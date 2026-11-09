"""Tidewater relay: stdlib-only HTTP bridge between the web UI and `sim`.

Shells out to `sim` for state, actions, graphs, judges data and
fast-forwards; serves the built web UI when present. Auth is social
(email + pseudo, no wallet): the relay issues session tokens itself,
stored in a disposable file next to the live state.

GET:  health, state, graph, judges. POST: auth, assign, survey,
licence, debt, council, fastforward ({days: 7|28, seed?}).
Errors are stable {"error": code, "message": text} envelopes; a sim
rule refusal maps to HTTP 409. Fast-forward runs on a temp copy only.
"""

from __future__ import annotations

import json
import mimetypes
import os
import secrets
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

from simclient import (SIM_TIMEOUT, build_assign_argv, build_council_argv, build_debt_argv,
                       build_licence_argv, build_query_argv, build_survey_argv, call_sim,
                       run_fastforward_isolated, sim_bin)

DEFAULT_PORT = 8785

# Guards every live-state access: sim calls, the session store, and the
# fast-forward snapshot copy (never the long fast-forward run itself).
MUTATION_LOCK = threading.Lock()

_API_METHODS = {"/api/health": "GET", "/api/auth": "POST",
                "/api/state": "GET", "/api/assign": "POST",
                "/api/survey": "POST", "/api/licence": "POST",
                "/api/debt": "POST", "/api/council": "POST",
                "/api/fastforward": "POST", "/api/graph": "GET",
                "/api/judges": "GET"}

_MESSAGES = {
    "E_BAD_JSON": "The request body is not valid JSON.",
    "E_METHOD_NOT_ALLOWED": "This route uses another HTTP method.",
    "E_NOT_FOUND": "Unknown API route.", "E_NO_STATE": "No game yet.",
    "E_NO_SIM": "The sim binary is missing.",
    "E_SIM_FAILED": "The sim refused or crashed.",
    "E_SIM_TIMEOUT": "The sim took too long.",
    "E_BAD_SIM_OUTPUT": "The sim answered something unreadable.",
    "E_BAD_AUTH": "Auth needs an email address and a pseudo.",
    "E_BAD_ASSIGN": "Assign needs a boat and a zone (or the quay).",
    "E_BAD_SURVEY": "A survey needs a zone.",
    "E_BAD_LICENCE": "A licence move needs buy|sell and a reference.",
    "E_BAD_DEBT": "A debt move needs buy|forbear|seize and a reference.",
    "E_BAD_COUNCIL": "A council move needs propose|vote and a rule.",
    "E_BAD_FASTFORWARD": "Fast-forward plays 7 or 28 days.",
    "E_FASTFORWARD_TIMEOUT": "The fast-forward took too long.",
    "E_NO_JOURNAL": "The fast-forward wrote no journal.",
    "E_NO_SERIES": "The fast-forward wrote no series.",
    "E_NO_MARKERS": "The fast-forward wrote no markers.",
}


def error_body(code: str) -> dict:
    """Stable error envelope: code plus readable message. Pure."""
    return {"error": code, "message": _MESSAGES.get(code, code)}


def default_state_path() -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(here, "state.json")


def state_path() -> str:
    return os.environ.get("SIM_STATE", default_state_path())


def sessions_path() -> str:
    override = os.environ.get("SIM_SESSIONS")
    if override:
        return override
    return os.path.join(os.path.dirname(state_path()),
                        "sessions.state.json")


def web_dist_dir() -> str:
    override = os.environ.get("WEB_DIST")
    if override:
        return override
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(os.path.dirname(here), "web", "dist")


def http_port() -> int:
    try:
        return int(os.environ.get("PORT", str(DEFAULT_PORT)))
    except ValueError:
        return DEFAULT_PORT


def parse_route(method: str, target: str) -> str:
    """Map a request to an endpoint name (or static/api_not_found/...)."""
    path = urlparse(target).path or "/"
    expected = _API_METHODS.get(path)
    if expected is not None:
        if method != expected:
            return "method_not_allowed"
        return path[len("/api/"):]
    if path == "/api" or path.startswith("/api/"):
        return "api_not_found"
    return "static"


def _as_nonempty_str(value: object) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _as_int(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip():
        try:
            return int(value.strip())
        except ValueError:
            return None
    return None


def _as_nonneg_int(value: object) -> int | None:
    n = _as_int(value)
    return n if n is not None and n >= 0 else None


def _as_number(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str) and value.strip():
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


def _as_action(value: object, allowed: set[str]) -> str | None:
    text = _as_nonempty_str(value)
    if text is None:
        return None
    return text.lower() if text.lower() in allowed else None


def _as_dict(body: object) -> dict | None:
    return body if isinstance(body, dict) else None


def validate_auth_payload(body: object) -> tuple[dict | None, str | None]:
    """Return (clean, None) or (None, error_code). Pure."""
    data = _as_dict(body)
    if data is None:
        return None, "E_BAD_JSON"
    email = _as_nonempty_str(data.get("email"))
    pseudo = _as_nonempty_str(data.get("pseudo"))
    if email is None or "@" not in email or pseudo is None:
        return None, "E_BAD_AUTH"
    return {"email": email, "pseudo": pseudo}, None


MESH_NAMES = {"large": "large", "large mesh": "large",
              "small": "small", "small mesh": "small"}


def validate_assign_payload(body: object) -> tuple[dict | None, str | None]:
    data = _as_dict(body)
    if data is None:
        return None, "E_BAD_JSON"
    boat = _as_nonempty_str(data.get("boat"))
    zone = _as_nonempty_str(data.get("zone"))
    quay = data.get("quay") is True or (zone is not None
                                        and zone.lower() == "quay")
    if boat is None or (zone is None and not quay):
        return None, "E_BAD_ASSIGN"
    mesh = None
    if data.get("mesh") is not None:
        raw = _as_nonempty_str(data.get("mesh"))
        mesh = MESH_NAMES.get(raw.lower()) if raw else None
        if mesh is None:
            return None, "E_BAD_ASSIGN"
    return {"boat": boat, "zone": zone, "quay": quay, "mesh": mesh}, None


def validate_survey_payload(body: object) -> tuple[dict | None, str | None]:
    data = _as_dict(body)
    if data is None:
        return None, "E_BAD_JSON"
    zone = _as_nonempty_str(data.get("zone"))
    if zone is None:
        return None, "E_BAD_SURVEY"
    return {"zone": zone}, None


def _validate_action_ref(body: object, allowed: set[str],
                         code: str) -> tuple[dict | None, str | None]:
    data = _as_dict(body)
    if data is None:
        return None, "E_BAD_JSON"
    action = _as_action(data.get("action"), allowed)
    ref = _as_nonempty_str(data.get("ref"))
    if action is None or ref is None:
        return None, code
    return {"action": action, "ref": ref}, None


def validate_licence_payload(body: object) -> tuple[dict | None, str | None]:
    return _validate_action_ref(body, {"buy", "sell"}, "E_BAD_LICENCE")


def validate_debt_payload(body: object) -> tuple[dict | None, str | None]:
    return _validate_action_ref(body, {"buy", "forbear", "seize"}, "E_BAD_DEBT")


def validate_council_payload(body: object) -> tuple[dict | None, str | None]:
    data = _as_dict(body)
    if data is None:
        return None, "E_BAD_JSON"
    action = _as_action(data.get("action"), {"propose", "vote"})
    rule = _as_nonempty_str(data.get("rule"))
    if action is None or rule is None:
        return None, "E_BAD_COUNCIL"
    clean: dict = {"action": action, "rule": rule}
    if data.get("indemnity") is not None:
        amount = _as_number(data.get("indemnity"))
        if amount is None or amount < 0:
            return None, "E_BAD_COUNCIL"
        clean["indemnity"] = amount
    return clean, None


def validate_fastforward_payload(body: object) -> tuple[dict | None,
                                                       str | None]:
    data = _as_dict(body)
    if data is None:
        return None, "E_BAD_JSON"
    if _as_int(data.get("days")) not in (7, 28):
        return None, "E_BAD_FASTFORWARD"
    seed = _as_nonneg_int(data.get("seed", 7))
    if seed is None:
        return None, "E_BAD_FASTFORWARD"
    return {"days": _as_int(data.get("days")), "seed": seed}, None


def load_sessions(path: str) -> dict:
    """Read the token store, {} when missing or broken."""
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def save_sessions(path: str, store: dict) -> None:
    """Persist the token store (best effort, lock held by caller)."""
    try:
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(store, fh)
        os.replace(tmp, path)
    except OSError:
        pass


def health_body() -> dict:
    binary = sim_bin()
    ready = os.path.isfile(binary) and os.access(binary, os.X_OK)
    return {"ok": True, "mode": "local", "sim": ready}


def hint_body() -> dict:
    return {"ok": True, "hint": "web/dist not built; API only", "api": sorted(_API_METHODS)}


def resolve_static_path(web_dist: str, url_path: str) -> tuple[str, str | None]:
    """Map a URL to (kind, fs_path); SPA fallback, no escape from web_dist."""
    if not os.path.isdir(web_dist):
        return ("no_dist", None)
    path = urlparse(url_path).path or "/"
    clean = os.path.normpath(path.lstrip("/"))
    candidate: str | None = None
    if clean in (".", ""):
        candidate = os.path.join(web_dist, "index.html")
    elif not clean.startswith("..") and not os.path.isabs(clean):
        candidate = os.path.join(web_dist, clean)
    if candidate is not None and os.path.isfile(candidate):
        return ("file", candidate)
    index = os.path.join(web_dist, "index.html")
    if os.path.isfile(index):
        return ("fallback", index)
    return ("no_index", None)


def _sim_active() -> tuple[str, str]:
    return sim_bin(), state_path()


_POST_SIM = {
    "assign": (validate_assign_payload,
               lambda c: build_assign_argv(*_sim_active(), c["boat"],
                                           c["zone"], c["quay"], c["mesh"])),
    "survey": (validate_survey_payload,
               lambda c: build_survey_argv(*_sim_active(), c["zone"])),
    "licence": (validate_licence_payload,
                lambda c: build_licence_argv(*_sim_active(), c["action"],
                                             c["ref"])),
    "debt": (validate_debt_payload,
             lambda c: build_debt_argv(*_sim_active(), c["action"], c["ref"])),
    "council": (validate_council_payload,
                lambda c: build_council_argv(*_sim_active(), c["action"],
                                             c["rule"], c.get("indemnity"))),
}


class RelayHandler(BaseHTTPRequestHandler):
    server_version = "TidewaterRelay/1.0"

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _send_json(self, status: int, body: dict):
        data = json.dumps(body).encode("utf-8")
        try:
            self.send_response(status)
            self._cors_headers()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _send_file(self, fs_path: str):
        try:
            with open(fs_path, "rb") as fh:
                data = fh.read()
        except OSError:
            self._send_json(404, error_body("E_NOT_FOUND"))
            return
        mime, _enc = mimetypes.guess_type(fs_path)
        content_type = mime or "application/octet-stream"
        if content_type.startswith("text/") or content_type in (
                "application/json", "application/javascript"):
            content_type += "; charset=utf-8"
        try:
            self.send_response(200)
            self._cors_headers()
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _read_json(self):
        """Return (body, status, error); error None means OK (body may be {})."""
        raw_length = self.headers.get("Content-Length")
        try:
            size = int(raw_length) if raw_length else 0
        except ValueError:
            size = 0
        raw = self.rfile.read(size) if size > 0 else b""
        if not raw.strip():
            return ({}, 0, None)
        try:
            parsed = json.loads(raw.decode("utf-8"))
        except ValueError:
            return (None, 400, error_body("E_BAD_JSON"))
        if not isinstance(parsed, dict):
            return (None, 400, error_body("E_BAD_JSON"))
        return (parsed, 0, None)

    def _query_via_sim(self, command: str):
        argv = build_query_argv(sim_bin(), state_path(), command)
        with MUTATION_LOCK:
            status, body = call_sim(argv, SIM_TIMEOUT)
        self._send_json(status, self._envelope(body))

    @staticmethod
    def _envelope(body: dict) -> dict:
        """Add a readable message to bare sim errors with a known code."""
        if "error" in body and "message" not in body:
            if body["error"] in _MESSAGES:
                return {**body, "message": _MESSAGES[body["error"]]}
        return body

    def do_GET(self):
        endpoint = parse_route("GET", self.path)
        if endpoint == "health":
            self._send_json(200, health_body())
        elif endpoint in ("state", "graph", "judges"):
            self._query_via_sim(endpoint)
        elif endpoint == "static":
            self._handle_static()
        elif endpoint == "method_not_allowed":
            self._send_json(405, error_body("E_METHOD_NOT_ALLOWED"))
        else:
            self._send_json(404, error_body("E_NOT_FOUND"))

    def do_POST(self):
        endpoint = parse_route("POST", self.path)
        if endpoint in _POST_SIM or endpoint in ("auth", "fastforward"):
            body, status, err = self._read_json()
            if err is not None:
                self._send_json(status, err)
                return
            self._handle_post(endpoint, body)
        elif endpoint == "method_not_allowed":
            self._send_json(405, error_body("E_METHOD_NOT_ALLOWED"))
        else:
            self._send_json(404, error_body("E_NOT_FOUND"))

    def _handle_static(self):
        kind, fs_path = resolve_static_path(web_dist_dir(), self.path)
        if kind == "no_dist":
            self._send_json(200, hint_body())
        elif fs_path is not None:
            self._send_file(fs_path)
        else:
            self._send_json(404, error_body("E_NOT_FOUND"))

    def _handle_post(self, endpoint: str, body: dict):
        if endpoint == "auth":
            self._handle_auth(body)
        elif endpoint == "fastforward":
            self._handle_fastforward(body)
        else:
            self._handle_sim_action(endpoint, body)

    def _handle_auth(self, body: dict):
        clean, err = validate_auth_payload(body)
        if err is not None:
            self._send_json(400, error_body(err))
            return
        token = secrets.token_urlsafe(16)
        with MUTATION_LOCK:
            store = load_sessions(sessions_path())
            store[token] = clean
            save_sessions(sessions_path(), store)
        self._send_json(200, {"ok": True, "token": token,
                              "pseudo": clean["pseudo"]})

    def _handle_sim_action(self, endpoint: str, body: dict):
        validate, to_argv = _POST_SIM[endpoint]
        clean, err = validate(body)
        if err is not None:
            self._send_json(400, error_body(err))
            return
        with MUTATION_LOCK:
            status, resp = call_sim(to_argv(clean), SIM_TIMEOUT)
        self._send_json(status, self._envelope(resp))

    def _handle_fastforward(self, body: dict):
        clean, err = validate_fastforward_payload(body)
        if err is not None:
            self._send_json(400, error_body(err))
            return
        status, resp = run_fastforward_isolated(
            state_path(), clean["days"], clean["seed"], lock=MUTATION_LOCK)
        self._send_json(status, self._envelope(resp))

    def log_message(self, *args):
        pass


def main() -> None:
    port = http_port()
    server = ThreadingHTTPServer(("127.0.0.1", port), RelayHandler)
    print("tidewater relay on 127.0.0.1:{} sim={} state={}".format(
        port, sim_bin(), state_path()))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

"""Tidewater relay: stdlib-only HTTP bridge between the web UI and `sim`.

Shells out to `sim` for state, actions, graphs, judges data and
fast-forwards; serves the built web UI when present. Auth is social
(email + pseudo, no wallet): the relay issues session tokens itself,
stored in a disposable file next to the live state.

GET:  health, state, graph, judges. POST: auth, assign, survey,
licence, debt, council, lease, day, fastforward ({days: 7|14|28, seed?}).
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

from simclient import (SIM_TIMEOUT, build_assign_argv, build_council_argv, build_day_argv,
                       build_next_season_argv, build_tick_argv,
                       build_debt_argv, build_lease_argv, build_licence_argv, build_query_argv,
                       build_survey_argv,
                       call_sim, call_sim_allow_text, run_fastforward_isolated, sim_bin)
from payloads import (validate_assign_payload, validate_auth_payload, validate_council_payload,
                      validate_day_payload, validate_debt_payload, validate_fastforward_payload,
                      validate_next_season_payload,
                      validate_lease_payload, validate_licence_payload, validate_reset_payload,
                      validate_survey_payload)

DEFAULT_PORT = 8785

# Guards every live-state access: sim calls, the session store, and the
# fast-forward snapshot copy (never the long fast-forward run itself).
MUTATION_LOCK = threading.Lock()

_API_METHODS = {"/api/health": "GET", "/api/auth": "POST",
                "/api/state": "GET", "/api/assign": "POST",
                "/api/survey": "POST", "/api/licence": "POST",
                "/api/debt": "POST", "/api/council": "POST", "/api/lease": "POST",
                "/api/fastforward": "POST", "/api/graph": "GET",
                "/api/judges": "GET", "/api/day": "POST",
                "/api/next-season": "POST", "/api/tick": "POST", "/api/reset": "POST"}

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
    "E_BAD_LEASE": "A lease move needs lease|unlease, a lessor and a lessee.",
    "E_BAD_COUNCIL": "A council move needs propose|vote and a rule.",
    "E_BAD_FASTFORWARD": "Fast-forward plays 7, 14 or 28 days.",
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


def sim_seed() -> int:
    try:
        return max(0, int(os.environ.get("SIM_SEED", "7")))
    except ValueError:
        return 7


def ensure_state() -> None:
    """Seed a fresh harbour when the state file is missing (M5).

    First sign-in on a fresh state path must play, never dead-end.
    """
    path = state_path()
    if os.path.isfile(path):
        return
    with MUTATION_LOCK:
        if os.path.isfile(path):
            return
        argv = [sim_bin(), "init", "--seed", str(sim_seed()), "--out", path]
        weeks = os.environ.get("SIM_WEEKS")
        if weeks:
            argv += ["--weeks", weeks]
        call_sim(argv, SIM_TIMEOUT)


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
    "lease": (validate_lease_payload,
              lambda c: build_lease_argv(*_sim_active(), c["action"],
                                         c["lessor"], c["lessee"],
                                         c.get("weeks"))),
    "council": (validate_council_payload,
                lambda c: build_council_argv(*_sim_active(), c["action"],
                                             c["rule"], c.get("indemnity"))),
    "tick": (validate_next_season_payload,
             lambda c: build_tick_argv(*_sim_active())),
    "next-season": (validate_next_season_payload,
                    lambda c: build_next_season_argv(*_sim_active())),
    "day": (validate_day_payload,
            lambda c: build_day_argv(*_sim_active())),
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
        ensure_state()
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
        if endpoint in _POST_SIM or endpoint in ("auth", "fastforward", "reset"):
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
        elif endpoint == "reset":
            self._handle_reset(body)
        else:
            self._handle_sim_action(endpoint, body)

    def _handle_reset(self, body: dict):
        clean, err = validate_reset_payload(body)
        if err is not None:
            self._send_json(400, error_body(err))
            return
        with MUTATION_LOCK:
            status, resp = call_sim_allow_text(
                [sim_bin(), "init", "--seed", str(clean["seed"]),
                 "--out", state_path()], SIM_TIMEOUT)
        if status != 200:
            self._send_json(status, self._envelope(resp))
            return
        self._send_json(200, {"ok": True, "seed": clean["seed"]})

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
        ensure_state()
        with MUTATION_LOCK:
            status, resp = call_sim(to_argv(clean), SIM_TIMEOUT)
        self._send_json(status, self._envelope(resp))

    def _handle_fastforward(self, body: dict):
        clean, err = validate_fastforward_payload(body)
        if err is not None:
            self._send_json(400, error_body(err))
            return
        ensure_state()
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

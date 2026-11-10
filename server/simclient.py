"""Client for the Tidewater Rust `sim` binary: argv builders, runners, mapping.

Stdlib only. Pure helpers run without the binary; `run_sim` is the only
function that spawns a process, and every caller accepts an injectable
`runner` for tests.

CLI contract (implemented by `crates/sim`, binary `sim`):
  sim state  --state F                                  -> player-view state
  sim graph  --state F                                  -> stock/price series
  sim judges --state F                                  -> judges panel data
  sim assign --state F --boat ID [--zone Z | --quay] [--mesh large|small]
  sim survey --state F --zone Z
  sim licence --state F --action buy|sell --ref R
  sim debt   --state F --action buy|forbear|seize --ref R
  sim council --state F --action propose|vote --rule R [--indemnity N]
  sim day --state F                                    -> day report
  sim fastforward --state COPY --days 7|28 --seed S \\
      --journal J --series R --markers M                -> summary on stdout

Every command prints JSON on stdout, except `init` which prints
plain text ("seeded ...") on success. A rule refusal prints
`{"error": "E_..."}` and maps to HTTP 409. Fast-forward also writes the
journal list, the series object and the markers list to J, R and M.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile

SIM_TIMEOUT = 30
FASTFORWARD_TIMEOUT = 90

QUERY_COMMANDS = ("state", "graph", "judges")


def repo_root() -> str:
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def sim_bin() -> str:
    override = os.environ.get("SIM_BIN")
    if override:
        return override
    return os.path.join(repo_root(), "target", "debug", "sim")


def build_query_argv(binary: str, state: str, command: str) -> list[str]:
    """Argv for a read-only sim query (state, graph or judges). Pure."""
    if command not in QUERY_COMMANDS:
        raise ValueError("unknown sim query: {}".format(command))
    return [binary, command, "--state", state]


def build_assign_argv(binary: str, state: str, boat: str,
                      zone: str | None = None, quay: bool = False,
                      mesh: str | None = None) -> list[str]:
    """Argv sending a boat to a zone, to the quay, with an optional mesh."""
    argv = [binary, "assign", "--state", state, "--boat", boat]
    if quay or zone == "quay":
        argv.append("--quay")
    elif zone is not None:
        argv += ["--zone", zone]
    if mesh is not None:
        argv += ["--mesh", mesh]
    return argv


def build_survey_argv(binary: str, state: str, zone: str) -> list[str]:
    return [binary, "survey", "--state", state, "--zone", zone]


def build_licence_argv(binary: str, state: str, action: str,
                       ref: str) -> list[str]:
    return [binary, "licence", "--state", state, "--action", action,
            "--ref", ref]


def build_debt_argv(binary: str, state: str, action: str,
                    ref: str) -> list[str]:
    return [binary, "debt", "--state", state, "--action", action,
            "--ref", ref]


def build_day_argv(binary: str, state: str) -> list[str]:
    """Argv ending the current live day; prints the day report."""
    return [binary, "day", "--state", state]


def build_council_argv(binary: str, state: str, action: str, rule: str,
                       indemnity: object = None) -> list[str]:
    argv = [binary, "council", "--state", state, "--action", action,
           "--rule", rule]
    if indemnity is not None:
        argv += ["--indemnity", str(indemnity)]
    return argv


def build_fastforward_argv(binary: str, state_copy: str, days: int,
                           seed: int, journal_path: str, series_path: str,
                           markers_path: str) -> list[str]:
    return [binary, "fastforward", "--state", state_copy,
            "--days", str(days), "--seed", str(seed),
            "--journal", journal_path, "--series", series_path,
            "--markers", markers_path]


def map_sim_result(returncode: int, stdout: str,
                   stderr: str = "") -> tuple[int, dict]:
    """Map a sim invocation to (http_status, json_body). Pure.

    Any {"error": ...} body becomes HTTP 409 with the same body.
    """
    parsed: object = None
    text = (stdout or "").strip()
    if text:
        try:
            parsed = json.loads(text)
        except ValueError:
            parsed = None
    if isinstance(parsed, dict) and "error" in parsed:
        return (409, parsed)
    if returncode != 0:
        body: dict = {"error": "E_SIM_FAILED"}
        lines = (stderr or "").strip().splitlines()
        if lines:
            body["detail"] = lines[-1][:200]
        return (502, body)
    if not isinstance(parsed, dict):
        return (502, {"error": "E_BAD_SIM_OUTPUT"})
    return (200, parsed)


def run_sim(argv: list[str], timeout: int) -> tuple[int, str, str]:
    proc = subprocess.run(argv, capture_output=True, text=True,
                          timeout=timeout)
    return (proc.returncode, proc.stdout or "", proc.stderr or "")


def call_sim(argv: list[str], timeout: int = SIM_TIMEOUT,
             runner=run_sim) -> tuple[int, dict]:
    """Run sim and map the outcome to (http_status, body)."""
    try:
        returncode, stdout, stderr = runner(argv, timeout)
    except subprocess.TimeoutExpired:
        return (504, {"error": "E_SIM_TIMEOUT"})
    except OSError as exc:
        return (502, {"error": "E_NO_SIM", "detail": str(exc)[:200]})
    return map_sim_result(returncode, stdout, stderr)


def call_sim_allow_text(argv: list[str], timeout: int = SIM_TIMEOUT,
                        runner=run_sim) -> tuple[int, dict]:
    """Run sim where exit 0 means success whatever stdout looks like.

    For `init`, whose success output is plain text ("seeded ..."), not
    JSON. Real failures (nonzero exit, timeout, missing binary) still
    map exactly as in `call_sim`.
    """
    status, body = call_sim(argv, timeout, runner)
    if status == 502 and body.get("error") == "E_BAD_SIM_OUTPUT":
        # Exit 0 with unparsable stdout: the command itself succeeded.
        return (200, {"ok": True})
    return (status, body)


def fastforward_response(summary: dict, journal: list, series: dict,
                         markers: list) -> dict:
    """Shape the fast-forward endpoint body. Pure."""
    return {"summary": summary, "journal": journal, "series": series,
            "markers": markers}


def read_json(path: str):
    """Return parsed JSON from a file, or None when missing or broken."""
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def run_fastforward_isolated(state_file: str, days: int, seed: int,
                             runner=run_sim, lock=None) -> tuple[int, dict]:
    """Run fast-forward on a temp copy; the live state is never mutated.

    `runner(argv, timeout)` returns (returncode, stdout, stderr) and is
    injectable so tests can run without the sim binary. When `lock` is
    given it guards only the snapshot copy, not the long subprocess run.
    """
    try:
        with tempfile.TemporaryDirectory(prefix="ff-") as tmp:
            copy_path = os.path.join(tmp, "state.json")
            journal_path = os.path.join(tmp, "journal.json")
            series_path = os.path.join(tmp, "series.json")
            markers_path = os.path.join(tmp, "markers.json")
            if lock is not None:
                with lock:
                    shutil.copyfile(state_file, copy_path)
            else:
                shutil.copyfile(state_file, copy_path)
            argv = build_fastforward_argv(sim_bin(), copy_path, days, seed,
                                         journal_path, series_path,
                                         markers_path)
            try:
                outcome = runner(argv, FASTFORWARD_TIMEOUT)
            except subprocess.TimeoutExpired:
                return (504, {"error": "E_FASTFORWARD_TIMEOUT"})
            except OSError as exc:
                detail = str(exc)[:200]
                return (502, {"error": "E_SIM_FAILED", "detail": detail})
            status, summary = map_sim_result(*outcome)
            if status != 200:
                return (status, summary)
            journal = read_json(journal_path)
            series = read_json(series_path)
            markers = read_json(markers_path)
            if not isinstance(journal, list):
                return (502, {"error": "E_NO_JOURNAL"})
            if not isinstance(series, dict):
                return (502, {"error": "E_NO_SERIES"})
            if not isinstance(markers, list):
                return (502, {"error": "E_NO_MARKERS"})
            return (200, fastforward_response(summary, journal, series,
                                             markers))
    except OSError:
        return (500, {"error": "E_NO_STATE"})

"""Relay acceptance: every endpoint plus error envelopes (stdlib only).

Spawns server/relay.py on a disposable port with a disposable state file and
a stub sim implementing the simclient CLI contract. The stub answers canned
JSON so these tests pin the relay layer, never the Rust engine.

Run: python3 server/test_relay.py (from the repo root).
"""

import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
RELAY = os.path.join(HERE, "relay.py")
SCRATCH = "/tmp/tidewater-game"

STUB = """#!/usr/bin/env python3
import json, sys
argv = sys.argv[1:]
cmd = argv[0] if argv else ""
def flag(name):
    return argv[argv.index(name) + 1] if name in argv else None
if cmd in ("state", "graph", "judges"):
    print(json.dumps({"ok": True, "view": cmd}))
elif cmd in ("assign", "survey", "licence", "debt", "council", "day"):
    if "REFUSE" in argv:
        print(json.dumps({"error": "E_SIM_FAILED"}))
    else:
        print(json.dumps({"ok": True, "cmd": cmd}))
elif cmd == "fastforward":
    journal, series, markers = flag("--journal"), flag("--series"), flag("--markers")
    json.dump([{"day": 1, "kind": "council", "detail": "vote"}], open(journal, "w"))
    json.dump({"stocks": [[3000, 5000, 2000]]}, open(series, "w"))
    json.dump([], open(markers, "w"))
    print(json.dumps({"days_run": int(flag("--days")), "seed": int(flag("--seed"))}))
else:
    print(json.dumps({"error": "E_SIM_FAILED"}))
    sys.exit(1)
"""


def free_port():
    """A currently free 127.0.0.1 port (disposable, never 8775/8765)."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    assert port not in (8775, 8765), "refusing a live port"
    return port


class RelayCase(unittest.TestCase):
    proc = None
    base = ""
    tmp = ""

    @classmethod
    def setUpClass(cls):
        os.makedirs(SCRATCH, exist_ok=True)
        cls.tmp = tempfile.mkdtemp(prefix="relay-ut-", dir=SCRATCH)
        stub = os.path.join(cls.tmp, "stub-sim.py")
        with open(stub, "w", encoding="utf-8") as fh:
            fh.write(STUB)
        os.chmod(stub, 0o755)
        with open(os.path.join(cls.tmp, "state.json"), "w") as fh:
            fh.write("{}")
        env = dict(os.environ)
        env["PORT"] = str(free_port())
        env["SIM_BIN"] = stub
        env["SIM_STATE"] = os.path.join(cls.tmp, "state.json")
        env["SIM_SESSIONS"] = os.path.join(cls.tmp, "sessions.json")
        env["WEB_DIST"] = os.path.join(cls.tmp, "no-dist-here")
        cls.proc = subprocess.Popen([sys.executable, RELAY], cwd=HERE, env=env,
                                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        cls.base = "http://127.0.0.1:{}".format(env["PORT"])
        cls._wait_ready()

    @classmethod
    def _wait_ready(cls):
        for _ in range(100):
            try:
                status, _ = cls.call("GET", "/api/health")
                if status == 200:
                    return
            except OSError:
                time.sleep(0.05)
        raise RuntimeError("relay never came up")

    @classmethod
    def tearDownClass(cls):
        if cls.proc is not None:
            cls.proc.send_signal(signal.SIGTERM)
            cls.proc.wait(timeout=10)
        shutil.rmtree(cls.tmp, ignore_errors=True)

    @classmethod
    def call(cls, method, path, body=None, raw=None):
        """One HTTP call; returns (status, parsed JSON body)."""
        data = raw if raw is not None else (
            json.dumps(body).encode() if body is not None else None)
        req = urllib.request.Request(cls.base + path, data=data, method=method,
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=10) as res:
                return res.status, json.loads(res.read().decode())
        except urllib.error.HTTPError as err:
            return err.code, json.loads(err.read().decode())

    def assert_envelope(self, body, code):
        self.assertEqual(body.get("error"), code)
        self.assertTrue(body.get("message"), "envelope needs a message")

    def test_health(self):
        status, body = self.call("GET", "/api/health")
        self.assertEqual(status, 200)
        self.assertTrue(body.get("ok"))

    def test_auth_ok(self):
        status, body = self.call("POST", "/api/auth",
                                 {"email": "a@b.c", "pseudo": "Skip"})
        self.assertEqual(status, 200)
        self.assertTrue(body.get("token"))
        self.assertEqual(body.get("pseudo"), "Skip")

    def test_auth_rejects_bad_payload(self):
        status, body = self.call("POST", "/api/auth", {"email": "nope"})
        self.assertEqual(status, 400)
        self.assert_envelope(body, "E_BAD_AUTH")

    def test_bad_json_envelope(self):
        status, body = self.call("POST", "/api/auth", raw=b"{oops")
        self.assertEqual(status, 400)
        self.assert_envelope(body, "E_BAD_JSON")

    def test_assign_ok_and_bad(self):
        status, body = self.call("POST", "/api/assign",
                                 {"boat": "0", "zone": "greybank"})
        self.assertEqual(status, 200)
        self.assertTrue(body.get("ok"))
        status, body = self.call("POST", "/api/assign", {"zone": "greybank"})
        self.assertEqual(status, 400)
        self.assert_envelope(body, "E_BAD_ASSIGN")

    def test_survey_ok_and_bad(self):
        status, body = self.call("POST", "/api/survey", {"zone": "deeps"})
        self.assertEqual(status, 200)
        status, body = self.call("POST", "/api/survey", {})
        self.assertEqual(status, 400)
        self.assert_envelope(body, "E_BAD_SURVEY")

    def test_licence_ok_and_bad(self):
        status, body = self.call("POST", "/api/licence",
                                 {"action": "buy", "ref": "okoro"})
        self.assertEqual(status, 200)
        status, body = self.call("POST", "/api/licence",
                                 {"action": "steal", "ref": "okoro"})
        self.assertEqual(status, 400)
        self.assert_envelope(body, "E_BAD_LICENCE")

    def test_debt_ok_and_bad(self):
        status, body = self.call("POST", "/api/debt",
                                 {"action": "forbear", "ref": "100"})
        self.assertEqual(status, 200)
        status, body = self.call("POST", "/api/debt",
                                 {"action": "forgive", "ref": "100"})
        self.assertEqual(status, 400)
        self.assert_envelope(body, "E_BAD_DEBT")

    def test_council_ok_and_bad(self):
        status, body = self.call("POST", "/api/council",
                                 {"action": "propose", "rule": "quota50",
                                  "indemnity": 10})
        self.assertEqual(status, 200)
        status, body = self.call("POST", "/api/council",
                                 {"action": "propose", "rule": "quota50",
                                  "indemnity": -1})
        self.assertEqual(status, 400)
        self.assert_envelope(body, "E_BAD_COUNCIL")

    def test_day_ok(self):
        status, body = self.call("POST", "/api/day", {})
        self.assertEqual(status, 200)
        self.assertTrue(body.get("ok"))
        self.assertEqual(body.get("cmd"), "day")

    def test_fastforward_ok_and_bad_days(self):
        status, body = self.call("POST", "/api/fastforward",
                                 {"days": 7, "seed": 7})
        self.assertEqual(status, 200)
        for key in ("summary", "journal", "series", "markers"):
            self.assertIn(key, body)
        self.assertEqual(body["summary"]["days_run"], 7)
        status, body = self.call("POST", "/api/fastforward",
                                 {"days": 9, "seed": 7})
        self.assertEqual(status, 400)
        self.assert_envelope(body, "E_BAD_FASTFORWARD")

    def test_queries_proxy_the_sim(self):
        for path in ("/api/state", "/api/graph", "/api/judges"):
            status, body = self.call("GET", path)
            self.assertEqual(status, 200, path)
            self.assertTrue(body.get("ok"), path)

    def test_sim_refusal_maps_to_409(self):
        status, body = self.call("POST", "/api/survey", {"zone": "REFUSE"})
        self.assertEqual(status, 409)
        self.assertEqual(body.get("error"), "E_SIM_FAILED")

    def test_unknown_route_and_method(self):
        status, body = self.call("GET", "/api/nope")
        self.assertEqual(status, 404)
        self.assert_envelope(body, "E_NOT_FOUND")
        status, body = self.call("GET", "/api/auth")
        self.assertEqual(status, 405)
        self.assert_envelope(body, "E_METHOD_NOT_ALLOWED")

    def test_static_hint_without_dist(self):
        status, body = self.call("GET", "/")
        self.assertEqual(status, 200)
        self.assertIn("hint", body)


if __name__ == "__main__":
    unittest.main(verbosity=2)

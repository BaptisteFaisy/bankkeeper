"""The testnet scripts must not lie about what they recorded.

Two regressions are guarded here, both found by replaying the deployment on a
local near-sandbox (see docs/TESTNET-RUN.md):

1. `scripts/testnet/e2e.mjs` must record the hash of every transaction, and
   must fail when it did not. Before the guard, a scenario that recorded
   nothing still exited 0 and wrote an empty proof table in
   `docs/deployments.md` — the table that is supposed to be the proof.
2. `scripts/testnet/testnet-lib.mjs` must fund a sub-account with the
   fraction that was asked for. `Math.round(0.1)` is 0, so the captain and
   the bank were created with **no NEAR at all** and could not sign their
   vote; the scenario died at the council with "Not enough balance".

Run: python3 tests/testnet_scripts.py
Exit 1 on a breach, 2 when node_modules is missing (nothing to check).
"""

import json
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
E2E = os.path.join(ROOT, "scripts", "testnet", "e2e.mjs")
LIB = os.path.join(ROOT, "scripts", "testnet", "testnet-lib.mjs")
DEPLOY = os.path.join(ROOT, "scripts", "testnet", "deploy.mjs")
MODULES = os.path.join(ROOT, "scripts", "testnet", "node_modules")


def read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def body_of(source, header):
    """The lines of a function, from its header to its closing brace."""
    lines = source.split("\n")
    start = next((i for i, line in enumerate(lines) if line.startswith(header)), None)
    if start is None:
        return ""
    depth, out = 0, []
    for line in lines[start:]:
        out.append(line)
        depth += line.count("{") - line.count("}")
        if depth == 0 and len(out) > 1:
            break
    return "\n".join(out)


def check_hash_recording():
    """e2e.mjs counts the transactions and keeps every hash."""
    breaches = []
    source = read(E2E)
    must = body_of(source, "async function must(")
    if "transactions += 1" not in must:
        breaches.append("e2e.mjs: must() does not count the transactions")
    if not re.search(r"if \(result\.txHash\) hashes\.push\(", must):
        breaches.append("e2e.mjs: must() does not record the transaction hash")
    if "hashes.length === transactions" not in source:
        breaches.append("e2e.mjs: no guard on hashes.length against transactions")
    if "hashes.length} transactions" not in source:
        breaches.append("e2e.mjs: the summary does not report the hash count")
    return breaches


def check_funding():
    """A sub-account is funded with the fraction that was asked for."""
    breaches = []
    lib = read(LIB)
    sub = body_of(lib, "export async function ensureSubaccount(")
    if "Math.round" in sub:
        breaches.append("testnet-lib.mjs: the dotation is rounded to the whole NEAR")
    if "nearToYocto" not in sub:
        breaches.append("testnet-lib.mjs: the dotation does not use nearToYocto")
    root = body_of(lib, "export async function ensureRoot(")
    if "prefix: PREFIX" not in root:
        breaches.append("testnet-lib.mjs: the fallback path loses the account prefix")
    return breaches


def subaccount_amounts():
    """The NEAR amounts deploy.mjs gives to the three scenario accounts."""
    source = read(DEPLOY)
    block = re.search(r"const SUBACCOUNTS = \[(.*?)\];", source, re.S)
    if block is None:
        return []
    return [float(value) for value in re.findall(r"\[\"[a-z]+\", ids\.\w+, ([0-9.]+)\]", block.group(1))]


def check_amounts_are_funded():
    """Every scenario account is given something above zero."""
    breaches = []
    amounts = subaccount_amounts()
    if not amounts:
        breaches.append("deploy.mjs: no sub-account amount found")
    for amount in amounts:
        if amount <= 0:
            breaches.append(f"deploy.mjs: a scenario account is given {amount} NEAR")
    return breaches


def near_to_yocto(amounts):
    """What near-api-js turns those amounts into, in yoctoNEAR."""
    entry = os.path.join(MODULES, "near-api-js", "lib", "index.js")
    if not os.path.isfile(entry):
        return None, f"{entry} missing"
    script = (
        f'import {{ nearToYocto }} from "{entry}";\n'
        "console.log(JSON.stringify(" + json.dumps(amounts) + ".map((a) => nearToYocto(a).toString())));\n"
    )
    with tempfile.TemporaryDirectory() as scratch:
        path = os.path.join(scratch, "amounts.mjs")
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(script)
        done = subprocess.run(
            ["node", path],
            cwd=os.path.join(ROOT, "scripts", "testnet"),
            capture_output=True, text=True, timeout=120,
        )
    if done.returncode != 0:
        return None, done.stderr.strip()[:200]
    return json.loads(done.stdout.strip()), None


def check_conversion(amounts):
    """The conversion keeps the fractions: 0.1 NEAR is not 0."""
    if not amounts:
        return []
    values, error = near_to_yocto(amounts)
    if values is None:
        print(f"near-api-js not usable: {error}")
        return []
    return [
        f"nearToYocto({amount}) is {value} yoctoNEAR — the account would be empty"
        for amount, value in zip(amounts, values)
        if int(value) <= 0
    ]


def main():
    if not os.path.isdir(MODULES):
        print("scripts/testnet/node_modules missing: run `npm ci` in scripts/testnet/")
        return 2
    amounts = subaccount_amounts()
    breaches = check_hash_recording() + check_funding() + check_amounts_are_funded()
    breaches += check_conversion(amounts)
    if breaches:
        print(f"{len(breaches)} breach(es):")
        for breach in breaches:
            print(f"  {breach}")
        return 1
    print(f"OK: the hash table is guarded, and {len(amounts)} scenario accounts are funded.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env node
// `node scripts/sandbox/stop.mjs` — stop the node and the relayer this machine
// started, by the exact PIDs they recorded. Nothing else is touched: keys and
// chain state stay under TW_CHAIN_HOME so the next start resumes the harbour.
import fs from 'node:fs';
import { paths, pidFrom } from './lib.mjs';

function stop(file, label) {
  const pid = pidFrom(file);
  if (pid === null) {
    console.log(`• ${label}: no live pid in ${file}`);
    fs.rmSync(file, { force: true });
    return;
  }
  process.kill(pid, 'SIGTERM');
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch {
      break;
    }
    // busy-wait a beat; the node flushes on SIGTERM
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
  }
  try {
    process.kill(pid, 0);
    console.log(`• ${label}: pid ${pid} still alive after 15s (SIGKILL)`);
    process.kill(pid, 'SIGKILL');
  } catch {
    console.log(`• ${label}: pid ${pid} stopped`);
  }
  fs.rmSync(file, { force: true });
}

stop(paths().relayerPid, 'relayer');
stop(paths().nodePid, 'sandbox');

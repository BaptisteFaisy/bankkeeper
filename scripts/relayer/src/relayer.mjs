#!/usr/bin/env node
// Sponsored relayer: the only process that holds key material.
//
// The browser posts an action here, the relayer signs with the captain's
// server-side key, pays the gas and answers with a transaction hash plus the
// new position. No wallet, no seed phrase, no gas prompt on the client.
//
//   POST /login {email}                  → account, contract, gold, licences
//   POST /licence/buy {email}            → buy_licence()
//   POST /loan/buy {email, tokenId?}     → buy_loan(token_id)
//   POST /council/vote {email, approve}  → vote(proposal_id, approve)
//   POST /council/propose {email, quota} → propose_rule(QuotaPerLicence(quota))
//   GET  /position?email=...             → same shape as /login, read-only
//   GET  /health                         → chain + relayer status
import fs from 'node:fs';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { paths, view } from '../../sandbox/lib.mjs';
import { chainConfig, buyLicence, buyLoan, chainError, login, normaliseEmail, position, propose, vote } from './chain.mjs';
import { allowAction, allowCall, recordAction } from './guard.mjs';
import { accountKey } from './identity.mjs';

const PORT = Number(process.env.TW_RELAYER_PORT || 8786);
const ORIGIN = process.env.TW_ALLOW_ORIGIN || '*';
const HOST = process.env.TW_RELAYER_HOST || '127.0.0.1';

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 8_192) reject(new Error('body too large'));
    });
    req.on('end', () => {
      if (raw.trim() === '') return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('body is not JSON'));
      }
    });
    req.on('error', reject);
  });
}

async function health() {
  const config = chainConfig();
  const status = await view(config.contractId, 'get_day');
  return {
    ok: true,
    contract: config.contractId,
    rpc: config.rpcUrl,
    network: config.networkId,
    owner: config.ownerAccount,
    treasury: config.treasuryAccount,
    day: Number(status.day),
    councilOpen: status.council_open,
  };
}

function refuse(status, code) {
  const error = new Error(code);
  error.status = status;
  return error;
}

/** Who is calling: the address, and the captain when there is one. */
function callerKey(req, email) {
  // Behind a function host the peer is a proxy: the caller is the first
  // address of `x-forwarded-for`, not the socket.
  const forwarded = String(req.headers?.['x-forwarded-for'] ?? '').split(',')[0].trim();
  const ip = forwarded !== '' ? forwarded : (req.socket?.remoteAddress ?? 'unknown');
  return `${ip}|${email ? accountKey(email) : '-'}`;
}

/** One sponsored transaction: the rate limit first, the per-captain cap
 *  second, the counter last (a refused action costs nothing). */
async function guarded(req, email, work) {
  if (!allowCall(callerKey(req, email))) throw refuse(429, 'E_RATE_LIMIT');
  const key = accountKey(normaliseEmail(email));
  if (!allowAction(key)) throw refuse(429, 'E_ACTION_CAP');
  const result = await work();
  recordAction(key);
  return result;
}

/** The router: one implementation, used by the Node server and by the
 *  serverless entry. `given` is the body when the host already parsed it
 *  (a function host does), so the stream is never read twice. */
export async function route(req, url, given) {
  if (req.method === 'GET' && url.pathname === '/health') return health();
  if (req.method === 'GET' && url.pathname === '/position') {
    const email = normaliseEmail(url.searchParams.get('email'));
    if (!allowCall(callerKey(req, email))) throw refuse(429, 'E_RATE_LIMIT');
    return position(email);
  }
  const body = given ?? await readBody(req);
  if (req.method === 'POST' && url.pathname === '/login') {
    if (!allowCall(callerKey(req, body.email))) throw refuse(429, 'E_RATE_LIMIT');
    return login(body.email);
  }
  if (req.method === 'POST' && url.pathname === '/licence/buy') {
    const receipt = await guarded(req, body.email, () => buyLicence(body.email));
    return { ...receipt, ...(await position(body.email)) };
  }
  if (req.method === 'POST' && url.pathname === '/loan/buy') {
    const receipt = await guarded(req, body.email, () => buyLoan(body.email, body.tokenId));
    return { ...receipt, ...(await position(body.email)) };
  }
  if (req.method === 'POST' && url.pathname === '/council/vote') {
    const receipt = await guarded(req, body.email, () => vote(body.email, body.approve !== false, body.proposalId ?? null));
    return { ...receipt, ...(await position(body.email)) };
  }
  if (req.method === 'POST' && url.pathname === '/council/propose') {
    const receipt = await guarded(req, body.email, () => propose(body.email, body.quota));
    return { ...receipt, ...(await position(body.email)) };
  }
  const notFound = new Error(`no route for ${req.method} ${url.pathname}`);
  notFound.status = 404;
  throw notFound;
}

/** One request, start to finish: the shape the Node server serves and the
 *  shape a function host calls. `given` is the body when the host parsed it. */
export async function handleRequest(req, res, given) {
  const url = new URL(req.url, `http://${req.headers.host ?? '127.0.0.1'}`);
  if (req.method === 'OPTIONS') return send(res, 204, {});
  return route(req, url, given)
    .then((result) => send(res, 200, result))
    .catch((error) => {
      const status = error.status ?? (String(error.message).includes('E_') ? 409 : 400);
      send(res, status, { error: chainError(error) });
    });
}

/** Run the server only when this file *is* the program: a function host
 *  imports it for `handleRequest` and must not open a port. */
const isProgram = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

const server = http.createServer(handleRequest);

if (isProgram) server.listen(PORT, HOST, () => {
  fs.writeFileSync(paths().relayerPid, `${JSON.stringify({ pid: process.pid, port: PORT, at: new Date().toISOString() })}\n`);
  const config = chainConfig();
  console.log(`tidewater relayer on http://${HOST}:${PORT}`);
  console.log(`  contract ${config.contractId} · owner ${config.ownerAccount} · treasury ${config.treasuryAccount}`);
  console.log('  keys stay under TW_CHAIN_HOME; nothing is returned to the browser but a hash');
});

function shutdown() {
  fs.rmSync(paths().relayerPid, { force: true });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2_000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

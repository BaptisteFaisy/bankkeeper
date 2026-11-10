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
//   GET  /position?email=...             → same shape as /login, read-only
//   GET  /health                         → chain + relayer status
import fs from 'node:fs';
import http from 'node:http';
import { paths, view } from '../../sandbox/lib.mjs';
import { chainConfig, buyLicence, buyLoan, chainError, login, normaliseEmail, position, vote } from './chain.mjs';

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

async function route(req, url) {
  if (req.method === 'GET' && url.pathname === '/health') return health();
  if (req.method === 'GET' && url.pathname === '/position') {
    return position(normaliseEmail(url.searchParams.get('email')));
  }
  const body = await readBody(req);
  if (req.method === 'POST' && url.pathname === '/login') return login(body.email);
  if (req.method === 'POST' && url.pathname === '/licence/buy') {
    return { ...(await buyLicence(body.email)), ...(await position(body.email)) };
  }
  if (req.method === 'POST' && url.pathname === '/loan/buy') {
    return { ...(await buyLoan(body.email, body.tokenId)), ...(await position(body.email)) };
  }
  if (req.method === 'POST' && url.pathname === '/council/vote') {
    return { ...(await vote(body.email, body.approve !== false, body.proposalId ?? null)), ...(await position(body.email)) };
  }
  const notFound = new Error(`no route for ${req.method} ${url.pathname}`);
  notFound.status = 404;
  throw notFound;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? '127.0.0.1'}`);
  if (req.method === 'OPTIONS') return send(res, 204, {});
  route(req, url)
    .then((result) => send(res, 200, result))
    .catch((error) => {
      const status = error.status ?? (String(error.message).includes('E_') ? 409 : 400);
      send(res, status, { error: chainError(error) });
    });
});

server.listen(PORT, HOST, () => {
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

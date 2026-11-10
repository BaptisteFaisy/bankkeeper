//! HTTP face of the shared auction: `node:http` only, no framework, no
//! dependency. Four routes, JSON in, JSON out, and a status that tells the
//! truth (`400` malformed, `409` under the requested floor, `401` bad
//! signature).
//!
//!   MARKET_STATE=market/var/state.json MARKET_SECRET=... node market/server.mjs
//!   port: MARKET_PORT (default 8790)

import { createServer } from 'node:http';
import { createMarket, MarketError } from './market.mjs';
import { verifyLanding } from './signature.mjs';

const MAX_BODY_BYTES = 8_192;

function send(response, status, body) {
  const text = `${JSON.stringify(body)}\n`;
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text) });
  response.end(text);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new MarketError(413, 'body_too_large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new MarketError(400, 'bad_json'));
      }
    });
    request.on('error', reject);
  });
}

/** A signature is only demanded when the host configured a secret. */
function checkSignature(secret, body, window) {
  if (!secret) return;
  if (!verifyLanding(secret, { ...body, window }, body.signature)) {
    throw new MarketError(401, 'bad_signature');
  }
}

function route(market, secret) {
  return async (request, response) => {
    const url = new URL(request.url, 'http://market.local');
    try {
      if (request.method === 'POST' && url.pathname === '/land') {
        const body = await readJson(request);
        const { current } = market.view(); // rolls the window forward first
        checkSignature(secret, body, current.id);
        return send(response, 201, market.land(body));
      }
      if (request.method === 'GET' && url.pathname === '/price') {
        const species = url.searchParams.get('species') ?? '';
        return send(response, 200, market.quote(species));
      }
      if (request.method === 'GET' && url.pathname === '/window') {
        return send(response, 200, market.view());
      }
      if (request.method === 'GET' && url.pathname === '/health') {
        return send(response, 200, { ok: true, window_secs: market.config.windowSecs, signatures: Boolean(secret) });
      }
      return send(response, 404, { error: 'not_found' });
    } catch (error) {
      if (error instanceof MarketError) return send(response, error.status, { error: error.code, ...error.details });
      return send(response, 500, { error: 'internal', message: String(error?.message ?? error) });
    }
  };
}

export function startServer({ port = Number(process.env.MARKET_PORT ?? 8790), statePath = process.env.MARKET_STATE ?? 'market/var/state.json', secret = process.env.MARKET_SECRET ?? null, quiet = false, market } = {}) {
  const instance = market ?? createMarket({ statePath });
  const server = createServer(route(instance, secret));
  server.listen(port, () => {
    if (quiet) return;
    const address = server.address();
    process.stdout.write(`market: listening on http://localhost:${address.port} (state ${statePath ?? 'in memory'})\n`);
  });
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().on('error', (error) => {
    process.stderr.write(`market: ${error.code ?? error.message} (port ${process.env.MARKET_PORT ?? 8790})\n`);
    process.exit(1);
  });
}

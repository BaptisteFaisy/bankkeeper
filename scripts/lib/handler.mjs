// The Vercel entry point: one handler, the relayer's own request handling.
//
// Vercel hands us `req` with the body already parsed (`req.body`), so the
// Node server's stream reader is bypassed: `handleRequest` takes the body as
// its third argument and only reads the stream when none is given.
import { handleRequest } from '../relayer/src/relayer.mjs';
import { bootstrapChainHome } from './bootstrap.mjs';

/** The mount point of the relayer on the function host. */
export const MOUNT = '/api/relayer';

export default async function handler(req, res) {
  bootstrapChainHome();
  // The host routes every path under the mount point to this one handler; the
  // router itself speaks bare paths (`/health`), exactly as the Node server
  // serves them. Rewrite, do not duplicate: one router, two hosts.
  const url = new URL(req.url ?? '/', 'http://relay.local');
  const path = url.pathname.startsWith(MOUNT) ? url.pathname.slice(MOUNT.length) || '/' : url.pathname;
  const shaped = { method: req.method, url: `${path}${url.search}`, headers: req.headers ?? {} };
  // A function host always parses the body (or gives none): never read the
  // stream here. `{}` keeps an unknown route answering 404 instead of
  // tripping on a request that cannot be replayed.
  return handleRequest(shaped, res, req.body ?? {});
}

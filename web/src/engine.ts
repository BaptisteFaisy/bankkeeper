// In-browser engine: the same rules as the relay, compiled to WebAssembly.
//
// `web/src/api.ts` still speaks `/api/<endpoint>`; when `VITE_ENGINE=wasm` the
// calls stop going over the network and go straight into the module. Payloads
// are byte-for-byte the relay's, so nothing else in the app changes.
//
// ABI (no wasm-bindgen): `tw_alloc(len)` hands out a buffer, we copy the
// request JSON in, `tw_call(ptr, len)` answers with a pointer and
// `tw_out_len()` gives its length.
import { toApiError } from './errors';

interface EngineExports {
  memory: WebAssembly.Memory;
  tw_alloc: (len: number) => number;
  tw_call: (ptr: number, len: number) => number;
  tw_free: (ptr: number, len: number) => void;
  tw_out_len: () => number;
}

let exports: EngineExports | null = null;
let loading: Promise<void> | null = null;

export function engineEnabled(): boolean {
  return import.meta.env.VITE_ENGINE === 'wasm';
}

/** Fetch and instantiate the module once; later calls reuse it. */
export function initEngine(): Promise<void> {
  if (!engineEnabled()) return Promise.resolve();
  loading ??= (async () => {
    const url = `${import.meta.env.BASE_URL}engine.wasm`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`engine.wasm: HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, {});
    exports = instance.exports as unknown as EngineExports;
  })();
  return loading;
}

function module(): EngineExports {
  if (exports === null) throw new Error('The engine is not loaded yet.');
  return exports;
}

function callRaw(request: string): unknown {
  const wasm = module();
  const bytes = new TextEncoder().encode(request);
  const pointer = wasm.tw_alloc(bytes.length);
  new Uint8Array(wasm.memory.buffer, pointer, bytes.length).set(bytes);
  // The call can grow the memory: read the offset first, then the buffer.
  const outPointer = wasm.tw_call(pointer, bytes.length);
  const length = wasm.tw_out_len();
  const reply = new TextDecoder().decode(new Uint8Array(wasm.memory.buffer, outPointer, length));
  wasm.tw_free(pointer, bytes.length);
  return JSON.parse(reply) as unknown;
}

/** Same contract as a relay call: resolves the body, throws on `error`. */
export async function engineCall<T>(path: string, init?: RequestInit): Promise<T> {
  await initEngine();
  const endpoint = path.replace(/^\/api\/?/, '') || 'health';
  const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : {};
  const reply = callRaw(JSON.stringify({ op: endpoint, body }));
  const payload = reply as Record<string, unknown>;
  if (typeof payload === 'object' && payload !== null && 'error' in payload) {
    const error = payload.error;
    // The engine answers with game sentences ("The weekly quota is spent…");
    // codes keep the relay's mapping so both modes read the same.
    if (typeof error === 'string' && error.includes(' ')) throw new Error(error);
    throw toApiError(payload);
  }
  return payload as T;
}

/** Test hook: drop the instance (the next call loads it again). */
export function resetEngineForTests(): void {
  exports = null;
  loading = null;
}

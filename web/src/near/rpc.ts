// Raw NEAR JSON-RPC view helper. Uses fetch only, no dependencies.
// Used by NEAR mode to read contract state; the local relay stays
// the default data source for gameplay.
export interface ViewCall {
  rpcUrl: string;
  contractId: string;
  method: string;
  args?: Record<string, unknown>;
}

interface RpcSuccess {
  result: { result: number[] };
}

export function decodeResult(bytes: number[]): string {
  return new TextDecoder().decode(new Uint8Array(bytes));
}

export async function viewFunction<T = unknown>(call: ViewCall): Promise<T> {
  const body = {
    jsonrpc: '2.0',
    id: 'tidewater-view',
    method: 'query',
    params: {
      request_type: 'call_function',
      finality: 'final',
      account_id: call.contractId,
      method_name: call.method,
      args_base64: btoa(JSON.stringify(call.args ?? {})),
    },
  };
  const res = await fetch(call.rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`NEAR RPC HTTP ${res.status}`);
  const payload = (await res.json()) as RpcSuccess;
  return JSON.parse(decodeResult(payload.result.result)) as T;
}

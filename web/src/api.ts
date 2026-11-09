// Typed client for the tidewater relay API. Base is the same origin,
// so dev uses the Vite proxy (:8785) and production hits the relay.
import type { FFResponse, Mesh, PortState, ZoneId } from './types';

export class ApiError extends Error {
  code: string;
  detail?: unknown;
  constructor(code: string, message?: string, detail?: unknown) {
    super(message ?? code);
    this.name = 'ApiError';
    this.code = code;
    this.detail = detail;
  }
}

function variantMessage(variant: string, inner: unknown): string {
  if (typeof inner === 'object' && inner !== null) {
    const parts = inner as { have?: unknown; need?: unknown };
    if (typeof parts.have === 'number' && typeof parts.need === 'number') {
      return `${variant} (have ${parts.have}, need ${parts.need})`;
    }
  }
  return variant;
}

function toApiError(payload: unknown): ApiError {
  if (typeof payload === 'object' && payload !== null && 'error' in payload) {
    const err = (payload as { error: unknown }).error;
    if (typeof err === 'string') return new ApiError(err, err, payload);
    if (typeof err === 'object' && err !== null) {
      const obj = err as Record<string, unknown>;
      if (typeof obj.code === 'string') {
        const msg = typeof obj.message === 'string' ? obj.message : obj.code;
        return new ApiError(obj.code, msg, payload);
      }
      // Externally tagged error: {"QuotaSpent": {"have": 0, "need": 14}}
      const keys = Object.keys(obj);
      if (keys.length === 1) {
        const variant = keys[0];
        return new ApiError(variant, variantMessage(variant, obj[variant]), payload);
      }
    }
  }
  return new ApiError('E_UNKNOWN', 'Unknown relay error', payload);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const payload: unknown = await res.json().catch(() => null);
  if (!res.ok) throw toApiError(payload);
  return payload as T;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export interface MutationResult {
  ok?: boolean;
  state?: PortState;
  report?: unknown;
  [key: string]: unknown;
}

export function getHealth(): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>('/api/health');
}

export function getState(): Promise<PortState> {
  return request<PortState>('/api/state');
}

export function postLogin(email: string, name: string): Promise<MutationResult> {
  return post<MutationResult>('/api/auth', { email, pseudo: name });
}

export interface AssignBody {
  boat: string;
  zone: ZoneId | null;
  net: Mesh;
}

export function postAssign(body: AssignBody): Promise<MutationResult> {
  const payload: Record<string, unknown> = { boat: body.boat, mesh: body.net };
  if (body.zone === null) payload.quay = true;
  else payload.zone = body.zone;
  return post<MutationResult>('/api/assign', payload);
}

export function postLicenceBuy(): Promise<MutationResult> {
  return post<MutationResult>('/api/licence', { action: 'buy', ref: 'pool' });
}

export function postLicenceSell(): Promise<MutationResult> {
  return post<MutationResult>('/api/licence', { action: 'sell', ref: 'pool' });
}

export function postSurvey(zone: ZoneId): Promise<MutationResult> {
  return post<MutationResult>('/api/survey', { zone });
}

// FNV-1a 32-bit: judge-friendly word seeds fold into the numeric seed
// the sim expects. Deterministic; 32 bits fit JSON numbers exactly.
export function seedToNumber(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function postFastForward(days: 7 | 28, seed: string): Promise<FFResponse> {
  return post<FFResponse>('/api/fastforward', { days, seed: seedToNumber(seed) });
}

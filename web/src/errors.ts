// Error type shared by the relay client and the in-browser engine.
// Kept apart so `engine.ts` can build them without importing `api.ts`.

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

/** Relay payload -> ApiError: string code, {code,message}, or one-variant enum. */
export function toApiError(payload: unknown): ApiError {
  if (typeof payload === 'object' && payload !== null && 'error' in payload) {
    const err = (payload as { error: unknown }).error;
    if (typeof err === 'string') return new ApiError(err, err, payload);
    if (typeof err === 'object' && err !== null) {
      const obj = err as Record<string, unknown>;
      if (typeof obj.code === 'string') {
        const msg = typeof obj.message === 'string' ? obj.message : obj.code;
        return new ApiError(obj.code, msg, payload);
      }
      const keys = Object.keys(obj);
      if (keys.length === 1) {
        const variant = keys[0];
        return new ApiError(variant, variantMessage(variant, obj[variant]), payload);
      }
    }
  }
  return new ApiError('E_UNKNOWN', 'Unknown relay error', payload);
}

// Typed client for the tidewater relay API. Base is the same origin,
// so dev uses the Vite proxy (:8785) and production hits the relay.
import { engineCall, engineEnabled } from './engine';
import { toApiError } from './errors';
import type { Charter } from './charter';
import type { FFResponse, GraphLive, JudgesLive, Mesh, PortState, ZoneId } from './types';

export { ApiError } from './errors';
export { toApiError } from './errors';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // In-browser engine: same payloads, no server (see engine.ts).
  if (engineEnabled()) return engineCall<T>(path, init);
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

export interface ExportBody {
  ok?: boolean;
  seed: number;
  weeks: number;
  game: unknown;
}

export interface InitBody {
  seed: number;
  weeks: number;
  // The institution the last campaign left behind; the engine applies it at
  // seeding, so it rules this campaign and never the one being closed.
  charter?: Charter | null;
}

/** The whole harbour as JSON, for the browser's own storage. */
export function getExport(): Promise<ExportBody> {
  return request<ExportBody>('/api/export');
}

/** Put a saved harbour back, in place of the one in memory. */
export function postImport(game: unknown): Promise<MutationResult> {
  return post<MutationResult>('/api/import', { game });
}

/** Seed a fresh harbour with an explicit shape (shareable link). */
export function postInit(body: InitBody): Promise<MutationResult> {
  return post<MutationResult>('/api/init', body);
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

export function postLicenceTrade(action: 'buy' | 'sell', ref: string): Promise<MutationResult> {
  return post<MutationResult>('/api/licence', { action, ref });
}

export function postLicenceBuy(): Promise<MutationResult> {
  return postLicenceTrade('buy', 'pool');
}

export function postLicenceSell(): Promise<MutationResult> {
  return postLicenceTrade('sell', 'pool');
}

export function postDebt(action: 'buy' | 'forbear' | 'seize', ref: string): Promise<MutationResult> {
  return post<MutationResult>('/api/debt', { action, ref });
}

export function postCouncil(action: 'propose' | 'vote', rule: string, indemnity?: number): Promise<MutationResult> {
  return post<MutationResult>('/api/council', indemnity === undefined ? { action, rule } : { action, rule, indemnity });
}

/** Barreau 4: rest a zone for N weeks; the regrowth pays the sea debt. */
export function postFallow(zone: ZoneId, weeks: number): Promise<MutationResult> {
  return post<MutationResult>('/api/fallow', { zone, weeks });
}

/** Barreau 4: the port fund buys juveniles back into a zone. */
export function postReseed(zone: ZoneId, crates: number): Promise<MutationResult> {
  return post<MutationResult>('/api/reseed', { zone, crates });
}

/** Barreau 5: file a claim against the port fund (max 1 per season). */
export function postClaim(actor: string, gold: number): Promise<MutationResult> {
  return post<MutationResult>('/api/claim', { actor, gold });
}

export function getJudges(): Promise<JudgesLive> {
  return request<JudgesLive>('/api/judges');
}

export function getGraph(): Promise<GraphLive> {
  return request<GraphLive>('/api/graph');
}

export function postSurvey(zone: ZoneId): Promise<MutationResult> {
  return post<MutationResult>('/api/survey', { zone });
}

export interface DayCouncil {
  season: number;
  tabled?: boolean;
  tally?: { for_votes: number; against_votes: number; passed: boolean };
  lines?: string[];
  [key: string]: unknown;
}

export interface DayReport {
  day: number;
  landings: Array<Record<string, unknown>>;
  lines: string[];
  week_rolled: boolean;
  council: DayCouncil | null;
  season_over?: boolean;
  bilan?: unknown;
  [key: string]: unknown;
}

export function postEndDay(): Promise<DayReport> {
  return post<DayReport>('/api/day', {});
}

export interface TickResult {
  day: number;
  closed: boolean;
  landing?: { crates: number; captain: string; zone: string } | null;
  lines: string[];
  report?: DayReport | null;
}

/** One lot of the day: the live clock calls this every thirty seconds. */
export function postTick(): Promise<TickResult> {
  return post<TickResult>('/api/tick', {});
}

export function postNextSeason(): Promise<MutationResult> {
  return post<MutationResult>('/api/next-season', {});
}

export function postReset(): Promise<MutationResult> {
  return post<MutationResult>('/api/reset', {});
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

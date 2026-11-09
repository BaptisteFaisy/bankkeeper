// Client-side weekly licence quota ledger. The relay enforces the real
// quota (a captain with no quota left stays at the quay); tracking it
// locally lets the HUD show the remaining allowance without a fetch.
export const CRATES_PER_LICENCE_WEEK = 70;

export interface QuotaState {
  week: number;
  licences: number;
  landed: number;
}

export function weekOfDay(day: number): number {
  return Math.floor(Math.max(1, day) - 1) / 7 + 1;
}

export function quotaTotal(licences: number): number {
  return Math.max(0, licences) * CRATES_PER_LICENCE_WEEK;
}

export function quotaLeft(state: QuotaState): number {
  return Math.max(0, quotaTotal(state.licences) - state.landed);
}

export function quotaExceeded(state: QuotaState): boolean {
  return state.landed >= quotaTotal(state.licences);
}

// Roll the ledger to a new week (quotas reset every Monday).
export function newWeek(week: number, licences: number): QuotaState {
  return { week, licences: Math.max(0, licences), landed: 0 };
}

// Record landed crates; clamps at the weekly total.
export function recordLanding(state: QuotaState, crates: number): QuotaState {
  return { ...state, landed: Math.min(quotaTotal(state.licences), state.landed + Math.max(0, crates)) };
}

// Sync from a server snapshot (landed crates so far this week).
export function syncQuota(week: number, licences: number, landed: number): QuotaState {
  return { week, licences: Math.max(0, licences), landed: Math.max(0, landed) };
}

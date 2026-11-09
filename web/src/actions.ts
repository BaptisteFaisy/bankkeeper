// Relay mutations as small module functions. Each takes the shared
// action context, runs one mutation, and never throws (errors toast).
// Mutations return true on success so callers can flash the UI.
import { postAssign, postCouncil, postDebt, postEndDay, postFastForward, postLicenceBuy, postLicenceTrade, postSurvey } from './api';
import type { AssignBody, MutationResult } from './api';
import type { FFResponse, ToastMsg, ZoneId } from './types';
import { ZONE_LABEL } from './types';

export interface MutDeps {
  setBusy: (b: string | null) => void;
  toastError: (e: unknown) => void;
  refreshQuiet: () => Promise<void>;
}

export interface GameActions {
  deps: MutDeps;
  pushToast: (kind: ToastMsg['kind'], title: string, body?: string) => void;
  resetFf: (r: FFResponse | null) => void;
}

export async function mutate<T>(deps: MutDeps, label: string, fn: () => Promise<T>): Promise<T | null> {
  deps.setBusy(label);
  try {
    const result = await fn();
    await deps.refreshQuiet();
    return result;
  } catch (e) {
    deps.toastError(e);
    return null;
  } finally {
    deps.setBusy(null);
  }
}

export function assignSummary(boat: string, zone: ZoneId | null): string {
  return zone === null ? `${boat} stays at the quay.` : `${boat} sails to ${ZONE_LABEL[zone]}.`;
}

export async function doAssign(actions: GameActions, body: AssignBody, boat: string): Promise<boolean> {
  const r: MutationResult | null = await mutate(actions.deps, 'assign', () => postAssign(body));
  if (r === null) return false;
  actions.pushToast('info', assignSummary(boat, body.zone));
  return true;
}

export async function doLicenceBuy(actions: GameActions): Promise<boolean> {
  const r = await mutate(actions.deps, 'licence', () => postLicenceBuy());
  if (r === null) return false;
  actions.pushToast('info', 'Licence bought: +70 crates a week.');
  return true;
}

export async function doLicenceTrade(actions: GameActions, action: 'buy' | 'sell', ref: string): Promise<boolean> {
  const r = await mutate(actions.deps, 'licence', () => postLicenceTrade(action, ref));
  if (r === null) return false;
  actions.pushToast('info', action === 'buy' ? `Licence bought from ${ref}.` : `Licence sold to ${ref}.`);
  return true;
}

export async function doDebt(actions: GameActions, action: 'buy' | 'forbear' | 'seize', ref: string): Promise<boolean> {
  const r = await mutate(actions.deps, 'debt', () => postDebt(action, ref));
  if (r === null) return false;
  actions.pushToast('info', `Note ${ref}: ${action}.`);
  return true;
}

export async function doCouncil(actions: GameActions, action: 'propose' | 'vote', rule: string, indemnity?: number): Promise<boolean> {
  const r = await mutate(actions.deps, 'council', () => postCouncil(action, rule, indemnity));
  if (r === null) return false;
  actions.pushToast('report', action === 'propose' ? `Motion tabled: ${rule}.` : `You vote ${rule}.`);
  return true;
}

export async function doSurvey(actions: GameActions, zone: ZoneId): Promise<boolean> {
  const r = await mutate(actions.deps, 'survey', () => postSurvey(zone));
  if (r === null) return false;
  actions.pushToast('report', `Survey of ${ZONE_LABEL[zone]} complete.`, 'The estimate holds for a week.');
  return true;
}

export async function doEndDay(actions: GameActions): Promise<boolean> {
  const r = await mutate(actions.deps, 'day', () => postEndDay());
  if (r === null) return false;
  const landings = Array.isArray(r.landings) ? r.landings.length : 0;
  actions.pushToast('report', `Day ${r.day} ends: ${landings} landings.`);
  return true;
}

export async function doRunFF(actions: GameActions, days: 7 | 28, seed: string): Promise<void> {
  await mutate(actions.deps, 'ff', async (): Promise<FFResponse> => {
    const r = await postFastForward(days, seed);
    actions.resetFf(r);
    actions.pushToast('report', `Fast-forward: ${r.summary?.days_run ?? '?'} days played.`);
    return r;
  });
}

// Relay mutations as small module functions. Each takes the shared
// action context, runs one mutation, and never throws (errors toast).
// Mutations return true on success so callers can flash the UI.
import { postAssign, postCouncil, postDebt, postEndDay, postFastForward, postFallow, postInit, postLicenceBuy, postLicenceTrade, postNextSeason, postReset, postReseed, postSurvey, postTick } from './api';
import type { AssignBody, InitBody, MutationResult } from './api';
import { charterLabel, saveCharter } from './charter';
import { fmtGold } from './format';
import type { DayNote, FFResponse, ToastMsg, ZoneId } from './types';
import { ZONE_LABEL, parseCouncilOutcome } from './types';

export interface MutDeps {
  setBusy: (b: string | null) => void;
  toastError: (e: unknown) => void;
  refreshQuiet: () => Promise<void>;
  onDayClosed?: () => void;
}

export interface GameActions {
  deps: MutDeps;
  pushToast: (kind: ToastMsg['kind'], title: string, body?: string) => void;
  resetFf: (r: FFResponse | null) => void;
  // Optional sink for day-response notes (council, season over).
  // Wired by the app shell; absent in older shells.
  noteDay?: (note: DayNote) => void;
}

let inFlight = false;
let lastActionKey = '';
let lastActionTime = 0;

export async function mutate<T>(deps: MutDeps, label: string, fn: () => Promise<T>): Promise<T | null> {
  const now = Date.now();
  if (inFlight) return null;
  if (lastActionKey === label && now - lastActionTime < 500) return null;
  inFlight = true;
  lastActionKey = label;
  lastActionTime = now;
  deps.setBusy(label);
  try {
    const result = await fn();
    await deps.refreshQuiet();
    return result;
  } catch (e) {
    deps.toastError(e);
    return null;
  } finally {
    inFlight = false;
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
  const r = await mutate(actions.deps, 'licence:buy:pool', () => postLicenceBuy());
  if (r === null) return false;
  actions.pushToast('info', 'Licence bought: +70 crates a week.');
  return true;
}

export async function doLicenceTrade(actions: GameActions, action: 'buy' | 'sell', ref: string): Promise<boolean> {
  const r = await mutate(actions.deps, `licence:${action}:${ref}`, () => postLicenceTrade(action, ref));
  if (r === null) return false;
  actions.pushToast('info', action === 'buy' ? `Licence bought from ${ref}.` : `Licence sold to ${ref}.`);
  return true;
}

function debtSummary(action: 'buy' | 'forbear' | 'seize', ref: string): string {
  if (action === 'buy') return `Note ${ref} bought from the bank.`;
  if (action === 'forbear') return `Note ${ref}: instalments deferred.`;
  return `Note ${ref} seized against the boat.`;
}

export async function doDebt(actions: GameActions, action: 'buy' | 'forbear' | 'seize', ref: string): Promise<boolean> {
  const r = await mutate(actions.deps, `debt:${action}:${ref}`, () => postDebt(action, ref));
  if (r === null) return false;
  actions.pushToast('info', debtSummary(action, ref));
  return true;
}

export async function doCouncil(actions: GameActions, action: 'propose' | 'vote', rule: string, indemnity?: number): Promise<boolean> {
  const r = await mutate(actions.deps, 'council', () => postCouncil(action, rule, indemnity));
  if (r === null) return false;
  const pretty = rule.split(',').join(', ').replace(/quota(\d+)/, 'quota $1');
  actions.pushToast('report', action === 'propose' ? `Motion tabled: ${pretty}.` : `You vote ${rule}.`);
  return true;
}

export async function doSurvey(actions: GameActions, zone: ZoneId): Promise<boolean> {
  const r = await mutate(actions.deps, `survey:${zone}`, () => postSurvey(zone));
  if (r === null) return false;
  actions.pushToast('report', `Survey of ${ZONE_LABEL[zone]} complete.`, 'The estimate holds for a week.');
  return true;
}

// Barreau 4: the two ways out of the debt owed to the sea, from the
// browser. The fallow costs no gold — the closed zone earns nothing while
// it rests; the reseed is paid by the port fund.
export async function doFallow(actions: GameActions, zone: ZoneId, weeks: number): Promise<boolean> {
  const r = await mutate(actions.deps, 'sea:fallow', () => postFallow(zone, weeks));
  if (r === null) return false;
  const paid = typeof r.paid === 'number' ? r.paid : 0;
  actions.pushToast('report', `${ZONE_LABEL[zone]} rests ${weeks} week(s): ${paid} crates paid to the sea.`);
  return true;
}

export async function doReseed(actions: GameActions, zone: ZoneId, crates: number): Promise<boolean> {
  const r = await mutate(actions.deps, 'sea:reseed', () => postReseed(zone, crates));
  if (r === null) return false;
  const spent = typeof r.spent === 'number' ? r.spent : 0;
  actions.pushToast('report', `${crates} crates put back into ${ZONE_LABEL[zone]}: ${fmtGold(spent / 100)}g out of the port fund.`);
  return true;
}

export async function doEndDay(actions: GameActions): Promise<boolean> {
  actions.deps.onDayClosed?.();
  const r = await mutate(actions.deps, 'day', () => postEndDay());
  if (r === null) return false;
  const landings = Array.isArray(r.landings) ? r.landings.length : 0;
  // Sim days are zero-based; players count from day 1.
  const dayNo = typeof r.day === 'number' ? r.day + 1 : '?';
  actions.pushToast('report', `Day ${dayNo} ends: ${landings} landings.`);
  const council = r.council === null || r.council === undefined ? null : parseCouncilOutcome(r.council);
  if (council !== null) {
    if (!council.tabled) {
      actions.pushToast('report', `Season ${council.season} council: no motion tabled; standing rules continue.`);
    } else {
      actions.pushToast('report', `Season ${council.season} council: ${council.forVotes} for, ${council.againstVotes} against — ${council.passed ? 'passed' : 'rejected'}.`);
    }
  }
  actions.noteDay?.({ council, seasonOver: r.season_over === true, bilan: r.bilan ?? null });
  return true;
}

/// Next season of the campaign: the harbour keeps everything, the sea keeps
/// what the last season left it (section 13, question 4).
export async function doNextSeason(actions: GameActions): Promise<boolean> {
  const r = await mutate(actions.deps, 'reset', () => postNextSeason());
  if (r === null) return false;
  const season = typeof r.season === 'number' ? r.season : null;
  actions.resetFf(null);
  actions.noteDay?.({ council: null, seasonOver: false, bilan: null });
  actions.pushToast('report', season === null ? 'Next season opens.' : `Season ${season} opens: the sea remembers.`);
  return true;
}

/// Write the charter and open the campaign it rules: a fresh harbour, seeded
/// under the sentence the player just chose, kept for the next reload.
export async function doNewCampaign(actions: GameActions, body: InitBody): Promise<boolean> {
  const r = await mutate(actions.deps, 'reset', () => postInit(body));
  if (r === null) return false;
  saveCharter(body.charter ?? {});
  actions.resetFf(null);
  actions.noteDay?.({ council: null, seasonOver: false, bilan: null });
  actions.pushToast('report', 'A new campaign opens.', `The charter: ${charterLabel(body.charter ?? {})}.`);
  return true;
}

export async function doReset(actions: GameActions): Promise<boolean> {
  const r = await mutate(actions.deps, 'reset', () => postReset());
  if (r === null) return false;
  actions.resetFf(null);
  actions.noteDay?.({ council: null, seasonOver: false, bilan: null });
  actions.pushToast('report', 'New harbour seeded. Fair winds.');
  return true;
}

/// One lot lands: the live clock's beat, every thirty seconds.
export async function doTick(actions: GameActions): Promise<boolean> {
  const r = await mutate(actions.deps, 'tick', () => postTick());
  if (r === null) return false;
  if (r.closed === true) {
    const report = r.report ?? null;
    const council = report?.council === null || report?.council === undefined ? null : parseCouncilOutcome(report.council);
    actions.noteDay?.({ council, seasonOver: report?.season_over === true, bilan: report?.bilan ?? null });
    actions.pushToast('report', `Day ${r.day} closes. ${(r.lines ?? []).length} lines in the ledger.`);
  }
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

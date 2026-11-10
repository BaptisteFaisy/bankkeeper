// The charter: the one rule a player writes at the end of a campaign, and
// which rules the campaigns that follow.
//
// The engine owns the mechanics (`crates/sim/src/charter.rs`); this module owns
// the words and the storage. The chosen charter is kept in
// `localStorage.tidewater-charter-v1` and handed to `init`, so a new campaign
// starts under the institution the last one left behind.
//
// Text mirror: OPTION_QUOTA_TITLE/DETAIL and friends in the Rust module are the
// same sentences. `python3 tests/ci_structural.py` keeps the files small, not
// the wording — change both sides together.

export interface Charter {
  quota_per_licence?: number | null;
  ban_small_mesh?: boolean;
  idle_licence_tax_bps?: number | null;
}

export type CharterId = 'quota' | 'mesh' | 'idle';

export interface CharterOption {
  id: CharterId;
  title: string;
  detail: string;
  charter: Charter;
}

export const CHARTER_OPTIONS: CharterOption[] = [
  {
    id: 'quota',
    title: 'The quota falls',
    detail:
      'A licence lands fifty crates a week instead of seventy. The sea breathes; every purse tightens.',
    charter: { quota_per_licence: 50 },
  },
  {
    id: 'mesh',
    title: 'The small mesh is banned',
    detail:
      'No boat may fish a fine net. Fewer young fish taken now, more grown fish for the seasons after.',
    charter: { ban_small_mesh: true },
  },
  {
    id: 'idle',
    title: 'Idle licences pay',
    detail:
      'A licence held but not fished for two weeks owes a tenth of its price every Monday. Unpaid, it goes back to the pool.',
    charter: { idle_licence_tax_bps: 1000 },
  },
];

const KEY = 'tidewater-charter-v1';

/** A charter with no rule at all is no charter. */
export function charterIsEmpty(charter: Charter | null | undefined): boolean {
  if (charter === null || charter === undefined) return true;
  const quota = charter.quota_per_licence;
  const tax = charter.idle_licence_tax_bps;
  return (quota ?? null) === null && charter.ban_small_mesh !== true && (tax ?? null) === null;
}

function parse(raw: string | null): Charter | null {
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Charter>;
    const charter: Charter = {};
    if (typeof parsed.quota_per_licence === 'number') charter.quota_per_licence = parsed.quota_per_licence;
    if (typeof parsed.ban_small_mesh === 'boolean') charter.ban_small_mesh = parsed.ban_small_mesh;
    if (typeof parsed.idle_licence_tax_bps === 'number') {
      charter.idle_licence_tax_bps = parsed.idle_licence_tax_bps;
    }
    return charterIsEmpty(charter) ? null : charter;
  } catch {
    return null;
  }
}

/** The charter this browser wrote, if any. */
export function loadCharter(): Charter | null {
  try {
    return parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

/** Keep the charter for the next campaign; best effort, like the save. */
export function saveCharter(charter: Charter): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(charter));
  } catch {
    // Blocked storage only costs the next campaign its institution.
  }
}

export function clearCharter(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear, nothing to lose.
  }
}

/** One-line reading of a charter, for the panel header. */
export function charterLabel(charter: Charter | null | undefined): string {
  if (charterIsEmpty(charter) || charter === null || charter === undefined) return 'No charter';
  const parts: string[] = [];
  if (typeof charter.quota_per_licence === 'number') parts.push(`quota ${charter.quota_per_licence}`);
  if (charter.ban_small_mesh === true) parts.push('small mesh banned');
  if (typeof charter.idle_licence_tax_bps === 'number') {
    parts.push(`idle licences taxed ${(charter.idle_licence_tax_bps / 100).toFixed(0)}%`);
  }
  return parts.join(' · ');
}

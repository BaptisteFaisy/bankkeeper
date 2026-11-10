// The shared season: `?seed=` and `?weeks=` are the same two parameters the
// game reads at boot (web/src/boot.ts -> persistence.shapeFromUrl), so this
// page can hand a judge the exact URL that replays what it is talking about.
export interface SharedSeason {
  seed: string;
  weeks: string;
  shared: boolean;
}

export const DEFAULT_SEED = '7';
export const DEFAULT_WEEKS = '2';

function read(params: URLSearchParams, name: string, fallback: string): string {
  const value = (params.get(name) ?? '').trim();
  return value === '' ? fallback : value;
}

export function sharedSeason(search: string): SharedSeason {
  const params = new URLSearchParams(search);
  const seed = read(params, 'seed', DEFAULT_SEED);
  return { seed, weeks: read(params, 'weeks', DEFAULT_WEEKS), shared: seed !== DEFAULT_SEED };
}

/** URL the game boots from: a boot with this seed replays this season. */
export function replayHref(season: SharedSeason): string {
  return `/?seed=${encodeURIComponent(season.seed)}&weeks=${encodeURIComponent(season.weeks)}`;
}

/** This page with the same season attached, to hand around with a hash. */
export function proofsHref(season: SharedSeason): string {
  return `/proofs.html?seed=${encodeURIComponent(season.seed)}&weeks=${encodeURIComponent(season.weeks)}`;
}

// The harbour survives a reload, and a season can be shared by URL.
//
// The engine is stateless between calls: it keeps the `Game` in memory, and
// `export` / `import` hand it over as JSON. We store that JSON in
// `localStorage`, and we read `?seed=7&weeks=2` so a link replays exactly the
// same season (`history_hash` included) on someone else's machine.
//
// Two tabs must not fight over that one slot: every save carries `savedAt`, and
// a tab only writes while the slot still holds the save it last saw. A tab that
// finds a newer save stops saving and says so (the newest game always wins).

const KEY = 'tidewater-game-v1';
export const PREVIOUS_KEY = `${KEY}.previous`;
export const BAD_KEY = `${KEY}.bad`;
/** localStorage is a few megabytes; a season is tens of kilobytes. */
const MAX_BYTES = 2_000_000;

export interface Shape {
  seed: number;
  weeks: number;
}

export interface Saved {
  savedAt: string;
  seed: number;
  weeks: number;
  game: unknown;
}

/** `?seed=` and `?weeks=` from the URL, when they make sense. */
export function shapeFromUrl(search: string): Shape | null {
  const params = new URLSearchParams(search);
  const rawSeed = params.get('seed');
  if (rawSeed === null || rawSeed.trim() === '') return null;
  const seed = Number.parseInt(rawSeed, 10);
  if (!Number.isFinite(seed) || seed < 0) return null;
  const rawWeeks = Number.parseInt(params.get('weeks') ?? '', 10);
  const weeks = Number.isFinite(rawWeeks) && rawWeeks >= 1 && rawWeeks <= 12 ? rawWeeks : 2;
  return { seed, weeks };
}

/** The link that replays this season on another machine. */
export function shareUrl(shape: Shape, href: string): string {
  const url = new URL(href);
  url.searchParams.set('seed', String(shape.seed));
  url.searchParams.set('weeks', String(shape.weeks));
  return url.toString();
}

function parse(raw: string | null): Saved | null {
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Saved>;
    if (typeof parsed.seed !== 'number' || parsed.game === undefined) return null;
    return {
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
      seed: parsed.seed,
      weeks: typeof parsed.weeks === 'number' ? parsed.weeks : 4,
      game: parsed.game,
    };
  } catch {
    return null;
  }
}

// The `savedAt` of the save this tab last read or wrote. Anything else in the
// slot means another tab moved the harbour on: this one steps aside.
let knownStamp: string | null = null;
const staleListeners = new Set<() => void>();
let staleAnnounced = false;

/** Tell the caller once when another tab took over the save slot. */
export function onStaleSave(listener: () => void): () => void {
  staleListeners.add(listener);
  return () => { staleListeners.delete(listener); };
}

function announceStale(): void {
  if (staleAnnounced) return;
  staleAnnounced = true;
  for (const listener of staleListeners) listener();
}

/** Listen for writes from the other tabs of this origin. */
export function watchOtherTabs(): void {
  window.addEventListener('storage', (event) => {
    if (event.key !== KEY || event.newValue === null) return;
    const incoming = parse(event.newValue);
    if (incoming !== null && incoming.savedAt !== knownStamp) announceStale();
  });
}

export function loadSaved(): Saved | null {
  try {
    const saved = parse(localStorage.getItem(KEY));
    knownStamp = saved?.savedAt ?? null;
    return saved;
  } catch {
    knownStamp = null;
    return null;
  }
}

/** Best effort: a full, blocked or taken-over slot only costs the resume. */
export function saveGame(payload: { seed: number; weeks: number; game: unknown }): Saved | null {
  try {
    const stored = parse(localStorage.getItem(KEY));
    if (stored !== null && stored.savedAt !== knownStamp) {
      announceStale();
      return null;
    }
    const saved: Saved = { savedAt: new Date().toISOString(), ...payload };
    const text = JSON.stringify(saved);
    if (text.length > MAX_BYTES) return null;
    localStorage.setItem(KEY, text);
    knownStamp = saved.savedAt;
    return saved;
  } catch {
    return null;
  }
}

export function clearSaved(): void {
  try {
    localStorage.removeItem(KEY);
    knownStamp = null;
  } catch {
    // Nothing to do: the harbour simply starts fresh next time.
  }
}

function copyTo(slot: string): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return false;
    localStorage.setItem(slot, raw);
    return true;
  } catch {
    return false;
  }
}

/** An unreadable save is set aside, not deleted: the player may want it back. */
export function quarantineBadSave(): boolean {
  const kept = copyTo(BAD_KEY);
  clearSaved();
  return kept;
}

/** Keep the harbour in play before a shared link replaces it. */
export function shelvePreviousSave(): boolean {
  return copyTo(PREVIOUS_KEY);
}

// The harbour survives a reload, and a season can be shared by URL.
//
// The engine is stateless between calls: it keeps the `Game` in memory, and
// `export` / `import` hand it over as JSON. We store that JSON in
// `localStorage`, and we read `?seed=7&weeks=2` so a link replays exactly the
// same season (`history_hash` included) on someone else's machine.

const KEY = 'tidewater-game-v1';
/** localStorage is a few megabytes; a season is tens of kilobytes. */
const MAX_BYTES = 2_000_000;

export interface Shape {
  seed: number;
  weeks: number;
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

interface Saved {
  savedAt: string;
  seed: number;
  weeks: number;
  game: unknown;
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

export function loadSaved(): Saved | null {
  try {
    return parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

/** Best effort: a full or blocked storage only costs the resume. */
export function saveGame(payload: { seed: number; weeks: number; game: unknown }): Saved | null {
  const saved: Saved = { savedAt: new Date().toISOString(), ...payload };
  try {
    const text = JSON.stringify(saved);
    if (text.length > MAX_BYTES) return null;
    localStorage.setItem(KEY, text);
    return saved;
  } catch {
    return null;
  }
}

export function clearSaved(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do: the harbour simply starts fresh next time.
  }
}

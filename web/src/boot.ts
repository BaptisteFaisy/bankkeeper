// Startup: pick the harbour the tab should show.
//
// Three inputs, in order of authority: an explicit `?seed=` in the URL (a
// shared season), then the harbour saved in this browser, then a fresh one.
// Only the in-browser engine can do this; the relay mode keeps its own state.
//
// Nothing here may leave the player staring at a dead screen: an unreadable
// save is set aside and a fresh harbour is seeded, and a shared link that
// disagrees with the harbour in play becomes an *offer* the player accepts.
import { engineEnabled } from './engine';
import { getExport, postImport, postInit } from './api';
import { loadCharter } from './charter';
import type { Charter } from './charter';
import {
  loadSaved, quarantineBadSave, saveGame, shapeFromUrl, shelvePreviousSave, watchOtherTabs,
} from './persistence';
import type { Saved, Shape } from './persistence';
import type { PortState } from './types';

export const DEFAULT_SHAPE: Shape = { seed: 7, weeks: 2 };

export interface BootNotice {
  kind: 'error' | 'info';
  title: string;
  body?: string;
}

export interface BootResult {
  /** Shape of the harbour now in memory; null in relay mode. */
  shape: Shape | null;
  /** A shared link the player has not accepted yet (their game is untouched). */
  seedOffer: Shape | null;
  /** One message for the toast stack, when the boot had to work around something. */
  notice: BootNotice | null;
}

const BAD_SAVE_NOTICE: BootNotice = {
  kind: 'error',
  title: 'That saved harbour could not be read.',
  body: 'It was set aside (tidewater-game-v1.bad) and a fresh harbour was seeded.',
};

function sameShape(a: Shape, b: Shape): boolean {
  return a.seed === b.seed && a.weeks === b.weeks;
}

/** Import the saved harbour; an obsolete or corrupt save falls back to a seed. */
async function importOrReseed(saved: Saved, charter: Charter | null): Promise<{ shape: Shape; notice: BootNotice | null }> {
  try {
    await postImport(saved.game);
    return { shape: { seed: saved.seed, weeks: saved.weeks }, notice: null };
  } catch {
    quarantineBadSave();
    await postInit({ ...DEFAULT_SHAPE, charter });
    return { shape: DEFAULT_SHAPE, notice: BAD_SAVE_NOTICE };
  }
}

/** Seed, import or offer: never throws on a bad save. */
export async function bootHarbour(): Promise<BootResult> {
  watchOtherTabs();
  if (!engineEnabled()) return { shape: null, seedOffer: null, notice: null };
  const fromUrl = shapeFromUrl(window.location.search);
  const saved = loadSaved();
  // A campaign the player opens here sails under the charter this browser
  // keeps; an imported save keeps its own (it travels inside the game JSON).
  const charter = loadCharter();
  if (saved !== null) {
    const offered = fromUrl !== null && !sameShape(saved, fromUrl) ? fromUrl : null;
    const { shape, notice } = await importOrReseed(saved, charter);
    return { shape, seedOffer: offered, notice };
  }
  const shape = fromUrl ?? DEFAULT_SHAPE;
  await postInit({ ...shape, charter });
  return { shape, seedOffer: null, notice: null };
}

/** The player accepted the shared season: shelve the game in play, seed the link. */
export async function openSharedHarbour(shape: Shape): Promise<void> {
  shelvePreviousSave();
  await postInit({ ...shape, charter: loadCharter() });
  clearUrlSeed();
}

/** Drop `?seed=` so a reload neither re-offers nor re-seeds. */
export function clearUrlSeed(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('seed');
  url.searchParams.delete('weeks');
  window.history.replaceState({}, '', url.toString());
}

/** Persist the live harbour; no-op when the state has not moved. */
let lastSignature: string | null = null;

export async function autosave(port: PortState): Promise<void> {
  if (!engineEnabled()) return;
  const weeks = port.weeksPerSeason ?? 4;
  const signature = [port.seed, port.day, port.week, port.playerGold, port.licences, weeks, port.seasonOver].join('|');
  if (signature === lastSignature) return;
  // The first state this tab sees is a baseline, not a move: a tab that never
  // touched the harbour must not rewrite the slot, or it would poison the
  // stale-save guard of the tab that really played (audit A6).
  const baseline = lastSignature === null;
  lastSignature = signature;
  if (baseline) return;
  try {
    const exported = await getExport();
    saveGame({ seed: exported.seed, weeks: exported.weeks, game: exported.game });
  } catch {
    // A failed save only costs the resume.
  }
}

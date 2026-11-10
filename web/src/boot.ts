// Startup: pick the harbour the tab should show.
//
// Three inputs, in order of authority: an explicit `?seed=` in the URL (a
// shared season), then the harbour saved in this browser, then a fresh one.
// Only the in-browser engine can do this; the relay mode keeps its own state.
import { engineEnabled } from './engine';
import { getExport, postImport, postInit } from './api';
import { loadCharter } from './charter';
import { loadSaved, saveGame, shapeFromUrl } from './persistence';
import type { Shape } from './persistence';
import type { PortState } from './types';

const DEFAULT_SHAPE: Shape = { seed: 7, weeks: 2 };

/** Seed, import or keep: returns the shape now in play. */
export async function bootHarbour(): Promise<Shape | null> {
  if (!engineEnabled()) return null;
  const fromUrl = shapeFromUrl(window.location.search);
  const saved = loadSaved();
  // A campaign the player opens here sails under the charter this browser
  // keeps; an imported save keeps its own (it travels inside the game JSON).
  const charter = loadCharter();
  if (fromUrl !== null && (saved === null || saved.seed !== fromUrl.seed || saved.weeks !== fromUrl.weeks)) {
    await postInit({ ...fromUrl, charter });
    return fromUrl;
  }
  if (saved !== null) {
    await postImport(saved.game);
    return { seed: saved.seed, weeks: saved.weeks };
  }
  await postInit({ ...DEFAULT_SHAPE, charter });
  return DEFAULT_SHAPE;
}

/** Persist the live harbour; no-op when the state has not moved. */
let lastSignature = '';

export async function autosave(port: PortState): Promise<void> {
  if (!engineEnabled()) return;
  const weeks = port.weeksPerSeason ?? 4;
  const signature = [port.seed, port.day, port.week, port.playerGold, port.licences, weeks, port.seasonOver].join('|');
  if (signature === lastSignature) return;
  lastSignature = signature;
  try {
    const exported = await getExport();
    saveGame({ seed: exported.seed, weeks: exported.weeks, game: exported.game });
  } catch {
    // A failed save only costs the resume.
  }
}

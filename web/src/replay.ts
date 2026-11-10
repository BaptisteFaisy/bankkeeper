// replay.ts — the criée, replayed: one cursor, one sweep.
//
// The auction panel and the scene must show the same lot at the same
// price, so the cursor and the sweep live here, once, and both read them.
// The panel prints the numbers; the scene draws the instruments.

import { useEffect, useState } from 'react';
import type { LandingView } from './types';
import { reducedMotion } from './motion';

/** How long the price of a lot takes to fall from its start to the hammer. */
export const SWEEP_MS = 1100;

/** How long a lot stays on the clock before the next one comes. */
const HOLD_MS = 1400;

export interface Replay {
  /** The lot on the clock, or null when the day has nothing left to replay. */
  live: LandingView | null;
  /** The last lot of the day, once the replay ran past it. */
  closed: LandingView | null;
  /** The one-based position of the live lot. */
  position: number;
  /** How many lots the day holds. */
  total: number;
  next: () => void;
  skip: () => void;
}

/** The day's landings, replayed one at a time. */
export function useReplay(landings: LandingView[], dayKey: string): Replay {
  const [index, setIndex] = useState(0);
  useEffect(() => { setIndex(0); }, [dayKey]);
  useEffect(() => {
    if (index >= landings.length || landings.length === 0 || reducedMotion()) return;
    const timer = window.setTimeout(() => setIndex((i) => i + 1), HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [index, landings.length]);
  const live = index < landings.length ? landings[index] : null;
  const closed = live === null && landings.length > 0 ? landings[landings.length - 1] : null;
  return {
    live,
    closed,
    position: index + 1,
    total: landings.length,
    next: () => setIndex((i) => Math.min(i + 1, landings.length)),
    skip: () => setIndex(landings.length),
  };
}

/** The price of the lot, falling from its start to the hammer. */
export function useSweep(start: number, hammer: number, lotKey: string): number {
  const [price, setPrice] = useState(start);
  useEffect(() => {
    if (reducedMotion() || start <= hammer) {
      setPrice(hammer);
      return;
    }
    let frame = 0;
    const t0 = performance.now();
    function tick(now: number): void {
      const k = Math.min(1, (now - t0) / SWEEP_MS);
      setPrice(start + (hammer - start) * k);
      if (k < 1) frame = window.requestAnimationFrame(tick);
    }
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [start, hammer, lotKey]);
  return price;
}

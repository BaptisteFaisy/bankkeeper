// The keyboard half of the sea chart (audit A8).
//
// The chart is a canvas, so a mouse player picks a boat then a zone by click.
// A keyboard player gets the same two steps from one tab stop: Left/Right walk
// the player's boats, Up/Down walk the four targets (three zones, then the
// quay), Enter or Space sends the boat. The canvas `aria-label` narrates both
// cursors, because canvas pixels are invisible to a screen reader.
import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { BoatView, ZoneId } from '../types';
import { ZONE_LABEL } from '../types';

/** The four places a boat can be sent to, quay last. */
const TARGETS: Array<ZoneId | null> = ['shallows', 'greybank', 'deeps', null];

export interface ChartCursor {
  boat: number;
  target: number;
}

export interface ChartKeyboard {
  cursor: ChartCursor;
  label: string;
  onKeyDown: (event: KeyboardEvent<HTMLCanvasElement>) => void;
}

/** What a key asks for: move a cursor, or send the boat. */
type KeyAction = { kind: 'boat' | 'target' | 'send'; step: number };

function targetName(target: number): string {
  const zone = TARGETS[target];
  return zone === null ? 'the quay' : ZONE_LABEL[zone];
}

function cycle(index: number, total: number, step: number): number {
  if (total <= 0) return 0;
  return (index + step + total) % total;
}

/** The one place that reads a key: arrows move, Enter sends. */
export function keyAction(key: string): KeyAction | null {
  if (key === 'Enter' || key === ' ') return { kind: 'send', step: 0 };
  if (key === 'ArrowLeft') return { kind: 'boat', step: -1 };
  if (key === 'ArrowRight') return { kind: 'boat', step: 1 };
  if (key === 'ArrowUp') return { kind: 'target', step: -1 };
  if (key === 'ArrowDown') return { kind: 'target', step: 1 };
  return null;
}

function chartLabel(boats: BoatView[], selectedBoat: string | null, target: number): string {
  const help = 'Left and right arrows pick a boat, up and down arrows pick a target, Enter sends it.';
  const picked = boats.find((b) => b.id === selectedBoat) ?? null;
  if (picked === null) {
    return `Sea chart: ${boats.length} boats, three zones and the quay. ${help} No boat picked yet.`;
  }
  return `Sea chart: ${picked.name} picked, target ${targetName(target)}. ${help}`;
}

export function useChartKeys(
  boats: BoatView[],
  selectedBoat: string | null,
  onPickBoat: (id: string) => void,
  onPickZone: (zone: ZoneId) => void,
  onPickQuay: () => void,
): ChartKeyboard {
  const [cursor, setCursor] = useState<ChartCursor>({ boat: 0, target: 0 });
  const mine = boats.filter((b) => b.mine);

  function pickBoat(step: number): void {
    if (mine.length === 0) return;
    const next = cycle(cursor.boat, mine.length, step);
    setCursor((c) => ({ ...c, boat: next }));
    const boat = mine[next];
    if (boat.id !== selectedBoat) onPickBoat(boat.id);
  }

  function pickTarget(step: number): void {
    setCursor((c) => ({ ...c, target: cycle(c.target, TARGETS.length, step) }));
  }

  function send(): void {
    const zone = TARGETS[cursor.target];
    if (zone === null) onPickQuay();
    else onPickZone(zone);
  }

  function onKeyDown(event: KeyboardEvent<HTMLCanvasElement>): void {
    const action = keyAction(event.key);
    if (action === null) return;
    event.preventDefault();
    if (action.kind === 'send') send();
    else if (action.kind === 'boat') pickBoat(action.step);
    else pickTarget(action.step);
  }

  return { cursor, label: chartLabel(boats, selectedBoat, cursor.target), onKeyDown };
}

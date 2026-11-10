// layout.ts — the geometry of the chart.
//
// The zone rectangles, the quay and the boat marks are the numbers of
// the old canvas chart (`components/SeaMap.tsx`): the same marks, so the
// scene and the chart agree on where a boat sits. Nothing here paints.

export const MAP_W = 760;
export const MAP_H = 440;
export const HUD_H = 116;
export const VIEW_W = MAP_W;
export const VIEW_H = MAP_H + HUD_H;

export type ZoneKey = 'shallows' | 'greybank' | 'deeps';

export const ZONE_KEYS: ZoneKey[] = ['shallows', 'greybank', 'deeps'];

export const ZONE_LABEL: Record<ZoneKey, string> = {
  shallows: 'The Shallows',
  greybank: 'Greybank',
  deeps: 'The Deeps',
};

export interface Rect { x: number; y: number; w: number; h: number }
export interface Pt { x: number; y: number }

export const ZONE_RECTS: Record<ZoneKey, Rect> = {
  shallows: { x: 168, y: 16, w: 576, h: 128 },
  greybank: { x: 168, y: 156, w: 576, h: 136 },
  deeps: { x: 168, y: 304, w: 576, h: 120 },
};

export const COAST_X = 152;
export const QUAY: Rect = { x: 24, y: 296, w: 112, h: 120 };

/** Where the day dial sits: the top corner of the sand strip. */
export const DIAL_RECT: Rect = { x: 10, y: 8, w: 98, h: 54 };

/** The three merchants on the coast. */
export const STALL_MARKS: Pt[] = [
  { x: 16, y: 78 },
  { x: 84, y: 78 },
  { x: 16, y: 184 },
];

/** Where a crate lands when it comes off a boat. */
export const DROP_MARK: Pt = { x: QUAY.x + QUAY.w - 26, y: QUAY.y + 46 };

/** The harbour chest, on the quay. */
export const CHEST_MARK: Pt = { x: QUAY.x + 56, y: QUAY.y + 88 };

export function zoneRect(id: ZoneKey): Rect {
  return ZONE_RECTS[id];
}

/** Deterministic berth on the quay: same order, same marks. */
export function quayMark(index: number): Pt {
  return {
    x: QUAY.x + 32 + (index % 2) * 52,
    y: QUAY.y + 30 + Math.floor(index / 2) * 34,
  };
}

/** Deterministic fishing ground inside a zone. */
export function zoneMark(id: ZoneKey, index: number): Pt {
  const r = ZONE_RECTS[id];
  return {
    x: r.x + 180 + (index % 5) * 64,
    y: r.y + 44 + Math.floor(index / 5) * 46,
  };
}

/** A stable pseudo-random number: the sea grain never moves. */
export function hash01(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5;
  return s - Math.floor(s);
}

/** The nests of the gulls that circle over the chart. */
export const GULL_NESTS: Pt[] = [
  { x: 400, y: 60 },
  { x: 560, y: 210 },
  { x: 360, y: 350 },
];

/** Where fish can be seen: a fixed field per zone, never re-rolled. */
export const FISH_SPOTS: Record<ZoneKey, Pt[]> = buildFishSpots();

function buildFishSpots(): Record<ZoneKey, Pt[]> {
  const out = {} as Record<ZoneKey, Pt[]>;
  ZONE_KEYS.forEach((id, zi) => {
    const r = ZONE_RECTS[id];
    const pts: Pt[] = [];
    for (let i = 0; i < 22; i += 1) {
      pts.push({
        x: r.x + 210 + hash01(zi * 100 + i) * (r.w - 240),
        y: r.y + 22 + hash01(zi * 100 + i + 50) * (r.h - 44),
      });
    }
    out[id] = pts;
  });
  return out;
}

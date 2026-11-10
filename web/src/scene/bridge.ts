// bridge.ts — the game, in the language of the scene.
//
// The scene knows nothing of the harbour: it reads hulls, grounds, stalls
// and instruments. This module is the only place that knows both. It turns
// a `PortState` into a `SceneState`, and it spots the moments that deserve
// a tween: a lot comes off a boat, a merchant starts buying, the port fund
// pays for a motion.

import type { LandingView, PortState, ZoneId } from '../types';
import { ZONE_LABEL } from '../types';
import { hex } from './palette';
import { DROP_MARK } from './layout';
import type { BoatModel } from './boats';
import type { SeaStall, SeaZone } from './sea';
import type { HudView, LedgerRow } from './hud';
import type { StallKind } from './sprites';
import type { SceneEvent, SceneState } from './scene';

/** Everything the scene needs to know about the harbour, at one instant. */
export interface SceneInput {
  port: PortState | null;
  /** The lot the criée is replaying right now, if any. */
  live: LandingView | null;
  /** The price the sweep is at, in gold pieces. */
  price: number;
  /** The boat the player picked: the scene rings it. */
  selectedBoat: string | null;
  /** The clock of the scene, in milliseconds. */
  now: number;
}

/** The phase of the day, from the weekday the harbour is on. */
const DAY_PHASE: Record<string, number> = {
  Mon: 0.06, Tue: 0.2, Wed: 0.36, Thu: 0.52, Fri: 0.68, Sat: 0.82, Sun: 0.93,
};

const FALLBACK_PHASE = 0.4;

/** Dawn, day, dusk, night: the dial in the corner follows the weekday. */
export function dayPhase(day: string): number {
  return DAY_PHASE[day] ?? FALLBACK_PHASE;
}

/** The hull of a boat: the player's orange, else the colour of its captain. */
function hullColour(port: PortState, captain: string, mine: boolean): string {
  if (mine) return hex('--buoy');
  const wanted = captain.toLowerCase();
  const found = port.captains.find(
    (c) => c.name.toLowerCase() === wanted || c.id.toLowerCase() === wanted,
  );
  return found?.color ?? hex('--muted');
}

/** The kind of stall a merchant gets: the scene draws three shapes. */
export function stallKind(name: string): StallKind {
  const key = name.toLowerCase();
  if (key.includes('cann')) return 'cannery';
  if (key.includes('gull') || key.includes('inn')) return 'inn';
  return 'monger';
}

/** The debt one zone owes the sea, in crates. */
export function zoneDebt(port: PortState | null, zone: ZoneId): number {
  const line = port?.sea?.zones.find((z) => z.zone === zone);
  return line?.debt ?? 0;
}

/** The hulls, one per boat, with their ground and their captain's colour. */
export function sceneBoats(port: PortState | null, selectedBoat: string | null): BoatModel[] {
  if (port === null) return [];
  return port.boats.map((boat) => ({
    id: boat.id,
    hull: hullColour(port, boat.captain, boat.mine),
    zone: boat.zone,
    mine: boat.mine,
    disarmed: boat.disarmed,
    selected: boat.id === selectedBoat,
  }));
}

/** The grounds: how rich each zone still is, and what it owes the sea. */
export function sceneZones(port: PortState | null): SeaZone[] {
  const zones = port?.zones ?? [];
  return zones.map((zone) => ({
    id: zone.id,
    stock: Math.max(0, Math.min(1, zone.schools / 4)),
    debt: zoneDebt(port, zone.id) > 0,
  }));
}

/** The merchants on the coast: the three the scene draws. */
export function sceneStalls(port: PortState | null): SeaStall[] {
  return (port?.buyers ?? []).slice(0, 3).map((buyer) => ({
    name: buyer.name,
    kind: stallKind(buyer.name),
  }));
}

/** The register: who took what today, and how much of the catch that is. */
export function sceneLedger(landings: LandingView[]): LedgerRow[] {
  const totals = new Map<string, number>();
  for (const lot of landings) {
    totals.set(lot.captain, (totals.get(lot.captain) ?? 0) + lot.crates);
  }
  const sum = [...totals.values()].reduce((a, b) => a + b, 0);
  return [...totals.entries()].map(([name, crates]) => ({
    name,
    crates,
    share: sum > 0 ? crates / sum : 0,
  }));
}

/** The chest on the quay: what the harbour holds, and how full it is. */
export function sceneFund(port: PortState | null): { level: number; amount: number } {
  const fund = port?.fund;
  const balance = fund?.balance ?? 0;
  const collected = fund?.paid_in ?? 0;
  const level = collected > 0 ? Math.max(0, Math.min(1, balance / collected)) : 0;
  return { level, amount: balance };
}

/** The criée, as the instruments of the scene read it. */
export function sceneAuction(input: SceneInput): HudView['auction'] {
  const lot = input.live;
  const buyers = input.port?.buyers ?? [];
  const buyer = lot?.buyer ?? null;
  const index = buyer === null ? -1 : buyers.findIndex((b) => b.name === buyer);
  return {
    active: lot !== null && buyer !== null,
    price: input.price,
    start: lot?.start ?? input.price,
    endsAt: input.now + 1100,
    buyer: index,
    buyerName: buyer ?? '',
  };
}

/** The whole picture the scene paints. */
export function sceneState(input: SceneInput): SceneState {
  const port = input.port;
  return {
    boats: sceneBoats(port, input.selectedBoat),
    zones: sceneZones(port),
    stalls: sceneStalls(port),
    hud: {
      dayPhase: dayPhase(port?.day ?? ''),
      dayLabel: port?.day ?? '',
      week: port?.week ?? 1,
      auction: sceneAuction(input),
      fund: sceneFund(port),
      ledger: sceneLedger(port?.landings ?? []),
    },
  };
}

/** The boat that landed this lot, if the harbour knows it. */
function boatOf(port: PortState | null, captain: string): string | null {
  const wanted = captain.toLowerCase();
  const boats = port?.boats ?? [];
  const match = boats.find((b) => b.captain.toLowerCase() === wanted);
  if (match !== undefined) return match.id;
  return null;
}

/** The stall of the merchant who bought the lot. */
function stallOf(port: PortState | null, buyer: string | null): number {
  if (buyer === null) return -1;
  const buyers = port?.buyers ?? [];
  return buyers.findIndex((b) => b.name === buyer);
}

/** Two lots are the same lot when they say the same thing. */
function sameLot(a: LandingView | null, b: LandingView | null): boolean {
  if (a === null || b === null) return a === b;
  return a.captain === b.captain && a.crates === b.crates && a.price === b.price;
}

/** What the scene says of itself, for the readers of the screen. */
export function sceneDescription(port: PortState | null): string {
  if (port === null) return 'The harbour is not awake yet.';
  const zones = port.zones.map((zone) => {
    const debt = zoneDebt(port, zone.id);
    const stock = Math.round(Math.max(0, Math.min(1, zone.schools / 4)) * 100);
    const bill = debt > 0 ? `, owes the sea ${Math.round(debt)} crates` : '';
    return `${ZONE_LABEL[zone.id]} is ${stock}% full${bill}`;
  });
  const atSea = port.boats.filter((b) => b.zone !== null).length;
  const fund = sceneFund(port);
  const chest = Math.round(fund.amount);
  return `${zones.join('. ')}. ${atSea} boats at sea. The port fund holds ${chest} gold.`;
}

/** The events the last change deserves: one tween each, never a loop. */
export function sceneEvents(previous: SceneInput | null, next: SceneInput): SceneEvent[] {
  const events: SceneEvent[] = [];
  const before = previous?.live ?? null;
  const after = next.live;
  if (after !== null && !sameLot(before, after)) {
    const boat = boatOf(next.port, after.captain);
    if (boat !== null) events.push({ type: 'land', boatId: boat });
    else events.push({ type: 'splash', x: DROP_MARK.x, y: DROP_MARK.y });
    const stall = stallOf(next.port, after.buyer);
    if (stall >= 0) events.push({ type: 'auction', stall });
  }
  const paidBefore = previous?.port?.fund?.paid_out ?? 0;
  const paidAfter = next.port?.fund?.paid_out ?? 0;
  if (paidAfter > paidBefore) events.push({ type: 'chest' });
  return events;
}

/** What the scene says out loud when the sea puts a zone in its debt. */
export function sceneNarration(previous: SceneInput | null, next: SceneInput): string | null {
  const zones = next.port?.zones ?? [];
  for (const zone of zones) {
    const debt = zoneDebt(next.port, zone.id);
    const was = previous === null ? 0 : zoneDebt(previous.port, zone.id);
    if (debt > 0 && was === 0) {
      return `${ZONE_LABEL[zone.id]} owes the sea ${Math.round(debt)} crates: the anchor is broken.`;
    }
  }
  return null;
}

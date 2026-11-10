// Shared domain types for the Tidewater game UI.
// Mirrors the relay API shapes; all UI strings stay in components.
import type { Charter } from './charter';

export type ZoneId = 'shallows' | 'greybank' | 'deeps';

export const ZONES: ZoneId[] = ['shallows', 'greybank', 'deeps'];

export const ZONE_LABEL: Record<ZoneId, string> = {
  shallows: 'The Shallows',
  greybank: 'Greybank',
  deeps: 'The Deeps',
};

export const ZONE_SPECIES: Record<ZoneId, string> = {
  shallows: 'Herring',
  greybank: 'Herring',
  deeps: 'Cod',
};

export type Mesh = 'large' | 'small';

export const MESH_LABEL: Record<Mesh, string> = {
  large: 'Large mesh',
  small: 'Small mesh',
};

// Net reported per landing (sim landing.mesh). Accepts the view slug
// ("large"/"small") and the raw sim spelling ("Large"/"Small").
export function parseMesh(raw: unknown): Mesh {
  const word = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (word.startsWith('small')) return 'small';
  return 'large';
}

export type Trend = 'rising' | 'steady' | 'falling';

export interface ZoneView {
  id: ZoneId;
  catchPerTrip: number;
  trend: Trend;
  tripCost: number;
  // Drawn fish schools, 0..4. An emptying zone loses these first.
  schools: number;
  boats: number;
  survey: string | null;
}

export interface TripView {
  zone: ZoneId;
  progress: number;
}

export interface BoatView {
  id: string;
  name: string;
  captain: string;
  mine: boolean;
  // Null means lying at the quay.
  zone: ZoneId | null;
  mesh: Mesh;
  trip: TripView | null;
  lastCatch: string;
  disarmed: boolean;
}

export interface CaptainView {
  id: string;
  name: string;
  color: string;
  gold: number;
  licences: number;
  active: boolean;
}

export interface BuyerLimit {
  species: string;
  limit: number;
  reasoning: string;
}

export interface BuyerView {
  id: string;
  name: string;
  open: boolean;
  // Every price this merchant would pay now, with its reasoning line.
  limits?: BuyerLimit[];
  // Null when the buyer does not bid on the current lot.
  limit: number | null;
  stock: number;
  target: number;
  buys: string;
}

export interface LotView {
  id: number;
  species: string;
  crates: number;
  captain: string;
  mesh: Mesh;
}

export interface SaleView {
  lot: number;
  buyer: string;
  crates: number;
  price: number;
  total: number;
  reasoning: string;
}

export interface AuctionView {
  lot: LotView | null;
  clock: number;
  floor: number;
  start: number;
  lastSale: SaleView | null;
  reasoning: string;
}

export interface LandingView {
  captain: string;
  crates: number;
  species: string;
  price: number;
  total: number;
  buyer: string | null;
  start: number;
  // Net this landing was fished with (sim landing.mesh), not the
  // boat's current net: a re-rigged boat keeps its old landings.
  mesh: Mesh;
}

export interface PortState {
  week: number;
  day: string;
  tide: string;
  seed: string;
  playerGold: number;
  netWorth: number;
  quotaLeft: number;
  licences: number;
  zones: ZoneView[];
  boats: BoatView[];
  captains: CaptainView[];
  buyers: BuyerView[];
  auction: AuctionView;
  landings: LandingView[];
  reasoning: string[];
  // Going licence price in gold pieces, when the sim reports it.
  licencePrice?: number;
  // True once the season is over (sim view_state seasonOver).
  seasonOver?: boolean;
  // Season bilan payload (sim bilan, centigold); parsed via parseBilan.
  bilan?: unknown;
  // Last council report (sim view_state lastCouncil); parsed via parseCouncilOutcome.
  lastCouncil?: unknown;
  // Season length in days and weeks (sim view_state), for shareable links.
  seasonDays?: number;
  weeksPerSeason?: number;
  // Live clock: seconds between two lots, and how many lots are left today.
  secondsPerLot?: number;
  lotsLeft?: number;
  // Campaign: which season this is, how many, and the bilans already closed.
  season?: number;
  campaignSeasons?: number;
  campaignOver?: boolean;
  campaign?: unknown[];
  // Barreau 4: the debt owed to the sea, live, in crates.
  sea?: SeaView;
  // The port's memory: one entry per closed season, oldest first (sim chronicle).
  chronicle?: ChronicleEntryView[];
  // The charter this campaign runs under, when the player wrote one (sim charter).
  charter?: Charter | null;
}

// One closed season as the harbour remembers it (sim ChronicleEntry).
// netWorth is in centigold, like every sim money field; the panel formats it.
export interface ChronicleEntryView {
  season: number;
  net_worth: number;
  stocks: [number, number, number];
  closures: string[];
  rule: string | null;
  seed: number;
}

export interface FFSummary {
  days_run: number;
  seed: number;
  history_hash: string;
  events: number;
}

export interface FFHistoryEntry {
  day: number;
  stocks: Record<string, number>;
  herring_price: number;
  bankruptcies: string[];
}

export interface FFEvent {
  day: number;
  kind: string;
  detail: string;
}

export interface FFSeries {
  days: number[];
  stocks: number[][];
  herring_price: number[];
  gold_total: number[];
}

export interface FFMarker {
  day: number;
  kind: string;
  detail: string;
}

export interface FFResponse {
  summary: FFSummary;
  journal: FFEvent[];
  series: FFSeries;
  markers: FFMarker[];
}

export const EMPTY_AUCTION: AuctionView = {
  lot: null,
  clock: 0,
  floor: 0,
  start: 0,
  lastSale: null,
  reasoning: '',
};

export interface ToastMsg {
  id: number;
  kind: 'error' | 'info' | 'report';
  title: string;
  body?: string;
  count: number;
}

export function zoneById(state: PortState | null, id: ZoneId): ZoneView | null {
  return state?.zones.find((z) => z.id === id) ?? null;
}

export function myBoats(state: PortState | null): BoatView[] {
  return state?.boats.filter((b) => b.mine) ?? [];
}

export interface JudgesActor {
  id: string;
  name: string;
  gold: number;
  licences: number;
  stopped: boolean;
}

export interface LoanView {
  id: number;
  borrower: string;
  holder: string;
  outstanding: number;
  missed: number;
}

export interface CouncilProposal {
  quota_per_licence: number;
  close_zone: string | null;
  ban_small_mesh: boolean;
  indemnity_per_licence_week: number;
  // Barreau 3: who pays an indemnity — the port fund or a further levy on
  // next season's landings. Null on a motion that promises nothing.
  funding?: 'fund' | 'levies' | null;
  // Barreau 2: landing levy for next season, centigold a crate; absent or
  // null means the motion leaves the levy alone.
  levy_per_crate?: number | null;
}

// Barreau 3: a season is four weeks (rules/config.rs weeks_per_season). The
// harbour office has no season prop, so the preview repeats the rule's
// default; the sim still decides the real bill at the council.
export const SEASON_WEEKS = 4;

// What an indemnity promises over a season: rate x licences x weeks, gold.
// The council pays every licence that votes yes, so the preview counts them
// all — the worst case the motion can cost.
export function indemnityBill(
  perLicenceWeek: number,
  licences: number,
  weeks: number = SEASON_WEEKS,
): number {
  return Math.round(perLicenceWeek * licences * weeks * 100) / 100;
}

export interface JudgesLive {
  seed: number;
  day: number;
  week: number;
  actors: JudgesActor[];
  gold_total: number;
  ext_in: number;
  ext_out: number;
  licence_pool: number;
  proposal: CouncilProposal | null;
  loans: LoanView[];
}

export interface GraphLive {
  history: Array<Record<string, unknown>>;
  stocks: [number, number, number];
  capacity: [number, number, number];
}

// Season council as the day report tells it: outcome, per-voter
// lines (TW-C4-05) and whether a motion was tabled at all.
export interface CouncilOutcome {
  season: number;
  tabled: boolean;
  passed: boolean;
  forVotes: number;
  againstVotes: number;
  lines: string[];
}

// What the app keeps from each day response: the council outcome
// (if any), the season-over flag and the raw bilan payload.
export interface DayNote {
  council: CouncilOutcome | null;
  seasonOver: boolean;
  bilan: unknown;
}

function numOr(raw: unknown, fallback: number): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
}

export function parseCouncilOutcome(raw: unknown): CouncilOutcome | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o['season'] !== 'number') return null;
  const tally = (typeof o['tally'] === 'object' && o['tally'] !== null
    ? o['tally'] as Record<string, unknown> : {});
  const lines = Array.isArray(o['lines'])
    ? (o['lines'] as unknown[]).filter((l): l is string => typeof l === 'string')
    : [];
  return {
    season: o['season'] as number,
    tabled: o['tabled'] !== false,
    passed: tally['passed'] === true,
    forVotes: numOr(tally['for_votes'], 0),
    againstVotes: numOr(tally['against_votes'], 0),
    lines,
  };
}

// Season bilan in UI units: net worth in gold pieces, remaining
// stock per zone (shallows, greybank, deeps), licences held, and the
// debt owed to the sea in crates (barreau 4) — the second column.
export interface SeasonBilan {
  netWorth: number;
  stocks: [number, number, number];
  licences: number;
  // What this season alone took above the sustainable catch, in crates.
  seaDebt?: number;
  // The liability the campaign carries, this season included, in crates.
  seaDebtTotal?: number;
}

/** One zone's line of the sea bill (barreau 4), in crates. */
export interface SeaZone {
  zone: ZoneId;
  taken: number;
  ceiling: number;
  debt: number;
  fallowWeeks: number;
}

/** The debt owed to the sea, live: the bill and the two ways to pay it. */
export interface SeaView {
  debt: number;
  season: number;
  zones: SeaZone[];
  reseedPrice: number;
  reseedGold: number;
}

function readStocks(raw: unknown): [number, number, number] | null {
  if (Array.isArray(raw) && raw.length >= 3) {
    const [a, b, c] = raw;
    if (typeof a === 'number' && typeof b === 'number' && typeof c === 'number') {
      return [Math.round(a), Math.round(b), Math.round(c)];
    }
    return null;
  }
  if (typeof raw === 'object' && raw !== null) {
    const o = raw as Record<string, unknown>;
    const byZone = (zone: string): number | null => {
      for (const key of Object.keys(o)) {
        if (key.toLowerCase() === zone && typeof o[key] === 'number') {
          return Math.round(o[key] as number);
        }
      }
      return null;
    };
    const a = byZone('shallows');
    const b = byZone('greybank');
    const c = byZone('deeps');
    if (a !== null && b !== null && c !== null) return [a, b, c];
  }
  return null;
}

// Net worth may arrive in gold pieces (view_state) or centigold
// (day report). The live net worth disambiguates: 100x apart can
// only be a unit mismatch, never a day of earnings.
function worthInPieces(worth: number, reference: number | undefined): number {
  if (reference === undefined || !Number.isFinite(reference) || reference === 0) return worth;
  const scale = Math.max(1, Math.abs(reference));
  const direct = Math.abs(worth - reference) / scale;
  const scaled = Math.abs(worth / 100 - reference) / scale;
  return scaled < direct ? worth / 100 : worth;
}

export function parseBilan(raw: unknown, referenceNetWorth?: number): SeasonBilan | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const worth = o['net_worth'] ?? o['netWorth'];
  const licences = o['licences'] ?? o['licenses'];
  const stocks = readStocks(o['stocks']);
  if (typeof worth !== 'number' || !Number.isFinite(worth)) return null;
  if (typeof licences !== 'number' || !Number.isFinite(licences)) return null;
  if (stocks === null) return null;
  return {
    netWorth: worthInPieces(worth, referenceNetWorth),
    stocks,
    licences: Math.round(licences),
    seaDebt: readCrates(o['sea_debt'] ?? o['seaDebt']),
    seaDebtTotal: readCrates(o['sea_debt_total'] ?? o['seaDebtTotal']),
  };
}

/** A crate count from the engine, or undefined when the save predates it. */
function readCrates(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  return Math.round(raw);
}

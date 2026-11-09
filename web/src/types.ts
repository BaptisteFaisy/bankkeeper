// Shared domain types for the Tidewater game UI.
// Mirrors the relay API shapes; all UI strings stay in components.

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

export interface BuyerView {
  id: string;
  name: string;
  open: boolean;
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

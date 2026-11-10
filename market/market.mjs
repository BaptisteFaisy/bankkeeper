//! The shared auction: every player's landings of a species in the current
//! ten-minute window are added up, and one price — computed on that total —
//! is paid to all of them. Flood the window and everyone is paid less.
//!
//! Nothing here touches the network or the clock directly: `now` is injected,
//! the state file is a path. Same landings, same clock, same price.

import { BASE_CENTIGOLD, SPECIES, windowPrice } from './price.mjs';
import { readStateFile, writeStateFile } from './store.mjs';

const STATE_VERSION = 1;
const HISTORY_WINDOWS = 24;
const MAX_CRATES_PER_LANDING = 1_000_000;

/** An error the HTTP layer can turn into a status and a JSON body. */
export class MarketError extends Error {
  constructor(status, code, details = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function integerOr(raw, fallback) {
  const value = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** Same, but a zero would break the arithmetic (a window of no seconds). */
function positiveOr(raw, fallback) {
  return integerOr(raw, fallback) || fallback;
}

/** Configuration: explicit options win, then the environment, then defaults. */
export function resolveConfig(options = {}) {
  const env = options.env ?? process.env;
  return {
    windowSecs: positiveOr(options.windowSecs ?? env.MARKET_WINDOW_SECS, 600),
    capCrates: integerOr(options.capCrates ?? env.MARKET_CAP_CRATES, 2_000),
    depthCrates: positiveOr(options.depthCrates ?? env.MARKET_DEPTH_CRATES, 600),
    elasticityBps: integerOr(options.elasticityBps ?? env.MARKET_ELASTICITY_BPS, 5_000),
    floorBps: integerOr(options.floorBps ?? env.MARKET_FLOOR_BPS, 2_500),
    ceilingBps: integerOr(options.ceilingBps ?? env.MARKET_CEILING_BPS, 20_000),
    now: options.now ?? (() => Date.now()),
    statePath: options.statePath ?? null,
  };
}

function emptyLandings() {
  return Object.fromEntries(SPECIES.map((species) => [species, []]));
}

function iso(ms) {
  return new Date(ms).toISOString();
}

function byPlayer(a, b) {
  return a.player < b.player ? -1 : 1;
}

/** Price band of one species, straight from the port's rules. */
function band(cfg, species) {
  const base = BASE_CENTIGOLD[species];
  return {
    base,
    floor: Math.trunc((base * cfg.floorBps) / 10_000),
    ceiling: Math.trunc((base * cfg.ceilingBps) / 10_000),
  };
}

/** One landing added to the per-player ledger of the window. */
function addLanding(ledger, landing) {
  const row = ledger.get(landing.player) ?? { player: landing.player, crates: 0, requested_floor: 0 };
  row.crates += landing.crates;
  row.requested_floor = Math.max(row.requested_floor, landing.price_floor ?? 0);
  ledger.set(landing.player, row);
}

/**
 * Total, capped total and per-player rows for one species in one window.
 * The cap is per player, per species, per window: that is the player's share
 * of the common price. Crates over it are taken but do not move the price.
 */
function summarise(ledger, capCrates) {
  let total = 0;
  let counted = 0;
  const players = [...ledger.values()].sort(byPlayer);
  for (const row of players) {
    row.counted = Math.min(row.crates, capCrates);
    row.over_cap = row.crates - row.counted;
    total += row.crates;
    counted += row.counted;
  }
  return { total, counted, over: total - counted, players };
}

function ledgerOf(landings, capCrates, extra = null) {
  const ledger = new Map();
  for (const landing of landings) addLanding(ledger, landing);
  if (extra) addLanding(ledger, extra);
  return summarise(ledger, capCrates);
}

export function createMarket(options = {}) {
  const cfg = resolveConfig(options);
  const windowMs = cfg.windowSecs * 1_000;
  const state = restoreState(cfg, windowMs);
  const memory = (species) => state.memory[species] ?? BASE_CENTIGOLD[species];

  function priceFor(species, counted) {
    const { base, floor, ceiling } = band(cfg, species);
    return windowPrice({
      anchor: memory(species),
      tonnage: counted,
      depth: cfg.depthCrates,
      elasticityBps: cfg.elasticityBps,
      floorCents: floor,
      ceilingCents: ceiling,
    });
  }

  function persist() {
    writeStateFile(cfg.statePath, state);
  }

  function hasLandings(win) {
    return SPECIES.some((species) => win.landings[species].length > 0);
  }

  /** Freeze the window: one price per species, one payout row per player. */
  function seal(win) {
    const record = { id: win.id, opens_at: iso(win.id * windowMs), closes_at: iso((win.id + 1) * windowMs), species: {} };
    for (const species of SPECIES) {
      const landings = win.landings[species];
      if (landings.length === 0) continue;
      const sum = ledgerOf(landings, cfg.capCrates);
      const price = priceFor(species, sum.counted);
      record.species[species] = { ...speciesRecord(species, sum, price), players: payouts(sum, price, band(cfg, species)) };
      state.memory[species] = price;
    }
    state.sealed.push(record);
    state.sealed = state.sealed.slice(-HISTORY_WINDOWS);
  }

  function speciesRecord(species, sum, price) {
    return { price, crates_total: sum.total, crates_counted: sum.counted, crates_over_cap: sum.over };
  }

  function payouts(sum, price, { floor }) {
    return sum.players.map((row) => ({
      player: row.player,
      crates: row.crates,
      crates_counted: row.counted,
      crates_over_cap: row.over_cap,
      payout: row.counted * price + row.over_cap * floor,
      requested_floor: row.requested_floor,
      paid_below_floor: row.requested_floor > price,
    }));
  }

  /** Move to the current window, sealing the previous one if it saw landings. */
  function advance() {
    const id = Math.floor(cfg.now() / windowMs);
    if (id === state.current.id) return;
    if (hasLandings(state.current)) seal(state.current);
    state.current = { id, landings: emptyLandings() };
    persist();
  }

  function validate(input) {
    const player = typeof input?.player === 'string' ? input.player.trim() : '';
    const species = input?.species;
    const crates = Number(input?.crates);
    const priceFloor = Number(input?.price_floor ?? 0);
    if (!player || player.length > 64) throw new MarketError(400, 'bad_player');
    if (!SPECIES.includes(species)) throw new MarketError(400, 'unknown_species', { known: SPECIES });
    if (!Number.isInteger(crates) || crates < 1 || crates > MAX_CRATES_PER_LANDING) {
      throw new MarketError(400, 'bad_crates');
    }
    if (!Number.isInteger(priceFloor) || priceFloor < 0) throw new MarketError(400, 'bad_price_floor');
    return { player, species, crates, price_floor: priceFloor, signature: input.signature ?? null };
  }

  /** `POST /land`: one player's crates join the window. */
  function land(input) {
    const landing = validate(input);
    advance();
    const landings = state.current.landings[landing.species];
    const projected = ledgerOf(landings, cfg.capCrates, landing);
    const price = priceFor(landing.species, projected.counted);
    if (price < landing.price_floor) {
      throw new MarketError(409, 'price_below_floor', { price, price_floor: landing.price_floor, ...speciesRecord(landing.species, projected, price) });
    }
    landings.push({ ...landing, at: iso(cfg.now()) });
    persist();
    const row = projected.players.find((entry) => entry.player === landing.player);
    return {
      window: state.current.id,
      species: landing.species,
      player: landing.player,
      crates: landing.crates,
      crates_total: projected.total,
      crates_counted: projected.counted,
      over_cap: row.over_cap,
      price,
      price_floor_surplus: band(cfg, landing.species).floor,
      projected_payout: row.counted * price + row.over_cap * band(cfg, landing.species).floor,
      closes_at: iso((state.current.id + 1) * windowMs),
      signature: landing.signature ? 'stored' : 'none',
    };
  }

  /** `GET /price`: the one price everybody is paid, and who put what in. */
  function quote(species) {
    if (!SPECIES.includes(species)) throw new MarketError(400, 'unknown_species', { known: SPECIES });
    advance();
    const sum = ledgerOf(state.current.landings[species], cfg.capCrates);
    const price = priceFor(species, sum.counted);
    const { base, floor, ceiling } = band(cfg, species);
    return {
      window: state.current.id,
      species,
      crates_total: sum.total,
      crates_counted: sum.counted,
      crates_over_cap: sum.over,
      price,
      base,
      anchor: memory(species),
      floor,
      ceiling,
      unit: 'centigold',
      depth_crates: cfg.depthCrates,
      elasticity_bps: cfg.elasticityBps,
      players: sum.players.map((row) => ({ player: row.player, crates: row.crates, crates_counted: row.counted, crates_over_cap: row.over_cap })),
      closes_at: iso((state.current.id + 1) * windowMs),
      closes_in_secs: Math.max(0, Math.ceil(((state.current.id + 1) * windowMs - cfg.now()) / 1_000)),
    };
  }

  /** `GET /window`: the window being filled and the one that just shut. */
  function view() {
    advance();
    const current = {
      id: state.current.id,
      opens_at: iso(state.current.id * windowMs),
      closes_at: iso((state.current.id + 1) * windowMs),
      closes_in_secs: Math.max(0, Math.ceil(((state.current.id + 1) * windowMs - cfg.now()) / 1_000)),
      species: {},
    };
    for (const species of SPECIES) {
      const sum = ledgerOf(state.current.landings[species], cfg.capCrates);
      current.species[species] = { ...speciesRecord(species, sum, priceFor(species, sum.counted)), anchor: memory(species) };
    }
    return {
      window_secs: cfg.windowSecs,
      now: iso(cfg.now()),
      current,
      previous: state.sealed.at(-1) ?? null,
      memory: Object.fromEntries(SPECIES.map((species) => [species, memory(species)])),
    };
  }

  advance();
  return { config: cfg, land, quote, view, priceFor, snapshot: () => JSON.parse(JSON.stringify(state)) };
}

function restoreState(cfg, windowMs) {
  const saved = readStateFile(cfg.statePath);
  const usable = saved && saved.version === STATE_VERSION && saved.window_secs === cfg.windowSecs && saved.current?.landings;
  if (!usable) {
    return { version: STATE_VERSION, window_secs: cfg.windowSecs, memory: {}, current: { id: Math.floor(cfg.now() / windowMs), landings: emptyLandings() }, sealed: [] };
  }
  const landings = { ...emptyLandings(), ...saved.current.landings };
  return { version: STATE_VERSION, window_secs: cfg.windowSecs, memory: saved.memory ?? {}, current: { id: saved.current.id, landings }, sealed: saved.sealed ?? [] };
}

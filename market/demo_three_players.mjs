#!/usr/bin/env node
//! Three simulated players, two windows, one shared price.
//!
//! Window 0 is a normal morning: A and C land their usual crates. In window 1
//! B dumps nine hundred crates on top of them. The price A is paid falls too —
//! that is the externality, and this script prints it before/after, against a
//! parallel market where B stayed home.
//!
//!   node market/demo_three_players.mjs

import { createMarket } from './market.mjs';
import { formatGold } from './price.mjs';

const WINDOW_MS = 600_000;
const SPECIES = 'herring';
const BASE = 400;
const DEPTH = 600;
const ELASTICITY_BPS = 5_000;

function fakeClock(start) {
  const state = { t: start };
  return { now: () => state.t, add: (dt) => { state.t += dt; } };
}

function land(market, player, crates) {
  return market.land({ player, species: SPECIES, crates });
}

function totalPayout(record) {
  return record.players.reduce((sum, row) => sum + row.payout, 0);
}

function pad(text, width, right = false) {
  const value = String(text);
  return right ? value.padStart(width) : value.padEnd(width);
}

function line(cells, widths) {
  return cells.map((cell, index) => pad(cell.text, widths[index], cell.right)).join('  ');
}

function table(headers, rows, right = []) {
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => String(row[index]).length)) + 2);
  const rule = widths.map((width) => '─'.repeat(width)).join('  ');
  return [
    line(headers.map((text, index) => ({ text, right: right[index] })), widths),
    rule,
    ...rows.map((row) => line(row.map((text, index) => ({ text, right: right[index] })), widths)),
  ].join('\n');
}

const clock = fakeClock(Date.UTC(2026, 10, 10, 8, 0, 0));
const shared = createMarket({ now: clock.now, statePath: null });
const withoutB = createMarket({ now: clock.now, statePath: null });

// --- window 0: the morning everyone knows ---------------------------------
for (const market of [shared, withoutB]) {
  land(market, 'A', 150);
  land(market, 'C', 120);
}
const morning = shared.quote(SPECIES);

clock.add(WINDOW_MS);
const sealedMorning = shared.view().previous.species[SPECIES];

// --- window 1: B floods ----------------------------------------------------
for (const market of [shared, withoutB]) {
  land(market, 'A', 150);
  land(market, 'C', 120);
}
land(shared, 'B', 900);
const flooded = shared.quote(SPECIES);
const quiet = withoutB.quote(SPECIES);

clock.add(WINDOW_MS);
const sealedFlood = shared.view().previous.species[SPECIES];
const sealedQuiet = withoutB.view().previous.species[SPECIES];

// --- the numbers -----------------------------------------------------------
const receipts = [
  ...sealedMorning.players.map((row) => ['0', row, sealedMorning.price]),
  ...sealedFlood.players.map((row) => ['1', row, sealedFlood.price]),
];
const marginal = (totalPayout(sealedFlood) - totalPayout(sealedQuiet)) / 900;

const output = [
  'Tidewater — la criée commune, trois joueurs, deux fenêtres',
  '',
  `formule   prix = mémoire x (1 + ${(ELASTICITY_BPS / 10_000).toFixed(2)} x (${DEPTH} - tonnage) / ${DEPTH}), borné au plancher et à l'horloge`,
  `fenêtre   ${WINDOW_MS / 60_000} minutes · plafond 2 000 caisses par joueur et par fenêtre · hareng à ${formatGold(BASE)} l'or`,
  '',
  'FENÊTRE 0 — 08:00 → 08:10, une matinée ordinaire',
  table(
    ['joueur', 'caisses', 'prix (or)', 'paiement (or)'],
    receipts.filter(([window]) => window === '0').map(([, row, price]) => [row.player, row.crates, formatGold(price), formatGold(row.payout)]),
    [false, true, true, true],
  ),
  `tonnage ${morning.crates_total} · facteur ${(morning.price / BASE).toFixed(2)} · prix commun ${formatGold(morning.price)} l'or`,
  '',
  'FENÊTRE 1 — 08:10 → 08:20, B débarque 900 caisses',
  table(
    ['joueur', 'caisses', 'prix (or)', 'paiement (or)'],
    receipts.filter(([window]) => window === '1').map(([, row, price]) => [row.player, row.crates, formatGold(price), formatGold(row.payout)]),
    [false, true, true, true],
  ),
  '',
  'AVANT / APRÈS — fenêtre 1, avec et sans le débarquement de B',
  table(
    ['', 'sans B', 'avec B', 'écart'],
    [
      ['tonnage de la fenêtre', quiet.crates_total, flooded.crates_total, `+${flooded.crates_total - quiet.crates_total}`],
      ['prix commun (or)', formatGold(quiet.price), formatGold(flooded.price), `${(flooded.price - quiet.price) / 100 > 0 ? '+' : ''}${((flooded.price - quiet.price) / 100).toFixed(2)}`],
      ['A — 150 caisses', formatGold(sealedQuiet.players.find((row) => row.player === 'A').payout), formatGold(sealedFlood.players.find((row) => row.player === 'A').payout), `${((sealedFlood.players.find((row) => row.player === 'A').payout - sealedQuiet.players.find((row) => row.player === 'A').payout) / 100).toFixed(2)}`],
      ['C — 120 caisses', formatGold(sealedQuiet.players.find((row) => row.player === 'C').payout), formatGold(sealedFlood.players.find((row) => row.player === 'C').payout), `${((sealedFlood.players.find((row) => row.player === 'C').payout - sealedQuiet.players.find((row) => row.player === 'C').payout) / 100).toFixed(2)}`],
      ['B — 900 caisses', '—', formatGold(sealedFlood.players.find((row) => row.player === 'B').payout), '—'],
    ],
    [false, true, true, true],
  ),
  '',
  `A et C ont perdu ${((sealedQuiet.players.find((r) => r.player === 'A').payout + sealedQuiet.players.find((r) => r.player === 'C').payout) / 100).toFixed(2)} - ${((sealedFlood.players.find((r) => r.player === 'A').payout + sealedFlood.players.find((r) => r.player === 'C').payout) / 100).toFixed(2)} = ${((sealedQuiet.players.find((r) => r.player === 'A').payout + sealedQuiet.players.find((r) => r.player === 'C').payout - sealedFlood.players.find((r) => r.player === 'A').payout - sealedFlood.players.find((r) => r.player === 'C').payout) / 100).toFixed(2)} l'or, sans avoir rien changé à leur pêche.`,
  `Les 900 caisses de B n'ont rapporté que ${(marginal / 100).toFixed(2)} l'or la caisse au port, contre ${(quiet.price / 100).toFixed(2)} au prix calme : le poisson en trop détruit de la valeur au lieu d'en créer.`,
  '',
  `mémoire du marché — fenêtre 0 close à ${formatGold(sealedMorning.price)}, fenêtre 1 close à ${formatGold(sealedFlood.price)} : la fenêtre 2 repartira de là.`,
];

process.stdout.write(`${output.join('\n')}\n`);

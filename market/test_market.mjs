//! `node --test market/` — the shared auction, pinned.
//!
//! Every test injects the clock, so nothing here depends on the wall clock or
//! on the machine it runs on. Prices are exact integers: the assertions are
//! the contract.

import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createMarket, MarketError } from './market.mjs';
import { stockFactorBps } from './price.mjs';
import { startServer } from './server.mjs';

const WINDOW_MS = 600_000;

/** A clock we own: the service never reads the real one under test. */
function fakeClock(start = 0) {
  const state = { t: start };
  return { now: () => state.t, set: (t) => { state.t = t; }, add: (dt) => { state.t += dt; } };
}

function marketWith(overrides = {}) {
  const clock = fakeClock(0);
  return { clock, market: createMarket({ now: clock.now, statePath: null, ...overrides }) };
}

test('the price falls as the tonnage rises', () => {
  const { market } = marketWith();
  const price = (crates) => market.land({ player: 'A', species: 'herring', crates }).price;
  // 400 x (1 + 0.5 x (600 - tonnage) / 600), floored at 100, truncated.
  assert.equal(price(150), 550);
  assert.equal(price(150), 500); // 300 crates in the window
  assert.equal(price(300), 400); // 600 crates: the depth of the auction
  assert.equal(price(300), 300); // 900 crates: a third over the depth
  assert.equal(market.quote('herring').crates_total, 900);
  assert.equal(market.quote('herring').price, 300);
  // One feed more and it keeps falling, down to the floor of the port.
  assert.equal(stockFactorBps(1_800, 600, 5_000), 0);
});

test('the price of a window is frozen at its close', () => {
  const { clock, market } = marketWith();
  market.land({ player: 'A', species: 'herring', crates: 200 });
  const quoted = market.quote('herring').price;
  assert.equal(quoted, 533);

  clock.add(WINDOW_MS);
  market.land({ player: 'B', species: 'herring', crates: 50 }); // rolls the window
  const sealed = market.view().previous;
  assert.equal(sealed.id, 0);
  assert.equal(sealed.species.herring.price, quoted); // the frozen price
  assert.equal(market.quote('herring').window, 1);

  // More landings in the new window never touch the closed one.
  market.land({ player: 'C', species: 'herring', crates: 400 });
  assert.equal(market.view().previous.species.herring.price, quoted);
});

test('the next window remembers the last price', () => {
  const { clock, market } = marketWith();
  market.land({ player: 'A', species: 'herring', crates: 900 });
  assert.equal(market.quote('herring').price, 300);

  clock.add(WINDOW_MS);
  market.land({ player: 'A', species: 'herring', crates: 900 });
  const second = market.quote('herring');
  assert.equal(second.anchor, 300); // memory of the closed window
  assert.equal(second.price, 225); // 300 x 0.75, not 400 x 0.75
  assert.ok(second.price < 300);
});

test('one player cannot flood the common price past the cap', () => {
  const { market } = marketWith({ capCrates: 500 });
  const receipt = market.land({ player: 'A', species: 'herring', crates: 900 });
  const quote = market.quote('herring');
  assert.equal(quote.crates_total, 900); // the surplus is taken...
  assert.equal(quote.crates_counted, 500); // ...but only 500 weigh on the price
  assert.equal(quote.crates_over_cap, 400);
  assert.equal(quote.price, 433); // 400 x 1.0833, not 400 x 0.75 (300)
  assert.equal(receipt.projected_payout, 256_500); // 500 x 433 + 400 x 100
  // Crates over the cap are paid the port floor, and add nothing to the drop.
  const other = marketWith({ capCrates: 500 }).market;
  other.land({ player: 'A', species: 'herring', crates: 1_500 });
  assert.equal(other.quote('herring').price, 433);
});

test('two players are paid the same price, and the flooder is not alone', () => {
  const { clock, market } = marketWith();
  market.land({ player: 'A', species: 'herring', crates: 150 });
  assert.equal(market.quote('herring').price, 550);
  market.land({ player: 'B', species: 'herring', crates: 150 });
  const shared = market.quote('herring');
  assert.equal(shared.price, 500); // B's crates took 50 centigold from A too
  assert.deepEqual(shared.players.map((row) => [row.player, row.crates]), [['A', 150], ['B', 150]]);

  clock.add(WINDOW_MS);
  market.land({ player: 'A', species: 'herring', crates: 1 });
  const sealed = market.view().previous.species.herring;
  assert.equal(sealed.price, 500);
  for (const row of sealed.players) assert.equal(row.payout, row.crates_counted * 500);
});

test('the same landings give the same price, whatever the order', () => {
  const first = marketWith().market;
  first.land({ player: 'A', species: 'herring', crates: 150 });
  first.land({ player: 'B', species: 'herring', crates: 300 });
  const second = marketWith().market;
  second.land({ player: 'B', species: 'herring', crates: 300 });
  second.land({ player: 'A', species: 'herring', crates: 150 });
  assert.equal(first.quote('herring').price, second.quote('herring').price);
  assert.deepEqual(first.quote('herring'), second.quote('herring'));
});

test('a landing under its requested floor is refused, and leaves no trace', () => {
  const { market } = marketWith();
  assert.throws(
    () => market.land({ player: 'A', species: 'herring', crates: 900, price_floor: 400 }),
    (error) => error instanceof MarketError && error.status === 409 && error.code === 'price_below_floor',
  );
  assert.equal(market.quote('herring').crates_total, 0);
});

test('a restart on the same state file loses nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'market-'));
  const statePath = join(dir, 'state.json');
  try {
    const clock = fakeClock(0);
    const before = createMarket({ now: clock.now, statePath });
    before.land({ player: 'A', species: 'herring', crates: 300 });
    before.land({ player: 'B', species: 'cod', crates: 60 });
    const quoted = before.quote('herring');

    const after = createMarket({ now: clock.now, statePath });
    assert.equal(after.quote('herring').price, quoted.price);
    assert.equal(after.quote('herring').crates_total, 300);
    assert.equal(after.quote('cod').crates_total, 60);

    // The restart also seals the window it slept through, at the old price.
    clock.add(2 * WINDOW_MS);
    const later = createMarket({ now: clock.now, statePath });
    const sealed = later.view().previous;
    assert.equal(sealed.id, 0);
    assert.equal(sealed.species.herring.price, quoted.price);
    assert.equal(later.quote('herring').window, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('over HTTP, two players read the same price', async () => {
  const { market } = marketWith();
  const server = startServer({ port: 0, market, statePath: null, secret: null, quiet: true });
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const land = (body) => fetch(`${base}/land`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await land({ player: 'A', species: 'herring', crates: 150 })).status, 201);
    const first = await (await fetch(`${base}/price?species=herring`)).json();
    assert.equal(first.price, 550);
    assert.equal((await land({ player: 'B', species: 'herring', crates: 150 })).status, 201);
    const second = await (await fetch(`${base}/price?species=herring`)).json();
    assert.equal(second.price, 500);
    assert.ok(second.price < first.price);
    assert.deepEqual(second.players.map((row) => row.player), ['A', 'B']);
    assert.deepEqual(await (await fetch(`${base}/window`)).json().then((w) => w.current.species.herring.price), 500);

    const bad = await land({ player: 'C', species: 'plaice', crates: 3 });
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).error, 'unknown_species');
    assert.equal((await fetch(`${base}/nope`)).status, 404);
  } finally {
    server.close();
  }
});

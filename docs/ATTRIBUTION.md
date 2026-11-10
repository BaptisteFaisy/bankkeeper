# The attribution register (rung 1, SEE)

The port's first rung is a mirror: before anyone argues about quotas, the
ledger says **who** is drawing down **which** ground, and **how far** past what
the ground can give back by itself.

Without that number, every later argument ("the sea is empty", "the others
take too much") is just morality. With it, the council has a figure it can
vote on.

## The formula

A zone regrows logistically overnight, at `regrow_bps` of the gap left to its
capacity:

```
regrowth(stock) = rate x stock x (1 - stock / capacity)
                = rate x stock x (capacity - stock) / capacity
```

That regrowth **is** the sustainable catch: the number of crates a day a zone
can hand over while leaving tomorrow's stock exactly where it is. It lives in
`crates/rules/src/stocks.rs` as `sustainable_catch(stock, capacity, regrow_bps)`
(integer arithmetic on `u128`, same one-crate floor as `regrow`, so the figure
never promises growth the sea does not perform).

Two points on the curve matter at the table:

| stock | sustainable catch | reading |
| --- | --- | --- |
| `capacity` (full) | `0` | a full sea grows nothing: every crate taken there comes out of capital |
| `capacity / 2` (half) | `capacity / 4 x rate` per day, the peak | the fastest point of the curve: that is where a ground earns the most without shrinking |
| `0` (empty) | `0` | a dead zone never comes back |

For Greybank (capacity 5,000, herring at 5% a day) the peak sits at 2,500
crates: `1,250 x 5% = 62.5`, so **62 crates a day**. The register writes 62.

The pressure ratio compares the whole window, not one day:

```
over_bps = taken x 10,000 / (sustainable x window_days)
```

`18,000` means the zone was fished at 1.8 times what it can renew. `10,000` is
exactly break-even; under `10,000` the sea gained back more than the fleet took.

Shares are hundredths of the take per captain, rounded by largest remainder so
they add to exactly `10,000` bps (`100.0%`) and never `9,999`.

## Reading

`window_days` is 28 days by default, or the whole journal when it is shorter
(a fresh season reads 1, 2, 3 days). `taken` is the sum of the zone's crates
over that window, straight from the daily journal; `sustainable` is the ceiling
**at today's stock**, the same for every captain.

Each captain of a row is credited with the crates he landed in the zone he
fished **first** that day (`DayRecord::fished_zone`; the journal keeps no
second zone). A two-zone day therefore puts all its crates on its first zone,
and the captain column of a row can be smaller than `taken`. A captain laid up
keeps his crates in `taken` but loses his line: the register names who still
sails. The player always keeps his line, laid up or not; that is the point of
the panel.

When `sustainable` is 0 (full or dead sea) the ratio has no meaning: the engine
writes `0` and the panel prints `capital` instead of a multiplier.

## Command line

```
cargo run -p sim -- init --seed 11 --out state.json
cargo run -p sim -- assign --state state.json --captain you --boat 0 --zone greybank
cargo run -p sim -- assign --state state.json --captain you --boat 1 --zone greybank
for i in $(seq 14); do cargo run -q -p sim -- day --state state.json; done
cargo run -q -p sim -- attribution --state state.json
```

Real output after a 14-day season (seed 11, two of your boats on Greybank):

```json
[
    {
        "zone": "shallows", "stock": 3000, "capacity": 3000,
        "sustainable": 0, "window_days": 14, "captains": [],
        "taken": 0, "over_bps": 0
    },
    {
        "zone": "greybank", "stock": 2863, "capacity": 5000,
        "sustainable": 61, "window_days": 14,
        "captains": [
            { "actor": "brandt", "name": "Brandt", "crates": 1128, "share_bps": 3948 },
            { "actor": "you", "name": "You", "crates": 579, "share_bps": 2027 },
            { "actor": "hale", "name": "Hale", "crates": 576, "share_bps": 2016 },
            { "actor": "okoro", "name": "Okoro", "crates": 574, "share_bps": 2009 }
        ],
        "taken": 2857, "over_bps": 33454
    },
    {
        "zone": "deeps", "stock": 2000, "capacity": 2000,
        "sustainable": 0, "window_days": 14, "captains": [],
        "taken": 0, "over_bps": 0
    }
]
```

What that run says: Greybank fell from 5,000 to 2,863 crates in two weeks while
the fleet took 2,857 crates against a ceiling of 61 a day (854 over the
window). That is **3.3 times** the sustainable catch; the ground is being
eaten, not harvested. Brandt alone took 39.5% of it. The Shallows and the Deeps
were left alone and read `sustainable: 0` because they sit **full**: their
stocks are still at capacity, so their logistic growth is nil. A full ground is
a stock, not an income.

The same register is served by the relay in `GET /api/state` under the
`attribution` key and printed by the web ledger under "Who took what": one line
per zone (`took 2,857 · durable 61/day · 3.3x`) with each captain's percentage
below it.

## Three sentences for the player

1. Every ground has an income, the crates it grows back overnight, and that
   income is all you can take without eating into tomorrow.
2. The register shows, per ground, what the whole port took against that income
   and which captains took it, so nobody can claim the sea emptied itself.
3. When the multiplier goes above `1.0x`, the port is spending its capital, and
   the names on the line are the ones spending it.

# The chronicle and the charter

Two mechanisms, one idea: **the port remembers, and the player leaves an
institution behind**. The chronicle is what the harbour writes about a closed
season; the charter is the one sentence the player writes at the end of a
campaign, and which rules the campaign after it.

Engine: `crates/sim/src/chronicle.rs` (memory), `crates/sim/src/charter.rs`
(institution). Web: `web/src/charter.ts`, `web/src/components/ChroniclePanel.tsx`,
`web/src/components/CharterScreen.tsx`.

## 1. The chronicle

```rust
struct ChronicleEntry {
    season: u64,          // 1-based, as the council minutes number it
    net_worth: i64,       // player net worth at the close, centigold
    stocks: [u64; 3],     // the sea keeps what the season left it
    closures: Vec<String>,// actors written down as stopped
    rule: Option<String>, // the motion that carried, if any
    seed: u64,            // the season can be replayed
}
```

`Game.chronicle: Vec<ChronicleEntry>`, `serde(default)` so pre-existing saves
load with an empty book. One entry is pushed per `season::close_season`, so the
order is the order of the seasons and a campaign of three seasons leaves three
lines. `view_state` serves it as `chronicle`, next to `campaign` and
`campaignOver`.

**Which closures?** The harbour keeps no per-day log of stops it could replay
later: `DayRecord` carries the day's catch, not the day's closures, and
`cycle.rs`/`evening.rs` are out of scope for this change. The chronicle
therefore writes down the stops **still in force when the books close**
(`Harbour::stopped`) plus the ones that fell on the closing day itself (that
day's `DayReport::closures`). Reading: a captain rescued during the season
sails again and is not in the book — the chronicle keeps what the port still
enforces, not what it once suffered.

**Which rule?** Only a motion that was *tabled and carried*: a silent council
or a rejected motion leaves `rule: null`. The text is the compact reading the
council itself uses, e.g. `quota 60 · Greybank closed · small mesh banned`.

## 2. The charter

```rust
struct Charter {
    quota_per_licence: Option<u64>,      // 50 in the "quota falls" option
    ban_small_mesh: bool,
    idle_licence_tax_bps: Option<u64>,   // 1000 = a tenth, per licence, per Monday
}
```

The three options are fixed, and their texts live in `charter.rs`
(`OPTION_*_TITLE`, `OPTION_*_DETAIL`) and in `web/src/charter.ts`:

| id | title | detail |
|---|---|---|
| `quota` | The quota falls | A licence lands fifty crates a week instead of seventy. The sea breathes; every purse tightens. |
| `mesh` | The small mesh is banned | No boat may fish a fine net. Fewer young fish taken now, more grown fish for the seasons after. |
| `idle` | Idle licences pay | A licence held but not fished for two weeks owes a tenth of its price every Monday. Unpaid, it goes back to the pool. |

**Where it is applied.** In `seed_game_with` — that is, at the founding of a
campaign, and nowhere else. `open_next_season` never re-applies it, so a
campaign runs all its seasons under one rule: *a charter never rules the
campaign that wrote it.* The player writes the charter when the third season
closes; the browser keeps it in `localStorage.tidewater-charter-v1` and sends
it as `charter` on `init`, so the next campaign starts under it. A save file
also carries its own `charter` field: importing a save brings its institution
with it.

**The idle levy** runs on the Monday roll (`season::roll_week`), before any
licence trade, so the pooled licence can be auctioned the same morning. A
captain with no trip in the last fortnight of journal (fourteen days) owes
`licence_price × bps / 10_000` per licence held; the gold goes to the harbour
bank. A purse that cannot cover the bill hands the licence back to the pool
instead of waiting for a payment that will never come. The levy waits for a
full fortnight of journal before calling anybody dormant: an empty log is not
evidence of idleness.

## 3. CLI

```
sim charter                                        # the three options, as the screen reads them
sim init --seed 7 --weeks 2 --charter quota        # a campaign under a charter (also accepts JSON)
sim chronicle --state state.json                   # the book, plus the campaign flag
```

## 4. Known edges

- **Old saves**: `chronicle` and `charter` are `serde(default)`, so a save
  written before this change loads with an empty book and no charter. The
  chronicle then starts at the next close; past seasons are not reconstructed.
- **The relay** (`server/relay.py`) still calls `sim init --seed …` without
  `--weeks` or `--charter`, and validates the init body itself. The charter
  therefore reaches the engine in wasm mode only; the relay mode would need its
  payload validator and `sim` invocation extended (not touched here).
- **The levy and a laid-up captain**: a stopped captain does not fish, so the
  levy keeps charging a dormant purse. That is the rule as written; it is also
  the moment the licences start draining back to the pool.

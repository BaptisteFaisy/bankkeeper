// Paying the debt owed to the sea (barreau 4), from the browser.
//
// Two exits, and only two, as the spine says:
//   - **jachère (fallow)** — a zone rests N weeks: the regrowth it performs
//     pays the debt, the zone earns nothing meanwhile, no gold moves;
//   - **réensemencement (reseed)** — the port fund buys juveniles back into
//     the zone at the going price: gold leaves the fund, crates go back into
//     the sea.
//
// Both buttons announce what they will do — crates paid, gold spent — before
// the click. The panel never invents a number: the engine publishes the
// regrowth of each zone (`fallowCredit`) and the price of a crate
// (`reseedPrice`), so the preview and the payment cannot disagree.
//
// Double clicks: the buttons are disabled while the app is busy, which is
// the guard the other panels already use (HarbourPanel, BoatsPanel). The
// mutation itself goes through `mutate()`, the shared helper, so the
// in-flight lock lives in one place.
import { useState } from 'react';
import type { SeaView, ZoneId } from '../types';
import { ZONES, ZONE_LABEL } from '../types';
import { fmtCrates, fmtGold } from '../format';

interface Props {
  sea: SeaView | null;
  // A mutation is in flight: the app's own busy flag.
  busy: boolean;
  onFallow: (zone: ZoneId, weeks: number) => void;
  onReseed: (zone: ZoneId, crates: number) => void;
}

// Weeks of rest offered: a season is four, a rest may not outlast it.
const WEEKS = [1, 2, 3, 4];
// Crates offered for a reseed, in the unit the player reads.
const CRATES = [50, 100, 200, 500];

/** One zone's line of the sea bill, or null when the zone is unknown. */
function zoneRow(sea: SeaView, zone: ZoneId): SeaView['zones'][number] | null {
  return sea.zones.find((row) => row.zone === zone) ?? null;
}

/** What a rest of `weeks` on `zone` pays: crates, and no gold. */
function fallowPreview(sea: SeaView, zone: ZoneId, weeks: number): string {
  const row = zoneRow(sea, zone);
  const crates = Math.min((row?.fallowCredit ?? 0) * weeks, sea.debt);
  return `${fmtCrates(crates)} crates paid to the sea over ${weeks} week(s) · no gold moves · ${ZONE_LABEL[zone]} earns nothing meanwhile`;
}

/** What a reseed of `crates` costs the port fund, and what it buys. */
function reseedPreview(sea: SeaView, zone: ZoneId, crates: number): string {
  const price = sea.reseedPrice ?? 0;
  const fund = sea.fundBalance ?? 0;
  // The engine caps a reseed at the debt it pays down, and at what the
  // zone can hold: the preview says the same thing before the click.
  const wanted = Math.min(crates, sea.debt);
  const gold = wanted * price;
  const short = gold > fund;
  const capped = wanted < crates ? ` (capped at the debt: ${wanted} crates)` : '';
  return `${fmtCrates(wanted)} crates put back into ${ZONE_LABEL[zone]} for ${fmtGold(gold)}g out of the port fund (holds ${fmtGold(fund)}g)${capped}${short ? ' — not enough in the fund' : ''}`;
}

export default function SeaPayBlock({ sea, busy, onFallow, onReseed }: Props) {
  const [zone, setZone] = useState<ZoneId>('greybank');
  const [weeks, setWeeks] = useState(2);
  const [crates, setCrates] = useState(100);

  if (sea === null) {
    return (
      <div>
        <h3>Pay the debt</h3>
        <p className="muted">The bill is written at the close of the season.</p>
      </div>
    );
  }

  return (
    <div>
      <h3>Pay the debt</h3>
      {sea.debt === 0 ? (
        <p className="muted">
          {sea.season > 0
            ? `${fmtCrates(sea.season)} crates running up this season: the bill is written down when the council sits, and the port pays it from then on.`
            : 'The sea is owed nothing: there is no bill to pay.'}
        </p>
      ) : (
        <>
          <label>
            Zone
            <select value={zone} onChange={(e) => setZone(e.target.value as ZoneId)} aria-label="Zone to rest or reseed">
              {ZONES.map((id) => (
                <option key={id} value={id}>{ZONE_LABEL[id]}</option>
              ))}
            </select>
          </label>
          <div className="harbour-row">
            <label>
              Weeks
              <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} aria-label="Weeks of fallow">
                {WEEKS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <button type="button" disabled={busy} onClick={() => onFallow(zone, weeks)}>
              Rest the zone
            </button>
          </div>
          <p className="muted" data-testid="fallow-preview">{fallowPreview(sea, zone, weeks)}</p>
          <div className="harbour-row">
            <label>
              Crates
              <select value={crates} onChange={(e) => setCrates(Number(e.target.value))} aria-label="Crates to reseed">
                {CRATES.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <button type="button" disabled={busy} onClick={() => onReseed(zone, crates)}>
              Reseed the zone
            </button>
          </div>
          <p className="muted" data-testid="reseed-preview">{reseedPreview(sea, zone, crates)}</p>
        </>
      )}
    </div>
  );
}

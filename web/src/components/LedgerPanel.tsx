// Harbour ledger: today landings per captain with prices and nets,
// plus the raw reasoning lines behind prices and NPC decisions.
// The net shown is the landing's own (landing.mesh), never the
// boat's current net.
//
// Rung 1 (SEE), "Who took what": one line per zone, the take over the
// window against what the zone gives back by itself, then the captains who
// took it. The numbers come from the engine's `attribution` reading of the
// journal (view_state key "attribution"); the panel only reads them.
import { useEffect, useState } from 'react';
import type { LandingView, ZoneId } from '../types';
import { MESH_LABEL, ZONE_LABEL, parseMesh } from '../types';
import { fmtGold } from '../format';
import { getState } from '../api';

/** One captain's line in a zone: crates landed and share in bps. */
export interface AttributionCaptain {
  actor: string;
  name: string;
  crates: number;
  share_bps: number;
}

/** One zone's row of the register: the ceiling, the take, the takers. */
export interface AttributionRow {
  zone: ZoneId;
  stock: number;
  capacity: number;
  sustainable: number;
  window_days: number;
  captains: AttributionCaptain[];
  taken: number;
  over_bps: number;
}

interface Props {
  landings: LandingView[];
  reasoning: string[];
  // Optional: when the screen already holds the register, hand it over and
  // the panel never asks the engine for it.
  attribution?: AttributionRow[];
}

/** "3.1x" for a take of 3.1 times the sustainable catch. */
function multiple(row: AttributionRow): string {
  if (row.taken === 0) return '—';
  // A sea that grows nothing (full or dead) has no multiplier: every crate
  // taken there comes out of capital.
  if (row.sustainable === 0) return 'capital';
  return `${(row.over_bps / 10_000).toFixed(1)}x`;
}

/** "20.3%" from a share in bps. */
function pct(shareBps: number): string {
  return `${(shareBps / 100).toFixed(1)}%`;
}

/** The captains of a row, biggest first, as the engine ordered them. */
function shares(row: AttributionRow): string {
  return row.captains.map((c) => `${c.name} ${pct(c.share_bps)}`).join(' · ');
}

/** One zone line: take, ceiling, ratio, then who took it. */
function ZoneShare({ row }: { row: AttributionRow }) {
  return (
    <li>
      <strong>{ZONE_LABEL[row.zone]}</strong>{' '}
      <span>
        took {row.taken} · durable {row.sustainable}/day · {multiple(row)}
      </span>
      {row.captains.length === 0 ? (
        <div className="muted">
          {row.taken === 0
            ? 'Nobody fished here over the window.'
            : 'No captain credited: two-zone days land under their first zone.'}
        </div>
      ) : (
        <div className="muted">{shares(row)}</div>
      )}
    </li>
  );
}

export default function LedgerPanel({ landings, reasoning, attribution }: Props) {
  const [rows, setRows] = useState<AttributionRow[]>(attribution ?? []);

  useEffect(() => {
    if (attribution !== undefined) {
      setRows(attribution);
      return;
    }
    let live = true;
    // The register moves when lots land: read it again with the landings,
    // not on a timer of its own (one poll is enough for the whole screen).
    getState()
      .then((state) => {
        const raw = (state as unknown as { attribution?: AttributionRow[] }).attribution;
        if (live && Array.isArray(raw)) setRows(raw);
      })
      .catch(() => undefined);
    return () => { live = false; };
  }, [attribution, landings.length]);

  return (
    <section className="panel ledger" aria-label="Harbour ledger">
      <h2>Harbour ledger</h2>
      <div className="ledger-cols">
        <div>
          <h3>Today landings</h3>
          {landings.length === 0 ? (
            <p className="muted">No landings yet today.</p>
          ) : (
            <ul className="landing-list">
              {landings.map((l, i) => (
                <li key={`${l.captain}-${i}`}>
                  <span>{l.captain}</span>
                  <span>
                    {l.crates} {l.species} @ {fmtGold(l.price)}g ({MESH_LABEL[parseMesh(l.mesh)].toLowerCase()})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3>Reasoning</h3>
          {reasoning.length === 0 ? (
            <p className="muted">Captains keep their counsel for now.</p>
          ) : (
            <ul className="reason-list">
              {reasoning.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div>
        <h3>Who took what</h3>
        {rows.length === 0 ? (
          <p className="muted">No journal yet: the register opens with the first landing.</p>
        ) : (
          <ul className="reason-list">
            {rows.map((row) => (
              <ZoneShare key={row.zone} row={row} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

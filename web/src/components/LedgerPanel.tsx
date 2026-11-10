// Harbour ledger: today landings per captain with prices and nets,
// plus the raw reasoning lines behind prices and NPC decisions.
// The net shown is the landing's own (landing.mesh), never the
// boat's current net.
import type { LandingView } from '../types';
import { MESH_LABEL, parseMesh } from '../types';
import { fmtGold } from '../format';

interface Props {
  landings: LandingView[];
  reasoning: string[];
}

export default function LedgerPanel({ landings, reasoning }: Props) {
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
    </section>
  );
}

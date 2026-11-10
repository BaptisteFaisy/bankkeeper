// TokenCards.tsx — graphical cards for the 6 contract NEP-245 token types.
//
// Types: gold (0), herring (1), cod (2), licences (3), boat deeds (10-19),
// and debt notes (100+). Each card features a procedural canvas icon, the
// supply balance in large numerals, the token id in small, and its unit.
import { useEffect, useRef } from 'react';
import type { SupplyRow } from './chain';
import { paintTokenIcon } from './icons';

function TokenIcon({ kind }: { kind: SupplyRow['icon'] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas !== null) {
      paintTokenIcon(canvas, kind, 56);
    }
  }, [kind]);
  return (
    <canvas
      ref={canvasRef}
      className="pf-tk-canvas"
      width={56}
      height={56}
      aria-hidden="true"
    />
  );
}

function displaySupply(row: SupplyRow): string {
  if (row.supply === null) return '\u2014';
  return row.supply.toLocaleString('fr-FR');
}

function SingleCard({ row }: { row: SupplyRow }) {
  const supplyText = displaySupply(row);
  return (
    <article
      className="pf-tk-card"
      tabIndex={0}
      aria-label={`${row.label} (token id ${row.id}) : solde ${supplyText} ${row.unit}`}
    >
      <div className="pf-tk-head">
        <TokenIcon kind={row.icon} />
        <div className="pf-tk-titles">
          <span className="pf-tk-id">token #{row.id}</span>
          <h3 className="pf-tk-label">{row.label}</h3>
        </div>
      </div>
      <div className="pf-tk-body">
        <div className="pf-tk-supply-wrap">
          <span className="pf-tk-num" data-testid={`supply-${row.id}`}>
            {supplyText}
          </span>
          <span className="pf-tk-unit">{row.unit}</span>
        </div>
        <p className="pf-tk-detail pf-muted">{row.detail}</p>
        {row.expected !== null ? (
          <span className="pf-tk-expected">Offre cible : {row.expected}</span>
        ) : null}
      </div>
    </article>
  );
}

export default function TokenCards({ rows }: { rows: SupplyRow[] }) {
  return (
    <section
      className="pf-card pf-card-tokens"
      aria-label="Registres de jetons NEP-245"
      data-testid="token-cards-section"
    >
      <div className="pf-card-head">
        <h2>Jetons du contrat NEP-245</h2>
        <span className="pf-badge">{rows.length} registres modélisés</span>
      </div>
      <p className="pf-body pf-muted">
        Chaque titre de propriété et chaque stock échangeable est un jeton multi-token
        NEP-245. Le solde total en circulation (<code>mt_supply</code>) est interrogé
        en direct sur le RPC testnet dès qu&rsquo;un contrat est en place.
      </p>
      <div className="pf-tk-grid" role="region" aria-label="Cartes de jetons">
        {rows.map((row) => (
          <SingleCard key={row.id} row={row} />
        ))}
      </div>
    </section>
  );
}

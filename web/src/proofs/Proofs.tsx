import { useCallback, useEffect, useMemo, useState } from 'react';
import './graphic.css';
import { contractRef, readSupplies, TOKENS } from './chain';
import type { SupplyRow } from './chain';
import { DEPLOYMENT } from './deployment';
import { sharedSeason } from './season';
import { loadTimeline } from './timeline';
import ContractCard from './ContractCard';
import TokenCards from './TokenCards';
import Timeline from './Timeline';
import { Invariants, Ledger, SeasonCard } from './Panels';

/**
 * The date this page speaks for: the timestamp of the recorded replay, read
 * from `docs/deployments.md` like everything else. No hand-written date that
 * could go stale and contradict the document.
 */
function footerDate(): string {
  const at = DEPLOYMENT.replayedAt;
  if (at === null) return 'Aucun rejeu enregistré';
  const day = at.slice(0, 10).split('-').reverse().join('/');
  return `Rejeu on-chain du ${day}`;
}

/** /proofs.html: the whole proofs page in reading order. */
export default function Proofs() {
  const contract = useMemo(() => contractRef(window.location.search), []);
  const season = useMemo(() => sharedSeason(window.location.search), []);
  const timelineSteps = useMemo(() => loadTimeline(contract !== null), [contract]);

  const [rows, setRows] = useState<SupplyRow[]>(() =>
    TOKENS.map((token) => ({ ...token, supply: null, note: '' })),
  );
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (contract === null) return;
    setBusy(true);
    try {
      setRows(await readSupplies(contract.id));
    } finally {
      setBusy(false);
    }
  }, [contract]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <main className="pf" data-testid="proofs">
      <header className="pf-head">
        <p className="pf-kicker">Tidewater &middot; port de pêche &middot; NEAR NEP-245</p>
        <h1>Preuves publiques</h1>
        <p className="pf-lede">
          Rien ici ne demande de nous croire : le contrat, les jetons, la saison,
          les transactions et les invariants du moteur sont lisibles et rejouables.
          Ce qui n&rsquo;est pas encore vérifiable est écrit tel quel, et cette page ne
          se prétend jamais &laquo; live &raquo; quand elle ne l&rsquo;est pas.
        </p>
        <p className="pf-nav-links">
          <a className="pf-link" href="/">Retour au jeu</a>
          <span className="pf-sep">&middot;</span>
          <a className="pf-link" href="#tokens">Jetons NEP-245</a>
          <span className="pf-sep">&middot;</span>
          <a className="pf-link" href="#timeline">Frise des transactions</a>
          <span className="pf-sep">&middot;</span>
          <a className="pf-link" href="#invariants">Invariants</a>
        </p>
      </header>
      <ContractCard
        contract={contract}
        rows={rows}
        busy={busy}
        onRefresh={() => void refresh()}
      />
      <div id="tokens">
        <TokenCards rows={rows} />
      </div>
      <div id="timeline">
        <Timeline steps={timelineSteps} />
      </div>
      <SeasonCard season={season} />
      <Ledger />
      <Invariants />
      <footer className="pf-foot">
        {footerDate()} &middot; page statique, aucune dépendance npm, aucun secret
        dans le dépôt. Direction artistique maritime plate.
      </footer>
    </main>
  );
}

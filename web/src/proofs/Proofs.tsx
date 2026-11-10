import { useMemo } from 'react';
import { contractRef } from './chain';
import { sharedSeason } from './season';
import ContractCard from './ContractCard';
import { Invariants, Ledger, SeasonCard } from './Panels';

/** /proofs.html: the whole page, in reading order. */
export default function Proofs() {
  const contract = useMemo(() => contractRef(window.location.search), []);
  const season = useMemo(() => sharedSeason(window.location.search), []);
  return (
    <main className="pf" data-testid="proofs">
      <header className="pf-head">
        <p className="pf-kicker">Tidewater · port de pêche · NEAR NEP-245</p>
        <h1>Preuves</h1>
        <p className="pf-lede">
          Rien ici ne demande de nous croire : le contrat, les jetons, la saison et
          les invariants du moteur sont lisibles et rejouables. Ce qui n&rsquo;est pas
          encore vérifiable est écrit tel quel, et cette page ne se prétend jamais
          « live » quand elle ne l&rsquo;est pas.
        </p>
        <p className="pf-lede">
          <a className="pf-link" href="/">Retour au jeu</a>
          <span className="pf-sep">·</span>
          <a className="pf-link" href="#invariants">Aller aux invariants</a>
        </p>
      </header>
      <ContractCard contract={contract} />
      <SeasonCard season={season} />
      <Ledger />
      <Invariants />
      <footer className="pf-foot">
        10 novembre 2026 · page statique, aucune dépendance npm, aucune clé ni
        aucun secret dans le dépôt.
      </footer>
    </main>
  );
}

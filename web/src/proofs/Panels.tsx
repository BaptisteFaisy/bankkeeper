// Panels.tsx — shared season card, on-chain/off-chain ledger, and invariants.
//
// The season card carries the exact ?seed= and ?weeks= that replay the game;
// the ledger honestly splits what lives in the contract vs what runs off-chain;
// the invariants list the deterministic tests judges can reproduce themselves.
import { proofsHref, replayHref } from './season';
import type { SharedSeason } from './season';

export function SeasonCard({ season }: { season: SharedSeason }) {
  return (
    <section className="pf-card" aria-label="2 La saison partagée" data-testid="season-card">
      <div className="pf-card-head">
        <h2>2 &middot; La saison partagée</h2>
        <span className="pf-badge">graine {season.seed}</span>
      </div>
      <div className="pf-body">
        <p className="pf-status">
          <span>
            {season.weeks} semaine(s) par saison, 3 saisons par campagne
            {season.shared ? ' — graine lue dans cette URL' : ' — graine par défaut'}
          </span>
        </p>
        <p>
          Le jeu lit <code>?seed=</code> et <code>?weeks=</code> au démarrage : même
          graine, même saison, même <code>history_hash</code>. Ce lien rejoue la
          saison dont parle cette page.
        </p>
        <p className="pf-actions-row">
          <a className="pf-button" data-testid="replay-link" href={replayHref(season)}>
            Rejouer cette saison dans le jeu
          </a>
          <span className="pf-sep">&middot;</span>
          <a className="pf-link" data-testid="proofs-link" href={proofsHref(season)}>
            garder cette graine sur la page de preuves
          </a>
        </p>
        <p className="pf-muted">
          Pour confronter un hash : ouvrez le lien, puis le panneau{' '}
          <code>Judges</code> &rarr; <code>Fast-forward</code>. Le hash affiché doit
          être identique à celui qu&rsquo;on vous a donné.
        </p>
      </div>
    </section>
  );
}

interface Row {
  name: string;
  detail: string;
}

const ON_CHAIN: Row[] = [
  { name: 'Licences de pêche', detail: 'jeton NEP-245 id 3, offre fixe 20, plafond 8 par capitaine, une licence = une voix' },
  { name: 'Notes de dette', detail: 'jetons id 100+, get_loan nomme le prêteur, forbear_loan le dénoue' },
  { name: 'Vote du conseil', detail: 'propose_rule, vote, cast_npc_votes, resolve_council — le outcome est un objet on-chain' },
  { name: 'Actes de bateau', detail: 'jetons id 10–19, un acte par bateau du port' },
  { name: 'Parts de renflouement', detail: 'jetons id 200+, 20 % des ventes d\u2019un marchand renfloué' },
  { name: 'Or, hareng, morue', detail: 'jetons id 0, 1, 2 : ils existent dans le contrat, le jeu du navigateur ne les manipule pas encore' },
];

const OFF_CHAIN: Row[] = [
  { name: 'Stocks des zones', detail: 'trois zones, un stock qui s\u2019épuise : crates/sim, dans le wasm du navigateur' },
  { name: 'Criée et prix', detail: 'la formule tient dans crates/rules/src/merchant.rs, arrondie au centième' },
  { name: 'Marchands NPC', detail: 'portefeuille, stock, cible : dans le moteur, pas dans un compte NEAR' },
  { name: 'Pêche en mer', detail: 'le poisson en mer n\u2019est à personne : il ne devient un objet qu\u2019une fois débarqué' },
  { name: 'Raisonnement des marchands', detail: 'la phrase « limit 6.0 = base 4.0 x 1.50 … » est calculée par le même fichier que le prix' },
];

function Column({ title, rows, kind }: { title: string; rows: Row[]; kind: 'chain' | 'off' }) {
  return (
    <div className={'pf-col pf-col-' + kind}>
      <h3>{title}</h3>
      <dl className="pf-dl">
        {rows.map((row) => (
          <div className="pf-row" key={row.name}>
            <dt>{row.name}</dt>
            <dd className="pf-muted">{row.detail}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function Ledger() {
  return (
    <section className="pf-card" aria-label="3 On-chain ou hors chaîne">
      <div className="pf-card-head">
        <h2>3 &middot; On-chain ou hors chaîne</h2>
      </div>
      <p className="pf-body pf-muted">
        Deux colonnes honnêtes. Aujourd&rsquo;hui, aucun geste du jeu joué ne passe
        par la chaîne : les jetons existent dans le contrat, le navigateur tourne sur
        le moteur Rust. C&rsquo;est le trou identifié dans{' '}
        <code>docs/COMPLIANCE.md</code>, et il reste ouvert.
      </p>
      <div className="pf-cols">
        <Column title="On-chain — le contrat NEP-245" rows={ON_CHAIN} kind="chain" />
        <Column title="Hors chaîne — le moteur Rust" rows={OFF_CHAIN} kind="off" />
      </div>
    </section>
  );
}

interface Proof {
  title: string;
  claim: string;
  command: string;
}

const PROOFS: Proof[] = [
  {
    title: 'La suite de tests',
    claim: '268 tests, zéro échec : règles économiques, contrat, simulation, moteur wasm.',
    command: 'cargo test --workspace',
  },
  {
    title: 'Le déterminisme',
    claim: 'Même graine, même saison : deux exécutions rendent le même history_hash (crates/sim/tests/seed_variety.rs). Ce que le panneau Judges affiche.',
    command: 'cargo test -p sim --test seed_variety',
  },
  {
    title: 'Le fast-forward',
    claim: 'Une semaine de commerce sans joueur, en moins d\u2019une seconde : stocks, prix, faillites, journal.',
    command: 'cargo run -p sim -- ff --state state.json --days 7',
  },
  {
    title: 'Le parcours de référence',
    claim: 'Navigateur headless, profil jetable : zéro erreur console, zéro requête réseau en mode démo.',
    command: 'cd web && npm run build:offline && cd .. && python3 tests/e2e_offline.py',
  },
];

function ProofCard({ proof }: { proof: Proof }) {
  return (
    <div className="pf-proof">
      <h3>{proof.title}</h3>
      <p>{proof.claim}</p>
      <code className="pf-cmd">{proof.command}</code>
    </div>
  );
}

export function Invariants() {
  return (
    <section className="pf-card" id="invariants" aria-label="4 Les invariants du moteur">
      <div className="pf-card-head">
        <h2>4 &middot; Les invariants du moteur</h2>
      </div>
      <p className="pf-body pf-muted">
        Quatre choses que vous pouvez reproduire sur votre machine, sans nous : le
        dépôt suffit, il n&rsquo;y a ni service ni secret à obtenir.
      </p>
      <div className="pf-proofs">
        {PROOFS.map((proof) => (
          <ProofCard key={proof.title} proof={proof} />
        ))}
      </div>
    </section>
  );
}

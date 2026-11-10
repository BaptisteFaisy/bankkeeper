// Timeline.tsx — chronological timeline of e2e scenario transactions.
//
// Shows each step of the contract scenario (fishing, licences, transfer,
// debt note, council proposal, voting, resolution), its testnet hash when
// recorded, and an honest status badge (confirmé / en attente / absent).
import { explorerUrl, shortHash } from './timeline';
import type { TimelineStep, TxStatus } from './timeline';

function statusBadge(status: TxStatus) {
  if (status === 'confirmed') {
    return <span className="pf-tl-tag pf-tl-tag-confirmed">Confirmé sur testnet</span>;
  }
  if (status === 'pending') {
    return <span className="pf-tl-tag pf-tl-tag-pending">En attente d&rsquo;exécution</span>;
  }
  return <span className="pf-tl-tag pf-tl-tag-absent">Non joué (contrat absent)</span>;
}

function HashLink({ hash }: { hash: string | null }) {
  if (hash === null) {
    return <span className="pf-muted pf-tl-hash">hash en attente</span>;
  }
  return (
    <a
      className="pf-tl-hash pf-link"
      href={explorerUrl(hash)}
      target="_blank"
      rel="noopener noreferrer"
      title={`Voir la transaction ${hash} sur Nearblocks testnet`}
    >
      <code>{shortHash(hash)}</code>
      <span className="pf-tl-ext" aria-hidden="true">&nbsp;&nearr;</span>
    </a>
  );
}

function TimelineItem({ step }: { step: TimelineStep }) {
  return (
    <li className={`pf-tl-item pf-tl-${step.status}`} tabIndex={0}>
      <div className="pf-tl-marker" aria-hidden="true">
        <span className="pf-tl-dot" />
        <span className="pf-tl-order">{step.order}</span>
      </div>
      <div className="pf-tl-content">
        <div className="pf-tl-header">
          <code className="pf-tl-action">{step.action}</code>
          {statusBadge(step.status)}
        </div>
        <p className="pf-tl-summary">{step.summary}</p>
        <div className="pf-tl-meta">
          <span className="pf-muted">Signataire : <code>{step.caller}</code></span>
          <span className="pf-sep">·</span>
          <span className="pf-muted">{step.standard}</span>
          <span className="pf-sep">·</span>
          <HashLink hash={step.hash} />
        </div>
      </div>
    </li>
  );
}

export default function Timeline({ steps }: { steps: TimelineStep[] }) {
  const confirmedCount = steps.filter((s) => s.status === 'confirmed').length;
  return (
    <section
      className="pf-card pf-card-timeline"
      aria-label="Frise chronologique des transactions"
      data-testid="timeline-card"
    >
      <div className="pf-card-head">
        <h2>Transactions du scénario e2e</h2>
        <span className="pf-badge">
          {confirmedCount > 0
            ? `${confirmedCount} / ${steps.length} transactions confirmées`
            : 'scénario prêt pour testnet'}
        </span>
      </div>
      <p className="pf-body pf-muted">
        Le scénario <code>scripts/testnet/e2e.mjs</code> rejoue l&rsquo;économie complète
        sur le contrat testnet : licences, endettement Brandt, scrutin pondéré du conseil,
        et dénouement des motions. Chaque étape est vérifiable sur l&rsquo;explorateur NEAR.
      </p>
      <ol className="pf-tl-list" aria-label="Liste des transactions du scénario">
        {steps.map((step) => (
          <TimelineItem key={step.id} step={step} />
        ))}
      </ol>
    </section>
  );
}

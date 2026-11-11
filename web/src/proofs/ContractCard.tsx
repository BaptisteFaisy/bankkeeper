// ContractCard.tsx — contract address, RPC reader, honest absent scene.
//
// Shows the configured account, reads mt_supply live when present, or renders
// the procedural harbour scene when not yet deployed. Never fakes live data.
import { RPC_URL, answered } from './chain';
import type { ContractRef, SupplyRow } from './chain';
import HarborFigure from './HarborFigure';

export type Status = 'absent' | 'loading' | 'live' | 'unreachable';

/**
 * The status of the contract card. While a read is in flight the page says
 * it is reading — never "no answer": a pending request is not a failed one.
 */
export function statusOf(contract: ContractRef | null, rows: SupplyRow[], busy = false): Status {
  if (contract === null) return 'absent';
  if (busy) return 'loading';
  return answered(rows) ? 'live' : 'unreachable';
}

export function Badge({ status }: { status: Status }) {
  if (status === 'live') {
    return <span className="pf-badge pf-badge-live">live &middot; lu sur la chaîne</span>;
  }
  if (status === 'loading') return <span className="pf-badge">lecture du RPC&hellip;</span>;
  if (status === 'unreachable') return <span className="pf-badge pf-badge-warn">aucune réponse</span>;
  return <span className="pf-badge pf-badge-warn">pas encore déployé</span>;
}

function Absent() {
  return (
    <div className="pf-body">
      <p className="pf-status" data-testid="contract-status">
        <Badge status="absent" />
        <span>
          Aucun contrat n&rsquo;est configuré pour <strong>cette page</strong> : nous ne
          pouvons donc rien lire on-chain, et nous ne l&rsquo;affichons pas.
        </span>
      </p>
      <HarborFigure title="Aucun contrat configuré" status="absent" />
      <p>
        L&rsquo;identifiant du contrat se lit dans <code>docs/deployments.md</code>, le
        fichier que <code>scripts/testnet/deploy.mjs</code> écrit au moment du
        déploiement. S&rsquo;il n&rsquo;y figure aucun compte déployé, cette carte reste
        muette plutôt que d&rsquo;inventer un état : c&rsquo;est le cas d&rsquo;un build
        fait avant le run, ou d&rsquo;un run qui a échoué.
      </p>
      <ul className="pf-list">
        <li>
          pour pointer cette page sur un contrat déjà déployé :{' '}
          <code>?contract=&lt;compte.testnet&gt;</code> dans l&rsquo;URL, ou{' '}
          <code>localStorage.tidewater-chain-v1</code> ;
        </li>
        <li>
          pour qu&rsquo;elle le lise par défaut : relancer{' '}
          <code>make testnet-deploy</code>, qui réécrit le document, puis rebuilder.
        </li>
      </ul>
      <p className="pf-muted">
        Le détail daté, les adresses et les hashs de transaction sont dans
        <code> docs/deployments.md</code>. Dès qu&rsquo;un identifiant est fourni,
        cette carte bascule d&rsquo;elle-même en lecture live.
      </p>
    </div>
  );
}

function expectedNote(row: SupplyRow): string {
  return row.expected === null ? '' : `offre fixe attendue : ${row.expected}`;
}

function SupplyTable({ rows }: { rows: SupplyRow[] }) {
  return (
    <table className="pf-table" data-testid="supply-table">
      <thead>
        <tr>
          <th scope="col">Jeton</th>
          <th scope="col">id</th>
          <th scope="col">mt_supply</th>
          <th scope="col">note</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.label}</td>
            <td className="pf-num">{row.id}</td>
            <td className="pf-num" data-testid={'supply-' + row.id}>
              {row.supply === null ? '\u2014' : row.supply.toLocaleString('fr-FR')}
            </td>
            <td className="pf-muted">{row.note === '' ? expectedNote(row) : row.note}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function sourceLabel(source: ContractRef['source']): string {
  if (source === 'url') return 'l\u2019URL';
  if (source === 'localStorage') return 'localStorage';
  if (source === 'env') return 'la variable de build';
  return 'docs/deployments.md';
}

function Live(props: {
  contract: ContractRef;
  rows: SupplyRow[];
  status: Status;
  busy: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="pf-body">
      <p className="pf-status" data-testid="contract-status">
        <Badge status={props.status} />
        <span>
          contrat <code data-testid="contract-id">{props.contract.id}</code> (lu dans{' '}
          {sourceLabel(props.contract.source)})
        </span>
      </p>
      <p className="pf-muted">
        <code>mt_supply</code> en lecture seule sur <code>{RPC_URL}</code>,
        un appel par jeton, sans clé ni compte.
      </p>
      <p>
        <button type="button" onClick={props.onRefresh} disabled={props.busy}>
          {props.busy ? 'Lecture\u2026' : 'Rafraîchir'}
        </button>
      </p>
      <SupplyTable rows={props.rows} />
      {props.status === 'unreachable' ? (
        <div className="pf-unreachable-block">
          <HarborFigure title="Noeud injoignable" status="unreachable" />
          <p className="pf-warn">
            Le RPC n&rsquo;a répondu pour aucun jeton : rien n&rsquo;est affiché comme
            live, et l&rsquo;état réel du contrat reste inconnu de cette page.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export default function ContractCard(props: {
  contract: ContractRef | null;
  rows: SupplyRow[];
  busy: boolean;
  onRefresh: () => void;
}) {
  const { contract, rows, busy, onRefresh } = props;
  const status = statusOf(contract, rows, busy);
  return (
    <section className="pf-card" aria-label="1 Le contrat" data-testid="contract-card">
      <div className="pf-card-head">
        <h2>1 &middot; Le contrat</h2>
        <Badge status={status} />
      </div>
      {contract === null ? (
        <Absent />
      ) : (
        <Live
          contract={contract}
          rows={rows}
          status={status}
          busy={busy}
          onRefresh={onRefresh}
        />
      )}
    </section>
  );
}

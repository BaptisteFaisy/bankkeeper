// Harbour office: the player levers from brief section 2.3.
// Surveys per zone, licence trade (pool and captains), the lease desk
// (rent a licence from a captain, end one of your own leases), loan notes
// (buy/forbear/seize) and council motions (propose + vote yes/no).
import { useState } from 'react';
import type { CaptainView, CouncilOutcome, CouncilProposal, LoanView, ZoneId } from '../types';
import { ZONE_LABEL } from '../types';
import { fmtGold } from '../format';

// One lease in force: a licence lent for a term, the quota going with it.
interface LeaseRow {
  lessor: string;
  lessorName: string;
  lessee: string;
  lesseeName: string;
  weeklyRent: number;
  weeksLeft: number;
}

interface Props {
  captains: CaptainView[];
  loans: LoanView[];
  licencePool: number;
  proposal: CouncilProposal | null;
  lastCouncil: CouncilOutcome | null;
  playerGold: number;
  licencePrice?: number;
  youLicences: number;
  busy: boolean;
  onSurvey: (zone: ZoneId) => void;
  onLicence: (action: 'buy' | 'sell', ref: string) => void;
  // Rent a licence out (own default: two weeks), or end one of your leases.
  leases?: LeaseRow[];
  onLease?: (action: 'lease' | 'unlease', lessor: string, lessee: string, weeks: number) => void;
  onDebt: (action: 'buy' | 'forbear' | 'seize', ref: string) => void;
  onPropose: (rule: string, indemnity: number) => void;
  onVote: (yes: boolean) => void;
}

const ZONES: ZoneId[] = ['shallows', 'greybank', 'deeps'];
// The Rent button asks for a fortnight at the default weekly rent.
const RENT_WEEKS = 2;

function SurveyRow({ busy, playerGold, onSurvey }: Pick<Props, 'busy' | 'playerGold' | 'onSurvey'>) {
  const short = playerGold < 80;
  return (
    <div className="harbour-block">
      <h3>Surveys (80g, holds a week)</h3>
      <div className="harbour-row">
        {ZONES.map((zone) => (
          <button key={zone} type="button" disabled={busy || short} title={short ? 'Needs 80g' : undefined} onClick={() => onSurvey(zone)}>
            Survey {ZONE_LABEL[zone]}
          </button>
        ))}
      </div>
    </div>
  );
}

function leaseText(lease: LeaseRow): string {
  const term = `${lease.weeksLeft} week${lease.weeksLeft === 1 ? '' : 's'} left`;
  const rent = `${fmtGold(lease.weeklyRent)}g a week, ${term}`;
  if (lease.lessee === 'you') return `You rent a licence from ${lease.lessorName}: ${rent}.`;
  return `${lease.lesseeName} rents a licence from you: ${rent}.`;
}

function LeaseList({ leases, busy, onLease }: Pick<Props, 'leases' | 'busy' | 'onLease'>) {
  const mine = (leases ?? []).filter((lease) => lease.lessor === 'you' || lease.lessee === 'you');
  if (mine.length === 0) return null;
  return (
    <ul className="harbour-list">
      {mine.map((lease, i) => (
        <li key={`${lease.lessor}-${lease.lessee}-${i}`}>
          <span>{leaseText(lease)}</span>
          <span className="harbour-row">
            <button type="button" disabled={busy || onLease === undefined} title={onLease === undefined ? 'Lease desk not wired' : undefined} onClick={() => onLease?.('unlease', lease.lessor, lease.lessee, 0)}>
              End lease
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}

function LicenceRow({ captains, licencePool, youLicences, busy, playerGold, licencePrice, leases, onLicence, onLease }: Pick<Props, 'captains' | 'licencePool' | 'youLicences' | 'busy' | 'playerGold' | 'licencePrice' | 'leases' | 'onLicence' | 'onLease'>) {
  const others = captains.filter((c) => c.id !== 'you');
  // Same pattern as the loan-note pool buy: no request fires when the
  // purse cannot cover the known price. Unknown price: stay enabled.
  const short = licencePrice !== undefined && playerGold < licencePrice;
  const shortTitle = short && licencePrice !== undefined ? `Needs ${fmtGold(licencePrice)}g` : undefined;
  return (
    <div className="harbour-block">
      <h3>Licences (pool: {licencePool}, yours: {youLicences}{licencePrice !== undefined ? `, ${fmtGold(licencePrice)}g each` : ''})</h3>
      <div className="harbour-row">
        <button type="button" disabled={busy || short || licencePool === 0} title={licencePool === 0 ? 'Pool empty' : shortTitle} onClick={() => onLicence('buy', 'pool')}>
          Buy licence
        </button>
        <button type="button" disabled={busy || youLicences === 0} title={youLicences === 0 ? 'You hold none' : undefined} onClick={() => onLicence('sell', 'pool')}>
          Sell licence
        </button>
        {others.map((c) => (
          <span key={c.id} className="harbour-trade">
            <span className="muted">{c.name} ({c.licences})</span>
            <button type="button" disabled={busy || short || c.licences === 0} title={c.licences === 0 ? `${c.name} holds none` : shortTitle} onClick={() => onLicence('buy', c.id)}>
              Buy
            </button>
            <button type="button" disabled={busy || youLicences === 0} title={youLicences === 0 ? 'You hold none' : undefined} onClick={() => onLicence('sell', c.id)}>
              Sell
            </button>
            <button type="button" disabled={busy || onLease === undefined || c.licences === 0} title={onLease === undefined ? 'Lease desk not wired' : c.licences === 0 ? `${c.name} holds none` : undefined} onClick={() => onLease?.('lease', c.id, 'you', RENT_WEEKS)}>
              Rent
            </button>
          </span>
        ))}
      </div>
      <LeaseList leases={leases} busy={busy} onLease={onLease} />
    </div>
  );
}

function DebtRow({ loans, busy, playerGold, onDebt }: Pick<Props, 'loans' | 'busy' | 'playerGold' | 'onDebt'>) {
  if (loans.length === 0) return null;
  return (
    <div className="harbour-block">
      <h3>Loan notes</h3>
      <ul className="harbour-list">
        {loans.map((loan) => (
          <li key={loan.id}>
            <span>Note {loan.id}: {loan.borrower} owes {fmtGold(loan.outstanding)}g, held by {loan.holder}, {loan.missed} missed.</span>
            <span className="harbour-row">
              {loan.holder === 'Harbour Bank' && (
                <button type="button" disabled={busy || loan.outstanding > playerGold} title={loan.outstanding > playerGold ? 'Cannot afford' : undefined} onClick={() => onDebt('buy', String(loan.id))}>
                  Buy
                </button>
              )}
              {loan.holder === 'You' && (
                <>
                  <button type="button" disabled={busy} onClick={() => onDebt('forbear', String(loan.id))}>
                    Forbear
                  </button>
                  <button type="button" disabled={busy} onClick={() => onDebt('seize', String(loan.id))}>
                    Seize
                  </button>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function proposalText(proposal: CouncilProposal): string {
  const parts = [`quota ${proposal.quota_per_licence}`];
  if (proposal.close_zone !== null) parts.push(`close ${proposal.close_zone}`);
  if (proposal.ban_small_mesh) parts.push('ban small mesh');
  // Barreau 2: the levy a crate the motion would set for next season.
  if (proposal.levy_per_crate !== null && proposal.levy_per_crate !== undefined) {
    parts.push(`levy ${(proposal.levy_per_crate / 100).toFixed(1)}g a crate`);
  }
  parts.push(`indemnity ${(proposal.indemnity_per_licence_week / 100).toFixed(2)}g`);
  return parts.join(' · ');
}

// Barreau 2: the levy a crate, a plain numeric field (0 to 1.2 gold).
function LevyInput({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <label>
      Levy a crate
      <input value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" maxLength={4} placeholder="0 to 1.2" aria-label="Landing levy in gold per crate" />
    </label>
  );
}

function ProposeForm({ busy, onPropose }: Pick<Props, 'busy' | 'onPropose'>) {
  const [quota, setQuota] = useState('50');
  const [closeZone, setCloseZone] = useState('');
  const [banMesh, setBanMesh] = useState(false);
  const [indemnity, setIndemnity] = useState('0');
  const [levy, setLevy] = useState('');
  function propose(): void {
    const tokens = [`quota${quota.trim() === '' ? '50' : quota.trim()}`];
    if (closeZone !== '') tokens.push(`close:${closeZone}`);
    if (banMesh) tokens.push('ban-mesh');
    const rate = Number(levy);
    if (levy.trim() !== '' && Number.isFinite(rate) && rate >= 0 && rate <= 1.2) {
      tokens.push(`levy:${rate}`);
    }
    const pay = Number(indemnity);
    onPropose(tokens.join(','), Number.isFinite(pay) && pay > 0 ? pay : 0);
  }
  return (
    <div className="harbour-row">
      <label>
        Quota
        <input value={quota} onChange={(e) => setQuota(e.target.value)} inputMode="numeric" maxLength={4} aria-label="Quota per licence" />
      </label>
      <label>
        Close
        <select value={closeZone} onChange={(e) => setCloseZone(e.target.value)} aria-label="Close zone">
          <option value="">None</option>
          {ZONES.map((zone) => (
            <option key={zone} value={zone}>{ZONE_LABEL[zone]}</option>
          ))}
        </select>
      </label>
      <label>
        <input type="checkbox" checked={banMesh} onChange={(e) => setBanMesh(e.target.checked)} />
        Ban small mesh
      </label>
      <label>
        Indemnity
        <input value={indemnity} onChange={(e) => setIndemnity(e.target.value)} inputMode="decimal" maxLength={6} aria-label="Indemnity in gold" />
      </label>
      <LevyInput value={levy} onChange={setLevy} />
      <button type="button" disabled={busy} onClick={propose}>
        Propose
      </button>
    </div>
  );
}

function CouncilMinutes({ council }: { council: CouncilOutcome }) {
  if (council.lines.length === 0) return null;
  return (
    <>
      <p className="muted">Last council (season {council.season}):</p>
      <ul className="reason-list">
        {council.lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </>
  );
}

function CouncilBlock({ proposal, lastCouncil, busy, onPropose, onVote }: Pick<Props, 'proposal' | 'lastCouncil' | 'busy' | 'onPropose' | 'onVote'>) {
  const showMinutes = proposal === null && lastCouncil !== null && lastCouncil.lines.length > 0;
  return (
    <div className="harbour-block">
      <h3>Council</h3>
      {proposal !== null && <p className="muted">Motion: {proposalText(proposal)}</p>}
      {proposal === null && !showMinutes && <p className="muted">No motion tabled.</p>}
      {showMinutes && lastCouncil !== null && <CouncilMinutes council={lastCouncil} />}
      <ProposeForm busy={busy} onPropose={onPropose} />
      <div className="harbour-row">
        <button type="button" disabled={busy} onClick={() => onVote(true)}>
          Vote yes
        </button>
        <button type="button" disabled={busy} onClick={() => onVote(false)}>
          Vote no
        </button>
      </div>
    </div>
  );
}

export default function HarbourPanel(props: Props) {
  return (
    <section className="panel harbour" aria-label="Harbour office">
      <h2>Harbour office</h2>
      <SurveyRow busy={props.busy} playerGold={props.playerGold} onSurvey={props.onSurvey} />
      <LicenceRow captains={props.captains} licencePool={props.licencePool} youLicences={props.youLicences} busy={props.busy} playerGold={props.playerGold} licencePrice={props.licencePrice} leases={props.leases} onLicence={props.onLicence} onLease={props.onLease} />
      <DebtRow loans={props.loans} busy={props.busy} playerGold={props.playerGold} onDebt={props.onDebt} />
      <CouncilBlock proposal={props.proposal} lastCouncil={props.lastCouncil} busy={props.busy} onPropose={props.onPropose} onVote={props.onVote} />
    </section>
  );
}

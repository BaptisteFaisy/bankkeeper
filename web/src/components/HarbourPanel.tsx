// Harbour office: the player levers from brief section 2.3.
// Surveys per zone, licence trade (pool and captains), loan notes
// (buy/forbear/seize) and council motions (propose + vote yes/no).
import { useState } from 'react';
import type { CaptainView, CouncilProposal, LoanView, ZoneId } from '../types';
import { ZONE_LABEL } from '../types';
import { fmtGold } from '../format';

interface Props {
  captains: CaptainView[];
  loans: LoanView[];
  licencePool: number;
  proposal: CouncilProposal | null;
  playerGold: number;
  youLicences: number;
  busy: boolean;
  onSurvey: (zone: ZoneId) => void;
  onLicence: (action: 'buy' | 'sell', ref: string) => void;
  onDebt: (action: 'buy' | 'forbear' | 'seize', ref: string) => void;
  onPropose: (rule: string, indemnity: number) => void;
  onVote: (yes: boolean) => void;
}

const ZONES: ZoneId[] = ['shallows', 'greybank', 'deeps'];

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

function LicenceRow({ captains, licencePool, youLicences, busy, onLicence }: Pick<Props, 'captains' | 'licencePool' | 'youLicences' | 'busy' | 'onLicence'>) {
  const others = captains.filter((c) => c.id !== 'you');
  return (
    <div className="harbour-block">
      <h3>Licences (pool: {licencePool}, yours: {youLicences})</h3>
      <div className="harbour-row">
        <button type="button" disabled={busy || licencePool === 0} title={licencePool === 0 ? 'Pool empty' : undefined} onClick={() => onLicence('buy', 'pool')}>
          Buy licence
        </button>
        <button type="button" disabled={busy || youLicences === 0} title={youLicences === 0 ? 'You hold none' : undefined} onClick={() => onLicence('sell', 'pool')}>
          Sell licence
        </button>
        {others.map((c) => (
          <span key={c.id} className="harbour-trade">
            <span className="muted">{c.name} ({c.licences})</span>
            <button type="button" disabled={busy || c.licences === 0} title={c.licences === 0 ? `${c.name} holds none` : undefined} onClick={() => onLicence('buy', c.id)}>
              Buy
            </button>
            <button type="button" disabled={busy || youLicences === 0} title={youLicences === 0 ? 'You hold none' : undefined} onClick={() => onLicence('sell', c.id)}>
              Sell
            </button>
          </span>
        ))}
      </div>
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
  parts.push(`indemnity ${(proposal.indemnity_per_licence_week / 100).toFixed(2)}g`);
  return parts.join(' · ');
}

function ProposeForm({ busy, onPropose }: Pick<Props, 'busy' | 'onPropose'>) {
  const [quota, setQuota] = useState('50');
  const [closeZone, setCloseZone] = useState('');
  const [banMesh, setBanMesh] = useState(false);
  const [indemnity, setIndemnity] = useState('0');
  function propose(): void {
    const tokens = [`quota${quota.trim() === '' ? '50' : quota.trim()}`];
    if (closeZone !== '') tokens.push(`close:${closeZone}`);
    if (banMesh) tokens.push('ban-mesh');
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
      <button type="button" disabled={busy} onClick={propose}>
        Propose
      </button>
    </div>
  );
}

function CouncilBlock({ proposal, busy, onPropose, onVote }: Pick<Props, 'proposal' | 'busy' | 'onPropose' | 'onVote'>) {
  return (
    <div className="harbour-block">
      <h3>Council</h3>
      <p className="muted">{proposal === null ? 'No motion tabled.' : `Motion: ${proposalText(proposal)}`}</p>
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
      <LicenceRow captains={props.captains} licencePool={props.licencePool} youLicences={props.youLicences} busy={props.busy} onLicence={props.onLicence} />
      <DebtRow loans={props.loans} busy={props.busy} playerGold={props.playerGold} onDebt={props.onDebt} />
      <CouncilBlock proposal={props.proposal} busy={props.busy} onPropose={props.onPropose} onVote={props.onVote} />
    </section>
  );
}

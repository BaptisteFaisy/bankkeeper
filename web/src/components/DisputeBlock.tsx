// Barreau 5 — Réparer : the collective fallow and the claim against the fund.
//
// The register says:
//   - what is closed and for how many weeks;
//   - what the port fund paid out in indemnities;
//   - the issue of the seasonal claim.
//
// Exactly one claim per season, as bounded by the spine: the button disables
// once a claim is heard. Numbers only, no sermons.
import { useState } from 'react';
import type { DisputeView, SeaZone } from '../types';
import { ZONE_LABEL } from '../types';
import { fmtGold } from '../format';

interface Props {
  dispute: DisputeView | null;
  closedZones: SeaZone[];
  busy: boolean;
  onClaim?: (actor: string, gold: number) => void;
}

export default function DisputeBlock({ dispute, closedZones, busy, onClaim }: Props) {
  const [demanded, setDemanded] = useState('50');
  const resting = closedZones.filter((z) => z.fallowWeeks > 0);
  const claimUsed = (dispute?.claimsThisSeason ?? 0) >= (dispute?.maxClaimsPerSeason ?? 1);
  const last = dispute?.lastClaim;

  function submit(): void {
    const gold = Number(demanded);
    if (!Number.isFinite(gold) || gold <= 0 || onClaim === undefined) return;
    onClaim('you', gold);
  }

  return (
    <div>
      <h3>Repairs & claims</h3>
      {resting.length === 0 ? (
        <p className="muted">No ground under collective fallow right now.</p>
      ) : (
        <ul className="reason-list">
          {resting.map((z) => (
            <li key={z.zone}>
              <strong>{ZONE_LABEL[z.zone]}</strong> resting: {z.fallowWeeks} week(s) left.
            </li>
          ))}
        </ul>
      )}
      {(dispute?.fallowIndemnitiesPaid ?? 0) > 0 && (
        <p className="muted" data-testid="fallow-indemnities">
          Port fund paid {fmtGold(dispute?.fallowIndemnitiesPaid ?? 0)}g in collective fallow indemnities.
        </p>
      )}
      {last !== undefined && last !== null && (
        <p className="muted" data-testid="last-claim">
          Last claim (season {last.season}): {last.summary}
        </p>
      )}
      {onClaim !== undefined && (
        <div className="harbour-row">
          <label>
            Claim
            <input
              value={demanded}
              onChange={(e) => setDemanded(e.target.value)}
              inputMode="decimal"
              maxLength={6}
              disabled={busy || claimUsed}
              aria-label="Gold demanded from the fund"
            />
          </label>
          <button
            type="button"
            disabled={busy || claimUsed}
            title={claimUsed ? 'One claim per season maximum' : undefined}
            onClick={submit}
          >
            Claim against fund
          </button>
          <span className="muted">
            {claimUsed ? '1/1 claim heard this season.' : '0/1 claim heard this season.'}
            {` Credibility: ${(dispute?.credibility ?? 0) > 0 ? '+' : ''}${dispute?.credibility ?? 0}`}
          </span>
        </div>
      )}
    </div>
  );
}

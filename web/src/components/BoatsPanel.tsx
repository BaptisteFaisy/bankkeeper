// Your boats: zone, net, current trip and last catch per boat.
// Two-click assignment: pick a boat, then a zone or the quay.
// The net switches only at the quay.
import type { BoatView, Mesh, ZoneId } from '../types';
import { MESH_LABEL, ZONE_LABEL, ZONES } from '../types';
import PanelHead from './PanelHead';

interface Props {
  boats: BoatView[];
  selectedBoat: string | null;
  busy: boolean;
  onSelectBoat: (id: string | null) => void;
  onAssign: (boat: BoatView, zone: ZoneId | null) => void;
  onMesh: (boat: BoatView, mesh: Mesh) => void;
}

function tripText(boat: BoatView): string {
  if (boat.disarmed) return 'Disarmed';
  if (boat.trip !== null) return `Trip to ${ZONE_LABEL[boat.trip.zone]} (${Math.round(boat.trip.progress * 100)}%)`;
  if (boat.zone !== null) return `At sea: ${ZONE_LABEL[boat.zone]}`;
  return 'At the quay';
}

function BoatCard({ boat, selected, busy, onSelectBoat, onAssign, onMesh }: Props & { boat: BoatView; selected: boolean }) {
  const atQuay = boat.zone === null && boat.trip === null;
  return (
    <li className={selected ? 'boat-card selected' : 'boat-card'}>
      <button
        type="button"
        className="boat-head"
        onClick={() => onSelectBoat(selected ? null : boat.id)}
        aria-pressed={selected}
      >
        <strong>{boat.name}</strong>
        <span className="muted">{tripText(boat)}</span>
      </button>
      <p className="boat-meta">
        {MESH_LABEL[boat.mesh]} · Last catch: {boat.lastCatch}
      </p>
      {selected && !boat.disarmed && (
        <div className="boat-orders">
          <div className="zone-buttons" role="group" aria-label={`Send ${boat.name} to`}>
            {ZONES.map((z) => (
              <button key={z} type="button" disabled={busy} onClick={() => onAssign(boat, z)}>
                {ZONE_LABEL[z]}
              </button>
            ))}
            <button type="button" disabled={busy} onClick={() => onAssign(boat, null)}>
              Quay
            </button>
          </div>
          <div className="mesh-row">
            <span className="muted">Net:</span>
            <button type="button" disabled={busy || !atQuay || boat.mesh === 'large'} aria-pressed={boat.mesh === 'large'} onClick={() => onMesh(boat, 'large')}>
              {boat.mesh === 'large' ? 'Large (current)' : 'Large'}
            </button>
            <button type="button" disabled={busy || !atQuay || boat.mesh === 'small'} aria-pressed={boat.mesh === 'small'} onClick={() => onMesh(boat, 'small')}>
              {boat.mesh === 'small' ? 'Small (current)' : 'Small'}
            </button>
            {!atQuay && <span className="muted">Nets change at the quay only.</span>}
          </div>
        </div>
      )}
    </li>
  );
}

export default function BoatsPanel(props: Props) {
  const mine = props.boats.filter((b) => b.mine);
  return (
    <section className="panel boats" aria-label="Your boats">
      <PanelHead title="Your boats" note="Two clicks send a boat out: pick the boat, then a ground on the water or a button below." />
      {mine.length === 0 ? (
        <p className="muted">No boats left. The harbour master wishes you fair winds elsewhere.</p>
      ) : (
        <ul className="boat-list">
          {mine.map((b) => (
            <BoatCard key={b.id} {...props} boat={b} selected={b.id === props.selectedBoat} />
          ))}
        </ul>
      )}
    </section>
  );
}

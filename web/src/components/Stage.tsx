// Stage: the scene, and the instruments that flank it.
//
// The scene is the big thing on the screen; the criée and the boats are the
// panels beside it. The replay of the day lives here, so the panel and the
// scene always show the same lot at the same price — the panel prints the
// numbers, the scene draws the instruments.
import type { BoatView, Mesh, PortState, ZoneId } from '../types';
import { EMPTY_AUCTION } from '../types';
import SeaMap from './SeaMap';
import AuctionPanel from './AuctionPanel';
import BoatsPanel from './BoatsPanel';
import ZoneReadings from './ZoneReadings';
import { useReplay, useSweep } from '../replay';

interface Props {
  port: PortState | null;
  selectedBoat: string | null;
  busy: boolean;
  over: boolean;
  onPickBoat: (id: string) => void;
  onPickZone: (zone: ZoneId) => void;
  onPickQuay: () => void;
  onSelectBoat: (id: string | null) => void;
  onAssign: (boat: BoatView, zone: ZoneId | null) => void;
  onMesh: (boat: BoatView, mesh: Mesh) => void;
}

/** The key of a lot: the sweep restarts when the lot changes. */
function lotKey(lot: { captain: string; crates: number; price: number } | null): string {
  if (lot === null) return 'none';
  return `${lot.captain}-${lot.crates}-${lot.price}`;
}

export default function Stage(props: Props) {
  const port = props.port;
  const landings = port?.landings ?? [];
  const dayKey = `${port?.week ?? 0}-${port?.day ?? ''}`;
  const replay = useReplay(landings, dayKey);
  const live = replay.live;
  const price = useSweep(live?.start ?? 0, live?.price ?? 0, lotKey(live));
  return (
    <main className="board">
      <section className="panel chart-panel" aria-label="Sea chart">
        <h2>Sea chart</h2>
        <SeaMap
          port={port}
          live={live}
          price={price}
          selectedBoat={props.selectedBoat}
          onPickBoat={props.onPickBoat}
          onPickZone={props.onPickZone}
          onPickQuay={props.onPickQuay}
        />
        <ZoneReadings zones={port?.zones ?? []} />
      </section>
      <div className="side">
        <AuctionPanel
          auction={port?.auction ?? EMPTY_AUCTION}
          buyers={port?.buyers ?? []}
          replay={replay}
          price={price}
        />
        <BoatsPanel
          boats={port?.boats ?? []}
          selectedBoat={props.selectedBoat}
          busy={props.busy || props.over}
          onSelectBoat={props.onSelectBoat}
          onAssign={props.onAssign}
          onMesh={props.onMesh}
        />
      </div>
    </main>
  );
}

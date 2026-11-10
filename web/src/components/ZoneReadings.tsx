// The zone readings: one text line per fishing ground, under the canvas.
//
// The scene reads the stock without numbers (fish silhouettes, a stock
// bar), but the old chart used to print the catch per trip, the trend,
// the hulls at sea, the trip cost and the survey on the water. Nothing
// that was readable may disappear, so the numbers live here — and screen
// readers get them as text, which canvas pixels never were.
import type { ZoneView } from '../types';
import { ZONE_LABEL } from '../types';

interface Props {
  zones: ZoneView[];
}

/** One ground, one line: the same five readings the water used to carry. */
function ZoneLine({ zone }: { zone: ZoneView }) {
  const hulls = zone.boats === 1 ? '1 boat' : `${zone.boats} boats`;
  return (
    <li>
      <strong>{ZONE_LABEL[zone.id]}</strong>
      {' '}
      {zone.catchPerTrip.toFixed(1)} crates/trip · {zone.trend} · {hulls} · {zone.tripCost}g/trip
      {zone.survey !== null ? ` · ${zone.survey}` : ''}
    </li>
  );
}

export default function ZoneReadings({ zones }: Props) {
  if (zones.length === 0) return null;
  return (
    <ul className="zone-readings" aria-label="Zone readings">
      {zones.map((zone) => (
        <ZoneLine key={zone.id} zone={zone} />
      ))}
    </ul>
  );
}

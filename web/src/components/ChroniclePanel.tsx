// The chronicle: what the port remembers of the seasons it has closed.
//
// One row per season: what the player was worth, what the sea had left, who
// was stopped, and the rule the council carried. Read-only — this is the
// harbour's book, not a lever.
import type { ChronicleEntryView } from '../types';
import { charterLabel } from '../charter';
import type { Charter } from '../charter';
import { fmtGold } from '../format';
import PanelHead from './PanelHead';

interface Props {
  entries: ChronicleEntryView[];
  charter?: Charter | null;
}

function closuresText(names: string[]): string {
  return names.length === 0 ? 'none' : names.join(', ');
}

/** Sim money is centigold; the panel reads in gold pieces. */
function gold(centigold: number): string {
  return fmtGold(centigold / 100);
}

function ChronicleRow({ entry }: { entry: ChronicleEntryView }) {
  const [shallows, greybank, deeps] = entry.stocks;
  return (
    <tr>
      <td className="num">{entry.season}</td>
      <td className="num">{gold(entry.net_worth)}g</td>
      <td className="num">{shallows} · {greybank} · {deeps}</td>
      <td>{closuresText(entry.closures)}</td>
      <td>{entry.rule === null ? 'no motion carried' : entry.rule}</td>
    </tr>
  );
}

export default function ChroniclePanel({ entries, charter }: Props) {
  return (
    <section className="panel chronicle" aria-label="Chronicle">
      <PanelHead title="The port's chronicle" note="One line per closed season: what you were worth, what the sea had left, the rule the fleet carried." />
      {entries.length === 0 ? (
        <p className="muted">No season closed yet. The book opens the day the first bilan is written.</p>
      ) : (
        <table className="chronicle-table">
          <thead>
            <tr>
              <th scope="col">Season</th>
              <th scope="col">Net worth</th>
              <th scope="col">Stocks left</th>
              <th scope="col">Stopped</th>
              <th scope="col">Rule carried</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <ChronicleRow key={entry.season} entry={entry} />
            ))}
          </tbody>
        </table>
      )}
      <p className="muted">This campaign sails under: {charterLabel(charter)}.</p>
    </section>
  );
}

// Books: the two columns of the score, always on screen, larger than
// anything else. What you are worth in gold, and what you owe the sea in
// crates taken above what the grounds could grow back. No verdict.
import type { PortState } from '../types';
import { fmtCrates } from '../format';

interface Props { port: PortState | null }

function seasonLine(port: PortState | null): string {
  if (port === null) return '';
  const seasons = port.campaignSeasons ?? 1;
  const season = seasons > 1 ? `Season ${port.season ?? 1} of ${seasons} · ` : '';
  return `${season}Week ${port.week} · ${port.day}`;
}

export default function Books({ port }: Props) {
  const worth = port === null ? null : Math.round(port.netWorth);
  const debt = port?.sea?.debt ?? null;
  return (
    <section className="books" aria-label="Your books">
      <p className="books-when">{seasonLine(port)}</p>
      <div className="books-worth">
        <span className="books-k">Net worth</span>
        <span className="books-v">{worth === null ? '—' : worth.toLocaleString('en-US')}<small>gold</small></span>
      </div>
      <div className="books-debt">
        <span className="books-k">Debt to the sea</span>
        <span className="books-v">{debt === null ? '—' : fmtCrates(debt)}<small>crates</small></span>
      </div>
    </section>
  );
}

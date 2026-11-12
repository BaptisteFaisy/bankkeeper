// TopBar: the harbour's header strip — the clock, the day's readings, and the
// two doors (how to play, judges). Restarting lives on the season-end card,
// and there is no sign-out: the harbour belongs to this browser.
//
// Split out of App.tsx so the screen keeps one subject per file (and stays
// inside the structural line budget). Pure presentation: every value and every
// callback is handed in by the screen.
import type { RefObject } from 'react';
import type { PortState } from '../types';
import type { Session } from '../session';
import { ClockControls, HowToPlay } from './HeaderControls';
import { fmtGold } from '../format';

export interface TopBarProps {
  port: PortState | null;
  session: Session;
  judgesOpen: boolean;
  onJudges: (open: boolean) => void;
  judgesRef: RefObject<HTMLButtonElement>;
  onEndDay: () => void;
  dayBusy: boolean;
  over: boolean;
  live: boolean;
  setLive: (on: boolean) => void;
  secondsLeft: number;
  onHowToPlay: () => void;
}

/** One dial of the header: a small label over its value (G-DESIGN V10.2 B).
 *  The whole dial is the `.tide-stat` the audits read, label first. */
function Dial({ label, value, unit, gold = false }: { label: string; value: string; unit: string; gold?: boolean }) {
  return (
    <span className={gold ? 'tide-stat dial gold' : 'tide-stat dial'}>
      <span className="dial-k">{label}</span>
      <span className="dial-v">{value}{unit === '' ? null : <> <small>{unit}</small></>}</span>
    </span>
  );
}

export default function TopBar({ port, session, judgesOpen, onJudges, judgesRef, onEndDay, dayBusy, over, live, setLive, secondsLeft, onHowToPlay }: TopBarProps) {
  return (
    <header className="topbar">
      <h1>Tidewater</h1>
      <span className="muted captain">· Captain {session.name}</span>
      <Dial label="Today" value={port === null ? '—' : `${port.day}, week ${port.week}`} unit={port === null ? '' : `${port.tide.toLowerCase()} tide`} />
      <Dial label="Your purse" value={port === null ? '—' : fmtGold(port.playerGold).replace(/\.0$/, '')} unit="gold" gold />
      <Dial label="Quota left" value={port === null ? '—' : String(port.quotaLeft)} unit="crates" />
      <ClockControls
        live={live}
        setLive={setLive}
        secondsLeft={secondsLeft}
        onEndDay={onEndDay}
        busy={dayBusy}
        over={over}
      />
      <HowToPlay onOpen={onHowToPlay} />
      <button
        type="button"
        className="ghost"
        ref={judgesRef}
        onClick={() => onJudges(!judgesOpen)}
        aria-expanded={judgesOpen}
        aria-controls={judgesOpen ? 'judges-bench' : undefined}
      >
        Judges
      </button>
    </header>
  );
}

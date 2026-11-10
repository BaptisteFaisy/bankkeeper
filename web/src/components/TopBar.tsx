// TopBar: the harbour's header strip — the clock, the day's readings, and the
// three doors (how to play, new harbour, judges).
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
  onLogout: () => void;
  judgesOpen: boolean;
  onJudges: (open: boolean) => void;
  judgesRef: RefObject<HTMLButtonElement>;
  onEndDay: () => void;
  dayBusy: boolean;
  over: boolean;
  onReset: () => void;
  live: boolean;
  setLive: (on: boolean) => void;
  secondsLeft: number;
  nextLot: () => void;
  onHowToPlay: () => void;
}

export default function TopBar({ port, session, onLogout, judgesOpen, onJudges, judgesRef, onEndDay, dayBusy, over, onReset, live, setLive, secondsLeft, nextLot, onHowToPlay }: TopBarProps) {
  return (
    <header className="topbar">
      <h1>Tidewater</h1>
      <span className="tide-stat">Week {port?.week ?? '—'} · {port?.day ?? '—'} · {port?.tide ?? '—'}</span>
      <span className="tide-stat gold">{port === null ? '—' : `${fmtGold(port.playerGold)}g`}</span>
      <span className="tide-stat">Quota left: {port?.quotaLeft ?? '—'}</span>
      {port !== null && (port.campaignSeasons ?? 1) > 1 ? (
        <span className="tide-stat">Season {port.season ?? 1} of {port.campaignSeasons}</span>
      ) : null}
      <span className="muted">{session.name}</span>
      <ClockControls
        live={live}
        setLive={setLive}
        secondsLeft={secondsLeft}
        nextLot={nextLot}
        onEndDay={onEndDay}
        busy={dayBusy}
        over={over}
      />
      <HowToPlay onOpen={onHowToPlay} />
      <button type="button" className="ghost" disabled={dayBusy} onClick={onReset}>
        New harbour
      </button>
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
      <button type="button" className="ghost" onClick={onLogout}>Log out</button>
    </header>
  );
}

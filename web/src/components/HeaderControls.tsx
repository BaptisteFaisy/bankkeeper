// Header controls: the live clock and the share link.
// Kept out of App.tsx so each file stays readable (see ci_structural.py).
import { useState } from 'react';
import type { GameState } from '../hooks';
import type { PortState } from '../types';
import { shareUrl } from '../persistence';

/** The live clock and the day's close: two ways into the same engine. */
export function ClockControls({ live, setLive, secondsLeft, onEndDay, busy, over }: {
  live: boolean;
  setLive: (on: boolean) => void;
  secondsLeft: number;
  onEndDay: () => void;
  busy: boolean;
  over: boolean;
}) {
  return (
    <>
      <button
        type="button"
        className={live ? undefined : 'ghost'}
        disabled={busy || over}
        aria-pressed={live}
        title={over ? 'The season is over' : 'One lot every thirty seconds, a day every five minutes'}
        onClick={() => setLive(!live)}
      >
        {live ? `Live · next lot ${secondsLeft}s` : 'Go live'}
      </button>
      <button type="button" disabled={busy || over} onClick={onEndDay} title="Land the rest of the day and close it">
        End the day
      </button>
    </>
  );
}

/** Reopens the three-card tutorial, for anyone who skipped it or forgot it. */
export function HowToPlay({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      className="ghost how-to-play"
      onClick={onOpen}
      title="Three cards: the shared stock, the auction, the council"
      aria-label="How to play"
    >
      How to play
    </button>
  );
}

/** The link that replays this season elsewhere (seed + length in the URL). */
export function CopyLink({ game, port }: { game: GameState; port: PortState | null }) {
  const [copied, setCopied] = useState(false);
  async function copy(): Promise<void> {
    const seed = Number.parseInt(port?.seed ?? '', 10);
    const url = shareUrl({ seed: Number.isFinite(seed) ? seed : 7, weeks: port?.weeksPerSeason ?? 4 }, window.location.href);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      game.actions.pushToast('info', 'Season link copied.', url);
    } catch {
      game.actions.pushToast('error', 'Could not copy. The link is:', url);
    }
  }
  return (
    <button type="button" className="ghost" onClick={() => { void copy(); }}>
      {copied ? 'Link copied' : 'Copy season link'}
    </button>
  );
}


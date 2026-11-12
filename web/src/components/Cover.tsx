// Cover: the front page of the game.
//
// One veil over the whole app, on every load: the name, one sentence that
// says what this is about, the goal, four verbs that explain how to play,
// and the two doors — `Play` lifts the veil, `Scenario` opens the guided
// demo page (`scene-preview.html`), a scripted day with captions.
// Read-only and self-contained: nothing here touches the engine.
import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';

const SCENARIO_URL = 'scene-preview.html';

const SLOGAN = 'One harbour, one sea. Every captain fishes the same three '
  + 'banks: land your catch, sell it at the auction, and decide with the '
  + 'fleet how much the sea can still give.';

const GOAL = 'Goal: the biggest net worth at the end of the campaign — with a sea still worth fishing.';

const HOW: Array<[string, string]> = [
  ['Send', 'Pick one of your boats, then a fishing ground on the water. It sails out, it lands, it comes home.'],
  ['Sell', 'Close the day and the fish auction sells your catch lot by lot: the price falls until a merchant buys it.'],
  ['Watch', 'The banks run out. What the sea cannot regrow is written down as a debt to the sea, in crates.'],
  ['Vote', 'Each season closes on a council vote about the next quota. The sea you leave is the sea you inherit.'],
];

/** Escape lifts the veil too: the card is a door, not a gate. */
function useEscape(onPlay: () => void): void {
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') onPlay();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPlay]);
}

/** The front page: one card, one accent colour, two doors. */
export default function Cover({ onPlay }: { onPlay: () => void }): ReactElement {
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => { card.current?.focus(); }, []);
  useEscape(onPlay);
  return (
    <div className="cover">
      <div
        className="cover-card"
        role="dialog"
        aria-labelledby="cover-title"
        aria-describedby="cover-body"
        tabIndex={-1}
        ref={card}
      >
        <h1 id="cover-title">Tidewater</h1>
        <div id="cover-body">
          <p className="cover-slogan">{SLOGAN}</p>
          <p className="cover-goal">{GOAL}</p>
          <h2>How to play</h2>
          <dl className="cover-how">
            {HOW.map(([verb, text]) => (
              <div className="cover-step" key={verb}>
                <dt>{verb}</dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="cover-actions">
          <button type="button" data-testid="cover-play" onClick={onPlay}>Play</button>
          <a className="ghost" href={SCENARIO_URL} target="_blank" rel="noreferrer" data-testid="cover-scenario">
            Scenario
          </a>
        </div>
        <p className="cover-foot">Play starts this harbour. Scenario shows one day played for you.</p>
      </div>
    </div>
  );
}

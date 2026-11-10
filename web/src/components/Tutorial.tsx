// Tutorial: three cards that teach the loop once, then get out of the way.
// Opens on the very first launch (no `localStorage` mark), never on its own
// after that; `How to play` in the top bar brings it back at any time.
import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject, ReactElement, RefObject } from 'react';

const KEY = 'tidewater-tutorial-v1';

/** Has this browser already been shown the loop? */
export function tutorialSeen(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    // Private mode: treat it as seen rather than opening on every load.
    return true;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(KEY, 'seen');
  } catch {
    // Storage blocked: the tutorial simply opens again next visit.
  }
}

/** First-launch gate for App: `open` starts true only on a fresh browser. */
export function useTutorial(): { open: boolean; show: () => void; close: () => void } {
  const [open, setOpen] = useState(() => !tutorialSeen());
  return {
    open,
    show: () => setOpen(true),
    close: () => {
      markSeen();
      setOpen(false);
    },
  };
}

/// Card one: the bank is a shared account, and the catch falls before the crash.
function StockArt(): ReactElement {
  const bars = [46, 40, 33, 27, 20, 14];
  return (
    <svg viewBox="0 0 320 110" role="img" aria-label="Six days on one bank: the stock shrinks and the catch per trip falls with it">
      <line x1="6" y1="96" x2="314" y2="96" stroke="var(--line)" strokeWidth="1" />
      {bars.map((h, i) => (
        <rect key={`bar-${h}`} x={12 + i * 50} y={96 - h} width="32" height={h} rx="2" fill="var(--sea)" />
      ))}
      <polyline points="20,24 78,30 134,35 190,39 240,42 278,45" fill="none" stroke="var(--buoy)" strokeWidth="2" />
      <text x="8" y="12" fill="var(--buoy)" fontSize="10">catch per trip</text>
      <text x="8" y="108" fill="var(--sand)" fontSize="10">the bank, day after day</text>
    </svg>
  );
}

/// Card two: each merchant stops at its own limit, and the price of the next
/// lot follows what the merchants still have room for.
function AuctionArt(): ReactElement {
  const rows = [
    { name: 'Cannery', fill: 0.92, tint: 'var(--buoy)' },
    { name: 'Fishmonger', fill: 0.55, tint: 'var(--sea)' },
    { name: 'Salt house', fill: 0.3, tint: 'var(--sea)' },
  ];
  return (
    <svg viewBox="0 0 320 100" role="img" aria-label="Three merchants with different remaining limits; the fullest one stops bidding and the next price drops">
      {rows.map((row, i) => (
        <g key={row.name}>
          <text x="6" y={25 + i * 24} fill="var(--ink)" fontSize="10">{row.name}</text>
          <rect x="92" y={15 + i * 24} width="170" height="12" rx="3" fill="#0b2126" stroke="var(--line)" />
          <rect x="92" y={15 + i * 24} width={Math.round(170 * row.fill)} height="12" rx="3" fill={row.tint} />
        </g>
      ))}
      <text x="6" y="96" fill="var(--sand)" fontSize="10">limit = its stock against its target</text>
      <line x1="286" y1="16" x2="286" y2="70" stroke="var(--buoy)" strokeWidth="1.5" strokeDasharray="4 3" />
      <polyline points="281,64 286,72 291,64" fill="none" stroke="var(--buoy)" strokeWidth="1.5" />
      <text x="266" y="12" fill="var(--buoy)" fontSize="9">next price</text>
    </svg>
  );
}

/// Card three: three seasons, a vote at each close, and banks that carry over.
function CampaignArt(): ReactElement {
  const seasons = ['Season 1', 'Season 2', 'Season 3'];
  return (
    <svg viewBox="0 0 320 110" role="img" aria-label="A campaign of three seasons; a quota vote closes each one and the stock carries over">
      <text x="8" y="13" fill="var(--muted)" fontSize="10">a campaign: three seasons</text>
      {seasons.map((season, i) => (
        <g key={season}>
          <rect x={8 + i * 102} y={24} width="92" height="36" rx="4" fill="var(--panel-2)" stroke="var(--line)" />
          <text x={18 + i * 102} y={47} fill="var(--sand)" fontSize="11">{season}</text>
          {i < 2 ? (
            <g>
              <line x1={100 + i * 102} y1={24} x2={100 + i * 102} y2={60} stroke="var(--buoy)" strokeWidth="2" />
              <text x={111 + i * 102} y={21} fill="var(--buoy)" fontSize="9">vote</text>
            </g>
          ) : null}
        </g>
      ))}
      <text x="8" y="88" fill="var(--ink)" fontSize="10">a quota vote closes each season</text>
      <text x="8" y="103" fill="var(--sand)" fontSize="10">the sea keeps what the season left it</text>
    </svg>
  );
}

interface Step {
  title: string;
  lines: string[];
  art: () => ReactElement;
}

const STEPS: Step[] = [
  {
    title: 'The stock is shared',
    lines: [
      'Every boat fishes the same three banks. A crate landed today is a crate the bank cannot lend tomorrow.',
      'Watch the catch per trip: it slips well before the bank gives way. That early fall is cheap to answer and dear to ignore.',
    ],
    art: StockArt,
  },
  {
    title: 'The auction pays what the merchant can afford',
    lines: [
      'No merchant bids past its own limit, set by its stock against its target. Fill one today and the lot it bids on tomorrow goes cheaper, for you and for every other captain.',
      'Each merchant carries a why tag: hover it, or focus it with the keyboard, to read the reason behind the limit.',
    ],
    art: AuctionArt,
  },
  {
    title: 'The council, and the campaign',
    lines: [
      'Quotas are voted at the close of a season, and an indemnity can swing a vote your way. A campaign runs three seasons.',
      'The sea keeps what the season left it: the next season opens on the banks you handed over, not on a fresh sea.',
    ],
    art: CampaignArt,
  },
];

function focusable(root: HTMLElement): HTMLElement[] {
  const selector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((el) => !el.hasAttribute('disabled'));
}

/** Tab and Shift+Tab stay inside the card while it is open. */
function wrapTab(event: KeyboardEvent, root: HTMLElement): void {
  const items = focusable(root);
  if (items.length === 0) {
    event.preventDefault();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (!event.shiftKey && (active === last || active === root)) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && (active === first || active === root)) {
    event.preventDefault();
    last.focus();
  }
}

interface Keys {
  advance: () => void;
  close: () => void;
}

/** Enter and Space advance, Escape closes, Tab is trapped; focus is restored on close. */
function useTutorialKeys(card: RefObject<HTMLDivElement>, keys: MutableRefObject<Keys>): void {
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    card.current?.focus();
    function onKey(event: KeyboardEvent): void {
      const node = card.current;
      if (node === null) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        keys.current.close();
        return;
      }
      if (event.key === 'Tab') {
        wrapTab(event, node);
        return;
      }
      if (event.key !== 'Enter' && event.key !== ' ') return;
      // A focused button already activates on Enter and Space: let it.
      if (event.target instanceof HTMLElement && event.target.tagName === 'BUTTON') return;
      event.preventDefault();
      keys.current.advance();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [card, keys]);
}

function StepBody({ step, index }: { step: Step; index: number }): ReactElement {
  const Art = step.art;
  return (
    <>
      <p className="tutorial-step">Step {index + 1} of {STEPS.length}</p>
      <h2 id="tutorial-title">{step.title}</h2>
      <div className="tutorial-art"><Art /></div>
      <div id="tutorial-body">
        {step.lines.map((line) => (
          <p key={line} className="tutorial-line">{line}</p>
        ))}
      </div>
    </>
  );
}

export function Tutorial({ onClose }: { onClose: () => void }): ReactElement {
  const [index, setIndex] = useState(0);
  const card = useRef<HTMLDivElement>(null);
  const last = index === STEPS.length - 1;
  const keys = useRef<Keys>({ advance: () => undefined, close: onClose });
  keys.current = { advance: () => (last ? onClose() : setIndex(index + 1)), close: onClose };
  useTutorialKeys(card, keys);
  return (
    <div className="tutorial-backdrop">
      <div
        className="tutorial-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-title"
        aria-describedby="tutorial-body"
        tabIndex={-1}
        ref={card}
      >
        <StepBody step={STEPS[index]} index={index} />
        <div className="tutorial-actions">
          <button type="button" onClick={() => keys.current.advance()}>
            {last ? 'Done' : 'Next'}
          </button>
          {last ? null : (
            <button type="button" className="ghost" onClick={onClose}>
              Skip
            </button>
          )}
          <span className="tutorial-spacer" />
          <span className="muted">You can reopen this from How to play</span>
        </div>
      </div>
    </div>
  );
}

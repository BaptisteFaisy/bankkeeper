// DeckNav: the tabs over the instrument deck. Every panel stays in the page
// (keyboard, screen readers and the e2e reach all of them); a tab only
// brings one into view, so the eye reads one thing at a time.
import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { reducedMotion } from '../motion';

const TABS: Array<[string, string]> = [
  ['Fish auction', 'Auction'],
  ['Your boats', 'Boats'],
  ['Harbour ledger', 'Ledger'],
  ['Harbour office', 'Office'],
  ['Chronicle', 'Chronicle'],
];

function sectionOf(deck: HTMLElement | null, label: string): HTMLElement | null {
  return deck?.querySelector<HTMLElement>(`section[aria-label="${label}"]`) ?? null;
}

/** The tab whose panel sits at the top of the deck. */
function current(deck: HTMLElement): string {
  const top = deck.getBoundingClientRect().top + 64;
  let found = TABS[0][0];
  for (const [label] of TABS) {
    const s = sectionOf(deck, label);
    if (s !== null && s.getBoundingClientRect().top <= top) found = label;
  }
  return found;
}

export default function DeckNav({ deck }: { deck: RefObject<HTMLElement> }) {
  const [on, setOn] = useState(TABS[0][0]);
  useEffect(() => {
    const el = deck.current;
    if (el === null) return;
    const onScroll = (): void => { setOn(current(el)); };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { el.removeEventListener('scroll', onScroll); };
  }, [deck]);
  function go(label: string): void {
    const s = sectionOf(deck.current, label);
    s?.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
    setOn(label);
  }
  return (
    <nav className="deck-nav" aria-label="Instruments">
      {TABS.map(([label, short]) => (
        <button key={label} type="button" className={on === label ? 'on' : ''} aria-current={on === label ? 'true' : undefined} onClick={() => go(label)}>
          {short}
        </button>
      ))}
    </nav>
  );
}

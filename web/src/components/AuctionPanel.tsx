// Fish auction: the day's lots replayed one at a time with a sweeping
// clock (brief TW-UI-04: clock, buyer limits, sale price), then the last
// sale. "Next landing" steps the replay by hand (brief section 11); it
// auto-advances unless reduced motion is asked.
import { useEffect, useState } from 'react';
import type { AuctionView, BuyerView, LandingView } from '../types';
import { MESH_LABEL, parseMesh } from '../types';
import { fmtGold } from '../format';

interface Props {
  auction: AuctionView;
  buyers: BuyerView[];
  landings: LandingView[];
  dayKey: string;
}

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function usePlayback(landings: LandingView[], dayKey: string): { index: number; next: () => void; skip: () => void } {
  const [index, setIndex] = useState(0);
  useEffect(() => { setIndex(0); }, [dayKey]);
  useEffect(() => {
    if (index >= landings.length || landings.length === 0 || reducedMotion()) return;
    const t = window.setTimeout(() => setIndex((i) => i + 1), 1400);
    return () => window.clearTimeout(t);
  }, [index, landings.length]);
  return {
    index,
    next: () => setIndex((i) => Math.min(i + 1, landings.length)),
    skip: () => setIndex(landings.length),
  };
}

function useSweep(start: number, hammer: number, lotKey: string): number {
  const [price, setPrice] = useState(start);
  useEffect(() => {
    if (reducedMotion() || start <= hammer) {
      setPrice(hammer);
      return;
    }
    let frame = 0;
    const t0 = performance.now();
    function tick(now: number): void {
      const k = Math.min(1, (now - t0) / 1100);
      setPrice(start + (hammer - start) * k);
      if (k < 1) frame = window.requestAnimationFrame(tick);
    }
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [start, hammer, lotKey]);
  return price;
}

/// The merchant's own reasoning, on hover or on keyboard focus: the track asks
/// for a tooltip, and the sentence comes from `rules::merchant`, not from here.
function BuyerRow({ buyer, hammer }: { buyer: BuyerView; hammer: { name: string; price: number } | null }) {
  const won = hammer !== null && buyer.name === hammer.name;
  const why = (buyer.limits ?? []).map((l) => l.reasoning).join(' ');
  return (
    <li className={buyer.open ? '' : 'closed'}>
      <span className="buyer-name">
        {buyer.name}
        {buyer.open && why !== '' ? (
          <span className="tip" tabIndex={0} aria-label={`Why ${buyer.name} pays what it pays`}>
            <span className="tip-mark" aria-hidden="true">why</span>
            <span className="tip-body" role="tooltip">{why}</span>
          </span>
        ) : null}
      </span>
      <span className="buyer-buys">{buyer.open ? buyer.buys : 'Closed'}</span>
      <span className="num">{buyer.open && won && hammer !== null ? fmtGold(hammer.price) : '—'}</span>
    </li>
  );
}

function LiveLot({ lot, position, total, onNext, onSkip }: {
  lot: LandingView;
  position: number;
  total: number;
  onNext: () => void;
  onSkip: () => void;
}) {
  const hammer = lot.price;
  const clock = useSweep(lot.start, hammer, `${position}-${lot.captain}-${lot.crates}`);
  const span = lot.start - hammer;
  const share = span <= 0 ? 0 : Math.min(1, Math.max(0, (clock - hammer) / span));
  return (
    <>
      <p className="lot-line">
        Lot {position + 1}/{total}: {lot.crates} crates of {lot.species} ({lot.captain}, {MESH_LABEL[parseMesh(lot.mesh)].toLowerCase()})
      </p>
      <div className="clock-row">
        <span className="clock-price">{fmtGold(clock)}</span>
        <div className="clock-bar" role="img" aria-label={`Clock at ${fmtGold(clock)}, hammer ${fmtGold(hammer)}`}>
          <span className="clock-fill" style={{ width: `${Math.round(share * 100)}%` }} />
        </div>
        <span className="muted">hammer {fmtGold(hammer)}</span>
      </div>
      {lot.buyer !== null ? (
        <p className="sale-line">
          Sold lot {position + 1} to {lot.buyer}: {lot.crates} × {fmtGold(hammer)} = {fmtGold(lot.total)}g
        </p>
      ) : (
        <p className="sale-line">Lot {position + 1} unsold below the floor.</p>
      )}
      <div className="harbour-row">
        <button type="button" onClick={onNext}>Next landing</button>
        <button type="button" className="ghost" onClick={onSkip}>Skip</button>
      </div>
    </>
  );
}

// Closing line once the replay ran past the last lot. Bound to the
// replay itself (last replayed lot, 1-based), never to lastSale:
// an unsold final lot must read unsold, not show an earlier hammer.
function ClosingLine({ lot, position }: { lot: LandingView; position: number }) {
  if (lot.buyer === null) {
    return <p className="sale-line">Lot {position} unsold below the floor.</p>;
  }
  return (
    <p className="sale-line">
      Sold lot {position} to {lot.buyer}: {lot.crates} × {fmtGold(lot.price)} = {fmtGold(lot.total)}g
    </p>
  );
}

export default function AuctionPanel({ auction, buyers, landings, dayKey }: Props) {
  const { index, next, skip } = usePlayback(landings, dayKey);
  const live = index < landings.length ? landings[index] : null;
  const closed = live === null && landings.length > 0 ? landings[landings.length - 1] : null;
  const hammer = live !== null && live.buyer !== null ? { name: live.buyer, price: live.price } : null;
  return (
    <section className="panel auction" aria-label="Fish auction">
      <h2>Fish auction</h2>
      {landings.length === 0 && (
        <p className="muted">No lot on the clock. The next landing starts the bidding.</p>
      )}
      {live !== null && (
        <LiveLot lot={live} position={index} total={landings.length} onNext={next} onSkip={skip} />
      )}
      {closed !== null && <ClosingLine lot={closed} position={landings.length} />}
      <ul className="buyer-limits">
        {buyers.map((b) => (
          <BuyerRow key={b.id} buyer={b} hammer={hammer} />
        ))}
      </ul>
      {auction.reasoning !== '' && <p className="reason-line">{auction.reasoning}</p>}
    </section>
  );
}

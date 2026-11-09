// Fish auction: the lot on sale, the descending clock, each buyer
// limit and the last sale. Readable in seconds: one big price,
// one bar, one line per buyer.
import type { AuctionView, BuyerView } from '../types';
import { MESH_LABEL } from '../types';

interface Props {
  auction: AuctionView;
  buyers: BuyerView[];
}

function clockShare(auction: AuctionView): number {
  const span = auction.start - auction.floor;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (auction.clock - auction.floor) / span));
}

function BuyerRow({ buyer }: { buyer: BuyerView }) {
  return (
    <li className={buyer.open ? '' : 'closed'}>
      <span className="buyer-name">{buyer.name}</span>
      <span className="buyer-buys">{buyer.open ? buyer.buys : 'Closed'}</span>
      <span className="num">{buyer.open && buyer.limit !== null ? buyer.limit.toFixed(1) : '—'}</span>
    </li>
  );
}

export default function AuctionPanel({ auction, buyers }: Props) {
  const lot = auction.lot;
  const sale = auction.lastSale;
  return (
    <section className="panel auction" aria-label="Fish auction">
      <h2>Fish auction</h2>
      {lot === null ? (
        <p className="muted">No lot on the clock. The next landing starts the bidding.</p>
      ) : (
        <>
          <p className="lot-line">
            Lot {lot.id}: {lot.crates} crates of {lot.species} ({lot.captain}, {MESH_LABEL[lot.mesh].toLowerCase()})
          </p>
          <div className="clock-row">
            <span className="clock-price">{auction.clock.toFixed(1)}</span>
            <div className="clock-bar" role="img" aria-label={`Clock at ${auction.clock.toFixed(1)}, floor ${auction.floor.toFixed(1)}`}>
              <span className="clock-fill" style={{ width: `${Math.round(clockShare(auction) * 100)}%` }} />
            </div>
            <span className="muted">floor {auction.floor.toFixed(1)}</span>
          </div>
        </>
      )}
      <ul className="buyer-limits">
        {buyers.map((b) => (
          <BuyerRow key={b.id} buyer={b} />
        ))}
      </ul>
      {sale !== null && (
        <p className="sale-line">
          Sold lot {sale.lot} to {sale.buyer}: {sale.crates} × {sale.price.toFixed(1)} = {sale.total.toFixed(1)}g
        </p>
      )}
      {auction.reasoning !== '' && <p className="reason-line">{auction.reasoning}</p>}
    </section>
  );
}

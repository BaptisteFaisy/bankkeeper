// A shared season link never silently replaces the harbour in play (audit A7).
// Boot keeps the saved game and hands the link over as an *offer*: the player
// either opens the shared season (the game in play is shelved under
// `tidewater-game-v1.previous` first) or keeps sailing their own.
import { useState } from 'react';
import { clearUrlSeed, openSharedHarbour } from '../boot';
import type { Shape } from '../persistence';
import type { GameState } from '../hooks';

interface Props {
  offer: Shape;
  game: GameState;
}

export default function SeedOffer({ offer, game }: Props) {
  const [decided, setDecided] = useState(false);
  if (decided) return null;

  function keepMine(): void {
    clearUrlSeed();
    setDecided(true);
  }

  function openShared(): void {
    void openSharedHarbour(offer)
      .then(async () => {
        setDecided(true);
        await game.actions.deps.refreshQuiet();
        game.actions.pushToast('report', `Shared season opened: seed ${offer.seed}.`, 'Your previous harbour is shelved, not lost.');
      })
      .catch((error: unknown) => {
        game.actions.deps.toastError(error);
      });
  }

  return (
    <section className="panel seed-offer" aria-label="Shared season">
      <h2>This link opens another season</h2>
      <p className="muted">
        Seed {offer.seed}, {offer.weeks} weeks a season. Your harbour in play is untouched: opening
        the link shelves it as <code>tidewater-game-v1.previous</code> instead of losing it.
      </p>
      <div className="harbour-row">
        <button type="button" disabled={game.busy !== null} onClick={openShared}>
          Open the shared season
        </button>
        <button type="button" className="ghost" disabled={game.busy !== null} onClick={keepMine}>
          Keep my harbour
        </button>
      </div>
    </section>
  );
}

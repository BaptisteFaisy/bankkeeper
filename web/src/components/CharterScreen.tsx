// Write the charter: the end of a campaign, and the institution it leaves.
//
// Three sentences, one choice. The picked rule is kept in this browser and
// handed to the engine when the next campaign is seeded, so it governs the
// campaign that follows — never the one that just closed.
import { useState } from 'react';
import { CHARTER_OPTIONS } from '../charter';
import type { Charter, CharterId } from '../charter';

interface Props {
  busy: boolean;
  onSail: (charter: Charter) => void;
}

function optionClass(picked: CharterId | null, id: CharterId): string {
  return picked === id ? 'charter-choice picked' : 'charter-choice';
}

export default function CharterScreen({ busy, onSail }: Props) {
  const [picked, setPicked] = useState<CharterId | null>(null);
  const chosen = CHARTER_OPTIONS.find((option) => option.id === picked) ?? null;
  return (
    <section className="panel charter-screen" aria-label="Write the charter">
      <h2>Write the charter</h2>
      <p className="muted">
        The campaign is over. The port keeps one sentence of it, and the next campaign sails under that sentence.
      </p>
      <div className="charter-choices">
        {CHARTER_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={optionClass(picked, option.id)}
            aria-pressed={picked === option.id}
            onClick={() => setPicked(option.id)}
          >
            <span>
              <strong>{option.title}</strong>
              <span className="muted">{option.detail}</span>
            </span>
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={busy || chosen === null}
        title={chosen === null ? 'Pick one of the three rules first' : undefined}
        onClick={() => {
          if (chosen !== null) onSail(chosen.charter);
        }}
      >
        Sail a new campaign with this charter
      </button>
    </section>
  );
}

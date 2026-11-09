// Top bar: week, day and tide, player gold, weekly quota left,
// Judges panel toggle. Static text only, no animation.
interface Props {
  week: number;
  day: number;
  tide: string;
  gold: number | null;
  quotaLeft: number;
  quotaTotal: number;
  judgesOpen: boolean;
  onToggleJudges: () => void;
}

export default function Hud(props: Props) {
  const { week, day, tide, gold, quotaLeft, quotaTotal, judgesOpen, onToggleJudges } = props;
  return (
    <header className="hud">
      <div className="hud-block">
        <span className="hud-label">Week</span>
        <span className="hud-week" data-testid="hud-week">
          {week}
        </span>
        <span className="hud-label">Day</span>
        <span className="hud-day" data-testid="hud-day">
          {day}
        </span>
        <span className="hud-tide" data-testid="hud-tide">
          {tide}
        </span>
      </div>
      <div className="hud-block">
        <span className="hud-label">Gold</span>
        <span className="hud-gold" data-testid="hud-gold">
          {gold ?? '—'}
        </span>
      </div>
      <div className="hud-block">
        <span className="hud-label">Weekly quota left</span>
        <span className="hud-quota" data-testid="hud-quota">
          {quotaLeft}/{quotaTotal}
        </span>
      </div>
      <div className="hud-block">
        <button onClick={onToggleJudges} type="button" data-testid="judges-toggle">
          {judgesOpen ? 'Close Judges' : 'Judges'}
        </button>
      </div>
    </header>
  );
}

// The toast stack: the game's running commentary (day closed, licence bought,
// quota spent, error). It lives in an ARIA live region so a screen reader
// announces it — polite for reports and infos, assertive for errors.
// The container stays mounted even when empty: a live region that appears with
// its first message is not announced reliably.
import type { ToastMsg } from '../types';

interface Props {
  toasts: ToastMsg[];
  onDismiss: (id: number) => void;
}

function toastRole(kind: ToastMsg['kind']): 'alert' | 'status' {
  return kind === 'error' ? 'alert' : 'status';
}

export default function ToastStack({ toasts, onDismiss }: Props) {
  return (
    <div className="toast-stack" role="status" aria-live="polite" aria-relevant="additions text">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} role={toastRole(t.kind)}>
          <div>
            <strong>
              {t.title}
              {t.count > 1 && <span className="toast-count">×{t.count}</span>}
            </strong>
            {t.body && <p>{t.body}</p>}
          </div>
          <button onClick={() => onDismiss(t.id)} type="button" className="ghost" aria-label={`Dismiss: ${t.title}`}>
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}

// Toast stack for landing reports, infos and errors.
// Relay E_* codes map to friendly text, raw code stays visible.
// Includes the toast state hook: duplicates collapse into a count,
// toasts auto-dismiss, at most TOAST_MAX stay on screen.
import { useRef, useState } from 'react';
import { useToastTimers } from '../hooks';

export interface ToastMsg {
  id: number;
  kind: 'error' | 'info' | 'report';
  title: string;
  body?: string;
  count: number;
}

const FRIENDLY: Record<string, string> = {
  QuotaExhausted: 'Weekly quota exhausted — that boat stays at the quay until Monday.',
  NoLicencesForSale: 'No licence for sale at that price.',
  LicenceShortOfGold: 'Not enough gold for that licence.',
  BoatAtSea: 'That boat is at sea — wait for it to land.',
  BoatAlreadyAssigned: 'That boat already sails there.',
  NetChangeAtQuayOnly: 'Nets can only be changed at the quay.',
  SurveyTooSoon: 'That zone already has a fresh survey.',
  SurveyShortOfGold: 'A survey costs 80 gold.',
  UnknownZone: 'Unknown fishing zone.',
  UnknownBoat: 'Unknown boat.',
  E_QUOTA: 'Weekly quota exhausted for this captain.',
  E_UNKNOWN_ZONE: 'Unknown fishing zone.',
  E_UNKNOWN_BOAT: 'Unknown boat.',
  E_SIM_FAILED: 'The tide engine failed.',
  E_SIM_TIMEOUT: 'The tide engine timed out.',
  E_NO_SIM: 'The tide engine is missing.',
  E_NO_STATE: 'No harbour state yet.',
  E_FASTFORWARD_TIMEOUT: 'The fast-forward took too long.',
  E_UNKNOWN: 'Something went wrong.',
};

export function friendlyError(code: string): string {
  const hit = FRIENDLY[code];
  if (hit) return hit;
  const pretty = code.replace(/^E_/, '').toLowerCase().replace(/_/g, ' ');
  return pretty.charAt(0).toUpperCase() + pretty.slice(1);
}

// Human detail for a relay error payload. Never returns the raw
// variant/code itself: "have 0, need 5" survives, the code does not.
export function errorDetail(detail: unknown): string | undefined {
  if (typeof detail !== 'object' || detail === null) return undefined;
  const err = (detail as { error?: unknown }).error;
  if (typeof err !== 'object' || err === null) return undefined;
  const obj = err as Record<string, unknown>;
  if (typeof obj.message === 'string' && obj.message !== obj.code) return obj.message;
  const keys = Object.keys(obj);
  if (keys.length !== 1) return undefined;
  const inner = obj[keys[0]] as { have?: unknown; need?: unknown };
  if (typeof inner !== 'object' || inner === null) return undefined;
  if (typeof inner.have === 'number' && typeof inner.need === 'number') {
    return `Have ${inner.have}, need ${inner.need}.`;
  }
  return undefined;
}

const TOAST_MAX = 4;

function sameToast(a: ToastMsg, kind: ToastMsg['kind'], title: string, body?: string): boolean {
  return a.kind === kind && a.title === title && a.body === body;
}

export interface ToastApi {
  toasts: ToastMsg[];
  pushToast: (kind: ToastMsg['kind'], title: string, body?: string) => void;
  dismissToast: (id: number) => void;
  clearToasts: () => void;
}

export function useToasts(): ToastApi {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const nextId = useRef(1);
  const timers = useToastTimers();

  function expire(id: number): void {
    timers.disarm(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  function pushToast(kind: ToastMsg['kind'], title: string, body?: string): void {
    const dup = toasts.find((t) => sameToast(t, kind, title, body));
    if (dup) {
      timers.arm(dup.id, expire);
      const id = dup.id;
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, count: t.count + 1 } : t)));
      return;
    }
    const id = nextId.current;
    nextId.current += 1;
    timers.arm(id, expire);
    const toast: ToastMsg = { id, kind, title, body, count: 1 };
    setToasts((prev) => [...prev.slice(-(TOAST_MAX - 1)), toast]);
  }

  function dismissToast(id: number): void {
    timers.disarm(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  function clearToasts(): void {
    timers.clearAll();
    setToasts([]);
  }

  return { toasts, pushToast, dismissToast, clearToasts };
}

interface Props {
  toasts: ToastMsg[];
  onDismiss: (id: number) => void;
}

export default function Toasts({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <span className="toast-diamond" aria-hidden="true" />
          <div>
            <strong>
              {t.title}
              {t.count > 1 && <span className="toast-count">×{t.count}</span>}
            </strong>
            {t.body && <p>{t.body}</p>}
          </div>
          <button onClick={() => onDismiss(t.id)} type="button" className="ghost">
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}

// Shared state hooks for the game screen. Small focused hooks
// compose into one GameState object via useGame.
import { useEffect, useRef, useState } from 'react';
import { ApiError, getGraph, getJudges, getState } from './api';
import { autosave } from './boot';
import type { FFResponse, GraphLive, JudgesLive, PortState, ToastMsg } from './types';
import { EMPTY_AUCTION } from './types';
import { clearSession, loadFf, loadSession, saveFf, saveSession } from './session';
import type { Session } from './session';
import type { GameActions } from './actions';

const TOAST_TTL_MS = 4500;
const TOAST_MAX = 4;
const POLL_MS = 2000;

export interface ToastApi {
  toasts: ToastMsg[];
  pushToast: (kind: ToastMsg['kind'], title: string, body?: string) => void;
  dismissToast: (id: number) => void;
  clearToasts: () => void;
  toastError: (e: unknown) => void;
}

function sameToast(a: ToastMsg, kind: ToastMsg['kind'], title: string, body?: string): boolean {
  return a.kind === kind && a.title === title && a.body === body;
}

// Relay E_* codes map to friendly text, raw code stays visible.
const FRIENDLY: Record<string, string> = {
  QuotaSpent: 'The weekly quota is spent. Boats stay at the quay until Monday.',
  BoatAtSea: 'That boat is at sea. Wait for it to land first.',
  NetAtSea: 'The net can only be changed at the quay.',
  NotYourBoat: 'Only your own boats take orders.',
  UnknownBoat: 'Unknown boat.',
  UnknownZone: 'Unknown zone.',
  NoLicenceForSale: 'No captain sells a licence right now.',
  NotEnoughGold: 'Not enough gold.',
  NoSurveyTwice: 'This zone already has a fresh survey.',
  E_NO_STATE: 'No harbour state yet.',
  E_SIM_FAILED: 'The harbour engine failed.',
  E_SIM_TIMEOUT: 'The harbour engine timed out.',
  E_NO_SIM: 'The harbour engine is missing.',
  E_FASTFORWARD_TIMEOUT: 'The fast-forward took too long.',
  E_UNKNOWN: 'Something went wrong.',
};

export function friendlyError(code: string): string {
  const hit = FRIENDLY[code];
  if (hit) return hit;
  const pretty = code.replace(/^E_/, '').toLowerCase().replace(/_/g, ' ');
  return pretty.charAt(0).toUpperCase() + pretty.slice(1);
}

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

interface ToastTimers {
  arm: (id: number, onFire: (fired: number) => void) => void;
  disarm: (id: number) => void;
  clearAll: () => void;
}

export function useToastTimers(): ToastTimers {
  const timers = useRef(new Map<number, number>());
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending.values()) window.clearTimeout(t);
      pending.clear();
    };
  }, []);
  function arm(id: number, onFire: (fired: number) => void): void {
    const old = timers.current.get(id);
    if (old !== undefined) window.clearTimeout(old);
    timers.current.set(id, window.setTimeout(() => onFire(id), TOAST_TTL_MS));
  }
  function disarm(id: number): void {
    const timer = timers.current.get(id);
    if (timer === undefined) return;
    window.clearTimeout(timer);
    timers.current.delete(id);
  }
  function clearAll(): void {
    for (const t of timers.current.values()) window.clearTimeout(t);
    timers.current.clear();
  }
  return { arm, disarm, clearAll };
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
  function toastError(e: unknown): void {
    if (e instanceof ApiError) pushToast('error', friendlyError(e.code), errorDetail(e.detail));
    else if (e instanceof Error) pushToast('error', e.message);
    else pushToast('error', 'Something went wrong.');
  }
  return { toasts, pushToast, dismissToast, clearToasts, toastError };
}

export function usePortPoll(): { port: PortState | null; offline: boolean; refreshQuiet: () => Promise<void> } {
  const [port, setPort] = useState<PortState | null>(null);
  const [offline, setOffline] = useState(false);

  async function refreshQuiet(): Promise<void> {
    try {
      const state = await getState();
      setPort({ ...state, auction: state.auction ?? EMPTY_AUCTION });
      setOffline(false);
      void autosave(state);
    } catch {
      setOffline(true);
    }
  }

  useEffect(() => {
    void refreshQuiet();
    const t = window.setInterval(() => { void refreshQuiet(); }, POLL_MS);
    return () => window.clearInterval(t);
  }, []);

  return { port, offline, refreshQuiet };
}

export interface GameState {
  session: Session | null;
  port: PortState | null;
  offline: boolean;
  selectedBoat: string | null;
  busy: string | null;
  ff: FFResponse | null;
  toasts: ToastMsg[];
  actions: GameActions;
  judgesOpen: boolean;
  setJudgesOpen: (open: boolean) => void;
  setSelectedBoat: (id: string | null) => void;
  login: (email: string, name: string) => void;
  logout: () => void;
  dismissToast: (id: number) => void;
}

// Drop cached fast-forwards saved under an older shape (no journal array).
function validFf(ff: FFResponse | null): FFResponse | null {
  if (ff === null || !Array.isArray(ff.journal)) return null;
  return ff;
}

export function useJudges(dayKey: string, busy: string | null): { judges: JudgesLive | null; graph: GraphLive | null } {
  const [judges, setJudges] = useState<JudgesLive | null>(null);
  const [graph, setGraph] = useState<GraphLive | null>(null);
  useEffect(() => {
    let live = true;
    function load(): void {
      getJudges().then((j) => { if (live) setJudges(j); }).catch(() => undefined);
      getGraph().then((g) => { if (live) setGraph(g); }).catch(() => undefined);
    }
    load();
    const t = window.setInterval(load, 10000);
    return () => { live = false; window.clearInterval(t); };
  }, [dayKey, busy === null]);
  return { judges, graph };
}

export function useGame(): GameState {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [selectedBoat, setSelectedBoat] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [judgesOpen, setJudgesOpen] = useState(false);
  const [ff, setFf] = useState<FFResponse | null>(() => validFf(loadFf<FFResponse>()));
  const { port, offline, refreshQuiet } = usePortPoll();
  const { toasts, pushToast, dismissToast, clearToasts, toastError } = useToasts();
  useEffect(() => { saveFf(ff); }, [ff]);
  function login(email: string, name: string): void {
    setSession(saveSession(email, name));
    void refreshQuiet();
  }
  function logout(): void {
    clearSession();
    setSession(null);
    setSelectedBoat(null);
    clearToasts();
  }
  const actions: GameActions = {
    deps: { setBusy, toastError, refreshQuiet },
    pushToast,
    resetFf: (r: FFResponse | null) => setFf(r),
  };
  return { session, port, offline, selectedBoat, busy, ff, toasts, actions, judgesOpen, setJudgesOpen, setSelectedBoat, login, logout, dismissToast };
}

// Local session: maps an email address to a stable captain id.
// Stored in localStorage; the NEAR-mode seam can replace this later.
export interface Session {
  email: string;
  name: string;
  playerId: string;
}

const KEY = 'tidewater-session-v1';

export function playerIdForEmail(email: string): string {
  const norm = email.trim().toLowerCase();
  let hash = 5381;
  for (let i = 0; i < norm.length; i += 1) {
    hash = ((hash << 5) + hash + norm.charCodeAt(i)) | 0;
  }
  return `captain-${(hash >>> 0).toString(36)}`;
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (!parsed.email || !parsed.playerId) return null;
    return { email: parsed.email, name: parsed.name ?? '', playerId: parsed.playerId };
  } catch {
    return null;
  }
}

export function saveSession(email: string, name: string): Session {
  const session: Session = { email, name, playerId: playerIdForEmail(email) };
  localStorage.setItem(KEY, JSON.stringify(session));
  return session;
}

export function clearSession(): void {
  localStorage.removeItem(KEY);
}

const FF_KEY = 'tidewater-ff-v1';

export function loadFf<T>(): T | null {
  try {
    const raw = localStorage.getItem(FF_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function saveFf<T>(ff: T | null): void {
  try {
    if (ff === null) localStorage.removeItem(FF_KEY);
    else localStorage.setItem(FF_KEY, JSON.stringify(ff));
  } catch {
    // Storage full or blocked: the judges view just resets on reload.
  }
}

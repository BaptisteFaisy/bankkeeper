// FastAuth adapter seam. NEAR mode authenticates through this
// interface; local play uses LocalSession below. A future FastAuth
// adapter implements the same interface, so gameplay code never
// touches wallet internals. No wallet imports here by design.
export interface NearSession {
  readonly kind: 'local' | 'near';
  accountId(): string | null;
  isSignedIn(): boolean;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
}

const LOCAL_KEY = 'tidewater-near-local-v1';

export class LocalSession implements NearSession {
  readonly kind = 'local' as const;
  private account: string | null = null;

  constructor() {
    try {
      this.account = localStorage.getItem(LOCAL_KEY);
    } catch {
      this.account = null;
    }
  }

  accountId(): string | null {
    return this.account;
  }

  isSignedIn(): boolean {
    return this.account !== null;
  }

  async signIn(): Promise<void> {
    this.account = `local-${Date.now().toString(36)}`;
    try {
      localStorage.setItem(LOCAL_KEY, this.account);
    } catch {
      // Storage unavailable: session stays in memory only.
    }
  }

  async signOut(): Promise<void> {
    this.account = null;
    try {
      localStorage.removeItem(LOCAL_KEY);
    } catch {
      // Nothing to clean.
    }
  }
}

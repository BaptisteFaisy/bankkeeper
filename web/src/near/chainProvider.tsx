// One owner for the chain session, shared by the login card and the strip.
//
// The card opens the NEAR account (the player sees no wallet, no recovery
// phrase, no gas prompt); the strip above the harbour shows that account, the
// last transaction and the three sponsored actions. Both read the same state,
// so a login is never performed twice. The state itself lives in
// `chainSession.ts`, split into pieces that each stay small.
import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { chainBase, chainBuildOnly, chainRequested } from './chain';
import { useChainCalls, useChainFields, useChainSponsored } from './chainSession';
import type { ChainFields } from './chainSession';

export interface ChainValue extends ChainFields {
  /** Chain mode is on for this page: runtime `?chain`, or a chain-only build. */
  enabled: boolean;
  /** True when the build itself is chain-only: no offline mode to go back to. */
  buildOnly: boolean;
  /** The relayer this page talks to ('' when the chain is off). */
  base: string;
  login: (email: string) => Promise<boolean>;
  retry: () => Promise<boolean>;
  buyLicence: () => Promise<boolean>;
  buyLoan: () => Promise<boolean>;
  vote: () => Promise<boolean>;
}

const ChainContext = createContext<ChainValue | null>(null);

/** The chain session. Throws only when used outside `<ChainProvider>`. */
export function useChain(): ChainValue {
  const value = useContext(ChainContext);
  if (value === null) throw new Error('useChain() outside <ChainProvider>');
  return value;
}

export function ChainProvider({ children, email = '' }: { children: ReactNode; email?: string }) {
  const { fields, patch } = useChainFields();
  const calls = useChainCalls(patch);
  const enabled = chainRequested();
  const sponsored = useChainSponsored(calls, fields, enabled, email);
  const value = useMemo<ChainValue>(() => ({
    enabled,
    buildOnly: chainBuildOnly(),
    base: enabled ? chainBase() : '',
    ...fields,
    login: calls.login,
    ...sponsored,
  }), [enabled, fields, calls, sponsored]);
  return <ChainContext.Provider value={value}>{children}</ChainContext.Provider>;
}

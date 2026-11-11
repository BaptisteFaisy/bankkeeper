// The chain session, in three small pieces:
//
//   useChainFields    — what the strip shows (account, last tx, note, error);
//   useChainCalls     — the guarded runner, and the login it is used for;
//   useChainSponsored — the three actions, plus the automatic login of a
//                       returning captain who has a harbour but no account.
//
// The double-click guard is the game's own (`mutate` in actions.ts): one
// in-flight mutation at a time, the same label debounced. No second guard here.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mutate } from '../actions';
import type { MutDeps } from '../actions';
import {
  chainBuyLicence, chainBuyLoan, chainErrorMessage, chainLogin, chainVote, shortHash,
} from './chain';
import type { ChainPosition, ChainReceipt } from './chain';

export interface ChainFields {
  /** The email the relayer signs for, set as soon as a login is attempted. */
  address: string;
  position: ChainPosition | null;
  txHash: string | null;
  note: string;
  error: string | null;
  /** The action in flight: 'login' | 'licence' | 'loan' | 'vote' | null. */
  busy: string | null;
}

const EMPTY: ChainFields = {
  address: '', position: null, txHash: null, note: '', error: null, busy: null,
};

export type Patch = (part: Partial<ChainFields>) => void;

export function useChainFields(): { fields: ChainFields; patch: Patch } {
  const [fields, setFields] = useState<ChainFields>(EMPTY);
  const patch = useCallback<Patch>((part) => setFields((prev) => ({ ...prev, ...part })), []);
  return { fields, patch };
}

function sponsorship(receipt: ChainReceipt): string {
  const seed = receipt.seedTxHash ?? null;
  return seed === null ? '' : ` · the house sponsored it (tx ${shortHash(seed)})`;
}

export type Runner = (
  label: string,
  who: string,
  work: (who: string) => Promise<ChainReceipt>,
  describe: (receipt: ChainReceipt) => string,
) => Promise<boolean>;

export interface ChainCalls {
  run: Runner;
  login: (email: string) => Promise<boolean>;
}

export function useChainCalls(patch: Patch): ChainCalls {
  const deps = useMemo<MutDeps>(() => ({
    // `mutate` hands back the label; the strip only needs which action it is.
    setBusy: (busy: string | null) => patch({ busy: busy === null ? null : busy.replace('chain:', '') }),
    toastError: (problem: unknown) => patch({ error: chainErrorMessage(problem) }),
    refreshQuiet: async () => { /* the chain never moves the harbour */ },
  }), [patch]);

  const run = useCallback<Runner>(async (label, who, work, describe) => {
    if (who === '') return false;
    patch({ error: null });
    const receipt = await mutate(deps, label, () => work(who));
    if (receipt === null) return false;
    patch({ position: receipt, txHash: receipt.txHash ?? null, note: describe(receipt) });
    return true;
  }, [deps, patch]);

  const login = useCallback(async (email: string): Promise<boolean> => {
    patch({ address: email });
    return run('chain:login', email, chainLogin, (r) => `the relayer signs for ${r.accountId}${sponsorship(r)}`);
  }, [patch, run]);

  return useMemo(() => ({ run, login }), [run, login]);
}

export interface ChainSponsored {
  retry: () => Promise<boolean>;
  buyLicence: () => Promise<boolean>;
  buyLoan: () => Promise<boolean>;
  vote: () => Promise<boolean>;
}

export function useChainSponsored(
  calls: ChainCalls, fields: ChainFields, enabled: boolean, email: string,
): ChainSponsored {
  const { run, login } = calls;
  const tried = useRef('');
  // A returning captain keeps the harbour session but has no NEAR account yet:
  // chain mode opens it on load, exactly as the login card would have. Once per
  // email — a refusal must never become a retry loop against the relayer.
  useEffect(() => {
    if (!enabled || email === '' || fields.position !== null || tried.current === email) return;
    tried.current = email;
    void login(email);
  }, [enabled, email, fields.position, login]);

  const who = fields.address;
  return useMemo(() => ({
    retry: () => login(who),
    buyLicence: () => run('chain:licence', who, chainBuyLicence, (r) => `licence bought (${r.licences} held)`),
    buyLoan: () => run('chain:loan', who, chainBuyLoan, (r) => `debt note ${r.tokenId ?? ''} bought`),
    vote: () => run('chain:vote', who, (id) => chainVote(id, true), (r) => `vote ${r.proposalId ?? '?'} yes (${r.yesWeight ?? 0} against ${r.noWeight ?? 0})`),
  }), [who, run, login]);
}

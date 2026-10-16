/** React Query wrappers around the Thrift+ scanner API (`/api/thriftplus/public`). */
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  addToCart,
  clearCart,
  continueAsGuest,
  getCart,
  getHistory,
  getMe,
  getSession,
  joinThriftPlus,
  passItem,
  removeFromCart,
  removePerson,
  requestSignInEmail,
  setMyNews,
  sendPriceFeel,
  clearHistory,
  setCartQty,
  signIn,
  signInWithCode,
  signInWithLink,
  signOut,
  type EmailSignIn,
  type PriceFeel,
  type ThriftPlusCart,
  type ThriftPlusHistoryEntry,
  type ThriftPlusItemCard,
  type ThriftPlusSession,
} from '../../../api/thriftPlusScanner.api';

export const thriftPlusKeys = {
  all: ['thriftPlus'] as const,
  session: ['thriftPlus', 'session'] as const,
  cart: ['thriftPlus', 'cart'] as const,
  history: ['thriftPlus', 'history'] as const,
  me: ['thriftPlus', 'me'] as const,
  myCard: ['thriftPlus', 'myCard'] as const,
};

/** The Member QR kept on the phone, so it shows with no signal (tripSheets.tsx). */
export const MY_CARD_KEY = 'tp-my-card';

/**
 * A new session (signed in, out, or scanning without signing in): the last person's Member QR and account aren't this
 * one's, so forget them, on the phone too (owner 2026-10-15, APP D9: a join lands straight on the Member QR).
 */
function forgetLastPerson(qc: QueryClient): void {
  qc.removeQueries({ queryKey: thriftPlusKeys.myCard });
  qc.removeQueries({ queryKey: thriftPlusKeys.me });
  try {
    localStorage.removeItem(MY_CARD_KEY);
  } catch {
    /* private mode: nothing was kept */
  }
}

/** A link or code sign-in's session, without its `purpose`. */
function sessionOf(r: EmailSignIn): ThriftPlusSession {
  const { purpose: _purpose, ...session } = r;
  return session as ThriftPlusSession;
}

/** `enabled` is false while an emailed link signs in (`?signin=`), so an older answer can't undo it. */
export function useThriftPlusSession(enabled = true) {
  return useQuery({ queryKey: thriftPlusKeys.session, queryFn: getSession, staleTime: Infinity, enabled });
}

export function useThriftPlusCart() {
  return useQuery({ queryKey: thriftPlusKeys.cart, queryFn: getCart, staleTime: Infinity });
}

export function useThriftPlusHistory(enabled = true) {
  return useQuery({ queryKey: thriftPlusKeys.history, queryFn: getHistory, staleTime: 0, enabled });
}

export function useSignIn() {
  const qc = useQueryClient();
  const setSession = (s: ThriftPlusSession) => {
    forgetLastPerson(qc);
    qc.setQueryData(thriftPlusKeys.session, s);
    // Staff test mode: signing in (or out) can open or close the scanner while Thrift+ is off.
    void qc.invalidateQueries({ queryKey: ['thriftPlus', 'open'] });
    // The trip and its totals depend on who is signed in.
    void qc.invalidateQueries({ queryKey: thriftPlusKeys.cart });
  };
  return {
    password: useMutation({
      mutationFn: ({ login, password }: { login: string; password: string }) => signIn(login, password),
      onSuccess: setSession,
    }),
    guest: useMutation({ mutationFn: () => continueAsGuest(), onSuccess: setSession }),
    signOut: useMutation({ mutationFn: () => signOut(), onSuccess: setSession }),
    // Email sign-in and joining (owner 2026-10-15, APP D9): send the email, then its code or its link signs in.
    email: useMutation({ mutationFn: (email: string) => requestSignInEmail(email) }),
    join: useMutation({
      mutationFn: ({ first, last, email }: { first: string; last: string; email: string }) => joinThriftPlus(first, last, email),
    }),
    code: useMutation({
      mutationFn: ({ email, code }: { email: string; code: string }) => signInWithCode(email, code),
      onSuccess: (r: EmailSignIn) => setSession(sessionOf(r)),
    }),
    link: useMutation({ mutationFn: (token: string) => signInWithLink(token), onSuccess: (r: EmailSignIn) => setSession(sessionOf(r)) }),
    /** Signed in elsewhere on this phone (the email's link in another tab): pick up that session. */
    adopt: setSession,
  };
}

export function useCartActions() {
  const qc = useQueryClient();
  const setCart = (cart: ThriftPlusCart) => {
    qc.setQueryData(thriftPlusKeys.cart, cart);
    void qc.invalidateQueries({ queryKey: thriftPlusKeys.history });
  };
  return {
    add: useMutation({ mutationFn: (item: ThriftPlusItemCard) => addToCart(item), onSuccess: setCart }),
    setQty: useMutation({
      mutationFn: ({ sku, qty }: { sku: string; qty: number }) => setCartQty(sku, qty),
      onSuccess: setCart,
    }),
    remove: useMutation({ mutationFn: (sku: string) => removeFromCart(sku), onSuccess: setCart }),
    clear: useMutation({ mutationFn: () => clearCart(), onSuccess: setCart }),
    pass: useMutation({
      mutationFn: (sku: string) => passItem(sku),
      onSuccess: () => void qc.invalidateQueries({ queryKey: thriftPlusKeys.history }),
    }),
    feel: useMutation({
      mutationFn: ({ sku, feel }: { sku: string; feel: PriceFeel }) => sendPriceFeel(sku, feel),
    }),
    clearScans: useMutation({
      mutationFn: () => clearHistory(),
      onSuccess: (rows: ThriftPlusHistoryEntry[]) => qc.setQueryData(thriftPlusKeys.history, rows),
    }),
  };
}

export function useMe(enabled = true) {
  return useQuery({ queryKey: thriftPlusKeys.me, queryFn: getMe, staleTime: 0, enabled });
}

/** The portal's changes. Each refreshes "me"; removing yourself signs you out. */
export function useAccountActions() {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: thriftPlusKeys.me });
  return {
    news: useMutation({
      mutationFn: (on: boolean) => setMyNews(on),
      onSuccess: refresh,
    }),
    removePerson: useMutation({
      mutationFn: (personId: number) => removePerson(personId),
      onSuccess: (r) => {
        if ('status' in r && r.status === 'signed_out') qc.setQueryData(thriftPlusKeys.session, { status: 'signed_out' });
        refresh();
      },
    }),
  };
}

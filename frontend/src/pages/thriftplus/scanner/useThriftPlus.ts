/** React Query wrappers around the Thrift+ scanner API (`/api/thriftplus/public`). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addToCart,
  clearCart,
  confirmPasswordReset,
  continueAsGuest,
  getCart,
  getHistory,
  getMe,
  getSession,
  passItem,
  removeFromCart,
  removePerson,
  reportCardLost,
  setMyTexts,
  requestPasswordReset,
  sendPriceFeel,
  setCartQty,
  setRewardChoice,
  setUpLogin,
  signIn,
  signInWithCard,
  signOut,
  type PriceFeel,
  type RewardChoice,
  type ThriftPlusCart,
  type ThriftPlusItemCard,
  type ThriftPlusSession,
} from '../../../api/thriftPlusScanner.api';

export const thriftPlusKeys = {
  all: ['thriftPlus'] as const,
  session: ['thriftPlus', 'session'] as const,
  cart: ['thriftPlus', 'cart'] as const,
  history: ['thriftPlus', 'history'] as const,
  me: ['thriftPlus', 'me'] as const,
};

export function useThriftPlusSession() {
  return useQuery({ queryKey: thriftPlusKeys.session, queryFn: getSession, staleTime: Infinity });
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
    qc.setQueryData(thriftPlusKeys.session, s);
    // Cover and totals depend on who is signed in.
    void qc.invalidateQueries({ queryKey: thriftPlusKeys.cart });
  };
  return {
    password: useMutation({
      mutationFn: ({ login, password }: { login: string; password: string }) => signIn(login, password),
      onSuccess: setSession,
    }),
    card: useMutation({
      mutationFn: ({ code, last4 }: { code: string; last4: string }) => signInWithCard(code, last4),
      onSuccess: setSession,
    }),
    reset: useMutation({ mutationFn: (email: string) => requestPasswordReset(email) }),
    guest: useMutation({ mutationFn: () => continueAsGuest(), onSuccess: setSession }),
    signOut: useMutation({ mutationFn: () => signOut(), onSuccess: setSession }),
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
    choose: useMutation({ mutationFn: (choice: RewardChoice) => setRewardChoice(choice), onSuccess: setCart }),
    pass: useMutation({
      mutationFn: (sku: string) => passItem(sku),
      onSuccess: () => void qc.invalidateQueries({ queryKey: thriftPlusKeys.history }),
    }),
    feel: useMutation({
      mutationFn: ({ sku, feel }: { sku: string; feel: PriceFeel }) => sendPriceFeel(sku, feel),
    }),
  };
}

/** The link in the reset email opens `/scan?reset=<token>`: set a new password and sign in. */
export function useConfirmReset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ token, password }: { token: string; password: string }) => confirmPasswordReset(token, password),
    onSuccess: (s: ThriftPlusSession) => {
      qc.setQueryData(thriftPlusKeys.session, s);
      void qc.invalidateQueries({ queryKey: thriftPlusKeys.cart });
    },
  });
}

export function useMe(enabled = true) {
  return useQuery({ queryKey: thriftPlusKeys.me, queryFn: getMe, staleTime: 0, enabled });
}

/** The portal's changes. Each refreshes "me"; removing yourself signs you out. */
export function useAccountActions() {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: thriftPlusKeys.me });
  return {
    cardLost: useMutation({ mutationFn: (cardId: number) => reportCardLost(cardId), onSuccess: refresh }),
    texts: useMutation({
      mutationFn: ({ kind, optedIn }: { kind: 'thriftplus' | 'news'; optedIn: boolean }) => setMyTexts(kind, optedIn),
      onSuccess: refresh,
    }),
    removePerson: useMutation({
      mutationFn: (personId: number) => removePerson(personId),
      onSuccess: (r) => {
        if ('status' in r && r.status === 'signed_out') qc.setQueryData(thriftPlusKeys.session, { status: 'signed_out' });
        refresh();
      },
    }),
    setUpLogin: useMutation({
      mutationFn: ({ email, password, username }: { email: string; password: string; username?: string }) =>
        setUpLogin(email, password, username),
      onSuccess: (s: ThriftPlusSession) => {
        qc.setQueryData(thriftPlusKeys.session, s);
        refresh();
      },
    }),
  };
}

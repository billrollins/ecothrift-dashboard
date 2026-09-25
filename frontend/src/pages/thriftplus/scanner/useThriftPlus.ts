/** React Query wrappers around the Thrift+ data module (the mock today, the real API on 10/07). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addToCart,
  clearCart,
  continueAsGuest,
  getCart,
  getHistory,
  getSession,
  passItem,
  removeFromCart,
  requestSignInCode,
  sendPriceFeel,
  setCartQty,
  signOut,
  verifySignInCode,
  type PriceFeel,
  type ThriftPlusCart,
  type ThriftPlusItemCard,
  type ThriftPlusSession,
} from '../../../api/thriftPlusMock';

export const thriftPlusKeys = {
  all: ['thriftPlus'] as const,
  session: ['thriftPlus', 'session'] as const,
  cart: ['thriftPlus', 'cart'] as const,
  history: ['thriftPlus', 'history'] as const,
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
    requestCode: useMutation({ mutationFn: (phone: string) => requestSignInCode(phone) }),
    verify: useMutation({ mutationFn: (code: string) => verifySignInCode(code), onSuccess: setSession }),
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
    pass: useMutation({
      mutationFn: (sku: string) => passItem(sku),
      onSuccess: () => void qc.invalidateQueries({ queryKey: thriftPlusKeys.history }),
    }),
    feel: useMutation({
      mutationFn: ({ sku, feel }: { sku: string; feel: PriceFeel }) => sendPriceFeel(sku, feel),
    }),
  };
}

import { useEffect, useMemo, useState } from 'react';
import type { Cart } from '../types/pos.types';

export type CardTypeFixWindow = {
  eligible: boolean;
  inWindow: boolean;
  canFix: boolean;
  minutesLeft: number;
  reason: string;
};

export function useCardTypeFixWindow(
  cart: Cart | null | undefined,
  user?: { is_superuser?: boolean } | null,
): CardTypeFixWindow {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  return useMemo(() => {
    const eligible =
      !!cart &&
      cart.status === 'completed' &&
      (cart.payment_method === 'card' || cart.payment_method === 'split');
    if (!eligible || !cart) {
      return { eligible: false, inWindow: false, canFix: false, minutesLeft: 0, reason: '' };
    }
    const deadlineMs = cart.card_type_fix_deadline
      ? new Date(cart.card_type_fix_deadline).getTime()
      : Number.NaN;
    const inWindow = Number.isFinite(deadlineMs) && now <= deadlineMs;
    const minutesLeft = inWindow ? Math.max(1, Math.ceil((deadlineMs - now) / 60_000)) : 0;
    const isSuper = Boolean(user?.is_superuser);
    const canFix = inWindow || isSuper;
    let reason = '';
    if (inWindow) {
      reason = `${minutesLeft} min left to fix without a manager`;
    } else if (isSuper) {
      reason = 'Past the 15 min window — superuser override';
    } else {
      reason = 'Locked after 15 min. Ask Bill Rollins to change it.';
    }
    return { eligible: true, inWindow, canFix, minutesLeft, reason };
  }, [cart, user?.is_superuser, now]);
}

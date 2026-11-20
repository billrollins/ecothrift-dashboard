/**
 * Auto-save for the Order window (Dash Update #191): every change queues a PATCH, sent after half a second of quiet
 * (changes made meanwhile go in the same call). Lifecycle dates also set the status while the order is still in
 * ordered → delivered (the dates drive it). After a save both the window's queries refresh; the changed fields flash
 * green, or red on a failure (then the field shows what is saved again, so nothing looks saved that is not).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { updateOrder } from '../../../api/inventory.api';
import type { PurchaseOrderDetailSurface } from '../../../types/inventory.types';
import { deriveLifecycleStatus } from './orderSteps';

const LIFECYCLE_KEYS = ['ordered_date', 'paid_date', 'shipped_date', 'expected_delivery', 'delivered_date'] as const;

export function useOrderAutosave(orderId: number) {
  const qc = useQueryClient();
  const pending = useRef<Record<string, unknown>>({});
  const inFlight = useRef(false);
  const timer = useRef<number | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['purchaseOrderSurface', orderId] });
    void qc.invalidateQueries({ queryKey: ['order-card', orderId] });
    void qc.invalidateQueries({ queryKey: ['purchaseOrders'], exact: false });
  }, [qc, orderId]);

  const flash = (set: (k: string | null) => void, key: string) => {
    set(key);
    window.setTimeout(() => set(null), 600);
  };

  const flush = useCallback(async () => {
    if (inFlight.current) return;
    const snapshot = { ...pending.current };
    const keys = Object.keys(snapshot);
    if (!keys.length) return;
    const base = qc.getQueryData<PurchaseOrderDetailSurface>(['purchaseOrderSurface', orderId]);
    if (!base) {
      refresh();
      flash(setFailedKey, keys.join(','));
      return;
    }
    pending.current = {};
    inFlight.current = true;
    const payload: Record<string, unknown> = { ...snapshot };
    if (LIFECYCLE_KEYS.some((k) => k in payload) && ['ordered', 'paid', 'shipped', 'delivered'].includes(base.status)) {
      const merged = { ...base, ...payload } as PurchaseOrderDetailSurface;
      payload.status = deriveLifecycleStatus(merged);
    }
    try {
      await updateOrder(orderId, payload);
      flash(setSavedKey, keys.join(','));
    } catch (e) {
      console.error(e);
      flash(setFailedKey, keys.join(','));
    } finally {
      inFlight.current = false;
      refresh();
      if (Object.keys(pending.current).length) void flush();
    }
  }, [qc, orderId, refresh]);

  const save = useCallback(
    (partial: Record<string, unknown>) => {
      Object.assign(pending.current, partial);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        timer.current = null;
        void flush();
      }, 500);
    },
    [flush],
  );

  // Leaving the window sends what is waiting rather than dropping it.
  useEffect(
    () => () => {
      if (timer.current) {
        window.clearTimeout(timer.current);
        void flush();
      }
    },
    [flush],
  );

  return { save, savedKey, failedKey };
}

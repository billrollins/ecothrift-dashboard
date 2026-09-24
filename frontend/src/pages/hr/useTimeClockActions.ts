import { useState } from 'react';
import { useSnackbar } from 'notistack';
import { useAuth } from '../../hooks/useAuth';
import {
  useClockIn,
  useClockOut,
  useCurrentEntry,
  useEndBreak,
  useFixForgotten,
  useSetShift,
  useStartBreak,
  useWeeklyHoursStatus,
} from '../../hooks/useTimeClock';
import { useMyWork } from '../../hooks/useMyWork';
import { t } from '../../i18n/routines';

function errorDetail(err: unknown, fallback: string): string {
  return (
    (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    ?? fallback
  );
}

export function useTimeClockActions() {
  const { user } = useAuth();
  const lang = user?.language === 'es' ? 'es' : 'en';
  const { enqueueSnackbar } = useSnackbar();
  const current = useCurrentEntry();
  const clockInMut = useClockIn();
  const clockOutMut = useClockOut();
  const setShiftMut = useSetShift();
  const startBreak = useStartBreak();
  const endBreak = useEndBreak();
  const fixMut = useFixForgotten();
  // Clock-out lists exactly what Today lists as still to do today (one model everywhere).
  const { work } = useMyWork();
  const [guardOpen, setGuardOpen] = useState(false);
  const weekly = useWeeklyHoursStatus();
  const [limitShift, setLimitShift] = useState<string | null>(null);

  const entry = current.data;
  const onBreak = Boolean(entry?.on_break);
  const owed = work.owed.map((item) => item.run);

  // No overtime is approved: at the weekly limit, clocking in asks first (it never blocks;
  // the hours can be wrong, e.g. after a forgotten clock-out).
  async function clockIn(shift: string, anyway = false) {
    const week = weekly.data;
    if (!anyway && week && (week.is_at_limit || week.is_over_limit)) {
      setLimitShift(shift);
      return;
    }
    setLimitShift(null);
    try {
      await clockInMut.mutateAsync({ shift });
      enqueueSnackbar(t('clockIn', lang), { variant: 'success' });
    } catch (err: unknown) {
      enqueueSnackbar(String(errorDetail(err, 'Failed to clock in')), { variant: 'error' });
    }
  }

  async function clockOut() {
    if (!entry) return;
    if (owed.length && !guardOpen) {
      setGuardOpen(true);
      return;
    }
    setGuardOpen(false);
    try {
      await clockOutMut.mutateAsync({ id: entry.id });
      enqueueSnackbar('Clocked out', { variant: 'success' });
    } catch (err: unknown) {
      enqueueSnackbar(String(errorDetail(err, 'Failed to clock out')), { variant: 'error' });
    }
  }

  /** A forgotten punch: close it at the time they left (ISO), or the suggestion if blank. */
  async function fixForgotten(clockOut?: string) {
    if (!entry) return;
    try {
      await fixMut.mutateAsync({ id: entry.id, clockOut });
      enqueueSnackbar(t('forgotFixed', lang), { variant: 'success' });
    } catch (err: unknown) {
      const body = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
      const message = body?.clock_out ?? body?.detail ?? 'Could not fix that shift';
      enqueueSnackbar(String(Array.isArray(message) ? message[0] : message), { variant: 'error' });
    }
  }

  async function toggleBreak() {
    if (!entry) return;
    try {
      if (onBreak) {
        await endBreak.mutateAsync(entry.id);
        enqueueSnackbar('Break ended', { variant: 'success' });
      } else {
        await startBreak.mutateAsync(entry.id);
        enqueueSnackbar('Break started', { variant: 'info' });
      }
    } catch (err: unknown) {
      enqueueSnackbar(String(errorDetail(err, 'Break action failed')), { variant: 'error' });
    }
  }

  function setShift(shift: string) {
    if (!entry) return;
    void setShiftMut.mutateAsync({ id: entry.id, shift });
  }

  return {
    entry,
    loading: current.isLoading,
    onBreak,
    owed,
    guardOpen,
    closeGuard: () => setGuardOpen(false),
    /** At the weekly limit: the shift waiting on "Clock in anyway". */
    limitOpen: limitShift !== null,
    confirmLimit: () => { if (limitShift) void clockIn(limitShift, true); },
    closeLimit: () => setLimitShift(null),
    clockIn,
    clockOut,
    toggleBreak,
    setShift,
    fixForgotten,
    pending: {
      clockIn: clockInMut.isPending,
      clockOut: clockOutMut.isPending,
      break: startBreak.isPending || endBreak.isPending,
      fix: fixMut.isPending,
    },
  };
}

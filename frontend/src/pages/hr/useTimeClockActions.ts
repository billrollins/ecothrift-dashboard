import { useState } from 'react';
import { useSnackbar } from 'notistack';
import { useAuth } from '../../hooks/useAuth';
import {
  useClockIn,
  useClockOut,
  useCurrentEntry,
  useEndBreak,
  useSetShift,
  useStartBreak,
} from '../../hooks/useTimeClock';
import { useMyRoutineRuns } from '../../hooks/useRoutines';
import { runsBlockingClockOut } from '../routines/runIsDue';
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
  const myRoutines = useMyRoutineRuns();
  const [guardOpen, setGuardOpen] = useState(false);

  const entry = current.data;
  const onBreak = Boolean(entry?.on_break);
  const owed = runsBlockingClockOut(myRoutines.data?.open);

  async function clockIn(shift: string) {
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
    clockIn,
    clockOut,
    toggleBreak,
    setShift,
    pending: {
      clockIn: clockInMut.isPending,
      clockOut: clockOutMut.isPending,
      break: startBreak.isPending || endBreak.isPending,
    },
  };
}

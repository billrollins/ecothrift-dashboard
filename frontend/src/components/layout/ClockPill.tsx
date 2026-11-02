import { useEffect, useState } from 'react';
import { Box, Button, ButtonBase, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { format, parseISO } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useCurrentEntry } from '../../hooks/useTimeClock';
import { shiftName, t } from '../../i18n/routines';
import { dashboardTabHref, saveDashboardTab } from '../../navigation/dashboardTabs';
import { elapsedSeconds, formatElapsed, useNowTick } from '../../pages/hr/timeClockFormat';
import { useTimeClockActions } from '../../pages/hr/useTimeClockActions';
import { dutyColors } from '../duty/tokens';
import { ClockInLimitDialog } from '../hr/ClockInLimitDialog';
import { ShiftPicker } from '../hr/ShiftPicker';
import { ClockOutRoutineGuard } from '../routines/ClockOutRoutineGuard';

const PILL_ON = { bg: '#E6F2E7', fg: '#1B5E20', border: '#A9D3AD' };
const PILL_OFF = { bg: '#F1F5F9', fg: '#334155', border: '#CBD5E1' };
const PILL_WARN = { bg: '#FFF1CC', fg: '#6B4300', border: '#E8C25A' };

/**
 * The clock status in the top bar: "On shift since 8:58 AM" / "Not clocked in".
 * Clocking is protected, never one tap: the pill only opens the ClockDialog, which shows today's
 * shift and then asks again ("Clock out now, 3:42 PM?") before anything is sent.
 */
export function ClockPill() {
  const { user } = useAuth();
  const lang = user?.language === 'es' ? 'es' : 'en';
  const current = useCurrentEntry();
  const [open, setOpen] = useState(false);
  const entry = current.data;

  if (current.isLoading && !entry) return null;

  const stale = Boolean(entry?.stale);
  const onBreak = Boolean(entry?.on_break);
  const since = entry ? format(parseISO(entry.clock_in), 'h:mm a') : '';
  const tone = !entry ? PILL_OFF : stale || onBreak ? PILL_WARN : PILL_ON;
  const label = !entry
    ? t('notClockedIn', lang)
    : stale
      ? t('forgotTitle', lang)
      : onBreak
        ? t('onBreak', lang)
        : t('onShiftSince', lang).replace('{time}', since);
  // A narrow phone bar has no room for the sentence: the clock time (or "off") stands in.
  const short = !entry ? t('clockedOut', lang) : stale ? '!' : onBreak ? t('onBreak', lang) : since;

  return (
    <>
      <ButtonBase
        data-testid="clock-pill"
        aria-label={`${t('timeClock', lang)}: ${label}`}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        sx={{
          height: 36,
          px: 1.25,
          mr: 1,
          gap: 0.75,
          minWidth: 0,
          borderRadius: 999,
          border: `1px solid ${tone.border}`,
          bgcolor: tone.bg,
          color: tone.fg,
          fontSize: 13,
          fontWeight: 700,
          whiteSpace: 'nowrap',
        }}
      >
        <Box
          aria-hidden
          sx={{ width: 9, height: 9, flexShrink: 0, borderRadius: '50%', bgcolor: entry ? tone.fg : '#64748B' }}
        />
        <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>{label}</Box>
        <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' }, maxWidth: 84, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {short}
        </Box>
      </ButtonBase>
      {open ? <ClockDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

type Confirming = { kind: 'out' } | { kind: 'in'; shift: string } | null;

/** Today's shift and clock state, one primary button, and an explicit confirm step before any punch. */
export function ClockDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const lang = user?.language === 'es' ? 'es' : 'en';
  const navigate = useNavigate();
  const clock = useTimeClockActions();
  const { entry } = clock;
  const now = useNowTick(true);
  const [confirming, setConfirming] = useState<Confirming>(null);

  // The punch went through (the current entry changed): the dialog has done its job.
  useEffect(() => {
    if (confirming?.kind === 'out' && !entry) onClose();
    if (confirming?.kind === 'in' && entry) onClose();
  }, [confirming, entry, onClose]);

  const nowText = format(new Date(now), 'h:mm a');
  const stale = Boolean(entry?.stale);
  const onBreak = Boolean(entry?.on_break);

  function openMyDay() {
    saveDashboardTab(user?.id, 'myday');
    onClose();
    navigate(dashboardTabHref('myday'));
  }

  let body;
  let actions;
  if (confirming) {
    const question = confirming.kind === 'out'
      ? t('clockOutConfirm', lang).replace('{time}', nowText)
      : t('clockInConfirm', lang)
        .replace('{shift}', shiftName(confirming.shift, lang))
        .replace('{time}', nowText);
    const busy = confirming.kind === 'out' ? clock.pending.clockOut : clock.pending.clockIn;
    body = (
      <Typography data-testid="clock-confirm" sx={{ fontSize: 18, fontWeight: 800, color: dutyColors.ink }}>
        {question}
      </Typography>
    );
    actions = (
      <>
        <Button onClick={() => setConfirming(null)} disabled={busy} sx={{ minHeight: 44 }}>
          {t('cancel', lang)}
        </Button>
        <Button
          variant="contained"
          color={confirming.kind === 'out' ? 'error' : 'primary'}
          disabled={busy}
          sx={{ minHeight: 44, fontWeight: 800 }}
          onClick={() => {
            if (confirming.kind === 'out') void clock.clockOut();
            else void clock.clockIn(confirming.shift);
          }}
        >
          {t(confirming.kind === 'out' ? 'clockOut' : 'clockIn', lang)}
        </Button>
      </>
    );
  } else if (!entry) {
    body = (
      <>
        <Typography sx={{ fontWeight: 800, mb: 0.5 }}>{t('notClockedIn', lang)}</Typography>
        <Typography sx={{ fontSize: 13, color: dutyColors.ink60, mb: 1.5 }}>{t('readyToStart', lang)}</Typography>
        <ShiftPicker lang={lang} onPick={(shift) => setConfirming({ kind: 'in', shift })} />
      </>
    );
    actions = <Button onClick={onClose} sx={{ minHeight: 44 }}>{t('close', lang)}</Button>;
  } else if (stale) {
    body = (
      <>
        <Typography sx={{ fontWeight: 800, mb: 0.5 }}>{t('forgotTitle', lang)}</Typography>
        <Typography sx={{ fontSize: 13, color: dutyColors.ink60 }}>
          {t('forgotSince', lang)} {format(parseISO(entry.clock_in), 'EEE h:mm a')} {t('forgotStillOpen', lang)}
        </Typography>
      </>
    );
    actions = (
      <>
        <Button onClick={onClose} sx={{ minHeight: 44 }}>{t('close', lang)}</Button>
        <Button variant="contained" onClick={openMyDay} sx={{ minHeight: 44, fontWeight: 800 }}>
          {t('fixInMyDay', lang)}
        </Button>
      </>
    );
  } else {
    body = (
      <>
        <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: dutyColors.ink60 }}>
          {t('todaysShift', lang)}
        </Typography>
        <Typography sx={{ fontSize: 18, fontWeight: 800, mb: 0.5 }}>{entry.shift_label || shiftName(entry.shift, lang)}</Typography>
        <Typography sx={{ fontSize: 14, color: dutyColors.ink }}>
          {onBreak
            ? `${t('onBreak', lang)}${entry.break_started_at ? ` · ${t('breakSince', lang)} ${format(parseISO(entry.break_started_at), 'h:mm a')}` : ''}`
            : t('onShiftSince', lang).replace('{time}', format(parseISO(entry.clock_in), 'h:mm a'))}
        </Typography>
        <Typography sx={{ fontSize: 28, fontWeight: 900, fontVariantNumeric: 'tabular-nums', mt: 0.5 }}>
          {formatElapsed(elapsedSeconds(entry, now))}
        </Typography>
        {onBreak ? (
          <Typography sx={{ fontSize: 13, color: dutyColors.ink60, mt: 1 }}>{t('endBreakFirst', lang)}</Typography>
        ) : null}
      </>
    );
    actions = (
      <>
        <Button onClick={onClose} sx={{ minHeight: 44 }}>{t('close', lang)}</Button>
        {onBreak ? (
          <Button
            variant="contained"
            color="warning"
            disabled={clock.pending.break}
            onClick={() => { void clock.toggleBreak(); }}
            sx={{ minHeight: 44, fontWeight: 800 }}
          >
            {t('endBreak', lang)}
          </Button>
        ) : (
          <Button variant="contained" color="error" onClick={() => setConfirming({ kind: 'out' })} sx={{ minHeight: 44, fontWeight: 800 }}>
            {t('clockOut', lang)}
          </Button>
        )}
      </>
    );
  }

  return (
    <>
      <Dialog open onClose={onClose} maxWidth="xs" fullWidth aria-labelledby="clock-dialog-title">
        <DialogTitle id="clock-dialog-title" sx={{ fontWeight: 800 }}>{t('timeClock', lang)}</DialogTitle>
        <DialogContent>{body}</DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>{actions}</DialogActions>
      </Dialog>
      <ClockInLimitDialog
        open={clock.limitOpen}
        lang={lang}
        busy={clock.pending.clockIn}
        onCancel={clock.closeLimit}
        onConfirm={clock.confirmLimit}
      />
      <ClockOutRoutineGuard
        open={clock.guardOpen}
        runs={clock.owed}
        busy={clock.pending.clockOut}
        onClose={() => { clock.closeGuard(); onClose(); }}
        onClockOut={() => { void clock.clockOut(); }}
      />
    </>
  );
}

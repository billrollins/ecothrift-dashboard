/**
 * TimeClock's pay period cards (Dash Updates #137, #179): Pay (so far, and expected once the schedule is worked),
 * Time off (ask, see the answer, withdraw) and Past shifts (each with Fix: a time change request to a manager).
 * Off payroll (family, #121) sees hours, never dollars. Pay starts hidden behind the eye, for a screen others see.
 */
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { Box, Button, IconButton, Skeleton, Typography } from '@mui/material';
import { format, parseISO } from 'date-fns';
import { es as esLocale } from 'date-fns/locale';
import { useState } from 'react';
import { formatDashboardCurrencyExact } from '../../../components/dashboard/dashboardFormatters';
import { StatusPill, type Tone } from '../../../components/page/PageKit';
import { MicroLabel, useToneText } from '../../../components/page/RichKit';
import type { MyPeriod, MyPeriodRequest, MyPeriodWorked } from '../../../types/hr.types';
import { useRequestCopy } from '../../people/ScheduleRequests';
import { useTimeClockCopy, type TimeClockCopyKey } from './copy';
import { EmptyRow, Panel, rowSx, todayRowSx } from './Panel';
import { hrs, pastRows } from './shifts';

// ---- Pay ------------------------------------------------------------------------------------------------------

function Figure({ label, value, caption, tone }: { label: string; value: string; caption: string; tone?: Tone }) {
  const captionColor = useToneText(tone);
  return (
    <Box sx={{ minWidth: 0 }}>
      <MicroLabel>{label}</MicroLabel>
      <Typography noWrap sx={{ fontSize: '1.625rem', fontWeight: 900, lineHeight: 1.25, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
      <Typography noWrap sx={{ minHeight: 18, fontSize: '0.75rem', fontWeight: 700, color: captionColor }}>{caption}</Typography>
    </Box>
  );
}

export function PayCard({ period }: { period: MyPeriod | undefined }) {
  const { tc, lang } = useTimeClockCopy();
  const [showPay, setShowPay] = useState(false);
  const locale = lang === 'es' ? { locale: esLocale } : undefined;
  const paid = Boolean(period?.on_payroll);
  const daysLeft = period ? (period.days_left === 0 ? tc('lastDay') : tc('daysLeft', { n: period.days_left + 1 })) : '';
  const money = (value: string | null) => (showPay && value != null ? formatDashboardCurrencyExact(value) : '••••');
  const body = () => {
    if (!period) return [0, 1].map((n) => <Skeleton key={n} variant="rounded" height={70} />);
    const n = period.so_far.shift_count;
    const worked = n === 1 ? tc('hoursOneShift', { h: hrs(period.so_far.hours) }) : tc('hoursShifts', { h: hrs(period.so_far.hours), n });
    const shifts = n === 1 ? tc('oneShift') : tc('shiftsCount', { n });
    const ahead = parseFloat(period.ahead.hours) > 0 ? tc('aheadScheduled', { h: hrs(period.ahead.hours) }) : tc('nothingAhead');
    const overtime = parseFloat(period.expected.overtime_hours) > 0 ? tc('overtimeIn', { h: hrs(period.expected.overtime_hours) }) : '';
    const end = tc('expectedBy', { date: format(parseISO(period.date_to), 'MMM d', locale) });
    return paid ? (
      <>
        <Figure label={tc('soFar')} value={money(period.so_far.pay)} caption={worked} />
        <Figure label={end} value={money(period.expected.pay)} caption={overtime || ahead} tone={overtime ? 'wait' : 'quiet'} />
      </>
    ) : (
      <>
        <Figure label={tc('soFar')} value={`${hrs(period.so_far.hours)} h`} caption={shifts} />
        <Figure label={end} value={`${hrs(period.expected.hours)} h`} caption={overtime || ahead} tone={overtime ? 'wait' : 'quiet'} />
      </>
    );
  };
  return (
    <Panel
      testId="pay-card"
      title={period && !paid ? tc('hours') : tc('pay')}
      meta={period ? `${period.label.replace(/, \d{4}$/, '')} · ${daysLeft}` : ''}
      action={paid ? (
        <IconButton size="small" onClick={() => setShowPay((v) => !v)} aria-label={tc(showPay ? 'hidePay' : 'showPay')} aria-pressed={showPay}>
          {showPay ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
        </IconButton>
      ) : null}
    >
      <Box sx={{ px: 2, pb: 1.5, display: 'grid', gap: 2, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>{body()}</Box>
    </Panel>
  );
}

// ---- Time off -------------------------------------------------------------------------------------------------

const REQUEST_TONE: Record<MyPeriodRequest['status'], Tone> = { pending: 'wait', approved: 'good', declined: 'problem', withdrawn: 'quiet' };
const REQUEST_LABEL: Record<MyPeriodRequest['status'], TimeClockCopyKey> = {
  pending: 'waiting', approved: 'approved', declined: 'declined', withdrawn: 'waiting',
};

export function TimeOffCard({ period, onAsk, onWithdraw, busyId, sx }: {
  period: MyPeriod | undefined;
  onAsk: () => void;
  onWithdraw: (id: number) => void;
  busyId: number | null;
  sx?: object;
}) {
  const { tc } = useTimeClockCopy();
  const { describe } = useRequestCopy();
  const requests = period?.requests;
  return (
    <Panel
      testId="time-off-card"
      title={tc('timeOff')}
      sx={sx}
      action={(
        <Button size="small" variant="outlined" onClick={onAsk} disabled={!period} aria-label={tc('requestTimeOff')} sx={{ mr: 1 }}>
          {tc('request')}
        </Button>
      )}
    >
      {!requests ? <Box sx={rowSx}><Skeleton variant="text" width="60%" /></Box> : requests.length === 0 ? (
        <EmptyRow>{tc('noRequests')}</EmptyRow>
      ) : requests.map((r) => {
        const answer = r.status !== 'pending' ? [r.decided_by_name, r.reply].filter(Boolean).join(': ') : r.note;
        return (
          <Box key={r.id} data-testid={`time-off-${r.id}`} sx={(t) => ({ ...rowSx(t), gridTemplateColumns: 'minmax(0, 1fr) auto', py: 0.5 })}>
            <Box sx={{ minWidth: 0 }}>
              <Typography noWrap sx={{ fontSize: '0.875rem', fontWeight: 800 }}>{describe(r)}</Typography>
              {answer ? <Typography noWrap title={answer} sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{answer}</Typography> : null}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <StatusPill tone={REQUEST_TONE[r.status]} label={tc(REQUEST_LABEL[r.status])} />
              {r.status === 'pending' ? (
                <Button size="small" color="inherit" disabled={busyId === r.id} onClick={() => onWithdraw(r.id)} sx={{ color: 'text.secondary', minWidth: 0 }}>
                  {tc('withdraw')}
                </Button>
              ) : null}
            </Box>
          </Box>
        );
      })}
    </Panel>
  );
}

// ---- Past shifts ----------------------------------------------------------------------------------------------

/** Day | worked | scheduled | hours | status | Fix. On a phone: day over worked, hours over status, Fix. */
const PAST_COLUMNS = {
  xs: 'minmax(0, 1fr) auto 52px',
  md: '116px minmax(0, 1.3fr) minmax(0, 1fr) 72px 132px 52px',
} as const;

export function PastShifts({ period, onFix }: { period: MyPeriod | undefined; onFix: (entry: MyPeriodWorked) => void }) {
  const { tc, lang } = useTimeClockCopy();
  const rows = period ? pastRows(period, tc, lang) : null;
  const quiet = { fontSize: '0.8125rem', color: 'text.secondary' } as const;
  return (
    <Panel testId="past-shifts" title={tc('pastShifts')} meta={period ? period.label.replace(/, \d{4}$/, '') : ''}>
      {!rows ? [0, 1, 2].map((n) => <Box key={n} sx={rowSx}><Skeleton variant="text" width="70%" /></Box>) : rows.length === 0 ? (
        <EmptyRow>{tc('noPast')}</EmptyRow>
      ) : rows.map((row) => (
        <Box
          key={row.key}
          data-testid={`shift-row-${row.key}`}
          sx={(t) => ({ ...rowSx(t), gridTemplateColumns: PAST_COLUMNS, py: { xs: 0.5, md: 0 }, ...(row.isToday ? todayRowSx(t) : {}) })}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography noWrap sx={{ fontSize: '0.875rem', fontWeight: 800 }}>{row.day}</Typography>
            <Typography noWrap sx={{ ...quiet, display: { xs: 'block', md: 'none' }, color: 'text.primary' }}>{row.worked || row.scheduled}</Typography>
          </Box>
          <Typography noWrap sx={{ display: { xs: 'none', md: 'block' }, fontSize: '0.875rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{row.worked}</Typography>
          <Typography noWrap sx={{ ...quiet, display: { xs: 'none', md: 'block' } }}>{row.scheduled}</Typography>
          <Typography sx={{ display: { xs: 'none', md: 'block' }, textAlign: 'right', fontSize: '0.875rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{row.hours}</Typography>
          {/* The pill's and the button's rooms are kept on every row, so nothing shifts when one shows. */}
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { xs: 'flex-end', md: 'center' }, gap: 0.25, minWidth: 0 }}>
            <Typography sx={{ display: { xs: 'block', md: 'none' }, fontSize: '0.875rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{row.hours}</Typography>
            {row.status ? <StatusPill tone={row.status.tone} label={tc(row.status.label)} /> : null}
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            {row.fix ? (
              <Button size="small" onClick={() => onFix(row.fix!)} aria-label={`${tc('fixShift')}: ${row.day || row.date}`} sx={{ minWidth: 0, fontWeight: 800 }}>
                {tc('fix')}
              </Button>
            ) : null}
          </Box>
        </Box>
      ))}
    </Panel>
  );
}

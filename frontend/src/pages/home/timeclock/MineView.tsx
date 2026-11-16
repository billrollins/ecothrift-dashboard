import { Alert, Box, Button, Skeleton, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography, type Theme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { es as esLocale } from 'date-fns/locale';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { withdrawScheduleRequest } from '../../../api/schedule.api';
import { TimeChangeDialog } from '../../../components/hr/TimeChangeDialog';
import { formatDashboardCurrencyExact } from '../../../components/dashboard/dashboardFormatters';
import { EmptyState, Section, StatusPill, type Tone } from '../../../components/page/PageKit';
import { Kpi, KpiStrip } from '../../../components/page/RichKit';
import { useMyPeriod } from '../../../hooks/useTimeClock';
import { t } from '../../../i18n/routines';
import type { MyPeriod, MyPeriodRequest, MyPeriodWorked } from '../../../types/hr.types';
import { clockLabel } from '../../routines/runDeadline';
import { AskDialog, useRequestCopy } from '../../people/ScheduleRequests';
import { errorText } from '../../people/scheduleLayout';
import { useTimeClockCopy, type TimeClockCopyKey } from './copy';

type Tc = ReturnType<typeof useTimeClockCopy>['tc'];

const hrs = (value: string | number) => {
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
};

export interface ShiftRowModel {
  key: string;
  date: string;
  isToday: boolean;
  /** Only on a day's first row: the card title on a phone. */
  day: string;
  scheduled: string;
  worked: string;
  hours: string;
  status: { tone: Tone; label: TimeClockCopyKey } | null;
  /** A finished shift with no fix waiting: it can be fixed. */
  fix: MyPeriodWorked | null;
}

function workedStatus(entry: MyPeriodWorked): ShiftRowModel['status'] {
  if (!entry.clock_out) return { tone: 'good', label: entry.on_break ? 'onBreak' : 'onClock' };
  if (entry.change?.status === 'pending') return { tone: 'wait', label: 'fixAsked' };
  if (entry.status === 'flagged') return { tone: 'problem', label: 'needsFix' };
  if (entry.change?.status === 'approved') return { tone: 'good', label: 'fixed' };
  if (entry.change?.status === 'denied') return { tone: 'quiet', label: 'fixDeclined' };
  return null;
}

/** The period's days as table rows: one per shift worked (the schedule on the first), else one for the day. */
export function shiftRows(period: MyPeriod, tc: Tc, lang: string): ShiftRowModel[] {
  const locale = lang === 'es' ? { locale: esLocale } : undefined;
  const rows: ShiftRowModel[] = [];
  for (const d of period.days) {
    const dayText = `${format(parseISO(d.date), 'EEE MMM d', locale)}${d.is_today ? ` · ${t('today', lang)}` : ''}`;
    const scheduled = d.scheduled
      .map((s) => `${s.text}${s.department_name ? ` ${s.department_name}` : ''} · ${hrs(s.hours)} h`)
      .join(', ');
    if (d.worked.length) {
      d.worked.forEach((entry, i) => {
        const open = !entry.clock_out;
        const breakText = entry.break_minutes ? ` · ${tc('breakMin', { m: entry.break_minutes })}` : '';
        rows.push({
          key: `${d.date}-${entry.id}`,
          date: d.date,
          isToday: d.is_today,
          day: i === 0 ? dayText : '',
          scheduled: i === 0 ? scheduled : '',
          worked: `${clockLabel(entry.clock_in)} – ${open ? tc('now') : clockLabel(entry.clock_out)}${breakText}`,
          hours: `${hrs(open ? entry.hours_so_far ?? '0' : entry.total_hours ?? '0')} h`,
          status: workedStatus(entry),
          fix: open || entry.change?.status === 'pending' ? null : entry,
        });
      });
      continue;
    }
    let status: ShiftRowModel['status'] = null;
    if (d.day_off) status = d.day_off.status === 'approved' ? { tone: 'info', label: 'dayOff' } : { tone: 'wait', label: 'dayOffAsked' };
    else if (d.scheduled.some((s) => parseFloat(s.hours_ahead) > 0)) status = { tone: 'quiet', label: 'upcoming' };
    else if (d.scheduled.length && (d.is_past || d.is_today)) status = { tone: 'quiet', label: 'notWorked' };
    rows.push({
      key: d.date, date: d.date, isToday: d.is_today, day: dayText, scheduled, worked: '', hours: '', status, fix: null,
    });
  }
  return rows;
}

/**
 * Hours and pay for this period as the rich kit's KPI strip (#179): worked so far, pay so far, expected once the
 * schedule is worked, what is still on the schedule, and time off waiting. Off payroll (#121) sees hours, never dollars.
 */
function PeriodTiles({ period, showPay, tc }: { period: MyPeriod; showPay: boolean; tc: Tc }) {
  const locale = useTimeClockCopy().lang === 'es' ? { locale: esLocale } : undefined;
  const end = format(parseISO(period.date_to), 'MMM d', locale);
  const shifts = period.so_far.shift_count === 1 ? tc('oneShift') : tc('shiftsCount', { n: period.so_far.shift_count });
  const ahead = parseFloat(period.ahead.hours) > 0 ? tc('ifScheduled', { h: hrs(period.ahead.hours) }) : tc('nothingAhead');
  const money = (value: string | null) => (showPay && value != null ? formatDashboardCurrencyExact(value) : '••••');
  const overtime = parseFloat(period.expected.overtime_hours) > 0 ? tc('overtimeIn', { h: hrs(period.expected.overtime_hours) }) : undefined;
  const aheadShifts = period.ahead.shift_count === 1 ? tc('oneShift') : tc('shiftsCount', { n: period.ahead.shift_count });
  const waiting = period.requests.filter((r) => r.status === 'pending').length;
  const timeOff = (
    <Kpi
      label={tc('timeOff')}
      value={waiting ? String(waiting) : tc('noneShort')}
      caption={waiting ? tc('waitingOnManager') : tc('noneWaiting')}
      tone={waiting ? 'wait' : 'quiet'}
    />
  );
  const columns = { xs: 2, sm: 3, lg: 5 };
  if (!period.on_payroll) {
    return (
      <Box data-testid="period-tiles">
        <KpiStrip columns={{ xs: 2, sm: 4 }}>
          <Kpi label={tc('workedSoFar')} value={`${hrs(period.so_far.hours)} h`} caption={shifts} />
          <Kpi label={tc('scheduledAheadTile')} value={`${hrs(period.ahead.hours)} h`} caption={aheadShifts} />
          <Kpi label={tc('expectedHours', { date: end })} value={`${hrs(period.expected.hours)} h`} caption={tc('offPayroll')} />
          {timeOff}
        </KpiStrip>
      </Box>
    );
  }
  return (
    <Box data-testid="period-tiles">
      <KpiStrip columns={columns}>
        <Kpi label={tc('workedSoFar')} value={`${hrs(period.so_far.hours)} h`} caption={shifts} />
        <Kpi label={tc('paySoFar')} value={money(period.so_far.pay)} caption={tc('beforeTaxes')} />
        <Kpi label={tc('expected', { date: end })} value={money(period.expected.pay)} caption={overtime ?? ahead} tone={overtime ? 'wait' : 'quiet'} />
        <Kpi label={tc('scheduledAheadTile')} value={`${hrs(period.ahead.hours)} h`} caption={aheadShifts} />
        {timeOff}
      </KpiStrip>
    </Box>
  );
}

function ShiftsTable({ rows, tc, onFix }: { rows: ShiftRowModel[]; tc: Tc; onFix: (entry: MyPeriodWorked) => void }) {
  if (!rows.length) return <EmptyState title={tc('noShifts')} body={tc('noShiftsBody')} />;
  return (
    <Table size="small" aria-label={tc('shifts')} sx={[tableSx, { '& td, & th': { whiteSpace: { sm: 'nowrap' } } }]}>
      <TableHead>
        <TableRow>
          <TableCell>{tc('day')}</TableCell>
          <TableCell>{tc('scheduled')}</TableCell>
          <TableCell>{tc('worked')}</TableCell>
          <TableCell align="right">{tc('hours')}</TableCell>
          <TableCell sx={{ width: 150 }}>{tc('status')}</TableCell>
          <TableCell sx={{ width: 72 }} />
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key} data-testid={`shift-row-${row.key}`} selected={row.isToday}>
            <TableCell sx={{ fontWeight: 700 }}>{row.day}</TableCell>
            <TableCell>{row.scheduled}</TableCell>
            <TableCell>{row.worked}</TableCell>
            <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{row.hours}</TableCell>
            <TableCell>{row.status ? <StatusPill tone={row.status.tone} label={tc(row.status.label)} /> : null}</TableCell>
            <TableCell align="right">
              {row.fix ? (
                <Button size="small" onClick={() => onFix(row.fix!)} aria-label={`${tc('fixShift')}: ${row.day || row.date}`}>
                  {tc('fix')}
                </Button>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** The rich kit's table look (micro headers, striped rows, a bar on today), without its fixed layout: these cells wrap. */
const tableSx = (t: Theme) => ({
  '& th': {
    fontSize: '0.6875rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.secondary',
    bgcolor: t.palette.grey[50], borderBottom: `2px solid ${t.palette.grey[300]}`, whiteSpace: 'nowrap',
  },
  '& td': { borderBottomColor: t.palette.grey[100] },
  '& tbody tr:nth-of-type(even)': { bgcolor: t.palette.grey[50] },
  '& tbody tr.Mui-selected, & tbody tr.Mui-selected:hover': {
    bgcolor: alpha(t.palette.secondary.main, 0.12), boxShadow: `inset 3px 0 0 ${t.palette.secondary.main}`,
  },
}) as const;

const REQUEST_TONE: Record<MyPeriodRequest['status'], Tone> = { pending: 'wait', approved: 'good', declined: 'problem', withdrawn: 'quiet' };
const REQUEST_LABEL: Record<MyPeriodRequest['status'], TimeClockCopyKey> = {
  pending: 'waiting', approved: 'approved', declined: 'declined', withdrawn: 'waiting',
};

function TimeOffTable({ requests, tc, onWithdraw, busyId }: {
  requests: MyPeriodRequest[];
  tc: Tc;
  onWithdraw: (id: number) => void;
  busyId: number | null;
}) {
  const { describe } = useRequestCopy();
  if (!requests.length) return <EmptyState title={tc('noRequests')} body={tc('noRequestsBody')} />;
  return (
    <Table size="small" aria-label={tc('timeOff')} sx={tableSx}>
      <TableHead>
        <TableRow>
          <TableCell>{tc('request')}</TableCell>
          <TableCell>{tc('note')}</TableCell>
          <TableCell sx={{ width: 130 }}>{tc('status')}</TableCell>
          <TableCell>{tc('answer')}</TableCell>
          <TableCell sx={{ width: 96 }} />
        </TableRow>
      </TableHead>
      <TableBody>
        {requests.map((r) => (
          <TableRow key={r.id} data-testid={`time-off-${r.id}`}>
            <TableCell sx={{ fontWeight: 700 }}>{describe(r)}</TableCell>
            <TableCell>{r.note}</TableCell>
            <TableCell><StatusPill tone={REQUEST_TONE[r.status]} label={tc(REQUEST_LABEL[r.status])} /></TableCell>
            <TableCell>{r.status !== 'pending' ? [r.decided_by_name, r.reply].filter(Boolean).join(': ') : ''}</TableCell>
            <TableCell align="right">
              {r.status === 'pending' ? (
                <Button size="small" color="inherit" disabled={busyId === r.id} onClick={() => onWithdraw(r.id)} sx={{ color: 'text.secondary' }}>
                  {tc('withdraw')}
                </Button>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * Mine (Dash Update #137): this pay period's hours and pay (so far, and expected once the schedule ahead is worked),
 * every shift with a Fix button (a time change request to a manager), and time off (unpaid, Nebraska's paid sick time
 * does not apply under 11 employees: decision 12). Off payroll (family, #121) sees hours, never dollars. Pay starts
 * hidden behind Show pay, as on Today, for a screen others can see.
 */
export function MineView() {
  const { tc, lang } = useTimeClockCopy();
  const period = useMyPeriod();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [showPay, setShowPay] = useState(false);
  const [fixing, setFixing] = useState<MyPeriodWorked | null>(null);
  const [asking, setAsking] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const data = period.data;
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['timeClock', 'myPeriod'] });
    void queryClient.invalidateQueries({ queryKey: ['scheduleRequests'] });
    void queryClient.invalidateQueries({ queryKey: ['scheduleWeek'] });
  };
  const withdraw = async (id: number) => {
    setBusyId(id);
    try {
      await withdrawScheduleRequest(id);
      refresh();
    } catch (err) {
      enqueueSnackbar(errorText(err, tc('couldNot')), { variant: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  if (period.isError && !data) return <Alert severity="error">{tc('couldNotLoad')}</Alert>;
  const daysLeft = data ? (data.days_left === 0 ? tc('lastDay') : tc('daysLeft', { n: data.days_left + 1 })) : '';

  return (
    <Stack spacing={{ xs: 2, md: 2.5 }} data-testid="time-clock-mine">
      <Box>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1, minHeight: 32 }}>
          <Typography variant="overline" color="text.secondary" noWrap sx={{ flex: 1, minWidth: 0, lineHeight: 1.4 }}>
            {data ? `${tc('payPeriod')} · ${data.label} · ${daysLeft}` : tc('payPeriod')}
          </Typography>
          {/* Kept in place while loading so the row never moves; off payroll has no pay to show. */}
          <Button
            size="small"
            onClick={() => setShowPay((v) => !v)}
            sx={{ visibility: data && !data.on_payroll ? 'hidden' : 'visible', flexShrink: 0 }}
            disabled={!data}
          >
            {tc(showPay ? 'hidePay' : 'showPay')}
          </Button>
        </Stack>
        {data ? <PeriodTiles period={data} showPay={showPay} tc={tc} /> : (
          <KpiStrip columns={{ xs: 2, sm: 3, lg: 5 }}>
            {[0, 1, 2, 3, 4].map((n) => <Skeleton key={n} variant="rounded" height={84} />)}
          </KpiStrip>
        )}
      </Box>

      <Section title={tc('shifts')} hint={tc('shiftsHint')} flush>
        {data ? <ShiftsTable rows={shiftRows(data, tc, lang)} tc={tc} onFix={setFixing} /> : (
          <Box sx={{ px: 2.5, pb: 2 }}><Skeleton variant="rounded" height={160} /></Box>
        )}
      </Section>

      <Section
        title={tc('timeOff')}
        hint={tc('timeOffHint')}
        flush
        action={<Button variant="outlined" size="small" onClick={() => setAsking(true)} sx={{ flexShrink: 0 }}>{tc('requestTimeOff')}</Button>}
      >
        {data ? <TimeOffTable requests={data.requests} tc={tc} onWithdraw={withdraw} busyId={busyId} /> : (
          <Box sx={{ px: 2.5, pb: 2 }}><Skeleton variant="rounded" height={64} /></Box>
        )}
      </Section>

      <TimeChangeDialog entry={fixing} onClose={() => { setFixing(null); refresh(); }} />
      {asking && data ? (
        <AskDialog initial={{ date: data.today }} today={data.today} onClose={() => setAsking(false)} onSent={refresh} />
      ) : null}
    </Stack>
  );
}

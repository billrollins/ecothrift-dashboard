import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import { Box, Button, Collapse, Skeleton, Typography } from '@mui/material';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useMyPay, useWeeklyHoursStatus } from '../../hooks/useTimeClock';
import { useModificationRequests, useTimeEntries } from '../../hooks/useTimeEntries';
import { t } from '../../i18n/routines';
import { formatHours } from '../../pages/hr/timeClockFormat';
import type { MyPayPeriod, TimeEntry, WeeklyHoursStatus } from '../../types/hr.types';
import { StatusTag } from '../duty/StatusTag';
import type { StatusTagTone } from '../duty/tokens';
import { dutyColors, thinScrollSx } from '../duty/tokens';
import { formatDashboardCurrency } from '../dashboard/dashboardFormatters';
import { daysLeftInPeriod } from './PayReveal';
import { RecentShiftsList } from './RecentShiftsList';
import { eyebrowSx } from './ShiftPicker';
import { TimeChangeDialog } from './TimeChangeDialog';
import { weekStatusLine } from './weekStatus';

type WeekLevel = 'ok' | 'near' | 'at' | 'over';

export function weekLevel(weekly: WeeklyHoursStatus | undefined): WeekLevel {
  if (!weekly) return 'ok';
  const worked = parseFloat(weekly.hours_worked);
  const limit = parseFloat(weekly.hours_limit);
  if (weekly.is_over_limit || worked > limit) return 'over';
  if (weekly.is_at_limit || worked >= limit) return 'at';
  if (worked >= limit - 2) return 'near';
  return 'ok';
}

const LEVEL_BAR: Record<WeekLevel, string> = {
  ok: dutyColors.brand,
  near: '#C98A00',
  at: dutyColors.red,
  over: dutyColors.red,
};

interface Alert {
  key: string;
  label: string;
  tone: StatusTagTone;
}

/** Things in Hours & pay worth a look: the weekly limit, flagged shifts, time changes waiting. */
export function hoursAlerts(
  weekly: WeeklyHoursStatus | undefined,
  entries: TimeEntry[],
  pendingChanges: number,
  lang: string,
): Alert[] {
  const alerts: Alert[] = [];
  const level = weekLevel(weekly);
  if (level === 'near') alerts.push({ key: 'week', label: t('nearLimit', lang), tone: 'amber' });
  if (level === 'at') alerts.push({ key: 'week', label: t('atLimit', lang), tone: 'red' });
  if (level === 'over') alerts.push({ key: 'week', label: t('overLimit', lang), tone: 'red' });
  const flagged = entries.filter((entry) => entry.status === 'flagged').length;
  if (flagged) {
    alerts.push({ key: 'flagged', label: `${flagged} ${t(flagged === 1 ? 'shiftsNeedFix' : 'shiftsNeedFixMany', lang)}`, tone: 'red' });
  }
  if (pendingChanges) {
    alerts.push({ key: 'changes', label: `${pendingChanges} ${t(pendingChanges === 1 ? 'changePending' : 'changesPending', lang)}`, tone: 'blue' });
  }
  return alerts;
}

function money(amount: string | undefined): string {
  return amount ? formatDashboardCurrency(amount) : '';
}

/** One pay period on one line: dates (and a short note), hours, and dollars when shown. */
function PeriodLine({ period, showPay, lang, current }: {
  period: MyPayPeriod;
  showPay: boolean;
  lang: string;
  current?: boolean;
}) {
  const pending = parseFloat(period.pending_hours) || 0;
  const note = current
    ? `${period.shift_count} ${t('shifts', lang)} · ${Math.max(daysLeftInPeriod(period.date_to), 0)} ${t('daysLeft', lang)}`
    : pending > 0 ? `${formatHours(period.pending_hours)} ${t('pendingLower', lang)}` : '';
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, py: 0.5 }}>
      <Typography noWrap sx={{ fontSize: 13.5, fontWeight: current ? 800 : 650, color: dutyColors.ink }}>
        {period.label}
      </Typography>
      <Typography noWrap sx={{ flex: 1, minWidth: 0, fontSize: 12, color: current || !pending ? dutyColors.ink40 : dutyColors.amberInk }}>
        {note}
      </Typography>
      <Typography sx={{ fontSize: current ? 16 : 13.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: dutyColors.ink }}>
        {formatHours(period.total_hours)} h
      </Typography>
      {showPay ? (
        <Typography sx={{ width: 76, textAlign: 'right', fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: dutyColors.brandDark }}>
          {money(period.total_pay)}
        </Typography>
      ) : null}
    </Box>
  );
}

const ROW_PX = 45;
const MORE_PX = 36;

/**
 * How many shift rows fit in `ref`'s height without scrolling, leaving room for the "More
 * shifts" button when some are left over. Null until measured (or without ResizeObserver).
 */
function useFitCount(ref: RefObject<HTMLDivElement | null>, total: number, enabled: boolean): number | null {
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (!enabled || !node || typeof ResizeObserver === 'undefined') return;
    setHeight(node.clientHeight);
    const observer = new ResizeObserver((items) => setHeight(items[0]?.contentRect.height ?? null));
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, enabled]);
  if (!enabled || height == null) return null;
  if (total * ROW_PX + 2 <= height) return total;
  return Math.max(1, Math.floor((height - 2 - MORE_PX) / ROW_PX));
}

/**
 * Hours & pay on Today: the week's hours with a tag for anything that needs a look, then the
 * pay period, past periods and recent shifts (a shift opens a time change request). Open by
 * default; `?hours=0` keeps it folded. With `fill` (desk) it stretches to the bottom of the
 * column, level with To do today, and shows as many shifts as fit; "More shifts" scrolls.
 */
export function HoursPayPanel({ fill = false }: { fill?: boolean }) {
  const { user } = useAuth();
  const lang = user?.language === 'es' ? 'es' : 'en';
  const [params, setParams] = useSearchParams();
  const open = params.get('hours') !== '0';
  const weekly = useWeeklyHoursStatus();
  const pay = useMyPay();
  const entries = useTimeEntries(
    user?.id ? { employee: user.id, page_size: 10, ordering: '-date,-clock_in' } : undefined,
    { enabled: Boolean(user?.id) },
  );
  const changes = useModificationRequests(user?.id ? { employee: user.id, status: 'pending', page_size: 1 } : undefined);
  const [showPay, setShowPay] = useState(false);
  const [allShifts, setAllShifts] = useState(false);
  const [changeEntry, setChangeEntry] = useState<TimeEntry | null>(null);
  const shiftsRef = useRef<HTMLDivElement | null>(null);

  const week = weekly.data;
  const level = weekLevel(week);
  const rows = entries.data?.results ?? [];
  const alerts = hoursAlerts(week, rows, changes.data?.count ?? 0, lang);
  const periods = pay.data ?? [];
  const current = periods.find((row) => row.is_current);
  // Empty periods (no hours) are noise; show the last three that had work.
  const past = periods.filter((row) => !row.is_current && parseFloat(row.total_hours) > 0).slice(0, 3);
  const pct = week && parseFloat(week.hours_limit) > 0
    ? Math.min(parseFloat(week.hours_worked) / parseFloat(week.hours_limit), 1) * 100
    : 0;
  const togglePay = () => setShowPay((value) => !value);
  const stretch = fill && open;
  const fit = useFitCount(shiftsRef, Math.min(rows.length, 10), stretch);

  function toggle() {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (open) next.set('hours', '0');
      else next.delete('hours');
      return next;
    }, { replace: true });
  }

  const body = (
    <Box
      sx={{
        px: 2,
        pb: 2,
        borderTop: `1px solid ${dutyColors.ink08}`,
        ...(stretch ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } : {}),
      }}
    >
      {level === 'at' || level === 'over' ? (
        <Typography sx={{ mt: 1.25, fontSize: 13, fontWeight: 700, color: dutyColors.red }}>
          {weekStatusLine(week, false, 0, lang).text}
        </Typography>
      ) : null}

      <Box sx={{ display: 'flex', alignItems: 'center', mt: 1.25 }}>
        <Typography sx={{ ...eyebrowSx, flex: 1 }}>{t('currentPeriod', lang)}</Typography>
        <Button size="small" onClick={togglePay} sx={{ minWidth: 0, px: 0.75, fontSize: 12, fontWeight: 700 }}>
          {t(showPay ? 'hidePay' : 'showPay', lang)}
        </Button>
      </Box>
      {current ? (
        <PeriodLine period={current} showPay={showPay} lang={lang} current />
      ) : pay.isLoading ? <Skeleton variant="rounded" height={28} sx={{ my: 0.5 }} /> : (
        <Typography sx={{ py: 0.5, fontSize: 13, color: dutyColors.ink40 }}>-</Typography>
      )}

      {past.length ? (
        <>
          <Typography sx={{ ...eyebrowSx, mt: 1 }}>{t('pastPeriods', lang)}</Typography>
          {past.map((period) => (
            <PeriodLine key={period.date_from} period={period} showPay={showPay} lang={lang} />
          ))}
        </>
      ) : null}

      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 1.25, mb: 0.75 }}>
        <Typography sx={eyebrowSx}>{t('recentShifts', lang)}</Typography>
        <Typography noWrap sx={{ fontSize: 12, color: dutyColors.ink40 }}>{t('tapShiftToChange', lang)}</Typography>
      </Box>
      {/* Desk: the list takes what is left; it fits without a scroll bar until "More shifts". */}
      <Box
        ref={shiftsRef}
        sx={stretch ? { flex: 1, minHeight: 0, overflowY: allShifts ? 'auto' : 'hidden', ...thinScrollSx } : undefined}
      >
        <RecentShiftsList
          entries={rows}
          loading={entries.isLoading}
          onPick={setChangeEntry}
          lang={lang}
          limit={stretch ? fit ?? 5 : 5}
          all={allShifts}
          onToggleAll={() => setAllShifts((value) => !value)}
        />
      </Box>
    </Box>
  );

  return (
    <Box
      sx={{
        bgcolor: dutyColors.card,
        border: `1px solid ${level === 'ok' ? dutyColors.ink15 : LEVEL_BAR[level]}`,
        borderRadius: '12px',
        overflow: 'hidden',
        ...(stretch
          ? { flex: '1 1 0', minHeight: 300, display: 'flex', flexDirection: 'column' }
          : { flexShrink: 0 }),
      }}
    >
      <Box
        component="button"
        type="button"
        aria-expanded={open}
        onClick={toggle}
        sx={{
          width: '100%',
          display: 'block',
          flexShrink: 0,
          px: 2,
          pt: 1.5,
          pb: 1.5,
          border: 'none',
          background: 'none',
          font: 'inherit',
          textAlign: 'left',
          cursor: 'pointer',
          '&:hover': { bgcolor: dutyColors.brandTint },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', minHeight: 22 }}>
          <Typography sx={{ ...eyebrowSx, flex: '1 0 auto' }}>{t('hoursAndPay', lang)}</Typography>
          {alerts.map((alert) => <StatusTag key={alert.key} small label={alert.label} tone={alert.tone} />)}
          <ExpandMoreRounded
            sx={{
              fontSize: 22,
              color: dutyColors.ink40,
              transform: open ? 'rotate(180deg)' : 'none',
              transition: 'transform 160ms ease',
            }}
          />
        </Box>
        {weekly.isLoading && !week ? (
          <Skeleton variant="text" width={180} height={30} />
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, mt: 0.25 }}>
            <Typography sx={{ fontSize: 22, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: dutyColors.ink }}>
              {formatHours(week?.hours_worked ?? '0')}
            </Typography>
            <Typography sx={{ fontSize: 13, color: dutyColors.ink40, fontVariantNumeric: 'tabular-nums' }}>
              / {formatHours(week?.hours_limit ?? '40')} h · {t('thisWeek', lang).toLowerCase()}
            </Typography>
            {level === 'ok' || level === 'near' ? (
              <Typography sx={{ ml: 'auto', fontSize: 13, fontWeight: 700, color: level === 'near' ? dutyColors.amberInk : dutyColors.ink60, fontVariantNumeric: 'tabular-nums' }}>
                {formatHours(week?.hours_remaining ?? '0')} {t('hLeft', lang)}
              </Typography>
            ) : null}
          </Box>
        )}
        <Box sx={{ mt: 0.75, height: 6, borderRadius: 99, bgcolor: dutyColors.ink08, overflow: 'hidden' }}>
          <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: LEVEL_BAR[level], borderRadius: 99 }} />
        </Box>
      </Box>

      {/* Desk fills the column, so it cannot animate its height; the phone folds smoothly. */}
      {fill ? (open ? body : null) : (
        <Collapse in={open} unmountOnExit>{body}</Collapse>
      )}
      <TimeChangeDialog entry={changeEntry} onClose={() => setChangeEntry(null)} />
    </Box>
  );
}

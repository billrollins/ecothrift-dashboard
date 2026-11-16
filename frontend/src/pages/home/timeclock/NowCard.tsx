/**
 * TimeClock > Now (Dash Updates #137, #179): clock in, break, clock out, and this week's hours against the limit.
 * Clocked out, the shifts of today's scheduled department are the buttons (one big "Clock in · Office" when there is
 * only one); every other shift is under Other shift. With nothing scheduled today, every shift is a button. Every
 * punch asks again first (owner, 2026-11-02). The week's line keeps its room whatever it says (no layout shift).
 */
import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { format } from 'date-fns';
import { es as esLocale } from 'date-fns/locale';
import { useState } from 'react';
import type { ScheduledShift } from '../../../api/schedule.api';
import { ClockInLimitDialog } from '../../../components/hr/ClockInLimitDialog';
import { ShiftHeroCard } from '../../../components/hr/ShiftHeroCard';
import { DEPT_TONE, ShiftMenu, useClockGroups, type ClockGroup } from '../../../components/hr/ShiftPicker';
import { PunchConfirmDialog, type PunchAsk } from '../../../components/layout/ClockPill';
import type { Tone } from '../../../components/page/PageKit';
import { MicroLabel, useToneText } from '../../../components/page/RichKit';
import { ClockOutRoutineGuard } from '../../../components/routines/ClockOutRoutineGuard';
import { PunchActions } from '../../../components/routines/today/PunchActions';
import type { HoursNag } from '../../../hooks/useHoursNag';
import type { MyPeriod, WeeklyHoursStatus } from '../../../types/hr.types';
import type { useTimeClockActions } from '../../hr/useTimeClockActions';
import { useTimeClockCopy } from './copy';
import { Panel } from './Panel';
import { weekWarning, type WeekTone } from './weekHours';

interface Choice { key: string; label: string; dept: string }

/** The clock-in buttons: today's scheduled department's shifts, or every shift when nothing is scheduled today. */
export function clockInChoices(groups: ClockGroup[], todays: ScheduledShift[], lang: string): { primary: Choice[]; others: boolean } {
  const scheduled = new Set(todays.map((s) => s.department_name.trim().toLowerCase()).filter(Boolean));
  const mine = groups.filter((g) => scheduled.has(g.en.trim().toLowerCase()));
  const flat = (list: ClockGroup[]) => list.flatMap((g) => g.shifts.map((s) => ({ key: s.key, label: lang === 'es' ? s.es : s.en, dept: g.key })));
  if (!mine.length) return { primary: flat(groups), others: false };
  return { primary: flat(mine), others: mine.length < groups.length };
}

function QuickClockIn({ todays, pending, onPick }: {
  todays: ScheduledShift[];
  pending: boolean;
  onPick: (shift: string, label: string) => void;
}) {
  const { tc, lang } = useTimeClockCopy();
  const groups = useClockGroups();
  const { primary, others } = clockInChoices(groups, todays, lang);
  const [menuEl, setMenuEl] = useState<HTMLElement | null>(null);
  const labelOf = (key: string) => groups.flatMap((g) => g.shifts).find((s) => s.key === key);
  const single = others && primary.length === 1 ? primary[0] : null;

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ minHeight: 28 }}>
        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'grey.400', flexShrink: 0 }} />
        <Typography sx={{ fontSize: '1.0625rem', fontWeight: 800, flex: 1, minWidth: 0 }} noWrap>{tc('notClockedIn')}</Typography>
        <Typography noWrap sx={{ fontSize: '0.8125rem', fontWeight: 700, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
          {todays.length ? tc('scheduledToday', { t: todays.map((s) => s.text).join(', ') }) : ''}
        </Typography>
      </Stack>
      {single ? (
        <Button
          fullWidth
          variant="contained"
          disabled={pending}
          onClick={() => onPick(single.key, single.label)}
          data-testid="clock-in-primary"
          sx={{ mt: 1.5, height: 52, fontSize: '1rem', fontWeight: 800 }}
        >
          {pending ? <CircularProgress size={18} sx={{ color: 'inherit' }} /> : tc('clockInAs', { shift: single.label })}
        </Button>
      ) : (
        <Box sx={{ mt: 1.5, display: 'grid', gap: 1, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          {primary.map((c) => {
            const tone = DEPT_TONE[c.dept] ?? DEPT_TONE.retail;
            return (
              <Box
                key={c.key}
                component="button"
                type="button"
                disabled={pending}
                onClick={() => onPick(c.key, c.label)}
                sx={{
                  height: 44, px: 1.5, borderRadius: '10px', border: 1, borderColor: 'divider', borderLeft: `4px solid ${tone.accent}`,
                  bgcolor: tone.tint, color: 'text.primary', fontFamily: 'inherit', fontSize: '0.84375rem', fontWeight: 800, textAlign: 'left',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: pending ? 'default' : 'pointer',
                  '&:hover': pending ? undefined : { borderColor: tone.accent },
                }}
              >
                {c.label}
              </Box>
            );
          })}
        </Box>
      )}
      {/* The link's room is kept with or without it, so the week's hours never move. */}
      <Box sx={{ mt: 0.5, minHeight: 30, textAlign: 'right' }}>
        {others ? (
          <Button size="small" color="inherit" onClick={(e) => setMenuEl(e.currentTarget)} sx={{ color: 'text.secondary' }}>
            {tc('otherShift')}
          </Button>
        ) : null}
      </Box>
      <ShiftMenu
        anchorEl={menuEl}
        lang={lang}
        onClose={() => setMenuEl(null)}
        onPick={(key) => {
          setMenuEl(null);
          const found = labelOf(key);
          onPick(key, found ? (lang === 'es' ? found.es : found.en) : key);
        }}
      />
    </Box>
  );
}

const BAR_KEY: Record<WeekTone, 'primary' | 'warning' | 'error'> = { quiet: 'primary', wait: 'warning', problem: 'error' };
const TEXT_TONE: Record<WeekTone, Tone> = { quiet: 'quiet', wait: 'wait', problem: 'problem' };
const short = (n: number) => String(Number(n.toFixed(2)));

/** This week: hours against what they are cleared for, a bar, and one line (hours left, or the overtime warning). */
function WeekHours({ week, nag, clock, period }: {
  week: WeeklyHoursStatus | undefined;
  nag: HoursNag;
  clock: ReturnType<typeof useTimeClockActions>;
  period: MyPeriod | undefined;
}) {
  const theme = useTheme();
  const { tc, lang } = useTimeClockCopy();
  const { worked, limit, tone, text } = weekWarning(week, nag, clock.entry, period, tc, lang);
  const toneText = useToneText(TEXT_TONE[tone]);
  const pct = limit > 0 ? Math.min(worked / limit, 1) * 100 : 0;
  return (
    <Box data-testid="week-hours" sx={{ pt: 1.5, borderTop: 1, borderColor: 'grey.100' }}>
      <Stack direction="row" alignItems="baseline" justifyContent="space-between">
        <MicroLabel>{tc('thisWeek')}</MicroLabel>
        <Typography sx={{ fontSize: '0.9375rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
          {week ? tc('weekOf', { worked: worked.toFixed(2), limit: short(limit) }) : ' '}
        </Typography>
      </Stack>
      <Box
        role="progressbar"
        aria-label={tc('thisWeek')}
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        sx={{ mt: 0.75, height: 8, borderRadius: 99, bgcolor: 'grey.200', overflow: 'hidden' }}
      >
        <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: theme.palette[BAR_KEY[tone]].main, borderRadius: 99, transition: 'width 300ms ease' }} />
      </Box>
      <Typography
        role={tone === 'problem' ? 'alert' : undefined}
        data-testid="week-warning"
        sx={{ mt: 0.75, minHeight: 36, fontSize: '0.8125rem', lineHeight: 1.4, fontWeight: tone === 'quiet' ? 600 : 800, color: tone === 'quiet' ? 'text.secondary' : toneText }}
      >
        {tone === 'quiet' ? (week ? tc('hLeftShort', { left: short(Math.max(limit - worked, 0)) }) : '') : text}
      </Typography>
    </Box>
  );
}

export function NowCard({ clock, week, nag, period, todays }: {
  clock: ReturnType<typeof useTimeClockActions>;
  week: WeeklyHoursStatus | undefined;
  nag: HoursNag;
  period: MyPeriod | undefined;
  /** Today's shifts on my schedule. */
  todays: ScheduledShift[];
}) {
  const { tc, lang } = useTimeClockCopy();
  const [ask, setAsk] = useState<PunchAsk>(null);
  const clockedIn = Boolean(clock.entry);
  const today = format(new Date(), 'EEE, MMM d', lang === 'es' ? { locale: esLocale } : undefined);

  return (
    <Panel testId="time-clock-card" title={tc('now')} meta={today}>
      <Box sx={{ px: 2, pb: 1.5, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 1.5 }}>
        <ShiftHeroCard
          bare
          entry={clock.entry}
          weekly={week}
          lang={lang}
          picker={<QuickClockIn todays={todays} pending={clock.pending.clockIn} onPick={(shift, label) => setAsk({ kind: 'in', shift, label })} />}
          onClockIn={(shift, label) => setAsk({ kind: 'in', shift, label })}
          pendingClockIn={clock.pending.clockIn}
          onSetShift={clock.setShift}
          onFixForgotten={(at) => { void clock.fixForgotten(at); }}
          pendingFix={clock.pending.fix}
          actions={clockedIn ? (
            <PunchActions
              onBreak={clock.onBreak}
              pendingBreak={clock.pending.break}
              pendingClockOut={clock.pending.clockOut}
              onToggleBreak={() => { void clock.toggleBreak(); }}
              onClockOut={() => setAsk({ kind: 'out' })}
              lang={lang}
            />
          ) : undefined}
        />
        <WeekHours week={week} nag={nag} clock={clock} period={period} />
      </Box>
      <PunchConfirmDialog
        ask={ask}
        busy={clock.pending.clockIn || clock.pending.clockOut}
        onCancel={() => setAsk(null)}
        onConfirm={(confirmed) => {
          setAsk(null);
          if (confirmed.kind === 'out') void clock.clockOut();
          else void clock.clockIn(confirmed.shift);
        }}
      />
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
        onClose={clock.closeGuard}
        onClockOut={() => { void clock.clockOut(); }}
      />
    </Panel>
  );
}

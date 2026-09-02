/**
 * Five numbers across the top of Users.
 *
 * The strip is a fixed slot. Five cells are always painted whichever tab is
 * open, and every cell shows an em-dash until its number lands, so the tab bar
 * and the table underneath never move while the counts load.
 */
import type { ReactNode } from 'react';
import { Box, Card, Stack, Tooltip, Typography } from '@mui/material';
import type { CustomerStats, EmployeeStats } from '../../../api/accounts.api';

export const STATS_STRIP_HEIGHT = 74;

const NOT_YET = '-';

function num(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : NOT_YET;
}

type Tone = 'neutral' | 'good' | 'warn';

const TONE_COLOR: Record<Tone, string> = {
  neutral: 'text.primary',
  good: 'success.main',
  warn: 'warning.main',
};

function Metric({
  label,
  value,
  sub,
  tone = 'neutral',
  hint,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: Tone;
  hint?: string;
}) {
  const cell = (
    <Stack spacing={0} sx={{ minWidth: 92, flexShrink: 0 }}>
      <Typography
        sx={{
          fontSize: '0.62rem',
          fontWeight: 800,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          color: 'text.secondary',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: '1.2rem',
          fontWeight: 800,
          lineHeight: 1.2,
          fontVariantNumeric: 'tabular-nums',
          color: TONE_COLOR[tone],
        }}
      >
        {value}
      </Typography>
      <Typography
        variant="caption"
        sx={{ color: 'text.secondary', whiteSpace: 'nowrap', fontSize: '0.66rem' }}
      >
        {sub}
      </Typography>
    </Stack>
  );
  return hint ? (
    <Tooltip title={hint} enterDelay={300}>
      {cell}
    </Tooltip>
  ) : (
    cell
  );
}

function Divider() {
  return (
    <Box
      sx={{
        display: { xs: 'none', md: 'block' },
        alignSelf: 'stretch',
        width: '1px',
        bgcolor: 'divider',
      }}
    />
  );
}

function Strip({ children }: { children: ReactNode }) {
  return (
    <Card
      variant="outlined"
      sx={{
        height: STATS_STRIP_HEIGHT,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={{ xs: 1.5, md: 3 }}
        divider={<Divider />}
        sx={{ px: 2, py: 1, overflow: 'hidden' }}
      >
        {children}
      </Stack>
    </Card>
  );
}

function monthTrend(now: number | undefined, before: number | undefined): string {
  if (typeof now !== 'number' || typeof before !== 'number') return 'this month';
  if (before === 0) return now > 0 ? 'first of the year' : 'none last month';
  const delta = now - before;
  if (delta === 0) return 'same as last month';
  return `${delta > 0 ? '+' : ''}${delta} vs last month`;
}

export function CustomerStatsStrip({ stats }: { stats?: CustomerStats | null }) {
  return (
    <Strip>
      <Metric
        label="Customers"
        value={num(stats?.active)}
        sub={stats ? `${stats.inactive} inactive` : 'active accounts'}
      />
      <Metric
        label="New"
        value={num(stats?.new_this_month)}
        sub={monthTrend(stats?.new_this_month, stats?.new_last_month)}
      />
      <Metric
        label="Verified"
        value={stats ? `${stats.verified_pct}%` : NOT_YET}
        sub={stats ? `${stats.verified} can be emailed` : 'of active'}
        tone={stats && stats.verified_pct < 50 ? 'warn' : 'neutral'}
        hint="Share of active customers who have proven their email address."
      />
      <Metric label="Holds" value={num(stats?.holds_this_month)} sub="this month" />
      <Metric
        label="Needs reply"
        value={num(stats?.needs_reply)}
        sub={stats?.needs_reply ? 'waiting on us' : 'inbox clear'}
        tone={stats?.needs_reply ? 'warn' : 'good'}
        hint="Message threads where Eco-Thrift owes the customer an answer."
      />
    </Strip>
  );
}

export function EmployeeStatsStrip({ stats }: { stats?: EmployeeStats | null }) {
  return (
    <Strip>
      <Metric
        label="On the clock"
        value={num(stats?.on_the_clock)}
        sub={stats?.on_the_clock ? 'clocked in now' : 'nobody clocked in'}
        tone={stats?.on_the_clock ? 'good' : 'neutral'}
        hint="People with an open time entry right now."
      />
      <Metric
        label="Staff"
        value={num(stats?.active)}
        sub={stats ? `${stats.inactive} inactive` : 'active accounts'}
      />
      <Metric
        label="Roles"
        value={stats ? `${stats.admins}/${stats.managers}/${stats.employees}` : NOT_YET}
        sub="admin / mgr / staff"
        hint="Active accounts by role."
      />
      <Metric label="New hires" value={num(stats?.new_hires_90d)} sub="last 90 days" />
      <Metric
        label="No password"
        value={num(stats?.no_password)}
        sub={stats?.no_password ? 'cannot sign in' : 'everyone can sign in'}
        tone={stats?.no_password ? 'warn' : 'good'}
        hint="Active staff with no usable password. Send them a reset link."
      />
    </Strip>
  );
}

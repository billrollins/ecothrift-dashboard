/**
 * Shared parts for the Users surfaces.
 *
 * Both directories draw people the same way - an initials disc, the name over
 * one line of context - and both drawers stack the same fixed-height fact rows,
 * so a record with nothing in a field is the same size as one that is full.
 */
import type { ReactNode } from 'react';
import { Avatar, Box, Chip, Stack, Tooltip, Typography } from '@mui/material';

export const DASH = '-';

/** Fact rows keep this height whether or not there is a value. */
export const FACT_MIN_HEIGHT = 34;

export function initials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Stable per-person hue so the same face keeps the same colour between visits. */
function hue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

export function PersonAvatar({
  name,
  seed,
  muted = false,
  size = 32,
}: {
  name: string;
  seed: string;
  muted?: boolean;
  size?: number;
}) {
  const h = hue(seed || name);
  return (
    <Avatar
      sx={{
        width: size,
        height: size,
        fontSize: size <= 32 ? '0.72rem' : '0.95rem',
        fontWeight: 700,
        flexShrink: 0,
        color: muted ? 'text.disabled' : `hsl(${h} 45% 28%)`,
        bgcolor: muted ? 'action.disabledBackground' : `hsl(${h} 55% 90%)`,
      }}
    >
      {initials(name)}
    </Avatar>
  );
}

/** Avatar plus a two-line identity block. Both lines always render. */
export function PersonCell({
  name,
  secondary,
  seed,
  muted = false,
  trailing,
}: {
  name: string;
  secondary: string;
  seed: string;
  muted?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0, width: '100%' }}>
      <PersonAvatar name={name || '?'} seed={seed} muted={muted} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
          <Typography
            variant="body2"
            noWrap
            sx={{ fontWeight: 600, color: muted ? 'text.secondary' : 'text.primary' }}
          >
            {name || 'Unnamed'}
          </Typography>
          {trailing}
        </Stack>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
          {secondary || DASH}
        </Typography>
      </Box>
    </Stack>
  );
}

/**
 * A state chip that is always present and only changes colour and wording.
 * Never conditionally rendered - that would resize the cell.
 */
export function StateChip({
  label,
  tone,
  hint,
}: {
  label: string;
  tone: 'good' | 'warn' | 'muted';
  hint?: string;
}) {
  const chip = (
    <Chip
      size="small"
      label={label}
      variant="outlined"
      color={tone === 'good' ? 'success' : tone === 'warn' ? 'warning' : 'default'}
      sx={{ fontWeight: 600, ...(tone === 'muted' ? { color: 'text.secondary' } : {}) }}
    />
  );
  return hint ? (
    <Tooltip title={hint} enterDelay={300}>
      {chip}
    </Tooltip>
  ) : (
    chip
  );
}

/** Two-line stacked cell for a number over its context. */
export function StackCell({ top, bottom }: { top: string; bottom: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography
        variant="body2"
        noWrap
        sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
      >
        {top}
      </Typography>
      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
        {bottom}
      </Typography>
    </Box>
  );
}

/** Label-left, value-right row at a fixed height. Empty reads as an em-dash. */
export function Fact({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  tone?: 'neutral' | 'good' | 'warn' | 'muted';
}) {
  const color =
    tone === 'good' ? 'success.main'
      : tone === 'warn' ? 'warning.main'
        : tone === 'muted' ? 'text.secondary'
          : 'text.primary';
  const empty = value == null || value === '' ;
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      sx={{ minHeight: FACT_MIN_HEIGHT, borderBottom: 1, borderColor: 'divider' }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, minWidth: 118 }}>
        {label}
      </Typography>
      <Box sx={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
        {typeof value === 'string' || typeof value === 'number' || empty ? (
          <Typography
            variant="body2"
            noWrap
            sx={{ fontWeight: 600, color: empty ? 'text.disabled' : color }}
          >
            {empty ? DASH : value}
          </Typography>
        ) : (
          value
        )}
      </Box>
    </Stack>
  );
}

export function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box sx={{ mb: 2.5 }}>
      <Typography
        variant="caption"
        sx={{
          display: 'block',
          fontWeight: 800,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          color: 'text.secondary',
          mb: 0.75,
        }}
      >
        {title}
      </Typography>
      {children}
    </Box>
  );
}

export function formatDay(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "3y 2m" / "5 months" / "new today" from a start date. */
export function tenureFrom(start: string | null | undefined): string {
  if (!start) return '';
  const from = new Date(start);
  if (Number.isNaN(from.getTime())) return '';
  const months = Math.max(
    0,
    (new Date().getFullYear() - from.getFullYear()) * 12 + (new Date().getMonth() - from.getMonth()),
  );
  if (months < 1) return 'new this month';
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest ? `${years}y ${rest}m` : `${years} year${years === 1 ? '' : 's'}`;
}

/** "today" / "3 days ago" / a date once it is far enough back. */
export function relativeDay(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return formatDay(value);
}

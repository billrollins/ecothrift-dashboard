/** Shared presentation for the Online Sales area.
 *
 * Every panel used to invent its own status chips, date format, and DataGrid
 * styling, so the same hold read differently on each tab. Labels, colours,
 * dates, and grid chrome live here instead.
 */
import type { ReactNode } from 'react';
import { Box, Chip, Stack, Tooltip, Typography, type SxProps, type Theme } from '@mui/material';
import type { GridColDef } from '@mui/x-data-grid';
import { format } from 'date-fns';
import { Link as RouterLink } from 'react-router-dom';
import type { Reservation, ReservationTimelineEntry } from '../../api/webstore.api';

/** Deep-link a hold's thread into Customers → Messages. */
export function messagesHrefForHold(row: Pick<Reservation, 'conversation_id'>): string | null {
  if (!row.conversation_id) return null;
  return `/online-sales/messages?thread=${row.conversation_id}`;
}

type ChipColor = 'default' | 'primary' | 'success' | 'warning' | 'info' | 'error';

type StatusMeta = { label: string; color: ChipColor };

/** Staff-facing hold labels. These are the words used at the counter, not the
 *  raw state names - "Needs pull" beats "Requested" when you are picking. */
const HOLD_STATUS_META: Record<string, StatusMeta> = {
  pending_verification: { label: 'Awaiting email', color: 'warning' },
  requested: { label: 'Needs pull', color: 'info' },
  confirmed: { label: 'Pulling', color: 'info' },
  ready_for_pickup: { label: 'Ready', color: 'success' },
  completed: { label: 'Completed', color: 'success' },
  declined: { label: 'Declined', color: 'error' },
  expired: { label: 'Expired', color: 'default' },
  cancelled: { label: 'Cancelled', color: 'default' },
};

const THREAD_STATE_META: Record<string, StatusMeta> = {
  pending_verification: { label: 'Unverified', color: 'default' },
  needs_reply: { label: 'Needs reply', color: 'warning' },
  waiting_on_customer: { label: 'Waiting on customer', color: 'info' },
  resolved: { label: 'Resolved', color: 'success' },
};

const LISTING_STATUS_META: Record<string, StatusMeta> = {
  draft: { label: 'Draft', color: 'default' },
  ready: { label: 'Ready', color: 'info' },
  published: { label: 'Published', color: 'success' },
  paused: { label: 'Paused', color: 'warning' },
  sold: { label: 'Sold', color: 'error' },
  archived: { label: 'Archived', color: 'default' },
};

/** Title-cases an unmapped snake_case value so nothing renders raw. */
export function humanize(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function meta(map: Record<string, StatusMeta>, value: string): StatusMeta {
  return map[value] || { label: humanize(value || '-'), color: 'default' };
}

/** Staff-facing timeline labels - keep aligned with STAFF_TIMELINE_LABELS in
 *  apps/webstore/serializers.py. */
export const HOLD_EVENT_LABELS: Record<string, string> = {
  requested: 'Hold requested',
  verified: 'Email verified',
  confirmed: 'Pulled for hold',
  staged: 'Marked ready',
  extended: 'Extended',
  completed: 'Completed',
  declined: 'Declined',
  expired: 'No-show / expired',
  cancelled: 'Cancelled',
  reopened: 'Reopened',
  note: 'Staff note',
};

function StatusTimelineTooltip({ timeline }: { timeline: ReservationTimelineEntry[] }) {
  return (
    <Box sx={{ minWidth: 260, maxWidth: 320 }}>
      <Typography
        variant="caption"
        sx={{
          display: 'block',
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'text.secondary',
          mb: 1,
        }}
      >
        Timeline
      </Typography>
      <Stack spacing={0}>
        {timeline.map((ev, index) => (
          <Box
            key={`${ev.kind}-${ev.created_at}-${index}`}
            sx={{
              py: 0.75,
              borderTop: index === 0 ? 0 : '1px solid',
              borderColor: 'divider',
            }}
          >
            <Stack
              direction="row"
              spacing={1}
              justifyContent="space-between"
              alignItems="baseline"
              gap={1}
            >
              <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                {ev.label || HOLD_EVENT_LABELS[ev.kind] || humanize(ev.kind)}
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: 'text.secondary', whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                {fmtWhen(ev.created_at)}
              </Typography>
            </Stack>
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
              {ev.actor_name || 'System'}
            </Typography>
            {ev.note?.trim() ? (
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  mt: 0.25,
                  color: 'text.secondary',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {ev.note.trim()}
              </Typography>
            ) : null}
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

export function HoldStatusChip({
  status,
  timeline,
}: {
  status: string;
  timeline?: ReservationTimelineEntry[] | null;
}) {
  const { label, color } = meta(HOLD_STATUS_META, status);
  const chip = (
    <Chip
      size="small"
      label={label}
      color={color}
      variant="outlined"
      sx={{ cursor: timeline?.length ? 'help' : undefined }}
    />
  );
  if (!timeline?.length) return chip;
  return (
    <Tooltip
      arrow
      enterDelay={250}
      leaveDelay={100}
      placement="left"
      describeChild
      title={<StatusTimelineTooltip timeline={timeline} />}
      slotProps={{
        tooltip: {
          sx: {
            maxWidth: 340,
            p: 1.5,
            bgcolor: 'background.paper',
            color: 'text.primary',
            border: '1px solid',
            borderColor: 'divider',
            boxShadow: 6,
          },
        },
        arrow: { sx: { color: 'background.paper' } },
      }}
    >
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}>
        {chip}
      </Box>
    </Tooltip>
  );
}

/** Status column shared by every holds grid - hover shows the full timeline. */
export const statusColumn: GridColDef<Reservation> = {
  field: 'status',
  headerName: 'Status',
  width: 140,
  renderCell: ({ row }) => (
    <CellCenter justify="flex-start">
      <HoldStatusChip status={row.status} timeline={row.timeline} />
    </CellCenter>
  ),
};

export function ThreadStateChip({ state }: { state: string }) {
  const { label, color } = meta(THREAD_STATE_META, state);
  return <Chip size="small" label={label} color={color} variant="outlined" />;
}

export function ListingStatusChip({ status }: { status: string }) {
  const { label, color } = meta(LISTING_STATUS_META, status);
  return <Chip size="small" label={label} color={color} variant="outlined" />;
}

/** Facebook column: Posted + last listed date, or Not posted. */
export function FacebookPostedCell({
  postedAt,
  postedUrl,
}: {
  postedAt?: string | null;
  postedUrl?: string | null;
}) {
  if (!postedAt) {
    return (
      <Typography variant="body2" color="text.disabled">
        Not posted
      </Typography>
    );
  }
  const parts = describeWhen(postedAt, new Date(), 'happened');
  const when = parts
    ? `${parts.dayLabel}${parts.timeLabel ? ` · ${parts.timeLabel}` : ''}`
    : fmtWhen(postedAt);
  return (
    <Stack spacing={0.15} sx={{ minWidth: 0 }}>
      {postedUrl ? (
        <Typography
          component="a"
          href={postedUrl}
          target="_blank"
          rel="noopener noreferrer"
          variant="body2"
          onClick={(e) => e.stopPropagation()}
          sx={{
            fontWeight: 700,
            color: 'success.dark',
            textDecoration: 'none',
            lineHeight: 1.25,
            '&:hover': { textDecoration: 'underline' },
          }}
        >
          Posted
        </Typography>
      ) : (
        <Typography
          variant="body2"
          sx={{ fontWeight: 700, color: 'success.dark', lineHeight: 1.25 }}
        >
          Posted
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary" noWrap title={parts?.title || when}>
        {when}
      </Typography>
    </Stack>
  );
}

export function holdStatusLabel(status: string): string {
  return meta(HOLD_STATUS_META, status).label;
}

/** One datetime format for the whole area. */
export function fmtWhen(value: string | number | Date | null | undefined): string {
  if (value == null || value === '') return '-';
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return '-';
  return format(d, 'MMM d, yyyy h:mm a');
}

/** Store calendar - deadlines and "today" mean Omaha business day. */
export const STORE_TZ = 'America/Chicago';

function calendarDayKey(date: Date, timeZone: string = STORE_TZ): string {
  // en-CA → YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function addCalendarDays(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return utc.toISOString().slice(0, 10);
}

function formatClock(date: Date, timeZone: string = STORE_TZ): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatShortDay(date: Date, timeZone: string = STORE_TZ): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function formatWeekday(date: Date, timeZone: string = STORE_TZ): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  }).format(date);
}

function formatCountdownShort(ms: number): string {
  if (ms <= 0) return 'Expired';
  const hours = Math.floor(ms / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (hours >= 48) {
    const days = Math.floor(hours / 24);
    return `${days}d left`;
  }
  if (hours >= 1) return `${hours}h ${mins}m left`;
  return `${mins}m left`;
}

export type WhenBucket =
  | 'expired'
  | 'today'
  | 'tomorrow'
  | 'yesterday'
  | 'soon'
  | 'recent'
  | 'other';

export type WhenParts = {
  dayLabel: string;
  timeLabel: string;
  bucket: WhenBucket;
  msUntil: number;
  title: string;
};

/** Split a timestamp into glanceable day + time, relative to the store calendar. */
export function describeWhen(
  value: string | number | Date | null | undefined,
  now: Date = new Date(),
  tone: 'deadline' | 'happened' = 'happened',
): WhenParts | null {
  if (value == null || value === '') return null;
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) return null;

  const day = calendarDayKey(date);
  const today = calendarDayKey(now);
  const tomorrow = addCalendarDays(today, 1);
  const yesterday = addCalendarDays(today, -1);
  const msUntil = date.getTime() - now.getTime();
  const timeLabel = formatClock(date);
  const title = fmtWhen(date);

  if (tone === 'deadline' && msUntil <= 0) {
    return {
      dayLabel: 'Expired',
      timeLabel: day === today ? `today · ${timeLabel}` : `${formatShortDay(date)} · ${timeLabel}`,
      bucket: 'expired',
      msUntil,
      title,
    };
  }

  if (day === today) {
    return {
      dayLabel: 'Today',
      timeLabel: tone === 'deadline' ? `${timeLabel} · ${formatCountdownShort(msUntil)}` : timeLabel,
      bucket: 'today',
      msUntil,
      title,
    };
  }
  if (day === tomorrow) {
    return {
      dayLabel: 'Tomorrow',
      timeLabel,
      bucket: 'tomorrow',
      msUntil,
      title,
    };
  }
  if (day === yesterday) {
    return {
      dayLabel: 'Yesterday',
      timeLabel,
      bucket: 'yesterday',
      msUntil,
      title,
    };
  }

  // Within a week either direction - weekday is faster to scan than a date.
  const dayDiff =
    (Date.parse(`${day}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000;
  if (dayDiff > 1 && dayDiff <= 6) {
    return {
      dayLabel: formatWeekday(date),
      timeLabel,
      bucket: 'soon',
      msUntil,
      title,
    };
  }
  if (dayDiff < -1 && dayDiff >= -6) {
    return {
      dayLabel: formatWeekday(date),
      timeLabel,
      bucket: 'recent',
      msUntil,
      title,
    };
  }

  return {
    dayLabel: formatShortDay(date),
    timeLabel,
    bucket: 'other',
    msUntil,
    title,
  };
}

function whenDayColor(bucket: WhenBucket, tone: 'deadline' | 'happened'): string {
  if (tone === 'deadline') {
    if (bucket === 'expired') return 'error.main';
    if (bucket === 'today') return 'warning.dark';
    if (bucket === 'tomorrow') return 'info.dark';
    return 'text.primary';
  }
  // Past-oriented: emphasize freshness.
  if (bucket === 'today') return 'success.dark';
  if (bucket === 'yesterday') return 'text.primary';
  return 'text.secondary';
}

/** Two-line date cell: Today / Tomorrow / weekday on top, clock underneath. */
export function WhenCell({
  value,
  tone = 'happened',
}: {
  value: string | number | Date | null | undefined;
  tone?: 'deadline' | 'happened';
}) {
  const parts = describeWhen(value, new Date(), tone);
  if (!parts) {
    return (
      <Typography variant="body2" color="text.disabled">
        -
      </Typography>
    );
  }
  return (
    <Tooltip title={parts.title} enterDelay={400}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          height: '100%',
          lineHeight: 1.2,
        }}
      >
        <Typography
          variant="body2"
          sx={{
            fontWeight: 700,
            color: whenDayColor(parts.bucket, tone),
          }}
        >
          {parts.dayLabel}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {parts.timeLabel}
        </Typography>
      </Box>
    </Tooltip>
  );
}

export const requestedAtColumn: GridColDef<Reservation> = {
  field: 'created_at',
  headerName: 'Requested',
  width: 128,
  renderCell: ({ value }) => <WhenCell value={value as string} tone="happened" />,
};

export const expiresAtColumn: GridColDef<Reservation> = {
  field: 'expires_at',
  headerName: 'Expires',
  width: 148,
  renderCell: ({ value }) => <WhenCell value={value as string} tone="deadline" />,
};

export const releasedAtColumn: GridColDef<Reservation> = {
  field: 'updated_at',
  headerName: 'Released',
  width: 128,
  renderCell: ({ value }) => <WhenCell value={value as string} tone="happened" />,
};

export const completedAtColumn: GridColDef<Reservation> = {
  field: 'completed_at',
  headerName: 'Completed',
  width: 128,
  renderCell: ({ value }) => <WhenCell value={value as string} tone="happened" />,
};

// Grid chrome moved to components/common/gridChrome so Admin > Users can wear it.
export {
  GRID_HEIGHT,
  GRID_MIN_HEIGHT,
  GRID_FILL_SX,
  PAGE_FILL_SX,
  GRID_ROW_HEIGHT,
  GRID_SX,
  GRID_SX_STATIC,
  GRID_PAGE_PROPS,
  noRowsSlot,
} from '../../components/common/gridChrome';

/** Full-cell flex wrapper so chips/pills sit on the row midline. */
function CellCenter({
  children,
  justify = 'center',
}: {
  children: ReactNode;
  justify?: 'center' | 'flex-start';
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: justify,
        width: '100%',
        height: '100%',
        minHeight: 0,
      }}
    >
      {children}
    </Box>
  );
}

/** Centered empty state, so a quiet queue reads as calm rather than broken. */
export function unreadRowClass(row: { unread?: number }): string {
  return (row.unread || 0) > 0 ? 'os-row--unread' : '';
}

/** Compact unread count - plain box so DataGrid cell clipping can't shear a Chip. */
export function UnreadCountBadge({
  count,
  title = 'Unread',
}: {
  count: number;
  title?: string;
}) {
  if (count <= 0) return null;
  return (
    <Box
      component="span"
      title={title}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 22,
        height: 22,
        px: 0.65,
        borderRadius: 999,
        bgcolor: 'error.main',
        color: 'error.contrastText',
        fontSize: '0.75rem',
        fontWeight: 700,
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      {count}
    </Box>
  );
}

/** Staff owes the next reply - matches Customers / Messages nav badges. */
export function NextActionBadge({
  title = 'Eco-Thrift owes the next reply',
}: {
  title?: string;
} = {}) {
  return (
    <Box
      component="span"
      title={title}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 22,
        height: 22,
        px: 0.65,
        borderRadius: 999,
        bgcolor: 'error.main',
        color: 'error.contrastText',
        fontSize: '0.75rem',
        fontWeight: 700,
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      !
    </Box>
  );
}

export function conversationNeedsStaffAction(state: string | undefined | null): boolean {
  return state === 'needs_reply';
}

/** Leading column: link into Customers → Messages when the hold has a thread. */
export const unreadColumn: GridColDef<Reservation> = {
  field: 'unread',
  headerName: '',
  width: 88,
  sortable: false,
  filterable: false,
  align: 'center',
  headerAlign: 'center',
  renderCell: ({ row }) => {
    const href = messagesHrefForHold(row);
    const unread = row.unread || 0;
    if (!href || (!row.has_messages && unread <= 0)) return null;
    return (
      <CellCenter>
        <Box
          component={RouterLink}
          to={href}
          onClick={(e) => e.stopPropagation()}
          title={unread > 0 ? 'Open unread messages' : 'Open messages'}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 0.5,
            minHeight: 28,
            px: unread > 0 ? 0 : 0.75,
            borderRadius: 1,
            textDecoration: 'none',
            color: unread > 0 ? 'inherit' : 'primary.main',
            fontSize: '0.75rem',
            fontWeight: 700,
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          {unread > 0 ? (
            <UnreadCountBadge count={unread} title="Customer replied - open messages" />
          ) : (
            'Messages'
          )}
        </Box>
      </CellCenter>
    );
  },
};

/** Pickup code, the thing staff read out loud. */
export const pickupCodeColumn: GridColDef<Reservation> = {
  field: 'pickup_code',
  headerName: 'Code',
  width: 110,
  align: 'center',
  headerAlign: 'center',
  renderCell: ({ row }) => {
    const code = (row.pickup_code || '').trim();
    if (!code) {
      return (
        <CellCenter>
          <Typography variant="body2" color="text.disabled">
            -
          </Typography>
        </CellCenter>
      );
    }
    return (
      <CellCenter>
        <Box
          component="span"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 72,
            px: 1,
            py: 0.35,
            borderRadius: 1,
            bgcolor: 'grey.100',
            border: '1px solid',
            borderColor: 'divider',
            fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
            fontSize: '0.8125rem',
            fontWeight: 700,
            letterSpacing: '0.14em',
            lineHeight: 1.2,
            color: 'text.primary',
          }}
        >
          {code.toUpperCase()}
        </Box>
      </CellCenter>
    );
  },
};

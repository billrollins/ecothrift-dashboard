import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO, isValid } from 'date-fns';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Collapse,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined';
import ChevronRight from '@mui/icons-material/ChevronRight';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import CheckRounded from '@mui/icons-material/CheckRounded';
import LocalShippingOutlined from '@mui/icons-material/LocalShippingOutlined';
import MenuRounded from '@mui/icons-material/MenuRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import { useDeliveryDays, useDeliveryDaysInfinite } from '../../../../hooks/useDelivery';
import { useAuth } from '../../../../hooks/useAuth';
import type { DeliveryDayDisplayState, DeliveryDaySummary } from '../../../../types/pos.types';
import {
  ecoField,
  ecoFieldBucketTone,
  ecoFieldStepAccent,
} from './ecoFieldTheme';

const PAGE_SIZE = 5;
/** ~5 dense rows visible; extra loaded rows scroll inside the section. */
const LIST_MAX_HEIGHT = 5 * 64;

type BucketTone = ReturnType<typeof ecoFieldBucketTone>;

const FUTURE_TONE = ecoFieldBucketTone('future');
const PAST_TONE = ecoFieldBucketTone('past');
const DAYS_ACCENT = ecoFieldStepAccent.days;

function formatDayLabel(dateStr: string): { weekday: string; rest: string } {
  const d = parseISO(dateStr);
  if (!isValid(d)) return { weekday: dateStr, rest: '' };
  return {
    weekday: format(d, 'EEE'),
    rest: format(d, 'MMM d'),
  };
}

/** Compact window from API times like "10:00:00" → "10:00-14:00". */
function formatDayWindow(start: string | null, end: string | null): string | null {
  const trim = (value: string | null) => (value ? value.slice(0, 5) : '');
  const from = trim(start);
  const to = trim(end);
  if (from && to) return `${from}-${to}`;
  if (from) return from;
  if (to) return to;
  return null;
}

function stateLabel(state: DeliveryDayDisplayState): string {
  switch (state) {
    case 'active':
      return 'In progress';
    case 'planned':
      return 'Planned';
    case 'completed':
      return 'Done';
    case 'cancelled':
      return 'Cancelled';
    case 'not_run':
      return 'Not run';
    default:
      return state;
  }
}

function dayStateChipSx(state: DeliveryDayDisplayState) {
  if (state === 'completed') {
    return { bgcolor: ecoField.tint, color: ecoField.greenDeep, border: `1px solid ${ecoField.green}` };
  }
  if (state === 'active') {
    return { bgcolor: ecoField.tint, color: ecoField.greenDeep };
  }
  if (state === 'cancelled' || state === 'not_run') {
    return { bgcolor: ecoField.amberTint, color: ecoField.amber };
  }
  return { bgcolor: DAYS_ACCENT.tint, color: DAYS_ACCENT.accent };
}

function rowActionLabel(state: DeliveryDayDisplayState): string {
  if (state === 'completed') return 'Done';
  if (state === 'active') return 'Resume';
  if (state === 'planned') return 'Open';
  return 'Review';
}

function DayListRow({
  day,
  onOpen,
  tone,
}: {
  day: DeliveryDaySummary;
  onOpen: (id: number) => void;
  tone: BucketTone;
}) {
  const { weekday, rest } = formatDayLabel(day.date);
  return (
    <Box
      component="button"
      type="button"
      onClick={() => onOpen(day.id)}
      sx={{
        display: 'flex',
        width: '100%',
        alignItems: 'center',
        gap: 1.25,
        px: 1.25,
        py: 1.15,
        minHeight: 64,
        border: 0,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        textAlign: 'left',
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'background-color 120ms ease',
        '&:active': { bgcolor: tone.rowHover },
        '&:last-of-type': { borderBottom: 0 },
      }}
    >
      <Box
        sx={{
          width: 44,
          height: 48,
          borderRadius: 1.5,
          bgcolor: tone.accentSoft,
          color: tone.accent,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          lineHeight: 1.05,
        }}
      >
        <Typography variant="caption" fontWeight={800} sx={{ letterSpacing: 0.3, fontSize: '0.65rem' }}>
          {weekday.toUpperCase()}
        </Typography>
        <Typography variant="body2" fontWeight={800} sx={{ fontSize: '0.85rem' }}>
          {rest || '-'}
        </Typography>
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={0.5} alignItems="center" useFlexGap flexWrap="wrap">
          <Chip
            size="small"
            label={stateLabel(day.display_state)}
            sx={{
              height: 20,
              fontSize: '0.65rem',
              fontWeight: 700,
              ...dayStateChipSx(day.display_state),
            }}
          />
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }} noWrap>
          {day.delivery_count} deliveries · {day.items_booked} items
        </Typography>
      </Box>
      <Stack alignItems="flex-end" spacing={0} sx={{ flexShrink: 0 }}>
        <Typography variant="caption" fontWeight={750} sx={{ color: tone.accent }}>
          {rowActionLabel(day.display_state)}
        </Typography>
        {day.display_state === 'completed' ? (
          <CheckRounded sx={{ color: ecoField.green, fontSize: 20 }} />
        ) : (
          <ChevronRight sx={{ color: tone.accent, opacity: 0.75, fontSize: 22 }} />
        )}
      </Stack>
    </Box>
  );
}

function DaysBucketSection({
  title,
  bucket,
  defaultOpen,
  onOpenDay,
  tone,
  icon,
}: {
  title: string;
  bucket: 'future' | 'past';
  defaultOpen: boolean;
  onOpenDay: (id: number) => void;
  tone: BucketTone;
  icon: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const query = useDeliveryDaysInfinite(
    { bucket, ...(import.meta.env.DEV ? { include_test: '1' as const } : {}) },
    PAGE_SIZE,
  );
  const days = query.data?.pages.flatMap((p) => p.results) ?? [];
  const total = query.data?.pages[0]?.count ?? 0;
  const emptyHint = `No ${title.toLowerCase()} days.`;

  return (
    <Box
      sx={{
        borderRadius: `${20}px`,
        overflow: 'hidden',
        mb: 1.5,
        border: `1.5px solid ${ecoField.line}`,
        boxShadow: '0 4px 14px rgba(20,32,26,.06)',
        bgcolor: ecoField.paper,
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        onClick={() => setOpen((v) => !v)}
        sx={{
          px: 1.25,
          py: 1,
          cursor: 'pointer',
          background: tone.headerBg,
          borderBottom: open ? '1px solid' : 0,
          borderColor: 'divider',
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: 1.25,
              bgcolor: tone.accentSoft,
              color: tone.accent,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            {icon}
          </Box>
          <Box>
            <Typography fontWeight={800} sx={{ color: tone.accent, lineHeight: 1.2 }}>
              {title}
            </Typography>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              {query.isLoading ? 'Loading…' : `${total} day${total === 1 ? '' : 's'}`}
            </Typography>
          </Box>
        </Stack>
        <IconButton
          size="small"
          aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          sx={{ color: tone.accent }}
        >
          {open ? <ExpandLess /> : <ExpandMore />}
        </IconButton>
      </Stack>
      <Collapse in={open}>
        {query.isLoading && (
          <Typography color="text.secondary" sx={{ px: 1.5, py: 1.5 }}>
            Loading…
          </Typography>
        )}
        {!query.isLoading && days.length === 0 && (
          <Typography color="text.secondary" sx={{ px: 1.5, py: 1.75 }}>
            {emptyHint}
          </Typography>
        )}
        {days.length > 0 && (
          <>
            <Box
              sx={{
                maxHeight: LIST_MAX_HEIGHT,
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              {days.map((day) => (
                <DayListRow key={day.id} day={day} onOpen={onOpenDay} tone={tone} />
              ))}
            </Box>
            {query.hasNextPage && (
              <Box sx={{ p: 1.25, bgcolor: tone.headerBg }}>
                <Button
                  fullWidth
                  size="medium"
                  variant="contained"
                  disableElevation
                  disabled={query.isFetchingNextPage}
                  onClick={() => void query.fetchNextPage()}
                  sx={{
                    minHeight: 44,
                    textTransform: 'none',
                    fontWeight: 700,
                    bgcolor: tone.accent,
                    '&:hover': { bgcolor: tone.accent, filter: 'brightness(0.92)' },
                  }}
                >
                  {query.isFetchingNextPage
                    ? 'Loading…'
                    : `Load more · ${Math.max(0, total - days.length)} left`}
                </Button>
              </Box>
            )}
          </>
        )}
      </Collapse>
    </Box>
  );
}

function TodayHeroCard({
  today,
  onOpen,
}: {
  today: DeliveryDaySummary;
  onOpen: () => void;
}) {
  const { weekday, rest } = formatDayLabel(today.date);
  const windowLabel = formatDayWindow(today.time_start, today.time_end);
  const done = today.display_state === 'completed';
  const showPlay = today.display_state === 'planned' || today.display_state === 'active';
  const actionLabel =
    today.display_state === 'active'
      ? 'Resume day'
      : today.display_state === 'planned'
        ? 'Start today'
        : done
          ? 'View summary'
          : 'Open day';

  return (
    <Box
      component="button"
      type="button"
      onClick={onOpen}
      sx={{
        display: 'block',
        width: '100%',
        border: done ? `1.5px solid ${ecoField.green}` : 0,
        p: 0,
        mb: 2,
        textAlign: 'left',
        cursor: 'pointer',
        fontFamily: 'inherit',
        borderRadius: 3,
        overflow: 'hidden',
        background: done ? ecoField.tint : ecoField.ink,
        boxShadow: ecoField.shadow,
        color: done ? ecoField.ink : '#fff',
        transition: 'transform 120ms ease, box-shadow 120ms ease',
        '&:active': {
          transform: 'scale(0.985)',
          boxShadow: '0 6px 16px rgba(20,32,26,.18)',
        },
      }}
    >
      <Box sx={{ p: 2, pb: 1.75, position: 'relative' }}>
        {!done && (
          <Box
            sx={{
              position: 'absolute',
              right: -18,
              top: -22,
              width: 110,
              height: 110,
              borderRadius: '50%',
              background: 'radial-gradient(circle,rgba(75,227,138,.28),transparent 70%)',
            }}
          />
        )}
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography
              variant="overline"
              noWrap
              sx={{
                color: done ? ecoField.greenDeep : '#9FB4A8',
                letterSpacing: 1.2,
                fontWeight: 800,
                lineHeight: 1.2,
                display: 'block',
              }}
            >
              Today · {weekday}{rest ? `, ${rest}` : ''}
            </Typography>
            <Typography
              variant="h5"
              fontWeight={800}
              sx={{ mt: 0.5, letterSpacing: -0.3, color: done ? ecoField.greenDeep : undefined }}
            >
              {done ? 'Day complete' : 'Delivery day'}
            </Typography>
            {windowLabel && (
              <Typography
                noWrap
                sx={{
                  color: done ? ecoField.muted : '#9FB4A8',
                  mt: 0.35,
                  fontWeight: 600,
                  fontSize: '0.9rem',
                }}
              >
                {windowLabel} window
              </Typography>
            )}
          </Box>
          <Chip
            size="small"
            label={stateLabel(today.display_state)}
            sx={{
              height: 22,
              fontWeight: 700,
              ...(done
                ? dayStateChipSx('completed')
                : {
                    bgcolor: 'rgba(255,255,255,0.18)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.35)',
                  }),
            }}
          />
        </Stack>

        <Stack direction="row" spacing={2.25} sx={{ mt: 2 }}>
          {[
            [today.delivery_count, 'stops'],
            [today.items_booked, 'items'],
            [today.completed_count, 'complete'],
          ].map(([value, label]) => (
            <Box key={String(label)}>
              <Typography
                variant="h5"
                fontWeight={800}
                sx={{ lineHeight: 1.05, color: done ? ecoField.greenDeep : undefined }}
              >
                {value}
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: done ? ecoField.muted : '#9FB4A8', fontWeight: 650 }}
              >
                {label}
              </Typography>
            </Box>
          ))}
        </Stack>

        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{
            mt: 1.75,
            px: 1.25,
            py: 1.1,
            borderRadius: 2,
            bgcolor: done ? ecoField.greenDeep : ecoField.green,
            color: '#fff',
          }}
        >
          <Stack direction="row" alignItems="center" spacing={0.75}>
            {done ? (
              <CheckRounded sx={{ color: '#fff' }} />
            ) : showPlay ? (
              <PlayArrowRounded sx={{ color: '#fff' }} />
            ) : (
              <LocalShippingOutlined sx={{ color: '#fff' }} />
            )}
            <Typography fontWeight={800} sx={{ fontSize: '0.95rem' }}>
              {actionLabel}
            </Typography>
          </Stack>
          <ChevronRight sx={{ color: '#fff' }} />
        </Stack>
      </Box>
    </Box>
  );
}

/** Prefer the bookable/test day with deliveries when multiple Today rows exist. */
function pickTodayDay(results: DeliveryDaySummary[] | undefined): DeliveryDaySummary | null {
  if (!results?.length) return null;
  return [...results].sort((a, b) => {
    const byCount = (b.delivery_count || 0) - (a.delivery_count || 0);
    if (byCount !== 0) return byCount;
    if (a.is_test !== b.is_test) return a.is_test ? -1 : 1;
    if (a.is_bookable !== b.is_bookable) return a.is_bookable ? -1 : 1;
    return a.id - b.id;
  })[0];
}

export default function FieldDaysLandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: todayData, isLoading: todayLoading } = useDeliveryDays({
    bucket: 'today',
    page_size: 5,
    ...(import.meta.env.DEV ? { include_test: '1' as const } : {}),
  });

  const today = pickTodayDay(todayData?.results);
  const openDay = (id: number) => navigate(`/pos/deliveries/field/days/${id}`);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';

  return (
    <Box sx={{ px: 2, pb: 1, color: ecoField.ink }}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.25}
        sx={{ pt: 'calc(12px + env(safe-area-inset-top))', pb: 1.5 }}
      >
        <IconButton
          aria-label="Open dashboard navigation"
          onClick={() => window.dispatchEvent(new Event('eco-field-toggle-nav'))}
          sx={{ width: 42, height: 42, border: `1px solid ${ecoField.line}` }}
        >
          <MenuRounded />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" spacing={0.75}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: DAYS_ACCENT.accent,
                flexShrink: 0,
              }}
            />
            <Typography
              variant="caption"
              fontWeight={800}
              sx={{ color: DAYS_ACCENT.accent, letterSpacing: '.1em', textTransform: 'uppercase' }}
            >
              Eco-Thrift · Delivery Field
            </Typography>
          </Stack>
          <Typography variant="h5" fontWeight={800} noWrap>
            {greeting}, {user?.first_name || 'driver'}
          </Typography>
        </Box>
        <Avatar sx={{ width: 42, height: 42, bgcolor: ecoField.green, fontWeight: 800 }}>
          {user?.first_name?.[0] || 'E'}{user?.last_name?.[0] || ''}
        </Avatar>
      </Stack>
      {todayLoading && (
        <Typography color="text.secondary" sx={{ mb: 1.5 }}>
          Loading today…
        </Typography>
      )}
      {!todayLoading && !today && (
        <Alert
          severity="info"
          sx={{
            mb: 2,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'info.light',
          }}
        >
          No delivery day for today yet.
        </Alert>
      )}
      {today && <TodayHeroCard today={today} onOpen={() => openDay(today.id)} />}

      <DaysBucketSection
        title="Future"
        bucket="future"
        defaultOpen
        onOpenDay={openDay}
        tone={FUTURE_TONE}
        icon={<CalendarMonthOutlined fontSize="small" />}
      />
      <DaysBucketSection
        title="Past"
        bucket="past"
        defaultOpen={false}
        onOpenDay={openDay}
        tone={PAST_TONE}
        icon={<HistoryOutlined fontSize="small" />}
      />
    </Box>
  );
}

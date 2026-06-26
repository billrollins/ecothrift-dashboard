import { Box, Typography } from '@mui/material';
import type { SalesWeeklyRow as SalesWeeklyRowType } from '../../types/pos.types';
import { dayMonthTitle, formatDashboardCurrency } from './dashboardFormatters';
import { dashboardPalette } from './dashboardCardStyles';

interface WeeklySalesRowProps {
  week: SalesWeeklyRowType;
  isThisWeek?: boolean;
  todayIso?: string;
  todayDay?: string;
}

type DailyVariant = 'default' | 'today' | 'thisWeek' | 'sameDow';

const cellSx = {
  minWidth: 0,
  px: 0.35,
  py: 0.25,
  border: '1px solid',
  borderRadius: 1,
  display: 'flex',
  flexDirection: 'column' as const,
  justifyContent: 'center',
  gap: 0,
  textAlign: 'center' as const,
};

const DAILY_VARIANT_SX: Record<DailyVariant, { bgcolor: string; borderColor: string }> = {
  default: { bgcolor: 'transparent', borderColor: 'rgba(91, 111, 95, 0.32)' },
  thisWeek: { bgcolor: dashboardPalette.goldSoft, borderColor: 'rgba(189, 134, 24, 0.5)' },
  sameDow: { bgcolor: dashboardPalette.blueSoft, borderColor: 'rgba(47, 103, 173, 0.48)' },
  today: { bgcolor: dashboardPalette.greenSoft, borderColor: dashboardPalette.green },
};

function WeekTotalCell({ label, value }: { label: string; value: string }) {
  return (
    <Box
      sx={{
        ...cellSx,
        borderColor: 'rgba(47, 122, 72, 0.58)',
        color: dashboardPalette.textOnBackdrop,
        bgcolor: dashboardPalette.green,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22)',
      }}
    >
      <Typography variant="caption" lineHeight={1} noWrap sx={{ fontSize: '0.6rem', fontWeight: 800, m: 0, letterSpacing: 0.2 }}>
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={900} lineHeight={1.08} noWrap sx={{ m: 0 }}>
        {value}
      </Typography>
    </Box>
  );
}

function DailyCell({ title, value, variant }: { title: string; value: string; variant: DailyVariant }) {
  const variantSx = DAILY_VARIANT_SX[variant];
  const emphasized = variant !== 'default';
  return (
    <Box
      sx={{
        ...cellSx,
        borderColor: variantSx.borderColor,
        bgcolor: variantSx.bgcolor,
        ...(emphasized ? { boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45)' } : {}),
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        lineHeight={1}
        noWrap
        sx={{ fontSize: '0.58rem', fontWeight: 800, m: 0, letterSpacing: 0.1 }}
      >
        {title}
      </Typography>
      <Typography
        variant="body2"
        fontWeight={variant === 'today' ? 900 : 800}
        lineHeight={1.08}
        noWrap
        sx={{ m: 0, color: variant === 'today' ? dashboardPalette.greenDark : 'inherit' }}
      >
        {value}
      </Typography>
    </Box>
  );
}

export function WeeklySalesRow({
  week,
  isThisWeek = false,
  todayIso,
  todayDay,
}: WeeklySalesRowProps) {
  const variantFor = (d: SalesWeeklyRowType['days'][number]): DailyVariant => {
    if (todayIso && d.date === todayIso) return 'today';
    if (isThisWeek) return 'thisWeek';
    if (todayDay && d.day === todayDay) return 'sameDow';
    return 'default';
  };

  return (
    <Box sx={{ p: 0.45 }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '1.3fr repeat(7, 1fr)',
          gap: 0.25,
          alignItems: 'stretch',
        }}
      >
        <WeekTotalCell label={week.label} value={formatDashboardCurrency(week.week_total)} />
        {week.days.map((d) => (
          <DailyCell
            key={d.date}
            title={dayMonthTitle(d.day, d.date)}
            value={formatDashboardCurrency(d.revenue)}
            variant={variantFor(d)}
          />
        ))}
      </Box>
    </Box>
  );
}

import { Box, Card, CardContent, Typography } from '@mui/material';
import type { SalesWeeklyRow as SalesWeeklyRowType } from '../../types/pos.types';
import { dashboardCardHoverLiftSx, dashboardPalette, dashboardRaisedCardSx } from './dashboardCardStyles';
import { useDashboardLayout } from './useDashboardLayout';
import { WeeklySalesRow } from './WeeklySalesRow';
import { WeeklySalesWeekList } from './WeeklySalesWeekList';

interface WeeklySalesListProps {
  weeks: SalesWeeklyRowType[];
  todayIso?: string;
  todayDay?: string;
}

export function WeeklySalesList({ weeks, todayIso, todayDay }: WeeklySalesListProps) {
  // Use the readable accordion list through md (<900px); 8-col row only on desktop.
  const { isMobile } = useDashboardLayout();

  return (
    <Card
      elevation={0}
      sx={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 3,
        overflow: 'hidden',
        ...dashboardRaisedCardSx,
        ...dashboardCardHoverLiftSx,
      }}
    >
      <CardContent sx={{ p: 1.5, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', '&:last-child': { pb: 1.5 } }}>
        <Box sx={{ mb: 1.25 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            sx={{ fontWeight: 800, letterSpacing: 0.9, textTransform: 'uppercase', lineHeight: 1 }}
          >
            Weekly Sales Book
          </Typography>
          <Typography variant="h6" fontWeight={800} lineHeight={1.15}>
            14-Week Calendar
          </Typography>
        </Box>
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            maxHeight: isMobile ? { xs: 360, sm: 420 } : undefined,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 0.5,
            pr: 0.25,
            WebkitOverflowScrolling: 'touch',
            '&::-webkit-scrollbar': { width: 8 },
            '&::-webkit-scrollbar-thumb': {
              bgcolor: `${dashboardPalette.muted}52`,
              borderRadius: 999,
            },
          }}
        >
          {isMobile ?
            <WeeklySalesWeekList weeks={weeks} todayIso={todayIso} todayDay={todayDay} />
          : weeks.map((week) => (
              <WeeklySalesRow
                key={week.week_start}
                week={week}
                isThisWeek={week.label === 'This Week'}
                todayIso={todayIso}
                todayDay={todayDay}
              />
            ))
          }
        </Box>
      </CardContent>
    </Card>
  );
}

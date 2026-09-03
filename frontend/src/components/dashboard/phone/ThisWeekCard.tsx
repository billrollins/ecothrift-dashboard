import { Box, Card, Typography } from '@mui/material';
import { useState } from 'react';
import type { SalesWeeklyRow } from '../../../types/pos.types';
import { dashboardPalette, dashboardPhoneCardSx } from '../dashboardCardStyles';
import {
  formatDashboardCurrency,
  formatItemsSold,
  longDayTitle,
  weekDateRange,
} from '../dashboardFormatters';
import { DayDetailSheet } from './DayDetailSheet';
import { VARIANT_SX, variantFor } from './salesDayVariant';

export function ThisWeekCard({
  weeks,
  todayIso,
  todayDay,
}: {
  weeks: SalesWeeklyRow[];
  todayIso?: string;
  todayDay?: string;
}) {
  const thisWeek = weeks.find((week) => week.label === 'This Week');
  const [detail, setDetail] = useState<{
    headline: string;
    revenue: string;
    itemsSold: number;
  } | null>(null);

  return (
    <>
      <Card elevation={0} sx={{ ...dashboardPhoneCardSx, overflow: 'hidden' }}>
        <Box sx={{ px: 2, pt: 1.75, pb: 1.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1 }}>
            <Typography sx={{ fontSize: '1.05rem', fontWeight: 800, lineHeight: 1.2 }}>
              This week
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', minHeight: 18 }}>
              {thisWeek ? weekDateRange(thisWeek.week_start, thisWeek.week_end) : '\u00a0'}
            </Typography>
          </Box>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: '1fr auto auto',
              gap: 1,
              px: 0.25,
              mt: 1,
              mb: 0.5,
            }}
          >
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 800, color: 'text.secondary' }}>
              Day
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 800, color: 'text.secondary', textAlign: 'right' }}>
              Sales
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 800, color: 'text.secondary', textAlign: 'right' }}>
              Items
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {(thisWeek?.days ?? []).map((day) => {
              const variant = variantFor(day, { isThisWeek: true, todayIso, todayDay });
              const variantSx = VARIANT_SX[variant];
              return (
                <Box
                  key={day.date}
                  component="button"
                  type="button"
                  onClick={() =>
                    setDetail({
                      headline: longDayTitle(day.day, day.date),
                      revenue: day.revenue,
                      itemsSold: day.items_sold ?? 0,
                    })
                  }
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto auto',
                    gap: 1,
                    alignItems: 'center',
                    width: '100%',
                    minHeight: 48,
                    px: 1,
                    border: '1px solid',
                    borderColor: variantSx.borderColor,
                    borderRadius: 1.5,
                    bgcolor: variantSx.bgcolor,
                    cursor: 'pointer',
                    textAlign: 'left',
                    font: 'inherit',
                    color: 'inherit',
                  }}
                >
                  <Box>
                    <Typography sx={{ fontSize: '0.875rem', fontWeight: variant === 'today' ? 800 : 700, lineHeight: 1.2 }}>
                      {day.day.slice(0, 3)}
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', lineHeight: 1.1 }}>
                      {day.date.slice(5).replace('-', '/')}
                    </Typography>
                  </Box>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 800, minWidth: 72, textAlign: 'right' }}>
                    {formatDashboardCurrency(day.revenue)}
                  </Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', minWidth: 36, textAlign: 'right' }}>
                    {formatItemsSold(day.items_sold ?? 0)}
                  </Typography>
                </Box>
              );
            })}
          </Box>
          <Box
            sx={{
              mt: 1,
              px: 1.25,
              py: 0.85,
              minHeight: 48,
              borderRadius: 1.5,
              bgcolor: dashboardPalette.green,
              color: dashboardPalette.textOnBackdrop,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 800, lineHeight: 1 }}>
              Week total
            </Typography>
            <Typography sx={{ fontSize: '1.1rem', fontWeight: 900 }}>
              {formatDashboardCurrency(thisWeek?.week_total ?? '0')}
            </Typography>
          </Box>
        </Box>
      </Card>
      <DayDetailSheet
        open={detail !== null}
        onClose={() => setDetail(null)}
        headline={detail?.headline ?? ''}
        salesLabel="Daily Sales"
        revenue={detail?.revenue ?? '0'}
        itemsSold={detail?.itemsSold ?? 0}
      />
    </>
  );
}

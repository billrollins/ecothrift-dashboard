import { Box, Typography } from '@mui/material';
import {
  formatDashboardCurrencyExact,
  formatItemsSold,
  longDayTitle,
} from './dashboardFormatters';

export interface SalesDayDetailContentProps {
  headline: string;
  subheadline?: string;
  salesLabel: string;
  revenue: string;
  itemsSold: number;
}

export function SalesDayDetailContent({
  headline,
  subheadline,
  salesLabel,
  revenue,
  itemsSold,
}: SalesDayDetailContentProps) {
  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={800} lineHeight={1.25} sx={{ mb: subheadline ? 0.25 : 0.75 }}>
        {headline}
      </Typography>
      {subheadline ?
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.75 }}>
          {subheadline}
        </Typography>
      : null}
      <Typography variant="body2" lineHeight={1.5} sx={{ m: 0 }}>
        {salesLabel}: {formatDashboardCurrencyExact(revenue)}
      </Typography>
      <Typography variant="body2" lineHeight={1.5} sx={{ m: 0 }}>
        Items Sold: {formatItemsSold(itemsSold)}
      </Typography>
    </Box>
  );
}

export function salesDayHeadline(dayName: string, date: string): string {
  return longDayTitle(dayName, date);
}

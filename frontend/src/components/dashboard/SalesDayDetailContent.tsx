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
  /** Thrift+ returns (negative) and Thrift+ revenue for the same period; shown when given. */
  returns?: string;
  thriftplusRevenue?: string;
}

export function SalesDayDetailContent({
  headline,
  subheadline,
  salesLabel,
  revenue,
  itemsSold,
  returns,
  thriftplusRevenue,
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
      {returns !== undefined ?
        <Typography variant="body2" lineHeight={1.5} sx={{ m: 0 }}>
          Returns: {formatDashboardCurrencyExact(returns)}
        </Typography>
      : null}
      {thriftplusRevenue !== undefined ?
        <Typography variant="body2" lineHeight={1.5} sx={{ m: 0 }}>
          Thrift+ revenue: {formatDashboardCurrencyExact(thriftplusRevenue)}
        </Typography>
      : null}
      <Typography variant="body2" lineHeight={1.5} sx={{ m: 0 }}>
        Items Sold: {formatItemsSold(itemsSold)}
      </Typography>
    </Box>
  );
}

export function salesDayHeadline(dayName: string, date: string): string {
  return longDayTitle(dayName, date);
}

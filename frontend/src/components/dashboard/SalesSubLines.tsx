import { Box, Typography } from '@mui/material';
import { formatDashboardCurrencyExact } from './dashboardFormatters';

interface SalesSubLinesProps {
  /** Thrift+ returns for the same period as the headline (negative or zero). */
  returns?: string;
  thriftplusRevenue?: string;
  /** e.g. "Today" or "This week"; the period the headline above covers. */
  period?: string;
  align?: 'left' | 'right';
  color?: string;
}

/**
 * Two small lines under the Sales headline (owner 10-20): the headline is net item sales; Returns is what came back
 * in it, Thrift+ revenue is the near-100%-margin money on top.
 */
export function SalesSubLines({ returns, thriftplusRevenue, period, align = 'left', color }: SalesSubLinesProps) {
  if (returns === undefined && thriftplusRevenue === undefined) return null;
  const rows: [string, string][] = [
    ['Returns', formatDashboardCurrencyExact(returns ?? '0')],
    ['Thrift+ revenue', formatDashboardCurrencyExact(thriftplusRevenue ?? '0')],
  ];
  return (
    <Box
      data-testid="sales-sub-lines"
      sx={{ display: 'flex', flexDirection: 'column', alignItems: align === 'right' ? 'flex-end' : 'flex-start', gap: 0 }}
      aria-label={period ? `${period}: returns and Thrift+ revenue` : 'Returns and Thrift+ revenue'}
    >
      {rows.map(([label, value]) => (
        <Typography
          key={label}
          variant="caption"
          color={color ?? 'text.secondary'}
          sx={{ fontSize: '0.72rem', fontWeight: 600, lineHeight: 1.35, fontVariantNumeric: 'tabular-nums' }}
        >
          {label} {value}
        </Typography>
      ))}
    </Box>
  );
}

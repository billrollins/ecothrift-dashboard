import { Box, Typography } from '@mui/material';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { dashboardPalette } from './dashboardCardStyles';
import { formatDashboardCurrencyExact, shortDate } from './dashboardFormatters';
import type { SalesChartRow, WeekBand } from './salesChartData';

interface ChartTooltipPayloadItem {
  payload: SalesChartRow;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: ChartTooltipPayloadItem[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  if (!point.day) return null;
  return (
    <Box
      sx={{
        bgcolor: 'rgba(255,253,247,0.96)',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        px: 1.25,
        py: 0.75,
        boxShadow: '0 14px 30px rgba(15,23,42,0.16)',
      }}
    >
      <Typography variant="caption" color="text.secondary" display="block">
        {point.day} {shortDate(point.date)}
      </Typography>
      <Typography variant="body2" fontWeight={600}>
        7-day: {formatDashboardCurrencyExact(String(point.rollingWeekTotal))}
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block">
        4-wk avg: {formatDashboardCurrencyExact(String(point.fourWeekWeeklyAvg))}
      </Typography>
    </Box>
  );
}

export interface SalesTrendChartProps {
  data: SalesChartRow[];
  weekBands: WeekBand[];
  ticks: string[];
  chartMax: number;
  goalAmount: number | null;
  goalLabel?: string | null;
  yAxisWidth?: number;
}

export function SalesTrendChart({
  data,
  weekBands,
  ticks,
  chartMax,
  goalAmount,
  goalLabel,
  yAxisWidth = 44,
}: SalesTrendChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={dashboardPalette.green} stopOpacity={0.3} />
            <stop offset="100%" stopColor={dashboardPalette.green} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="goldHighlight" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={dashboardPalette.gold} />
            <stop offset="35%" stopColor={dashboardPalette.goldBright} />
            <stop offset="55%" stopColor="#fff8d6" />
            <stop offset="75%" stopColor={dashboardPalette.goldBright} />
            <stop offset="100%" stopColor={dashboardPalette.gold} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(99, 112, 102, 0.22)" />
        {weekBands
          .filter((b) => b.shaded)
          .map((b) => (
            <ReferenceArea
              key={b.x1}
              x1={b.x1}
              x2={b.x2}
              fill="currentColor"
              fillOpacity={0.035}
            />
          ))}
        <XAxis
          dataKey="date"
          ticks={ticks}
          tickFormatter={shortDate}
          tick={{ fontSize: 11, fontWeight: 600, fill: dashboardPalette.muted }}
          interval={0}
        />
        <YAxis
          domain={[0, chartMax]}
          tickFormatter={(v) => `$${Math.round(v / 1000)}k`}
          tick={{ fontSize: 10, fill: dashboardPalette.muted }}
          width={yAxisWidth}
        />
        <RechartsTooltip content={<ChartTooltip />} />
        {goalAmount != null && (
          <ReferenceLine
            y={goalAmount}
            stroke={dashboardPalette.gold}
            strokeWidth={1.5}
            ifOverflow="extendDomain"
            label={
              goalLabel
                ? {
                    value: goalLabel,
                    position: 'insideTopRight',
                    fill: dashboardPalette.goldDark,
                    fontSize: goalLabel.length > 18 ? 10 : 11,
                    fontWeight: 900,
                  }
                : undefined
            }
          />
        )}
        <Area
          type="monotone"
          dataKey="rollingWeekTotal"
          stroke="none"
          fill="url(#salesFill)"
          name="7-day total"
        />
        <Line
          type="monotone"
          dataKey="rollingBelow"
          stroke={dashboardPalette.green}
          strokeWidth={1.5}
          dot={false}
          connectNulls={false}
          isAnimationActive={false}
          legendType="none"
          tooltipType="none"
        />
        <Line
          type="monotone"
          dataKey="avgBelow"
          stroke={dashboardPalette.greenDark}
          strokeWidth={2}
          strokeDasharray="5 5"
          dot={false}
          connectNulls={false}
          isAnimationActive={false}
          legendType="none"
          tooltipType="none"
        />
        {goalAmount != null && (
          <>
            <Line
              type="monotone"
              dataKey="rollingOver"
              stroke="#ffe08a"
              strokeWidth={7}
              strokeOpacity={0.55}
              strokeLinecap="round"
              dot={false}
              connectNulls={false}
              legendType="none"
              isAnimationActive={false}
              tooltipType="none"
            />
            <Line
              type="monotone"
              dataKey="rollingOver"
              stroke="url(#goldHighlight)"
              strokeWidth={3}
              strokeLinecap="round"
              dot={false}
              connectNulls={false}
              legendType="none"
              isAnimationActive={false}
              tooltipType="none"
            />
            <Line
              type="monotone"
              dataKey="avgOver"
              stroke="url(#goldHighlight)"
              strokeWidth={3}
              strokeDasharray="5 5"
              strokeLinecap="butt"
              dot={false}
              connectNulls={false}
              legendType="none"
              isAnimationActive={false}
              tooltipType="none"
            />
          </>
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

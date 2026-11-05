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
import { CHART_INITIAL_DIMENSION } from '../common/chartDefaults';
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
  /** Fixed gridlines (the desktop card uses $5K steps); recharts picks them when left out. */
  yTicks?: number[];
  /** The desktop card (owner 2026-11-05): $5K and $20K labels, a softer gold glow, room for the line's end. */
  desktop?: boolean;
}

/** "$0", "$5K", "$20K". */
export function salesAxisDollars(v: number): string {
  return v === 0 ? '$0' : `$${Math.round(v / 1000)}K`;
}

export function SalesTrendChart({
  data,
  weekBands,
  ticks,
  chartMax,
  goalAmount,
  goalLabel,
  yAxisWidth = 44,
  yTicks,
  desktop = false,
}: SalesTrendChartProps) {
  // Desktop: a number axis on the day position, so goal-crossing points don't widen their week.
  const xOf = new Map<string, number>();
  const dateOf = new Map<number, string>();
  if (desktop) {
    for (const row of data) {
      if (!row.date) continue;
      xOf.set(row.date, row.x);
      dateOf.set(row.x, row.date);
    }
  }
  const xKey = (date: string): string | number => (desktop ? xOf.get(date) ?? 0 : date);
  const lastX = data.length ? data[data.length - 1].x : 0;
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50} initialDimension={CHART_INITIAL_DIMENSION}>
      <ComposedChart data={data} margin={{ top: desktop ? 8 : 4, right: desktop ? 14 : 8, left: 0, bottom: 0 }}>
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
        {/* Desktop leaves the alternating week shading out: the Monday dates mark the weeks. */}
        {weekBands
          .filter((b) => b.shaded && !desktop)
          .map((b) => (
            <ReferenceArea
              key={b.x1}
              x1={xKey(b.x1)}
              x2={xKey(b.x2)}
              fill="currentColor"
              fillOpacity={0.035}
            />
          ))}
        {desktop ? (
          <XAxis
            dataKey="x"
            type="number"
            domain={[0, lastX]}
            allowDataOverflow
            ticks={ticks.map((d) => xOf.get(d) ?? 0)}
            tickFormatter={(v: number) => shortDate(dateOf.get(v) ?? '')}
            tick={{ fontSize: 11, fontWeight: 600, fill: dashboardPalette.muted }}
            tickLine={{ stroke: 'rgba(99, 112, 102, 0.35)' }}
            axisLine={{ stroke: 'rgba(99, 112, 102, 0.35)' }}
            interval={0}
          />
        ) : <XAxis
          dataKey="date"
          ticks={ticks}
          tickFormatter={shortDate}
          tick={{ fontSize: 11, fontWeight: 600, fill: dashboardPalette.muted }}
          interval={0}
        />}
        <YAxis
          domain={[0, chartMax]}
          ticks={yTicks}
          interval={yTicks ? 0 : undefined}
          tickFormatter={desktop ? salesAxisDollars : (v) => `$${Math.round(v / 1000)}k`}
          tick={{ fontSize: 10, fill: dashboardPalette.muted }}
          tickLine={!desktop}
          axisLine={desktop ? { stroke: 'rgba(99, 112, 102, 0.35)' } : true}
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
          isAnimationActive={!desktop}
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
            {!desktop && <Line
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
            />}
            <Line
              type="monotone"
              dataKey="rollingOver"
              stroke={desktop ? dashboardPalette.gold : 'url(#goldHighlight)'}
              strokeWidth={desktop ? 2 : 3}
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
              stroke={desktop ? dashboardPalette.greenDark : 'url(#goldHighlight)'}
              strokeWidth={desktop ? 2 : 3}
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

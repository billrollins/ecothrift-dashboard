import type { SalesDailyMetric } from '../../types/pos.types';
import { parseDashboardAmount } from './dashboardFormatters';

export interface SalesChartPoint {
  date: string;
  day: string;
  weekStart: string;
  rolling: number;
  avg: number;
}

export interface SalesChartRow {
  /** Day position (0, 1, 2 ...; goal crossings fall between days), so a number axis spaces the days evenly. */
  x: number;
  date: string;
  day: string;
  weekStart: string;
  rollingWeekTotal: number;
  fourWeekWeeklyAvg: number;
  rollingBelow: number | null;
  rollingOver: number | null;
  avgBelow: number | null;
  avgOver: number | null;
}

export interface WeekBand {
  x1: string;
  x2: string;
  shaded: boolean;
}

export function sliceSalesDailyWindow(
  daily: SalesDailyMetric[],
  days: number,
): SalesDailyMetric[] {
  if (days <= 0 || daily.length <= days) return daily;
  return daily.slice(daily.length - days);
}

export function salesDailyPoints(daily: SalesDailyMetric[]): SalesChartPoint[] {
  return daily.map((d) => ({
    date: d.date,
    day: d.day,
    weekStart: d.week_start,
    rolling: parseDashboardAmount(d.rolling_week_total),
    avg: parseDashboardAmount(d.four_week_weekly_avg),
  }));
}

export function buildSalesChartData(
  dailyPoints: SalesChartPoint[],
  goalAmount: number | null,
): SalesChartRow[] {
  const split = (v: number): { below: number | null; over: number | null } => ({
    below: goalAmount == null || v <= goalAmount ? v : null,
    over: goalAmount != null && v >= goalAmount ? v : null,
  });
  const makeRow = (
    x: number,
    date: string,
    day: string,
    weekStart: string,
    rolling: number,
    avg: number,
  ): SalesChartRow => {
    const r = split(rolling);
    const a = split(avg);
    return {
      x,
      date,
      day,
      weekStart,
      rollingWeekTotal: rolling,
      fourWeekWeeklyAvg: avg,
      rollingBelow: r.below,
      rollingOver: r.over,
      avgBelow: a.below,
      avgOver: a.over,
    };
  };

  const rows: SalesChartRow[] = [];
  for (let i = 0; i < dailyPoints.length; i += 1) {
    const p = dailyPoints[i];
    rows.push(makeRow(i, p.date, p.day, p.weekStart, p.rolling, p.avg));
    if (goalAmount == null || i === dailyPoints.length - 1) continue;

    const n = dailyPoints[i + 1];
    const crossings: { t: number; series: 'rolling' | 'avg' }[] = [];
    const addCross = (a: number, b: number, series: 'rolling' | 'avg') => {
      if ((a < goalAmount && b > goalAmount) || (a > goalAmount && b < goalAmount)) {
        crossings.push({ t: (goalAmount - a) / (b - a), series });
      }
    };
    addCross(p.rolling, n.rolling, 'rolling');
    addCross(p.avg, n.avg, 'avg');
    crossings.sort((x, y) => x.t - y.t);

    for (const c of crossings) {
      let rollingV = p.rolling + (n.rolling - p.rolling) * c.t;
      let avgV = p.avg + (n.avg - p.avg) * c.t;
      if (c.series === 'rolling') rollingV = goalAmount;
      else avgV = goalAmount;
      rows.push(makeRow(i + c.t, '', '', p.weekStart, rollingV, avgV));
    }
  }
  return rows;
}

export function buildWeekBands(dailyPoints: SalesChartPoint[]): WeekBand[] {
  const bands: WeekBand[] = [];
  const seen = new Set<string>();
  let shaded = false;
  let currentStart: string | null = null;
  dailyPoints.forEach((d, idx) => {
    if (!seen.has(d.weekStart)) {
      if (currentStart !== null) {
        bands.push({ x1: currentStart, x2: dailyPoints[idx - 1].date, shaded });
        shaded = !shaded;
      }
      seen.add(d.weekStart);
      currentStart = d.date;
    }
    if (idx === dailyPoints.length - 1 && currentStart !== null) {
      bands.push({ x1: currentStart, x2: d.date, shaded });
    }
  });
  return bands;
}

export function mondayTickDates(daily: SalesDailyMetric[], thinEvery = 1): string[] {
  return daily
    .filter((d) => d.day === 'Monday')
    .filter((_, i) => thinEvery <= 1 || i % thinEvery === 0)
    .map((d) => d.date);
}

export function salesChartMax(
  dailyPoints: SalesChartPoint[],
  goalAmount: number | null,
): number {
  const highestDataPoint = dailyPoints.reduce(
    (highest, point) => Math.max(highest, point.rolling, point.avg),
    0,
  );
  return Math.ceil(Math.max(highestDataPoint, goalAmount ?? 0) * 1.08);
}

/** Y-axis gridlines every $5K (owner 2026-11-05), from 0 to just above the highest line or the goal. */
export function salesFiveKTicks(chartMax: number): number[] {
  const top = Math.max(5000, Math.ceil(chartMax / 5000) * 5000);
  return Array.from({ length: top / 5000 + 1 }, (_, i) => i * 5000);
}

/** The days shown: `weeks` weeks ending `backWeeks` weeks before the last day. */
export function salesTrendWindow(
  daily: SalesDailyMetric[],
  weeks: number,
  backWeeks: number,
): SalesDailyMetric[] {
  const end = Math.max(0, daily.length - backWeeks * 7);
  return daily.slice(Math.max(0, end - weeks * 7), end);
}

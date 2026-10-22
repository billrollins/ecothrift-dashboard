import { Box, Stack } from '@mui/material';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import ShoppingBag from '@mui/icons-material/ShoppingBag';
import PrecisionManufacturing from '@mui/icons-material/PrecisionManufacturing';
import Handyman from '@mui/icons-material/Handyman';
import Storefront from '@mui/icons-material/Storefront';
import { useAuth } from '../../hooks/useAuth';
import { isoWeekKey } from '../../pages/admin/routines/gradeWeek';
import type {
  DepartmentDailyMetric,
  DepartmentDailyWeek,
  DepartmentDetailsKey,
  DepartmentGoalKey,
  DepartmentMetrics,
} from '../../types/pos.types';
import {
  buyingGridValue,
  buyingWeekTotal,
  departmentCellAriaLabel,
  departmentDayIsClickable,
  processingGridValue,
  processingWeekTotal,
  restorationGridValue,
  restorationWeekTotal,
  retailCellAriaLabel,
  retailDayIsClickable,
  retailGoalCellState,
  retailGridValue,
  retailWeekGoalAchieved,
  retailWeekTotal,
} from './DepartmentCardGrid';
import { DepartmentCard } from './DepartmentCard';
import { DepartmentDetailsDrawer, type DepartmentDetailsRequest } from './DepartmentDetailsDrawer';
import {
  DepartmentGoalDialog,
  formatDepartmentGoalValue,
  type DepartmentGoalConfig,
  type DepartmentGoalKind,
} from './DepartmentGoalDialog';
import { formatDashboardCurrency, parseDashboardAmount } from './dashboardFormatters';
import { DepartmentRetailDayDialog, type RetailSummaryMode } from './DepartmentRetailDayDialog';
import { dashboardPalette } from './dashboardCardStyles';
import { dayPeriod, weekPeriod } from './departmentPeriods';
import { useDashboardLayout } from './useDashboardLayout';

interface DepartmentMetricCardsProps {
  metrics: DepartmentMetrics;
}

interface CardConfig {
  key: DepartmentGoalKey;
  label: string;
  /** The one number each card is about (owner 2026-10-22). */
  metricLabel: string;
  kind: DepartmentGoalKind;
  accent: string;
  icon: ReactNode;
  actual: string;
  /** The Actual as a number, for the share-of-goal bar (money and counts). */
  actualValue?: number;
  actualNote?: string;
  placeholder?: boolean;
  goalMet?: boolean;
  getValue: (day: DepartmentDailyMetric) => string;
  getWeekTotal: (week: DepartmentDailyWeek) => string;
  getCellState?: (day: DepartmentDailyMetric) => 'scheduled' | 'achieved' | undefined;
  getWeekAchieved?: (week: DepartmentDailyWeek) => boolean;
}

export function DepartmentMetricCards({ metrics }: DepartmentMetricCardsProps) {
  const { user } = useAuth();
  const { isMobile } = useDashboardLayout();
  const isSuperuser = Boolean(user?.is_superuser);
  const canOpenCommandCenter = ['Admin', 'Manager'].includes(user?.role || '');
  const { buying, processing, restoration, retail, goals, daily_weeks } = metrics;
  const [openKey, setOpenKey] = useState<DepartmentGoalKey | null>(null);
  const [details, setDetails] = useState<DepartmentDetailsRequest | null>(null);
  const [summary, setSummary] = useState<{ mode: RetailSummaryMode; date?: string; week?: string } | null>(null);

  const todayIso = useMemo(() => {
    let latest = '';
    for (const week of daily_weeks) {
      for (const day of week.days) {
        if (!day.is_future && day.date > latest) latest = day.date;
      }
    }
    return latest;
  }, [daily_weeks]);

  const currentWeek = daily_weeks.find((week) => week.is_current)
    ?? daily_weeks.find((week) => week.days.some((day) => day.date === todayIso))
    ?? daily_weeks[daily_weeks.length - 1]
    ?? null;
  const retailScore = currentWeek?.retail_week_score;

  const cards: CardConfig[] = [
    {
      key: 'buying',
      label: 'Buying',
      metricLabel: 'Purchased inventory',
      kind: 'currency',
      accent: dashboardPalette.teal,
      icon: <ShoppingBag />,
      actual: formatDashboardCurrency(buying.week),
      actualValue: parseDashboardAmount(buying.week),
      getValue: buyingGridValue,
      getWeekTotal: buyingWeekTotal,
    },
    {
      key: 'processing',
      label: 'Processing',
      metricLabel: 'Processed inventory, at our price',
      kind: 'currency',
      accent: dashboardPalette.amber,
      icon: <PrecisionManufacturing />,
      actual: formatDashboardCurrency(processing.week),
      actualValue: parseDashboardAmount(processing.week),
      getValue: processingGridValue,
      getWeekTotal: processingWeekTotal,
    },
    {
      key: 'restoration',
      label: 'Restoration',
      metricLabel: 'Count of items finished',
      kind: 'count',
      accent: dashboardPalette.violet,
      icon: <Handyman />,
      actual: String(restoration.week_jobs_done),
      actualValue: restoration.week_jobs_done,
      actualNote: `${restoration.today_jobs_done} today · ${restoration.active_jobs} in flight`,
      placeholder: false,
      getValue: restorationGridValue,
      getWeekTotal: restorationWeekTotal,
    },
    {
      key: 'retail',
      label: 'Retail',
      metricLabel: 'Quality score',
      kind: 'grade',
      accent: dashboardPalette.gold,
      icon: <Storefront />,
      actual: retail.average_grade ?? '-',
      actualNote: [
        retailScore != null ? `Score ${Math.round(retailScore)}` : null,
        retail.note || [
          retail.last_grade ? `${retail.last_grade} on the last graded day` : null,
          `${retail.week_work_cycles ?? 0} work cycles this week`,
          `${retail.week_idle_dismissed ?? 0} idle prompts dismissed`,
        ].filter(Boolean).join(' · '),
      ].filter(Boolean).join(' · '),
      goalMet: Boolean(retail.week_goal_met),
      getValue: retailGridValue,
      getWeekTotal: retailWeekTotal,
      getCellState: retailGoalCellState,
      getWeekAchieved: retailWeekGoalAchieved,
    },
  ];

  const activeCard = cards.find((c) => c.key === openKey) ?? null;
  const activeConfig: DepartmentGoalConfig | null = activeCard
    ? { key: activeCard.key, label: activeCard.label, kind: activeCard.kind }
    : null;

  const openRetailWeek = (week: DepartmentDailyWeek | null) => {
    const weekStart = week?.week_start;
    setSummary({
      mode: 'week',
      week: weekStart ? isoWeekKey(new Date(`${weekStart}T12:00:00`)) : isoWeekKey(new Date()),
    });
  };

  const openDetails = (card: CardConfig, period: { start: string; end: string }) => {
    setDetails({
      department: card.key as DepartmentDetailsKey,
      label: card.label,
      metricLabel: card.metricLabel,
      period,
    });
  };

  const goalShare = (card: CardConfig): number | null => {
    const goal = parseDashboardAmount((goals[card.key]?.value ?? '').replace(/[$,\s]/g, ''));
    return card.actualValue != null && goal > 0 ? card.actualValue / goal : null;
  };

  const renderCard = (card: CardConfig) => {
    const isRetail = card.key === 'retail';
    return (
      <DepartmentCard
        key={card.key}
        label={card.label}
        metricLabel={card.metricLabel}
        accent={card.accent}
        icon={card.icon}
        goalDisplay={formatDepartmentGoalValue(card.kind, goals[card.key]?.value ?? '')}
        actualDisplay={card.actual}
        actualNote={card.actualNote}
        progress={goalShare(card)}
        placeholder={card.placeholder}
        goalMet={card.goalMet}
        onGoalClick={() => setOpenKey(card.key)}
        onActualClick={
          isRetail
            ? () => openRetailWeek(currentWeek)
            : () => currentWeek && openDetails(card, weekPeriod(currentWeek, todayIso))
        }
        weeks={daily_weeks}
        currentWeek={currentWeek}
        getValue={card.getValue}
        getWeekTotal={card.getWeekTotal}
        getCellState={card.getCellState}
        getWeekAchieved={card.getWeekAchieved}
        todayIso={todayIso}
        onCellClick={
          isRetail
            ? (day) => setSummary({ mode: 'day', date: day.date })
            : (day) => openDetails(card, dayPeriod(day.date))
        }
        isCellClickable={isRetail ? retailDayIsClickable : departmentDayIsClickable}
        cellAriaLabel={isRetail ? retailCellAriaLabel : departmentCellAriaLabel(card.metricLabel)}
        onWeekClick={
          isRetail ? (week) => openRetailWeek(week) : (week) => openDetails(card, weekPeriod(week, todayIso))
        }
      />
    );
  };

  return (
    <>
      {isMobile ? (
        <Stack spacing={1.5}>{cards.map(renderCard)}</Stack>
      ) : (
        // Desk: a 2x2 grid that fills the column beside Sales (owner 2026-10-22).
        <Box
          data-testid="department-grid"
          sx={{
            flex: 1,
            minHeight: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gridTemplateRows: { md: 'repeat(2, minmax(270px, auto))', lg: 'repeat(2, minmax(0, 1fr))' },
            gap: 1.5,
          }}
        >
          {cards.map(renderCard)}
        </Box>
      )}

      {activeConfig && (
        <DepartmentGoalDialog
          open={openKey !== null}
          onClose={() => setOpenKey(null)}
          config={activeConfig}
          goal={goals[activeConfig.key] ?? null}
          isSuperuser={isSuperuser}
        />
      )}

      <DepartmentDetailsDrawer request={details} onClose={() => setDetails(null)} />

      <DepartmentRetailDayDialog
        open={summary !== null}
        onClose={() => setSummary(null)}
        mode={summary?.mode ?? 'day'}
        date={summary?.date}
        week={summary?.week}
        showCommandCenterLink={canOpenCommandCenter}
      />
    </>
  );
}

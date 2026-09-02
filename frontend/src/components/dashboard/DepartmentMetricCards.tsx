import { Box, Grid } from '@mui/material';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import ShoppingBag from '@mui/icons-material/ShoppingBag';
import PrecisionManufacturing from '@mui/icons-material/PrecisionManufacturing';
import Handyman from '@mui/icons-material/Handyman';
import Storefront from '@mui/icons-material/Storefront';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import type {
  DepartmentDailyMetric,
  DepartmentDailyWeek,
  DepartmentGoalKey,
  DepartmentMetrics,
} from '../../types/pos.types';
import {
  DepartmentCardGrid,
  buyingGridValue,
  buyingWeekTotal,
  processingGridValue,
  processingWeekTotal,
  restorationGridValue,
  restorationWeekTotal,
  retailDayIsClickable,
  retailGoalCellState,
  retailGridValue,
  retailWeekGoalAchieved,
  retailWeekTotal,
} from './DepartmentCardGrid';
import { DepartmentStatCard } from './DepartmentStatCard';
import {
  DepartmentGoalDialog,
  formatDepartmentGoalValue,
  type DepartmentGoalConfig,
  type DepartmentGoalKind,
} from './DepartmentGoalDialog';
import { formatDashboardCurrency } from './dashboardFormatters';
import { DepartmentWeekDetailDialog } from './DepartmentWeekDetailDialog';
import { dashboardPalette } from './dashboardCardStyles';
import { useDashboardLayout } from './useDashboardLayout';

interface DepartmentMetricCardsProps {
  metrics: DepartmentMetrics;
}

interface CardConfig {
  key: DepartmentGoalKey;
  label: string;
  kind: DepartmentGoalKind;
  accent: string;
  icon: ReactNode;
  actual: string;
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
  const navigate = useNavigate();
  const { isCompact } = useDashboardLayout();
  const isSuperuser = Boolean(user?.is_superuser);
  const { buying, processing, restoration, retail, goals, daily_weeks } = metrics;
  const [openKey, setOpenKey] = useState<DepartmentGoalKey | null>(null);
  const [weekDetailKey, setWeekDetailKey] = useState<DepartmentGoalKey | null>(null);

  const todayIso = useMemo(() => {
    let latest = '';
    for (const week of daily_weeks) {
      for (const day of week.days) {
        if (!day.is_future && day.date > latest) latest = day.date;
      }
    }
    return latest;
  }, [daily_weeks]);

  const cards: CardConfig[] = [
    {
      key: 'buying',
      label: 'Buying',
      kind: 'currency',
      accent: dashboardPalette.teal,
      icon: <ShoppingBag />,
      actual: formatDashboardCurrency(buying.week),
      getValue: buyingGridValue,
      getWeekTotal: buyingWeekTotal,
    },
    {
      key: 'processing',
      label: 'Processing',
      kind: 'currency',
      accent: dashboardPalette.amber,
      icon: <PrecisionManufacturing />,
      actual: formatDashboardCurrency(processing.week),
      getValue: processingGridValue,
      getWeekTotal: processingWeekTotal,
    },
    {
      key: 'restoration',
      label: 'Restoration',
      kind: 'count',
      accent: dashboardPalette.violet,
      icon: <Handyman />,
      actual: String(restoration.week_jobs_done),
      actualNote: `${restoration.today_jobs_done} today · ${restoration.active_jobs} in flight`,
      placeholder: false,
      getValue: restorationGridValue,
      getWeekTotal: restorationWeekTotal,
    },
    {
      key: 'retail',
      label: 'Retail',
      kind: 'count',
      accent: dashboardPalette.gold,
      icon: <Storefront />,
      actual: retail.average_grade ?? '-',
      actualNote: retail.last_grade
        ? `${retail.last_grade} on the last graded day · ${retail.week_audits} submitted`
        : `${retail.week_audits} submitted this week`,
      goalMet: retail.average_grade === 'A' || retail.average_grade === 'B',
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

  const weekDetailCard = cards.find((c) => c.key === weekDetailKey) ?? null;

  return (
    <>
      <Grid container spacing={1.5} columns={12} sx={{ overflow: 'visible' }}>
        {cards.map((card) => (
          <Grid
            key={card.key}
            size={{ xs: 12, sm: 6, md: 6, lg: 3 }}
            sx={{ display: 'flex', minWidth: 0, p: 1, overflow: 'visible' }}
          >
            <Box sx={{ width: '100%', height: '100%', minWidth: 0, minHeight: 0, display: 'flex' }}>
              <DepartmentStatCard
                label={card.label}
                accent={card.accent}
                icon={card.icon}
                goalDisplay={formatDepartmentGoalValue(card.kind, goals[card.key]?.value ?? '')}
                actualDisplay={card.actual}
                actualNote={card.actualNote}
                placeholder={card.placeholder}
                goalMet={card.goalMet}
                onGoalClick={() => setOpenKey(card.key)}
                showWeekDetailButton={isCompact}
                onViewWeekDetail={() => setWeekDetailKey(card.key)}
                footer={
                  <DepartmentCardGrid
                    weeks={daily_weeks}
                    getValue={card.getValue}
                    getWeekTotal={card.getWeekTotal}
                    getCellState={card.getCellState}
                    getWeekAchieved={card.getWeekAchieved}
                    todayIso={todayIso}
                    onDayHeadsClick={isCompact ? () => setWeekDetailKey(card.key) : undefined}
                    onCellClick={
                      card.key === 'retail'
                        ? (day) => navigate(
                            // Grades explains the letter. Everyone else lands on
                            // their own routines, which is the only QA screen
                            // they can open.
                            isSuperuser
                              ? `/admin/routines?view=grades&day=${day.date}`
                              : '/routines',
                          )
                        : undefined
                    }
                    isCellClickable={card.key === 'retail' ? retailDayIsClickable : undefined}
                  />
                }
              />
            </Box>
          </Grid>
        ))}
      </Grid>

      {activeConfig && (
        <DepartmentGoalDialog
          open={openKey !== null}
          onClose={() => setOpenKey(null)}
          config={activeConfig}
          goal={goals[activeConfig.key] ?? null}
          isSuperuser={isSuperuser}
        />
      )}

      {weekDetailCard ? (
        <DepartmentWeekDetailDialog
          open={weekDetailKey !== null}
          onClose={() => setWeekDetailKey(null)}
          label={weekDetailCard.label}
          weeks={daily_weeks}
          getValue={weekDetailCard.getValue}
          getWeekTotal={weekDetailCard.getWeekTotal}
          getCellState={weekDetailCard.getCellState}
          getWeekAchieved={weekDetailCard.getWeekAchieved}
          todayIso={todayIso}
        />
      ) : null}
    </>
  );
}

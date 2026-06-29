import { Box, Grid, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import ShoppingBag from '@mui/icons-material/ShoppingBag';
import PrecisionManufacturing from '@mui/icons-material/PrecisionManufacturing';
import Handyman from '@mui/icons-material/Handyman';
import WorkspacePremium from '@mui/icons-material/WorkspacePremium';
import { useAuth } from '../../hooks/useAuth';
import type { DepartmentGoalKey, DepartmentMetrics } from '../../types/pos.types';
import {
  DepartmentCardGrid,
  buyingGridValue,
  processingGridValue,
  restorationGridValue,
  retailGridValue,
} from './DepartmentCardGrid';
import { DepartmentStatCard } from './DepartmentStatCard';
import {
  DepartmentGoalDialog,
  formatDepartmentGoalValue,
  type DepartmentGoalConfig,
  type DepartmentGoalKind,
} from './DepartmentGoalDialog';
import { DepartmentWeekDetailDialog } from './DepartmentWeekDetailDialog';
import { formatDashboardCurrency } from './dashboardFormatters';
import { dashboardPalette } from './dashboardCardStyles';
import type { DepartmentDailyMetric } from '../../types/pos.types';
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
  placeholder?: boolean;
  subStat?: ReactNode;
  getValue: (day: DepartmentDailyMetric) => string;
}

export function DepartmentMetricCards({ metrics }: DepartmentMetricCardsProps) {
  const { user } = useAuth();
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
    },
    {
      key: 'processing',
      label: 'Processing',
      kind: 'currency',
      accent: dashboardPalette.amber,
      icon: <PrecisionManufacturing />,
      actual: formatDashboardCurrency(processing.week),
      getValue: processingGridValue,
    },
    {
      key: 'restoration',
      label: 'Restoration',
      kind: 'count',
      accent: dashboardPalette.violet,
      icon: <Handyman />,
      actual: String(restoration.active_jobs),
      placeholder: false,
      subStat: (
        <Typography
          variant="caption"
          sx={{
            fontSize: '0.62rem',
            fontWeight: 800,
            color: 'text.secondary',
            lineHeight: 1.2,
            whiteSpace: { xs: 'normal', sm: 'nowrap' },
          }}
        >
          {restoration.active_jobs} in restoration · {restoration.returns_pending} awaiting retag
        </Typography>
      ),
      getValue: restorationGridValue,
    },
    {
      key: 'retail',
      label: 'Retail QA',
      kind: 'grade',
      accent: dashboardPalette.blue,
      icon: <WorkspacePremium />,
      actual: retail.ready && retail.last_grade ? retail.last_grade : '—',
      placeholder: !retail.ready,
      getValue: retailGridValue,
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
          <Grid key={card.key} size={{ xs: 12, sm: 6, md: 3 }} sx={{ display: 'flex', minWidth: 0, p: 1, overflow: 'visible' }}>
            <Box sx={{ width: '100%', minWidth: 0 }}>
              <DepartmentStatCard
                label={card.label}
                accent={card.accent}
                icon={card.icon}
                goalDisplay={formatDepartmentGoalValue(card.kind, goals[card.key]?.value ?? '')}
                actualDisplay={card.actual}
                placeholder={card.placeholder}
                subStat={card.subStat}
                onGoalClick={() => setOpenKey(card.key)}
                showWeekDetailButton={isCompact}
                onViewWeekDetail={() => setWeekDetailKey(card.key)}
                footer={
                  isCompact ? undefined : (
                    <DepartmentCardGrid weeks={daily_weeks} getValue={card.getValue} todayIso={todayIso} />
                  )
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

      {weekDetailCard ?
        <DepartmentWeekDetailDialog
          open={weekDetailKey !== null}
          onClose={() => setWeekDetailKey(null)}
          label={weekDetailCard.label}
          weeks={daily_weeks}
          getValue={weekDetailCard.getValue}
          todayIso={todayIso}
        />
      : null}
    </>
  );
}

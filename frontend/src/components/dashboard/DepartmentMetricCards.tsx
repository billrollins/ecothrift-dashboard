import { Box, Grid, ListItemText, Menu, MenuItem, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ShoppingBag from '@mui/icons-material/ShoppingBag';
import PrecisionManufacturing from '@mui/icons-material/PrecisionManufacturing';
import Handyman from '@mui/icons-material/Handyman';
import WorkspacePremium from '@mui/icons-material/WorkspacePremium';
import { useAuth } from '../../hooks/useAuth';
import { useQualityAudits } from '../../hooks/useQualityAudit';
import type {
  DepartmentDailyMetric,
  DepartmentDailyWeek,
  DepartmentGoalKey,
  DepartmentMetrics,
} from '../../types/pos.types';
import type { QualityAudit } from '../../types/qualityAudit.types';
import {
  DepartmentCardGrid,
  buyingGridValue,
  buyingWeekTotal,
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
  placeholder?: boolean;
  subStat?: ReactNode;
  goalMet?: boolean;
  goalStatus?: ReactNode;
  getValue: (day: DepartmentDailyMetric) => string;
  getWeekTotal: (week: DepartmentDailyWeek) => string;
  getCellState?: (day: DepartmentDailyMetric) => 'scheduled' | 'achieved' | undefined;
  getWeekAchieved?: (week: DepartmentDailyWeek) => boolean;
}

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function canOpenQualityAudit(role: string | null | undefined): boolean {
  return role === 'Admin' || role === 'Manager';
}

function formatSubmittedAt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function DepartmentMetricCards({ metrics }: DepartmentMetricCardsProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isCompact } = useDashboardLayout();
  const isSuperuser = Boolean(user?.is_superuser);
  const canOpenQa = canOpenQualityAudit(user?.role);
  const { buying, processing, restoration, retail, goals, daily_weeks } = metrics;
  const [openKey, setOpenKey] = useState<DepartmentGoalKey | null>(null);
  const [weekDetailKey, setWeekDetailKey] = useState<DepartmentGoalKey | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuAuditIds, setMenuAuditIds] = useState<number[]>([]);

  const { data: submittedAudits } = useQualityAudits(
    { status: 'submitted', limit: 100 },
    { enabled: canOpenQa && menuAuditIds.length > 1 },
  );

  const menuAudits: QualityAudit[] = useMemo(() => {
    if (!submittedAudits || menuAuditIds.length === 0) return [];
    const byId = new Map(submittedAudits.map((a) => [a.id, a]));
    return menuAuditIds.map((id) => byId.get(id)).filter(Boolean) as QualityAudit[];
  }, [submittedAudits, menuAuditIds]);

  const todayIso = useMemo(() => {
    let latest = '';
    for (const week of daily_weeks) {
      for (const day of week.days) {
        if (!day.is_future && day.date > latest) latest = day.date;
      }
    }
    return latest;
  }, [daily_weeks]);

  const formSlug = retail.form_slug || 'retail';

  function openAudit(id: number) {
    setMenuAnchor(null);
    setMenuAuditIds([]);
    navigate(`/admin/quality-audit/run/${formSlug}/${id}`);
  }

  function handleRetailCellClick(day: DepartmentDailyMetric, event: React.MouseEvent<HTMLElement>) {
    if (!canOpenQa) return;
    const ids = day.retail_audit_ids ?? [];
    if (ids.length === 0) return;
    if (ids.length === 1) {
      openAudit(ids[0]);
      return;
    }
    setMenuAuditIds(ids);
    setMenuAnchor(event.currentTarget);
  }

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
      actual: String(restoration.active_jobs),
      placeholder: false,
      subStat: (
        <Typography
          variant="caption"
          sx={{
            fontSize: { xs: '0.68rem', md: '0.62rem' },
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
      getWeekTotal: restorationWeekTotal,
    },
    {
      key: 'retail',
      label: 'Retail QA',
      kind: 'grade',
      accent: dashboardPalette.blue,
      icon: <WorkspacePremium />,
      actual: retail.ready && retail.last_grade ? retail.last_grade : '—',
      placeholder: !retail.ready,
      goalMet: retail.week_goal_met,
      goalStatus: retail.scheduled_days > 0 ? (
        <Typography
          variant="caption"
          sx={{
            fontSize: { xs: '0.68rem', md: '0.62rem' },
            fontWeight: 800,
            color: retail.due_goal_met ? dashboardPalette.greenDark : 'text.secondary',
            lineHeight: 1.25,
          }}
        >
          {retail.completed_days}/{retail.scheduled_days} days hit · {retail.week_audits}/
          {retail.week_required} audits
          {retail.schedule?.weekdays?.length
            ? ` · ${retail.schedule.weekdays.map((day) => WEEKDAY_SHORT[day]).join(' ')}`
            : ''}
          {retail.due_goal_met && !retail.week_goal_met ? ' · On track' : ''}
        </Typography>
      ) : (
        <Typography
          variant="caption"
          sx={{ fontSize: { xs: '0.68rem', md: '0.62rem' }, fontWeight: 800, color: 'text.secondary' }}
        >
          Set required audit days in Goal
        </Typography>
      ),
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
        {cards.map((card) => {
          const isRetail = card.key === 'retail';
          return (
            <Grid
              key={card.key}
              size={{ xs: 12, sm: 6, md: 6, lg: 3 }}
              sx={{ display: 'flex', minWidth: 0, p: 1, overflow: 'visible' }}
            >
              <Box sx={{ width: '100%', minWidth: 0, minHeight: 0 }}>
                <DepartmentStatCard
                  label={card.label}
                  accent={card.accent}
                  icon={card.icon}
                  goalDisplay={formatDepartmentGoalValue(card.kind, goals[card.key]?.value ?? '')}
                  actualDisplay={card.actual}
                  placeholder={card.placeholder}
                  goalMet={card.goalMet}
                  goalStatus={card.goalStatus}
                  subStat={card.subStat}
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
                        isRetail && canOpenQa
                          ? (day, event) => handleRetailCellClick(day, event)
                          : undefined
                      }
                      isCellClickable={
                        isRetail && canOpenQa ? retailDayIsClickable : undefined
                      }
                      cellAriaLabel={isRetail ? retailCellAriaLabel : undefined}
                    />
                  }
                />
              </Box>
            </Grid>
          );
        })}
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
          onCellClick={
            weekDetailCard.key === 'retail' && canOpenQa
              ? (day, event) => handleRetailCellClick(day, event)
              : undefined
          }
          isCellClickable={
            weekDetailCard.key === 'retail' && canOpenQa ? retailDayIsClickable : undefined
          }
          cellAriaLabel={weekDetailCard.key === 'retail' ? retailCellAriaLabel : undefined}
        />
      ) : null}

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => {
          setMenuAnchor(null);
          setMenuAuditIds([]);
        }}
      >
        {menuAudits.length > 0
          ? menuAudits.map((audit) => (
              <MenuItem key={audit.id} onClick={() => openAudit(audit.id)} sx={{ minHeight: 44 }}>
                <ListItemText
                  primary={`Grade ${audit.overall_grade || '—'}`}
                  secondary={formatSubmittedAt(audit.submitted_at)}
                />
              </MenuItem>
            ))
          : menuAuditIds.map((id) => (
              <MenuItem key={id} onClick={() => openAudit(id)} sx={{ minHeight: 44 }}>
                <ListItemText primary={`Audit #${id}`} />
              </MenuItem>
            ))}
      </Menu>
    </>
  );
}

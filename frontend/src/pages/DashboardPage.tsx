import { Box, Alert, Grid } from '@mui/material';
import { LoadingScreen } from '../components/feedback/LoadingScreen';
import { DepartmentMetricCards } from '../components/dashboard/DepartmentMetricCards';
import { SalesOverviewSection } from '../components/dashboard/SalesOverviewSection';
import { dashboardPalette } from '../components/dashboard/dashboardCardStyles';
import { DashboardPhone } from '../components/dashboard/phone/DashboardPhone';
import { SectionHeader } from '../components/dashboard/SectionHeader';
import { WeeklySalesList } from '../components/dashboard/WeeklySalesList';
import {
  dashboardGutterPbSx,
  dashboardGutterPtSx,
  dashboardGutterSx,
  useDashboardLayout,
} from '../components/dashboard/useDashboardLayout';
import { FloorPage } from '../components/layout/FloorPage';
import { useAuth } from '../hooks/useAuth';
import { useDashboardMetrics } from '../hooks/useDashboard';
import { t } from '../i18n/routines';

export default function DashboardPage() {
  const { user } = useAuth();
  const lang = user?.language === 'es' ? 'es' : 'en';
  const { data: metrics, isLoading, error } = useDashboardMetrics();
  const { isMobile } = useDashboardLayout();

  const showInitialLoad = isLoading && !metrics;

  if (showInitialLoad) return <LoadingScreen message="Loading dashboard..." />;

  if (error || !metrics) {
    return (
      <Box>
        <Alert severity="error">Failed to load dashboard metrics.</Alert>
      </Box>
    );
  }

  if (isMobile) {
    return <DashboardPhone metrics={metrics} />;
  }

  return (
    <FloorPage
      title={t('home', lang)}
      subtitle={t('homeSubtitle', lang)}
      fill
      contained={false}
      bodyBg={dashboardPalette.backdrop}
    >
    <Box
      sx={{
        flex: 1,
        display: 'grid',
        gridTemplateRows: 'minmax(0, 1fr) auto',
        height: '100%',
        minHeight: 0,
        gap: 2,
        overflow: 'visible',
      }}
    >
      <Box
        sx={{
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 1.25,
          overflow: 'visible',
          ...dashboardGutterSx,
          ...dashboardGutterPtSx,
        }}
      >
        <SectionHeader
          title="Sales"
          hint="Daily completed POS sales over 90 days, with weekly totals."
        />
        <Grid
          container
          spacing={1.5}
          sx={{
            flex: 1,
            minHeight: 0,
            height: 0,
            overflow: 'visible',
          }}
        >
          <Grid
            size={{ xs: 12, md: 6 }}
            sx={{
              display: 'flex',
              minHeight: 0,
              height: '100%',
            }}
          >
            <SalesOverviewSection sales={metrics.sales} />
          </Grid>
          <Grid
            size={{ xs: 12, md: 6 }}
            sx={{
              display: 'flex',
              minHeight: 0,
              height: '100%',
            }}
          >
            <WeeklySalesList
              weeks={metrics.sales.weekly_last_14_weeks}
              todayIso={metrics.sales.daily_last_90_days.at(-1)?.date}
              todayDay={metrics.sales.daily_last_90_days.at(-1)?.day}
            />
          </Grid>
        </Grid>
      </Box>

      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1.25,
          overflow: 'visible',
          ...dashboardGutterSx,
          ...dashboardGutterPbSx,
        }}
      >
        <SectionHeader
          title="Departments"
          hintDesktop="Per-department weekly metrics."
          hintMobile="Per-department weekly metrics."
        />
        <DepartmentMetricCards metrics={metrics.department_metrics} />
      </Box>
    </Box>
    </FloorPage>
  );
}

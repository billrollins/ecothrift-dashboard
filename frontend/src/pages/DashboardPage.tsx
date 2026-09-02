import { Box, Alert, Grid, Typography } from '@mui/material';
import { LoadingScreen } from '../components/feedback/LoadingScreen';
import { DepartmentMetricCards } from '../components/dashboard/DepartmentMetricCards';
import { dashboardRaisedStatSx } from '../components/dashboard/dashboardCardStyles';
import { formatDashboardCurrency } from '../components/dashboard/dashboardFormatters';
import { SalesOverviewSection } from '../components/dashboard/SalesOverviewSection';
import { SectionHeader } from '../components/dashboard/SectionHeader';
import { WeeklySalesList } from '../components/dashboard/WeeklySalesList';
import {
  dashboardGutterPbSx,
  dashboardGutterPtSx,
  dashboardGutterSx,
  useDashboardLayout,
} from '../components/dashboard/useDashboardLayout';
import { useDashboardMetrics } from '../hooks/useDashboard';

export default function DashboardPage() {
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

  return (
    <Box
      sx={{
        flex: 1,
        ...(isMobile
          ? {
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              height: 'auto',
              minHeight: 'auto',
            }
          : {
              display: 'grid',
              gridTemplateRows: 'minmax(0, 1fr) auto',
              height: '100%',
              minHeight: 0,
              gap: 2,
            }),
        overflow: 'visible',
      }}
    >
      <Box
        sx={{
          ...(isMobile ? { minHeight: 'auto' } : { minHeight: 0 }),
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
          action={
            isMobile ? (
              <Box
                sx={{
                  px: 1.15,
                  py: 0.65,
                  borderRadius: 2,
                  textAlign: 'right',
                  ...dashboardRaisedStatSx,
                }}
              >
                <Typography
                  variant="caption"
                  color="text.secondary"
                  display="block"
                  lineHeight={1}
                  sx={{
                    fontSize: '0.66rem',
                    textTransform: 'uppercase',
                    letterSpacing: 0.7,
                    fontWeight: 700,
                  }}
                >
                  Today&apos;s Sales
                </Typography>
                <Typography variant="subtitle2" fontWeight={800} lineHeight={1.35}>
                  {formatDashboardCurrency(metrics.sales.today)}
                </Typography>
              </Box>
            ) : undefined
          }
        />
        <Grid
          container
          spacing={1.5}
          sx={{
            ...(isMobile
              ? { flex: 'none', minHeight: 'auto', height: 'auto' }
              : { flex: 1, minHeight: 0, height: 0 }),
            overflow: 'visible',
          }}
        >
          <Grid
            size={{ xs: 12, md: 6 }}
            sx={{
              display: 'flex',
              ...(isMobile ? { minHeight: 0 } : { minHeight: 0, height: '100%' }),
            }}
          >
            <SalesOverviewSection sales={metrics.sales} />
          </Grid>
          <Grid
            size={{ xs: 12, md: 6 }}
            sx={{
              display: 'flex',
              ...(isMobile ? { minHeight: 0 } : { minHeight: 0, height: '100%' }),
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
  );
}

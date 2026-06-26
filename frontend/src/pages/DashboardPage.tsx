import { Box, Alert, Grid } from '@mui/material';

import { LoadingScreen } from '../components/feedback/LoadingScreen';

import { DepartmentMetricCards } from '../components/dashboard/DepartmentMetricCards';

import { SalesOverviewSection } from '../components/dashboard/SalesOverviewSection';

import { SectionHeader } from '../components/dashboard/SectionHeader';

import { WeeklySalesList } from '../components/dashboard/WeeklySalesList';

import { DASHBOARD_SHADOW_GUTTER } from '../components/dashboard/dashboardCardStyles';

import { useDashboardMetrics } from '../hooks/useDashboard';



export default function DashboardPage() {
  const { data: metrics, isLoading, error } = useDashboardMetrics();

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

        minHeight: 0,

        height: '100%',

        display: 'grid',

        gridTemplateRows: 'minmax(0, 1fr) auto',

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

          px: DASHBOARD_SHADOW_GUTTER,

          pt: DASHBOARD_SHADOW_GUTTER,

        }}

      >

        <SectionHeader

          title="Sales"

          hint="Daily completed POS sales over 90 days, with weekly totals."

        />

        <Grid container spacing={1.5} sx={{ flex: 1, minHeight: 0, height: 0, overflow: 'visible' }}>

          <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex', minHeight: 0, height: '100%' }}>

            <SalesOverviewSection sales={metrics.sales} />

          </Grid>

          <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex', minHeight: 0, height: '100%' }}>

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

          px: DASHBOARD_SHADOW_GUTTER,

          pb: DASHBOARD_SHADOW_GUTTER,

        }}

      >

        <SectionHeader

          title="Departments"

          hint="Per-department weekly metrics. Hover a card for details."

        />

        <DepartmentMetricCards metrics={metrics.department_metrics} />

      </Box>

    </Box>

  );

}



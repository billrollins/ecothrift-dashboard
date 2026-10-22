import { Box, Alert } from '@mui/material';
import { LoadingScreen } from '../components/feedback/LoadingScreen';
import { DepartmentMetricCards } from '../components/dashboard/DepartmentMetricCards';
import { SalesFlipCard } from '../components/dashboard/SalesFlipCard';
import { dashboardPalette } from '../components/dashboard/dashboardCardStyles';
import { DashboardPhone } from '../components/dashboard/phone/DashboardPhone';
import { SectionHeader } from '../components/dashboard/SectionHeader';
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

  const columnSx = {
    minWidth: 0,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 1.25,
  } as const;

  return (
    <FloorPage
      title={t('dashboard', lang)}
      subtitle={t('homeSubtitle', lang)}
      fill
      contained={false}
      bodyBg={dashboardPalette.backdrop}
    >
      {/* One screen (owner 2026-10-22): Sales on the left, the four department cards 2x2 on the right. Below a wide
          desk (lg) the two stack. Everyone sees everything here, goals included. */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          height: '100%',
          display: 'grid',
          gridTemplateColumns: { md: 'minmax(0, 1fr)', lg: 'minmax(0, 5fr) minmax(0, 7fr)' },
          gridTemplateRows: { md: 'minmax(440px, auto) auto', lg: 'minmax(560px, 1fr)' },
          columnGap: 2.5,
          rowGap: 2,
          ...dashboardGutterSx,
          ...dashboardGutterPtSx,
          ...dashboardGutterPbSx,
        }}
      >
        <Box component="section" aria-label="Sales" sx={columnSx}>
          <SectionHeader
            title="Sales"
            hint="Net item sales (after Thrift+ returns) over 90 days. The corner button shows the 14-week calendar."
          />
          <SalesFlipCard sales={metrics.sales} sx={{ flex: 1, minHeight: 0 }} />
        </Box>
        <Box component="section" aria-label="Departments" sx={columnSx}>
          <SectionHeader
            title="Departments"
            hint="This week against each goal. Tap a number for what is behind it; the corner button shows past weeks."
          />
          <DepartmentMetricCards metrics={metrics.department_metrics} />
        </Box>
      </Box>
    </FloorPage>
  );
}

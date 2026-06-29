import { useMediaQuery, useTheme } from '@mui/material';
import { DASHBOARD_SHADOW_GUTTER } from './dashboardCardStyles';

/** Dashboard layout breakpoints — aligned with MainLayout mobile nav (md). */
export function useDashboardLayout() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isCompact = useMediaQuery(theme.breakpoints.down('sm'));

  return { isMobile, isCompact };
}

/** Responsive horizontal padding for dashboard sections (shadow gutter on desktop). */
export const dashboardGutterSx = {
  px: { xs: 1, sm: 1.5, md: DASHBOARD_SHADOW_GUTTER },
} as const;

export const dashboardGutterPtSx = {
  pt: { xs: 1, sm: 1.5, md: DASHBOARD_SHADOW_GUTTER },
} as const;

export const dashboardGutterPbSx = {
  pb: { xs: 1, sm: 1.5, md: DASHBOARD_SHADOW_GUTTER },
} as const;

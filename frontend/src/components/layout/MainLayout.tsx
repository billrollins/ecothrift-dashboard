import { Suspense, useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AppBar,
  Box,
  ButtonBase,
  Drawer as MuiDrawer,
  IconButton,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
  Divider,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingScreen } from '../feedback/LoadingScreen';
import { AppErrorBoundary } from '../feedback/AppErrorBoundary';
import { ObjectModalProvider } from '../objects/ObjectModal';
import { VIEW_AS_BAND_VAR } from '../viewAs/ViewAsBanner';
import { Sidebar, SIDEBAR_WIDTH } from './Sidebar';
import { PhoneTabBar } from './PhoneTabBar';
import { phoneShellTitle, showsPhoneTabBar } from './phoneFirstRoutes';
import { getAppVersion } from '../../api/core.api';
import { useRememberPage } from '../dashFixes/rememberPage';
import logo from '../../assets/logo-full-360x120.png';
import logoIcon from '../../assets/logo-icon-32x32.png';
import { dashboardPalette } from '../dashboard/dashboardCardStyles';
import { dutyColors } from '../duty/tokens';
import { RESTORATION_BENCH_PATH } from '../../pages/restoration/restorationRoutes';
import { ClockPill } from './ClockPill';
import { TOP_BAR_SLOT_ID, TopBarBannerHost } from './TopBarBanners';
import { NotificationBell } from './NotificationBell';
import { AccountMenu } from './AccountMenu';
import { useDashboardTab } from '../../navigation/dashboardTabs';
import { hasRunner } from '../../pages/routines/todayRunner';
import { PrintServerButton } from '../printing/PrintServerButton';
import { KitPageContext } from '../page/kitSignal';
import { pageTitleFor } from '../../navigation/pageRegistry';

const DASHBOARD_BACKDROP = dashboardPalette.backdrop;

/** The View as band's height (0 when not viewing): the shell starts below it. */
const BAND = `var(${VIEW_AS_BAND_VAR}, 0px)`;

export default function MainLayout() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useAuth();
  const lang = user?.language === 'es' ? 'es' : 'en';
  const navigate = useNavigate();
  const location = useLocation();
  // Pages built with the kit (PageShell) mark themselves; while one is on screen the top bar names the page (#134).
  const [kitPages, setKitPages] = useState(0);
  const markKitPage = useCallback((delta: 1 | -1) => setKitPages((n) => Math.max(0, n + delta)), []);
  // The Dashboard is two tabs: Store (the olive numbers page) and My day (what /today was).
  const dashboardTab = useDashboardTab();
  const isDashboardPath = location.pathname === '/dashboard';
  const isDashboard = isDashboardPath && dashboardTab === 'store';
  // The other Home tabs (HR, Routines, Calendar, Messages, Profile) draw the same Home band edge to edge.
  const isHomeTab = isDashboardPath && dashboardTab !== 'store' && dashboardTab !== 'myday';
  const isToday = (isDashboardPath && dashboardTab === 'myday')
    || location.pathname === '/today' || location.pathname.startsWith('/today/');
  // A routine open on Today draws its own pane edge to edge, like the runner always did.
  const isTodayRunner = isToday && hasRunner(new URLSearchParams(location.search));
  const isRestoration = location.pathname.startsWith('/restoration');
  const isRestorationBench = location.pathname === RESTORATION_BENCH_PATH;
  const isFieldMobile = isMobile && location.pathname.startsWith('/pos/deliveries/field');
  // Routines and its Admin control room draw their own panes edge to edge.
  const isRoutines = location.pathname.startsWith('/routines') || location.pathname.startsWith('/admin/routines');
  const isRetailQa = location.pathname.startsWith('/admin/retail-qa');
  // Signage (#129): the store map takes the full height under the top bar; the page lays itself out edge to edge.
  const isSignage = location.pathname.startsWith('/facilities/signage');
  const isStaffRoutines = location.pathname.startsWith('/routines');
  const isFloorDesk = !isMobile && (isDashboard || isToday || isStaffRoutines || isHomeTab);
  const isPhoneShell = isMobile && showsPhoneTabBar(location.pathname, location.search);

  const handleDrawerToggle = () => setMobileOpen(!mobileOpen);

  useRememberPage();

  const { data: appVersion } = useQuery({
    queryKey: ['appVersion'],
    queryFn: async () => {
      const { data } = await getAppVersion();
      return data;
    },
    staleTime: Infinity,
  });

  useEffect(() => {
    const openFieldNavigation = () => setMobileOpen(true);
    window.addEventListener('eco-field-toggle-nav', openFieldNavigation);
    return () => window.removeEventListener('eco-field-toggle-nav', openFieldNavigation);
  }, []);

  const sidebarContent = (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minWidth: 0,
        overflowX: 'hidden',
      }}
    >
      {/* The logo is home: it opens the Dashboard (its last tab). Its block is the top bar's height, so the grey line
          under it meets the line under the top bar (Bill, Dash Updates #32). */}
      <Box
        sx={{
          height: isPhoneShell ? 56 : { xs: 56, sm: 64 }, flexShrink: 0, px: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, overflow: 'hidden',
        }}
      >
        <ButtonBase
          aria-label="Dashboard"
          data-testid="sidebar-logo"
          onClick={() => {
            setMobileOpen(false);
            navigate('/dashboard');
          }}
          sx={{ maxWidth: '100%', borderRadius: 1 }}
        >
          {/* The PNG has a clear band above and below the art (16 of 120 px each), so it is drawn taller than the
              block and the clear bands overflow, hidden: the logo fills the block without making it taller. */}
          <Box
            component="img"
            src={logo}
            alt="Eco-Thrift"
            sx={{ display: 'block', maxWidth: '100%', width: 'auto', height: isPhoneShell ? 58 : { xs: 58, sm: 66 } }}
          />
        </ButtonBase>
      </Box>
      <Divider />
      <Box sx={{ flexGrow: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
        <Sidebar />
      </Box>
      <Divider />
      {/* The Dash version, then this computer's print server; a click opens Printing (Bill, Dash Updates #9). */}
      <Box sx={{ px: 1, py: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25 }}>
        {appVersion?.version && (
          <Typography variant="caption" color="text.disabled">
            v{appVersion.version}
          </Typography>
        )}
        <PrintServerButton />
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', mt: BAND, height: `calc(100dvh - ${BAND})`, maxHeight: `calc(100dvh - ${BAND})`, overflow: 'hidden' }}>
      {/* Sidebar */}
      {isMobile ? (
        <MuiDrawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            '& .MuiDrawer-paper': {
              width: SIDEBAR_WIDTH,
              boxSizing: 'border-box',
              overflowX: 'hidden',
              borderRight: '1px solid #f1f5f9',
            },
          }}
        >
          {sidebarContent}
        </MuiDrawer>
      ) : (
        <MuiDrawer
          variant="permanent"
          sx={{
            width: SIDEBAR_WIDTH,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: SIDEBAR_WIDTH,
              top: BAND,
              height: `calc(100% - ${BAND})`,
              boxSizing: 'border-box',
              overflowX: 'hidden',
              borderRight: '1px solid #f1f5f9',
            },
          }}
        >
          {sidebarContent}
        </MuiDrawer>
      )}

      {/* Main Content */}
      <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* AppBar */}
        {!isFieldMobile && (
          <AppBar
            position="sticky"
            color="default"
            elevation={0}
            sx={{
              borderBottom: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
            }}
          >
            <Toolbar
              variant={isPhoneShell ? 'dense' : undefined}
              sx={isPhoneShell ? { minHeight: 56, px: 1.5 } : undefined}
            >
              {isMobile && (
                <IconButton edge="start" onClick={handleDrawerToggle} sx={{ mr: isPhoneShell ? 1 : 2 }}>
                  <MenuIcon />
                </IconButton>
              )}
              {isPhoneShell ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                  <Box
                    component="img"
                    src={logoIcon}
                    alt=""
                    sx={{ width: 32, height: 32, display: 'block' }}
                  />
                  <Typography variant="body2" fontWeight={800} noWrap>
                    {phoneShellTitle(location.pathname, lang, dashboardTab)}
                  </Typography>
                </Box>
              ) : null}
              {!isPhoneShell && kitPages > 0 ? (
                <Typography variant="h6" component="h1" noWrap sx={{ fontWeight: 800, minWidth: 0, flexShrink: 1 }}>
                  {pageTitleFor(location.pathname, location.search, location.hash)}
                </Typography>
              ) : null}
              {/* The empty middle: "this is not normal" banners (View as, training register) live here, never above
                  the page (Dash Updates #54). */}
              <Box
                id={TOP_BAR_SLOT_ID}
                sx={{ flexGrow: 1, minWidth: 0, display: 'flex', justifyContent: 'center', px: 1 }}
              >
                <TopBarBannerHost />
              </Box>
              {/* Top bar = right now: the clock, the one bell, me. */}
              {user ? (
                <>
                  <ClockPill />
                  <NotificationBell />
                  <AccountMenu />
                </>
              ) : null}
            </Toolbar>
          </AppBar>
        )}

        {/* Page Content */}
        <Box
          component="main"
          sx={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            maxWidth: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflowX: 'hidden',
            overflowY: isRestorationBench || isRoutines || isRetailQa || isSignage || (isMobile && isTodayRunner) ? 'hidden' : 'auto',
            p: isFieldMobile || isRoutines || isRetailQa || isSignage || isFloorDesk || isToday || isHomeTab || (isPhoneShell && isDashboard)
              ? 0
              : isRestoration
                ? { xs: 0.75, md: 1 }
                : isDashboard
                  ? { xs: 1, sm: 2, md: 3 }
                  : 3,
            ...(isDashboard
              ? {
                  background: DASHBOARD_BACKDROP,
                }
              : {}),
            bgcolor: isRetailQa
              ? '#f1f2ee'
              : isFieldMobile
                ? '#fff'
                : isDashboard
                  ? DASHBOARD_BACKDROP
                  : isFloorDesk
                    ? dutyColors.paper
                    : 'background.default',
          }}
        >
          <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: isRetailQa ? 'hidden' : undefined }}>
            <AppErrorBoundary variant="page" resetKey={location.pathname}>
              <Suspense fallback={<LoadingScreen message="Loading…" />}>
                {/* Any SKU / product / order link on any page opens its object modal (pages may wrap their own). */}
                <ObjectModalProvider>
                  <KitPageContext.Provider value={markKitPage}>
                    <Outlet />
                  </KitPageContext.Provider>
                </ObjectModalProvider>
              </Suspense>
            </AppErrorBoundary>
          </Box>
        </Box>
        {isPhoneShell ? <PhoneTabBar /> : null}
      </Box>
    </Box>
  );
}

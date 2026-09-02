import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AppBar,
  Avatar,
  Box,
  Drawer as MuiDrawer,
  IconButton,
  Menu,
  MenuItem,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
  Divider,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import Logout from '@mui/icons-material/Logout';
import Person from '@mui/icons-material/Person';
import LockReset from '@mui/icons-material/LockReset';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import ChangePasswordDialog from '../users/ChangePasswordDialog';
import { Sidebar, SIDEBAR_WIDTH } from './Sidebar';
import { getAppVersion } from '../../api/core.api';
import logo from '../../assets/logo-full-360x120.png';
import { dashboardPalette } from '../dashboard/dashboardCardStyles';
import { RESTORATION_BENCH_PATH } from '../../pages/restoration/restorationRoutes';
import { RoutinesNag } from '../routines/RoutinesNag';
import { useNavBadgeCounts } from '../../hooks/useNavBadgeCounts';
import { resolveNavItem } from '../../navigation/navResolve';
import { navigateForNavItem } from '../../navigation/navUtils';
import { NavWaitingBadge } from '../../navigation/NavWaitingBadge';

const PROFILE_NAV_IDS = ['timeClock', 'routines'] as const;

const DASHBOARD_BACKDROP = dashboardPalette.backdrop;

export default function MainLayout() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isDashboard = location.pathname === '/dashboard';
  const isRestoration = location.pathname.startsWith('/restoration');
  const isRestorationBench = location.pathname === RESTORATION_BENCH_PATH;
  const isFieldMobile = isMobile && location.pathname.startsWith('/pos/deliveries/field');
  // Routines and its Admin control room draw their own panes edge to edge.
  const isRoutines = location.pathname.startsWith('/routines') || location.pathname.startsWith('/admin/routines');
  const profileBadges = useNavBadgeCounts({ onlineSales: false });
  const profileNavItems = PROFILE_NAV_IDS
    .map((id) => resolveNavItem(id))
    .filter((item): item is NonNullable<typeof item> => item != null);

  const handleDrawerToggle = () => setMobileOpen(!mobileOpen);
  const handleMenuOpen = (e: React.MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget);
  const handleMenuClose = () => setAnchorEl(null);

  const handleLogout = async () => {
    handleMenuClose();
    await logout();
    navigate('/login');
  };

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
      <Box sx={{ p: 2.5, display: 'flex', justifyContent: 'center', minWidth: 0 }}>
        <img src={logo} alt="Eco-Thrift" style={{ maxWidth: '100%', width: 180, height: 'auto' }} />
      </Box>
      <Divider />
      <Box sx={{ flexGrow: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
        <Sidebar />
      </Box>
      {appVersion?.version && (
        <>
          <Divider />
          <Box sx={{ px: 2, py: 1.5, textAlign: 'center' }}>
            <Typography variant="caption" color="text.disabled">
              v{appVersion.version}
            </Typography>
          </Box>
        </>
      )}
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', height: '100dvh', maxHeight: '100dvh', overflow: 'hidden' }}>
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
            <Toolbar>
              {isMobile && (
                <IconButton edge="start" onClick={handleDrawerToggle} sx={{ mr: 2 }}>
                  <MenuIcon />
                </IconButton>
              )}
              <Box sx={{ flexGrow: 1 }} />
              {user ? (
                <Box sx={{ width: 44, height: 44, mr: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <RoutinesNag />
                </Box>
              ) : null}
              {user && (
                <>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mr: 1, display: { xs: 'none', sm: 'block' } }}
                  >
                    {user.full_name}
                  </Typography>
                  <IconButton
                    onClick={handleMenuOpen}
                    aria-label="Account menu"
                    sx={{ width: 44, height: 44 }}
                  >
                    <Avatar sx={{ width: 36, height: 36, bgcolor: 'primary.main', fontSize: 14 }}>
                      {user.first_name?.[0]}{user.last_name?.[0]}
                    </Avatar>
                  </IconButton>
                  <Menu
                    anchorEl={anchorEl}
                    open={Boolean(anchorEl)}
                    onClose={handleMenuClose}
                    transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                    anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                  >
                    <MenuItem disabled>
                      <ListItemIcon><Person fontSize="small" /></ListItemIcon>
                      <ListItemText
                        primary={user.full_name}
                        secondary={user.role}
                      />
                    </MenuItem>
                    <Divider />
                    {profileNavItems.map((item) => (
                      <MenuItem
                        key={item.id}
                        onClick={() => {
                          handleMenuClose();
                          navigateForNavItem(navigate, item);
                        }}
                      >
                        <ListItemIcon><item.Icon fontSize="small" /></ListItemIcon>
                        <ListItemText primary={item.label} />
                        <Box sx={{ width: 28, display: 'flex', justifyContent: 'flex-end' }}>
                          <NavWaitingBadge count={profileBadges[item.id] ?? 0} />
                        </Box>
                      </MenuItem>
                    ))}
                    <Divider />
                    <MenuItem
                      onClick={() => {
                        handleMenuClose();
                        setPasswordOpen(true);
                      }}
                    >
                      <ListItemIcon><LockReset fontSize="small" /></ListItemIcon>
                      <ListItemText primary="Change password" />
                    </MenuItem>
                    <MenuItem onClick={handleLogout}>
                      <ListItemIcon><Logout fontSize="small" /></ListItemIcon>
                      <ListItemText primary="Logout" />
                    </MenuItem>
                  </Menu>
                  <ChangePasswordDialog
                    open={passwordOpen}
                    onClose={() => setPasswordOpen(false)}
                  />
                </>
              )}
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
            overflowY: isRestorationBench || isRoutines ? 'hidden' : 'auto',
            p: isFieldMobile || isRoutines
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
            bgcolor: isFieldMobile ? '#fff' : isDashboard ? DASHBOARD_BACKDROP : 'background.default',
          }}
        >
          <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <Outlet />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

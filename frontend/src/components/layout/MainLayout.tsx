import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
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
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { Sidebar, SIDEBAR_WIDTH } from './Sidebar';
import { getAppVersion } from '../../api/core.api';
import logo from '../../assets/logo-full-240x80.png';

export default function MainLayout() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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

  const sidebarContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}>
        <img src={logo} alt="Eco-Thrift" style={{ maxWidth: 180, height: 'auto' }} />
      </Box>
      <Divider />
      <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
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
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      {isMobile ? (
        <MuiDrawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            '& .MuiDrawer-paper': { width: SIDEBAR_WIDTH, boxSizing: 'border-box' },
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
              borderRight: '1px solid',
              borderColor: 'divider',
            },
          }}
        >
          {sidebarContent}
        </MuiDrawer>
      )}

      {/* Main Content */}
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        {/* AppBar */}
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
            {user && (
              <>
                <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>
                  {user.full_name}
                </Typography>
                <IconButton onClick={handleMenuOpen} size="small">
                  <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: 14 }}>
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
                  <MenuItem onClick={handleLogout}>
                    <ListItemIcon><Logout fontSize="small" /></ListItemIcon>
                    <ListItemText primary="Logout" />
                  </MenuItem>
                </Menu>
              </>
            )}
          </Toolbar>
        </AppBar>

        {/* Page Content */}
        <Box component="main" sx={{ flexGrow: 1, p: 3, bgcolor: 'background.default' }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}

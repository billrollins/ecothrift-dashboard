import { Suspense } from 'react';
import { AppBar, Box, Button, Toolbar } from '@mui/material';
import Logout from '@mui/icons-material/Logout';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../../contexts/AuthContext';
import { LoadingScreen } from '../feedback/LoadingScreen';
import logoImg from '../../assets/eco-thrift-logo-color.svg';

const navItems = [
  { path: '/consignee/items', label: 'My Items' },
  { path: '/consignee/payouts', label: 'My Payouts' },
  { path: '/consignee', label: 'Summary' },
];

export function ConsigneeLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  return (
    <Box sx={{ minHeight: '100vh', backgroundColor: 'background.default' }}>
      <AppBar
        position="static"
        elevation={0}
        sx={{
          backgroundColor: 'background.paper',
          color: 'text.primary',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Toolbar sx={{ gap: 4 }}>
          <Box
            component="img"
            src={logoImg}
            alt="Eco-Thrift"
            // The old PNG's 108 x 36 box (art 108 wide), so the menu beside it stays put.
            sx={{
              height: 36,
              width: 108,
              objectFit: 'contain',
            }}
          />
          <Box sx={{ display: 'flex', gap: 1, flexGrow: 1 }}>
            {navItems.map((item) => (
              <Button
                key={item.path}
                onClick={() => navigate(item.path)}
                sx={{
                  color:
                    location.pathname === item.path ||
                    location.pathname.startsWith(item.path + '/')
                      ? 'primary.main'
                      : 'text.secondary',
                  fontWeight:
                    location.pathname === item.path ||
                    location.pathname.startsWith(item.path + '/')
                      ? 600
                      : 400,
                  textTransform: 'none',
                  '&:hover': {
                    backgroundColor: 'action.hover',
                    color: 'primary.main',
                  },
                }}
              >
                {item.label}
              </Button>
            ))}
          </Box>
          <Button
            color="inherit"
            startIcon={<Logout />}
            onClick={() => logout().then(() => navigate('/login'))}
            sx={{
              color: 'text.secondary',
              textTransform: 'none',
              '&:hover': {
                backgroundColor: 'action.hover',
                color: 'error.main',
              },
            }}
          >
            Logout
          </Button>
        </Toolbar>
      </AppBar>

      <Box
        component="main"
        sx={{
          p: 3,
          maxWidth: 1200,
          mx: 'auto',
        }}
      >
        <Suspense fallback={<LoadingScreen message="Loading…" />}>
          <Outlet />
        </Suspense>
      </Box>
    </Box>
  );
}

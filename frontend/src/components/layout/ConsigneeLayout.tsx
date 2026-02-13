import { AppBar, Box, Button, Toolbar } from '@mui/material';
import Logout from '@mui/icons-material/Logout';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../../contexts/AuthContext';
import logoImg from '../../assets/logo-full-240x80.png';

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
            sx={{
              height: 36,
              width: 'auto',
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
        <Outlet />
      </Box>
    </Box>
  );
}

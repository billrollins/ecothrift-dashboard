import {
  Collapse,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import AccessTime from '@mui/icons-material/AccessTime';
import AccountBalance from '@mui/icons-material/AccountBalance';
import Dashboard from '@mui/icons-material/Dashboard';
import Handshake from '@mui/icons-material/Handshake';
import Inventory from '@mui/icons-material/Inventory';
import LocalHospital from '@mui/icons-material/LocalHospital';
import People from '@mui/icons-material/People';
import PointOfSale from '@mui/icons-material/PointOfSale';
import Security from '@mui/icons-material/Security';
import Settings from '@mui/icons-material/Settings';
import ShoppingCart from '@mui/icons-material/ShoppingCart';
import Store from '@mui/icons-material/Store';
import SupervisorAccount from '@mui/icons-material/SupervisorAccount';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import type { UserRole } from '../../types/accounts.types';

const SIDEBAR_WIDTH = 260;

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  roles?: UserRole[];
}

interface NavSection {
  label: string;
  items: NavItem[];
  roles?: UserRole[];
  collapsible?: boolean;
}

const navSections: NavSection[] = [
  {
    label: 'Dashboard',
    items: [{ path: '/dashboard', label: 'Dashboard', icon: <Dashboard /> }],
  },
  {
    label: 'HR',
    collapsible: true,
    items: [
      { path: '/hr/time-clock', label: 'Time Clock', icon: <AccessTime /> },
      { path: '/hr/time-history', label: 'Time History', icon: <AccessTime /> },
      { path: '/hr/employees', label: 'Employees', icon: <People /> },
      { path: '/hr/sick-leave', label: 'Sick Leave', icon: <LocalHospital /> },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { path: '/inventory/vendors', label: 'Vendors', icon: <Store /> },
      { path: '/inventory/orders', label: 'Orders', icon: <ShoppingCart /> },
      { path: '/inventory/processing', label: 'Processing', icon: <Inventory /> },
      { path: '/inventory/products', label: 'Products', icon: <Inventory /> },
      { path: '/inventory/items', label: 'Items', icon: <Inventory /> },
    ],
  },
  {
    label: 'POS',
    items: [
      { path: '/pos/terminal', label: 'Terminal', icon: <PointOfSale /> },
      { path: '/pos/drawers', label: 'Drawers', icon: <AccountBalance /> },
      { path: '/pos/cash', label: 'Cash Management', icon: <AccountBalance /> },
      { path: '/pos/transactions', label: 'Transactions', icon: <Inventory /> },
    ],
  },
  {
    label: 'Consignment',
    roles: ['Manager', 'Admin'],
    collapsible: true,
    items: [
      { path: '/consignment/accounts', label: 'Accounts', icon: <Handshake /> },
      { path: '/consignment/items', label: 'Items', icon: <Handshake /> },
      { path: '/consignment/payouts', label: 'Payouts', icon: <AccountBalance /> },
    ],
  },
  {
    label: 'Admin',
    roles: ['Admin'],
    collapsible: true,
    items: [
      { path: '/admin/users', label: 'Users', icon: <SupervisorAccount /> },
      { path: '/admin/permissions', label: 'Permissions', icon: <Security /> },
      { path: '/admin/settings', label: 'Settings', icon: <Settings /> },
    ],
  },
];

function canAccess(userRole: UserRole | null, sectionRoles?: UserRole[]): boolean {
  if (!sectionRoles || sectionRoles.length === 0) return true;
  if (!userRole) return false;
  return sectionRoles.includes(userRole);
}

function NavItemButton({
  label,
  icon,
  isActive,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <ListItemButton
      onClick={onClick}
      selected={isActive}
      sx={{
        borderRadius: 1,
        mx: 1,
        mb: 0.5,
        '&.Mui-selected': {
          backgroundColor: 'primary.main',
          color: 'primary.contrastText',
          '&:hover': {
            backgroundColor: 'primary.dark',
          },
          '& .MuiListItemIcon-root': {
            color: 'inherit',
          },
        },
      }}
    >
      <ListItemIcon sx={{ minWidth: 40 }}>{icon}</ListItemIcon>
      <ListItemText primary={label} primaryTypographyProps={{ variant: 'body2' }} />
    </ListItemButton>
  );
}

export function Sidebar() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const userRole = user?.role ?? null;

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    HR: true,
    Inventory: true,
    POS: true,
    Consignment: true,
    Admin: true,
  });

  const toggleSection = (label: string) => {
    setOpenSections((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <List
      component="nav"
      sx={{
        width: SIDEBAR_WIDTH,
        pt: 2,
        px: 1,
      }}
    >
      {navSections.map((section) => {
        if (!canAccess(userRole, section.roles)) return null;

        const isSectionActive = section.items.some(
          (item) => location.pathname === item.path || location.pathname.startsWith(item.path + '/')
        );

        if (section.collapsible) {
          const isOpen = openSections[section.label] ?? true;
          return (
            <div key={section.label}>
              <ListItemButton
                onClick={() => toggleSection(section.label)}
                sx={{
                  borderRadius: 1,
                  mx: 1,
                  mb: 0.5,
                  ...(isSectionActive && {
                    backgroundColor: 'action.selected',
                  }),
                }}
              >
                <ListItemText
                  primary={section.label}
                  primaryTypographyProps={{ variant: 'subtitle2', fontWeight: 600 }}
                />
                {isOpen ? <ExpandLess /> : <ExpandMore />}
              </ListItemButton>
              <Collapse in={isOpen} timeout="auto" unmountOnExit>
                <List component="div" disablePadding>
                  {section.items.map((item) => (
                    <NavItemButton
                      key={item.path}
                      label={item.label}
                      icon={item.icon}
                      isActive={
                        location.pathname === item.path ||
                        location.pathname.startsWith(item.path + '/')
                      }
                      onClick={() => navigate(item.path)}
                    />
                  ))}
                </List>
              </Collapse>
            </div>
          );
        }

          return (
          <div key={section.label}>
            {section.items.map((item) => (
              <NavItemButton
                key={item.path}
                label={item.label}
                icon={item.icon}
                isActive={
                  location.pathname === item.path ||
                  location.pathname.startsWith(item.path + '/')
                }
                onClick={() => navigate(item.path)}
              />
            ))}
          </div>
        );
      })}
    </List>
  );
}

export { SIDEBAR_WIDTH };

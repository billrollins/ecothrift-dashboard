import {
  Box,
  Chip,
  Collapse,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from '@mui/material';
import { alpha, useTheme, type Theme } from '@mui/material/styles';
import AccessTime from '@mui/icons-material/AccessTime';
import AccountBalance from '@mui/icons-material/AccountBalance';
import Article from '@mui/icons-material/Article';
import AssignmentTurnedIn from '@mui/icons-material/AssignmentTurnedIn';
import Dashboard from '@mui/icons-material/Dashboard';
import Handshake from '@mui/icons-material/Handshake';
import Balance from '@mui/icons-material/Balance';
import CategoryOutlined from '@mui/icons-material/CategoryOutlined';
import Description from '@mui/icons-material/Description';
import History from '@mui/icons-material/History';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import LocalShipping from '@mui/icons-material/LocalShipping';
import LocalOffer from '@mui/icons-material/LocalOffer';
import Inventory from '@mui/icons-material/Inventory';
import LocalHospital from '@mui/icons-material/LocalHospital';
import People from '@mui/icons-material/People';
import PointOfSale from '@mui/icons-material/PointOfSale';
import Gavel from '@mui/icons-material/Gavel';
import Star from '@mui/icons-material/Star';
import Security from '@mui/icons-material/Security';
import Settings from '@mui/icons-material/Settings';
import ShoppingCart from '@mui/icons-material/ShoppingCart';
import Store from '@mui/icons-material/Store';
import Tune from '@mui/icons-material/Tune';
import FactCheck from '@mui/icons-material/FactCheck';
import SupervisorAccount from '@mui/icons-material/SupervisorAccount';
import Search from '@mui/icons-material/Search';
import { useEffect, useState, type ReactNode } from 'react';
import { type NavigateFunction, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import type { UserRole } from '../../types/accounts.types';

const SIDEBAR_WIDTH = 260;

const LS_INVENTORY_SUBGROUPS = 'ecothrift.sidebar.inventorySubgroups.v1';

const DEFAULT_INVENTORY_SUBGROUPS: Record<string, boolean> = {
  inbound: true,
  items: false,
  vendors: false,
  admin: false,
};

function loadInventorySubgroupState(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(LS_INVENTORY_SUBGROUPS);
    if (!raw) return { ...DEFAULT_INVENTORY_SUBGROUPS };
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return { ...DEFAULT_INVENTORY_SUBGROUPS, ...parsed };
  } catch {
    return { ...DEFAULT_INVENTORY_SUBGROUPS };
  }
}

function saveInventorySubgroupState(state: Record<string, boolean>) {
  try {
    localStorage.setItem(LS_INVENTORY_SUBGROUPS, JSON.stringify(state));
  } catch {
    /* ignore quota */
  }
}

/** Rank for nav access: Admin 3, Manager 2, Employee 1, Consignee 0. */
const ROLE_RANK: Record<UserRole, number> = {
  Admin: 3,
  Manager: 2,
  Employee: 1,
  Consignee: 0,
};

function effectiveRoleRank(user: { role: UserRole | null; roles?: UserRole[] } | null): number {
  if (!user) return -1;
  if (user.roles?.length) {
    return Math.max(...user.roles.map((r) => ROLE_RANK[r] ?? -1));
  }
  if (user.role) return ROLE_RANK[user.role] ?? -1;
  return -1;
}

function canAccessNav(
  user: { role: UserRole | null; roles?: UserRole[] } | null,
  itemRoles?: UserRole[],
): boolean {
  if (!itemRoles || itemRoles.length === 0) return true;
  const ur = effectiveRoleRank(user);
  if (ur < 0) return false;
  const minRequired = Math.min(...itemRoles.map((r) => ROLE_RANK[r]));
  return ur >= minRequired;
}

interface NavItem {
  path: string;
  label: string;
  icon: ReactNode;
  roles?: UserRole[];
  navigateHash?: string;
  inactiveWhenHash?: string;
  /** Query string for disambiguating placeholder routes, e.g. `?view=orders` */
  navSearch?: string;
  /** Small pill · escape hatch routes */
  legacy?: boolean;
}

type SubgroupIconAccent = 'inbound' | 'items' | 'vendors' | 'admin';

interface NavSubgroup {
  /** Stable key for persistence and collapse */
  id: string;
  label: string;
  items: NavItem[];
  iconAccent?: SubgroupIconAccent;
}

interface NavSection {
  label: string;
  items?: NavItem[];
  subgroups?: NavSubgroup[];
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
    collapsible: true,
    subgroups: [
      {
        id: 'inbound',
        label: 'Inbound fulfillment',
        iconAccent: 'inbound',
        items: [
          {
            path: '/inventory/orders',
            label: 'Orders',
            icon: <ShoppingCart />,
          },
          {
            path: '/inventory/inbound',
            navSearch: '?view=manifest',
            label: 'Manifest prep',
            icon: <Article />,
          },
          {
            path: '/inventory/receiving',
            label: 'Receiving',
            icon: <LocalShipping />,
          },
          {
            path: '/inventory/inbound',
            navSearch: '?view=processing',
            label: 'Processing',
            icon: <Inventory />,
          },
          {
            path: '/inventory/inbound',
            navSearch: '?view=finalization',
            label: 'Finalization',
            icon: <AssignmentTurnedIn />,
          },
          {
            path: '/inventory/inbound',
            navSearch: '?view=disputes',
            label: 'Disputes',
            icon: <Balance />,
          },
        ],
      },
      {
        id: 'items',
        label: 'Items',
        iconAccent: 'items',
        items: [
          {
            path: '/inventory/items',
            label: 'Search items',
            icon: <Search />,
          },
          {
            path: '/inventory/quick-reprice',
            label: 'Quick reprice',
            icon: <LocalOffer />,
          },
          {
            path: '/inventory/products',
            label: 'Products',
            icon: <Inventory />,
          },
        ],
      },
      {
        id: 'vendors',
        label: 'Vendors',
        iconAccent: 'vendors',
        items: [
          { path: '/inventory/vendors', label: 'Vendors', icon: <Store /> },
          {
            path: '/inventory/templates',
            label: 'Manifest templates',
            icon: <Description />,
          },
        ],
      },
      {
        id: 'admin',
        label: 'Admin',
        iconAccent: 'admin',
        items: [
          {
            path: '/inventory/admin/categories',
            label: 'Categories',
            icon: <CategoryOutlined />,
          },
          {
            path: '/inventory/legacy',
            label: 'Legacy inventory pages',
            icon: <History />,
            legacy: true,
          },
        ],
      },
    ],
  },
  {
    label: 'POS',
    collapsible: true,
    items: [
      { path: '/pos/terminal', label: 'Terminal', icon: <PointOfSale /> },
      { path: '/pos/drawers', label: 'Drawers', icon: <AccountBalance /> },
      { path: '/pos/cash', label: 'Cash Management', icon: <AccountBalance /> },
      { path: '/pos/transactions', label: 'Transactions', icon: <Inventory /> },
    ],
  },
  {
    label: 'Buying',
    collapsible: true,
    items: [
      { path: '/buying/auctions', label: 'Auctions', icon: <Gavel /> },
      { path: '/buying/watchlist', label: 'Watchlist', icon: <Star /> },
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
    roles: ['Manager', 'Admin'],
    collapsible: true,
    items: [
      {
        path: '/admin/assumptions',
        label: 'Assumptions',
        icon: <FactCheck />,
        roles: ['Manager', 'Admin'],
      },
      {
        path: '/admin/pos-setup',
        label: 'POS setup',
        icon: <Tune />,
        roles: ['Manager', 'Admin'],
      },
      { path: '/admin/users', label: 'Users', icon: <SupervisorAccount />, roles: ['Admin'] },
      { path: '/admin/customers', label: 'Customers', icon: <People />, roles: ['Admin'] },
      { path: '/admin/permissions', label: 'Permissions', icon: <Security />, roles: ['Admin'] },
      { path: '/admin/settings', label: 'Settings', icon: <Settings />, roles: ['Manager', 'Admin'] },
    ],
  },
];

function navItemIsActive(
  pathname: string,
  search: string,
  hash: string,
  item: NavItem,
): boolean {
  if (item.navSearch != null && item.navSearch !== '') {
    const canon = item.navSearch.startsWith('?') ? item.navSearch : `?${item.navSearch}`;
    return pathname === item.path && search === canon;
  }
  const itemPathRaw = item.path;
  if (itemPathRaw.includes('?')) {
    const [p, qs] = itemPathRaw.split('?');
    if (!p) return false;
    return pathname === p && search === `?${qs}`;
  }
  const pathOk = pathname === itemPathRaw || pathname.startsWith(`${itemPathRaw}/`);

  if (item.navigateHash) {
    return pathOk && hash === item.navigateHash;
  }
  if (item.inactiveWhenHash && hash === item.inactiveWhenHash) {
    return false;
  }
  return pathOk;
}

function navigateForNavItem(navigateFn: NavigateFunction, item: NavItem) {
  if (item.navSearch != null && item.navSearch !== '') {
    const canon = item.navSearch.startsWith('?') ? item.navSearch : `?${item.navSearch}`;
    navigateFn({ pathname: item.path, search: canon, hash: '' });
    return;
  }
  const raw = item.path;
  if (raw.includes('?')) {
    const [p, qs] = raw.split('?');
    if (p) navigateFn({ pathname: p, search: qs ? `?${qs}` : '' });
    return;
  }
  navigateFn({
    pathname: raw,
    hash: item.navigateHash ?? '',
  });
}

function flattenSectionItems(section: NavSection): NavItem[] {
  if (section.subgroups?.length) {
    return section.subgroups.flatMap((g) => g.items);
  }
  return section.items ?? [];
}

function mutedIconColor(theme: Theme, accent?: SubgroupIconAccent): string {
  if (!accent) return theme.palette.text.secondary;
  switch (accent) {
    case 'inbound':
      return alpha(theme.palette.primary.main, 0.7);
    case 'items':
      return alpha(theme.palette.grey[700], 0.85);
    case 'vendors':
      return '#64748b';
    case 'admin':
      return alpha(theme.palette.text.secondary, 1);
    default:
      return theme.palette.text.secondary;
  }
}

function NavItemButton({
  label,
  icon,
  isActive,
  onClick,
  iconTint,
  legacy,
}: {
  label: string;
  icon: ReactNode;
  isActive: boolean;
  onClick: () => void;
  /** Muted icon color when not active */
  iconTint?: string;
  legacy?: boolean;
}) {
  const theme = useTheme();
  const inactiveIconColor = iconTint ?? theme.palette.text.secondary;

  return (
    <ListItemButton
      selected={isActive}
      onClick={onClick}
      sx={{
        borderRadius: 1,
        mx: 1,
        mb: 0.5,
        minHeight: 40,
        minWidth: 0,
        py: legacy ? 0.75 : 1,
        pl: 2,
        pr: 1.5,
        transition: theme.transitions.create('background-color', {
          duration: 120,
          easing: theme.transitions.easing.easeInOut,
        }),
        ...(!isActive && {
          '&:hover': {
            bgcolor: 'grey.50',
          },
        }),
        '&.Mui-selected': {
          bgcolor: alpha(theme.palette.primary.main, 0.06),
          color: 'text.primary',
          boxShadow: `inset 3px 0 0 ${theme.palette.primary.main}`,
          '&:hover': {
            bgcolor: alpha(theme.palette.primary.main, 0.09),
          },
          '& .MuiListItemIcon-root': {
            color: theme.palette.primary.main,
          },
        },
        '&:focus-visible': {
          outline: `2px solid ${theme.palette.primary.main}`,
          outlineOffset: 2,
        },
      }}
    >
      <ListItemIcon
        sx={{
          minWidth: 40,
          flexShrink: 0,
          color: isActive ? theme.palette.primary.main : inactiveIconColor,
          '& .MuiSvgIcon-root': { fontSize: 20 },
        }}
      >
        {icon}
      </ListItemIcon>
      <ListItemText
        primary={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
            <Typography
              component="span"
              variant="body2"
              fontWeight={isActive ? 600 : 500}
              color="text.primary"
              sx={{
                fontSize: '0.8125rem',
                lineHeight: 1.3,
              }}
              noWrap
            >
              {label}
            </Typography>
            {legacy && (
              <Chip
                component="span"
                label="Legacy"
                size="small"
                variant="outlined"
                sx={{
                  flexShrink: 0,
                  height: 18,
                  borderColor: 'divider',
                  color: 'text.secondary',
                  '& .MuiChip-label': {
                    px: 0.75,
                    fontSize: '0.625rem',
                    fontWeight: 600,
                  },
                }}
              />
            )}
          </Box>
        }
        sx={{ minWidth: 0, my: 0 }}
      />
    </ListItemButton>
  );
}

/** Collapsible inventory subgroup header + nested links */
function InventorySubgroupBlock({
  sg,
  sgIdx,
  isOpen,
  onToggle,
  pathname,
  search,
  hash,
  navigate,
  theme,
}: {
  sg: NavSubgroup;
  sgIdx: number;
  isOpen: boolean;
  onToggle: () => void;
  pathname: string;
  search: string;
  hash: string;
  navigate: ReturnType<typeof useNavigate>;
  theme: Theme;
}) {
  const { user } = useAuth();
  const iconMuted = mutedIconColor(theme, sg.iconAccent);

  return (
    <Box
      sx={{
        mt: sgIdx > 0 ? 2.5 : 0,
        pt: sgIdx > 0 ? 2 : 0,
        borderTop: sgIdx > 0 ? '1px solid #e2e8f0' : 'none',
      }}
    >
      <ListItemButton
        dense
        onClick={onToggle}
        sx={{
          borderRadius: 1,
          mx: 1,
          py: 0.75,
          pr: 1,
          minHeight: 36,
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <Typography
          component="span"
          sx={{
            flexGrow: 1,
            typography: 'caption',
            fontSize: '0.625rem',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'text.secondary',
            lineHeight: 1.5,
          }}
        >
          {sg.label}
        </Typography>
        {isOpen ? (
          <ExpandLess sx={{ fontSize: 12, color: 'text.disabled', flexShrink: 0 }} />
        ) : (
          <ExpandMore sx={{ fontSize: 12, color: 'text.disabled', flexShrink: 0 }} />
        )}
      </ListItemButton>
      <Collapse in={isOpen} timeout={{ enter: 200, exit: 200 }} unmountOnExit>
        <List component="div" disablePadding>
          {sg.items.map((item) => {
            if (!canAccessNav(user, item.roles)) return null;
            const rowKey = `${item.label}-${item.path}-${item.navigateHash ?? ''}-${item.navSearch ?? ''}`;
            return (
              <NavItemButton
                key={rowKey}
                label={item.label}
                icon={item.icon}
                iconTint={iconMuted}
                legacy={item.legacy}
                isActive={navItemIsActive(pathname, search, hash, item)}
                onClick={() => navigateForNavItem(navigate, item)}
              />
            );
          })}
        </List>
      </Collapse>
    </Box>
  );
}

export function Sidebar() {
  const theme = useTheme();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname;
  const search = location.search;
  const hash = location.hash || '';

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    HR: true,
    Inventory: true,
    POS: true,
    Buying: true,
    Consignment: true,
    Admin: true,
  });

  const [inventorySubOpen, setInventorySubOpen] = useState<Record<string, boolean>>(loadInventorySubgroupState);

  useEffect(() => {
    const inv = navSections.find((s) => s.label === 'Inventory');
    if (!inv?.subgroups) return;
    setInventorySubOpen((prev) => {
      let next = prev;
      let changed = false;
      for (const sg of inv.subgroups!) {
        const hasActive = sg.items.some((item) =>
          navItemIsActive(pathname, search, hash, item),
        );
        if (hasActive && !prev[sg.id]) {
          if (!changed) {
            next = { ...prev };
            changed = true;
          }
          next[sg.id] = true;
        }
      }
      if (changed) {
        saveInventorySubgroupState(next);
      }
      return next;
    });
  }, [pathname, search, hash]);

  const toggleInventorySubgroup = (id: string) => {
    setInventorySubOpen((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      saveInventorySubgroupState(next);
      return next;
    });
  };

  const toggleSection = (label: string) => {
    setOpenSections((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <List
      component="nav"
      sx={{
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        pt: 2,
        px: 1,
        overflowX: 'hidden',
      }}
    >
      {navSections.map((section) => {
        if (!canAccessNav(user, section.roles)) return null;

        const flatItems = flattenSectionItems(section);
        const isSectionActive = flatItems.some((item) =>
          navItemIsActive(pathname, search, hash, item),
        );

        const renderNavItemRow = (
          item: NavItem,
          iconTint?: string,
        ) => {
          if (!canAccessNav(user, item.roles)) return null;
          const rowKey = `${item.label}-${item.path}-${item.navigateHash ?? ''}-${item.navSearch ?? ''}`;
          return (
            <NavItemButton
              key={rowKey}
              label={item.label}
              icon={item.icon}
              iconTint={iconTint}
              legacy={item.legacy}
              isActive={navItemIsActive(pathname, search, hash, item)}
              onClick={() => navigateForNavItem(navigate, item)}
            />
          );
        };

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
                  pr: 1,
                  ...(isSectionActive && {
                    backgroundColor: 'action.selected',
                  }),
                }}
              >
                <ListItemText
                  primary={section.label}
                  primaryTypographyProps={{ variant: 'subtitle2', fontWeight: 600, noWrap: true }}
                  sx={{ minWidth: 0 }}
                />
                {isOpen ? (
                  <ExpandLess sx={{ flexShrink: 0 }} />
                ) : (
                  <ExpandMore sx={{ flexShrink: 0 }} />
                )}
              </ListItemButton>
              <Collapse in={isOpen} timeout="auto" unmountOnExit>
                <List component="div" disablePadding>
                  {section.label === 'Inventory' && section.subgroups?.length ? (
                    section.subgroups.map((sg, sgIdx) => (
                      <InventorySubgroupBlock
                        key={sg.id}
                        sg={sg}
                        sgIdx={sgIdx}
                        isOpen={inventorySubOpen[sg.id] ?? DEFAULT_INVENTORY_SUBGROUPS[sg.id] ?? false}
                        onToggle={() => toggleInventorySubgroup(sg.id)}
                        pathname={pathname}
                        search={search}
                        hash={hash}
                        navigate={navigate}
                        theme={theme}
                      />
                    ))
                  ) : (
                    (section.items ?? []).map((item) => renderNavItemRow(item, mutedIconColor(theme)))
                  )}
                </List>
              </Collapse>
            </div>
          );
        }

        return (
          <div key={section.label}>
            {(section.items ?? []).map((item) => renderNavItemRow(item, mutedIconColor(theme)))}
          </div>
        );
      })}
    </List>
  );
}

export { SIDEBAR_WIDTH };

import { Box, BottomNavigation, BottomNavigationAction } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useNavBadgeCounts } from '../../hooks/useNavBadgeCounts';
import { t } from '../../i18n/routines';
import { FLOOR_NAV_IDS, FLOOR_NAV_LABEL_KEYS, isFloorNavId } from '../../navigation/floorNav';
import { resolveNavItems } from '../../navigation/navResolve';
import { navItemIsActive, navigateForNavItem } from '../../navigation/navUtils';
import { NavWaitingBadge } from '../../navigation/NavWaitingBadge';
import type { ResolvedNavItem } from '../../navigation/navTypes';

export const PHONE_TAB_BAR_HEIGHT = 56;

export const PHONE_TAB_IDS = FLOOR_NAV_IDS;

export function PhoneTabBar() {
  const { user } = useAuth();
  const lang = user?.language === 'es' ? 'es' : 'en';
  const navigate = useNavigate();
  const location = useLocation();
  const items = resolveNavItems(user, [...FLOOR_NAV_IDS]);
  const badges = useNavBadgeCounts({ onlineSales: false });

  const activeId = items.find((item) =>
    navItemIsActive(location.pathname, location.search, location.hash || '', item),
  )?.id ?? false;

  return (
    <BottomNavigation
      showLabels
      value={activeId}
      sx={{
        flexShrink: 0,
        width: '100%',
        height: `calc(${PHONE_TAB_BAR_HEIGHT}px + env(safe-area-inset-bottom))`,
        pb: 'env(safe-area-inset-bottom)',
        borderTop: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        '& .MuiBottomNavigationAction-root': {
          minWidth: 0,
          px: 0.5,
          minHeight: PHONE_TAB_BAR_HEIGHT,
        },
        '& .Mui-selected': {
          color: 'primary.main',
        },
      }}
    >
      {items.map((item) => (
        <BottomNavigationAction
          key={item.id}
          value={item.id}
          label={isFloorNavId(item.id) ? t(FLOOR_NAV_LABEL_KEYS[item.id], lang) : item.label}
          icon={<TabIcon item={item} count={badges[item.id] ?? 0} />}
          onClick={() => {
            if (item.id === 'today') {
              if (location.pathname !== item.path) navigate(item.path);
              return;
            }
            if (navItemIsActive(location.pathname, location.search, location.hash || '', item)) {
              return;
            }
            navigateForNavItem(navigate, item);
          }}
        />
      ))}
    </BottomNavigation>
  );
}

function TabIcon({ item, count }: { item: ResolvedNavItem; count: number }) {
  const Icon = item.Icon;
  return (
    <Box sx={{ position: 'relative', width: 24, height: 24 }}>
      <Icon sx={{ fontSize: 24 }} />
      <Box
        sx={{
          position: 'absolute',
          top: -8,
          right: -14,
          width: 18,
          height: 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <NavWaitingBadge count={count} />
      </Box>
    </Box>
  );
}

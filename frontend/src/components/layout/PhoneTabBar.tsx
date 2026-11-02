import { Box, BottomNavigation, BottomNavigationAction } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useNavBadgeCounts, useNavBadgeTones } from '../../hooks/useNavBadgeCounts';
import { t } from '../../i18n/routines';
import { FLOOR_TABS } from '../../navigation/floorNav';
import { dashboardTabHref, saveDashboardTab, useDashboardTab } from '../../navigation/dashboardTabs';
import { resolveNavItem } from '../../navigation/navResolve';
import { NavWaitingBadge, type NavBadgeTone } from '../../navigation/NavWaitingBadge';
import type { ResolvedNavItem } from '../../navigation/navTypes';

export const PHONE_TAB_BAR_HEIGHT = 56;

/** The phone twin of FloorNav: Store | My day. */
export function PhoneTabBar() {
  const { user } = useAuth();
  const lang = user?.language === 'es' ? 'es' : 'en';
  const navigate = useNavigate();
  const activeTab = useDashboardTab();
  const badges = useNavBadgeCounts({ onlineSales: false });
  const tones = useNavBadgeTones();

  return (
    <BottomNavigation
      showLabels
      value={activeTab}
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
      {FLOOR_TABS.map((tab) => {
        const item = resolveNavItem(tab.navId);
        if (!item) return null;
        return (
          <BottomNavigationAction
            key={tab.id}
            value={tab.id}
            label={t(tab.labelKey, lang)}
            icon={<TabIcon item={item} count={badges[tab.navId] ?? 0} tone={tones[tab.navId]} />}
            onClick={() => {
              saveDashboardTab(user?.id, tab.id);
              if (tab.id === activeTab) return;
              navigate(dashboardTabHref(tab.id));
            }}
          />
        );
      })}
    </BottomNavigation>
  );
}

function TabIcon({ item, count, tone }: { item: ResolvedNavItem; count: number; tone?: NavBadgeTone }) {
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
        <NavWaitingBadge count={count} tone={tone} />
      </Box>
    </Box>
  );
}

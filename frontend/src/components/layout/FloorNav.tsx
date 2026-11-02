import { Box, ButtonBase } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { dutyColors } from '../duty/tokens';
import { useAuth } from '../../hooks/useAuth';
import { useNavBadgeCounts, useNavBadgeTones } from '../../hooks/useNavBadgeCounts';
import { t } from '../../i18n/routines';
import { FLOOR_TABS } from '../../navigation/floorNav';
import {
  dashboardTabHref,
  saveDashboardTab,
  useDashboardTab,
  type DashboardTab,
} from '../../navigation/dashboardTabs';
import { resolveNavItem } from '../../navigation/navResolve';
import type { ResolvedNavItem } from '../../navigation/navTypes';
import { NavWaitingBadge, type NavBadgeTone } from '../../navigation/NavWaitingBadge';

/**
 * The desk twin of PhoneTabBar: the Dashboard's two tabs, Store and My day. Identical on
 * every Dashboard tab; only the active one changes. The choice is remembered per person.
 */
export function FloorNav() {
  const { user } = useAuth();
  const lang = user?.language === 'es' ? 'es' : 'en';
  const navigate = useNavigate();
  const activeTab = useDashboardTab();
  const badges = useNavBadgeCounts({ onlineSales: false });
  const tones = useNavBadgeTones();

  const pick = (tab: DashboardTab) => {
    saveDashboardTab(user?.id, tab);
    if (tab === activeTab) return;
    navigate(dashboardTabHref(tab));
  };

  return (
    <Box
      role="tablist"
      sx={{
        display: 'flex',
        alignItems: 'center',
        height: 40,
        p: '3px',
        borderRadius: '10px',
        bgcolor: 'rgba(255,255,255,0.14)',
        flexShrink: 0,
      }}
    >
      {FLOOR_TABS.map((tab) => {
        const item = resolveNavItem(tab.navId);
        if (!item) return null;
        return (
          <FloorNavItem
            key={tab.id}
            item={item}
            label={t(tab.labelKey, lang)}
            count={badges[tab.navId] ?? 0}
            tone={tones[tab.navId]}
            active={tab.id === activeTab}
            onPick={() => pick(tab.id)}
          />
        );
      })}
    </Box>
  );
}

function FloorNavItem({
  item,
  label,
  count,
  tone,
  active,
  onPick,
}: {
  item: ResolvedNavItem;
  label: string;
  count: number;
  tone?: NavBadgeTone;
  active: boolean;
  onPick: () => void;
}) {
  const Icon = item.Icon;
  return (
    <ButtonBase
      onClick={onPick}
      role="tab"
      aria-label={label}
      aria-selected={active}
      aria-current={active ? 'page' : undefined}
      sx={{
        height: 34,
        px: 1.25,
        borderRadius: '8px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        flexShrink: 0,
        color: active ? dutyColors.brandDark : 'rgba(255,255,255,0.88)',
        bgcolor: active ? '#fff' : 'transparent',
        boxShadow: active ? '0 1px 3px rgba(0,0,0,0.18)' : 'none',
        '&:hover': { bgcolor: active ? '#fff' : 'rgba(255,255,255,0.10)' },
      }}
    >
      <Icon sx={{ fontSize: 18, color: 'inherit' }} />
      <Box
        component="span"
        sx={{
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: '0.01em',
          whiteSpace: 'nowrap',
          color: 'inherit',
        }}
      >
        {label}
      </Box>
      <Box sx={{ width: 20, display: 'flex', justifyContent: 'flex-end' }}>
        <NavWaitingBadge count={count} tone={tone} />
      </Box>
    </ButtonBase>
  );
}

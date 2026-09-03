import { Box, ButtonBase } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { dutyColors } from '../duty/tokens';
import { useAuth } from '../../hooks/useAuth';
import { useNavBadgeCounts } from '../../hooks/useNavBadgeCounts';
import { t } from '../../i18n/routines';
import {
  FLOOR_NAV_EXTRA_IDS,
  FLOOR_NAV_IDS,
  FLOOR_NAV_LABEL_KEYS,
  isFloorNavId,
} from '../../navigation/floorNav';
import { resolveNavItems } from '../../navigation/navResolve';
import type { ResolvedNavItem } from '../../navigation/navTypes';
import { navItemIsActive, navigateForNavItem } from '../../navigation/navUtils';
import { NavWaitingBadge } from '../../navigation/NavWaitingBadge';

/**
 * The desk twin of PhoneTabBar: Home / Today / Pay / Routines, plus Settings
 * behind a divider for Manager+. Identical on every floor page; only the
 * active item changes.
 */
export function FloorNav() {
  const { user } = useAuth();
  const lang = user?.language === 'es' ? 'es' : 'en';
  const navigate = useNavigate();
  const location = useLocation();
  const items = resolveNavItems(user, [...FLOOR_NAV_IDS]);
  const extras = resolveNavItems(user, [...FLOOR_NAV_EXTRA_IDS]);
  const badges = useNavBadgeCounts({ onlineSales: false });

  const isActive = (item: ResolvedNavItem) =>
    navItemIsActive(location.pathname, location.search, location.hash || '', item);

  const pick = (item: ResolvedNavItem) => {
    if (isActive(item)) return;
    navigateForNavItem(navigate, item);
  };

  return (
    <Box
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
      {items.map((item) => (
        <FloorNavItem
          key={item.id}
          item={item}
          label={isFloorNavId(item.id) ? t(FLOOR_NAV_LABEL_KEYS[item.id], lang) : item.label}
          count={badges[item.id] ?? 0}
          active={isActive(item)}
          onPick={() => pick(item)}
        />
      ))}
      {extras.length > 0 ? (
        <>
          <Box
            aria-hidden
            sx={{ width: '1px', height: 22, mx: '3px', bgcolor: 'rgba(255,255,255,0.32)', flexShrink: 0 }}
          />
          {extras.map((item) => (
            <FloorNavItem
              key={item.id}
              item={item}
              label={item.id === 'settings' ? t('settings', lang) : item.label}
              count={badges[item.id] ?? 0}
              active={isActive(item)}
              onPick={() => pick(item)}
            />
          ))}
        </>
      ) : null}
    </Box>
  );
}

function FloorNavItem({
  item,
  label,
  count,
  active,
  onPick,
}: {
  item: ResolvedNavItem;
  label: string;
  count: number;
  active: boolean;
  onPick: () => void;
}) {
  const Icon = item.Icon;
  return (
    <ButtonBase
      onClick={onPick}
      aria-label={label}
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
        <NavWaitingBadge count={count} />
      </Box>
    </ButtonBase>
  );
}

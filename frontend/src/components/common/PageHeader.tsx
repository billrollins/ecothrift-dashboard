import { Box, Typography } from '@mui/material';
import { useInRouterContext, useLocation } from 'react-router-dom';
import { ECO_ICONS } from '../../icons/ecoIcons';
import { NAV_ITEM_CATALOG } from '../../navigation/navItemCatalog';
import type { NavIconKey } from '../../navigation/navTypes';
import { navItemIsActive } from '../../navigation/navUtils';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  dense?: boolean;
  /** One short title row - Overview and other shop-floor bands. */
  compact?: boolean;
  /** The page's icon. Left out: the icon of the sidebar page this route belongs to. `false`: no icon. */
  icon?: NavIconKey | false;
}

/** The icon of the sidebar page a route belongs to (the longest matching path), or null. */
export function navIconForRoute(pathname: string, search = '', hash = ''): NavIconKey | null {
  let best: { icon: NavIconKey; length: number } | null = null;
  for (const item of Object.values(NAV_ITEM_CATALOG)) {
    if (!navItemIsActive(pathname, search, hash, item)) continue;
    if (!best || item.path.length > best.length) best = { icon: item.icon, length: item.path.length };
  }
  return best?.icon ?? null;
}

function HeaderIcon({ name, size }: { name: NavIconKey; size: number }) {
  const Icon = ECO_ICONS[name];
  return <Icon aria-hidden sx={{ fontSize: size, color: 'primary.main', flexShrink: 0 }} />;
}

function RouteIcon({ size }: { size: number }) {
  const { pathname, search, hash } = useLocation();
  const name = navIconForRoute(pathname, search, hash);
  return name ? <HeaderIcon name={name} size={size} /> : null;
}

export function PageHeader({ title, subtitle, action, dense, compact, icon }: PageHeaderProps) {
  const inRouter = useInRouterContext();
  const iconSize = compact ? 20 : dense ? 26 : 32;
  const iconEl = icon === false
    ? null
    : icon
      ? <HeaderIcon name={icon} size={iconSize} />
      : inRouter ? <RouteIcon size={iconSize} /> : null;
  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: compact ? 'nowrap' : 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: compact ? 1 : dense ? 1 : 2,
        mb: compact ? 0.5 : dense ? 0.75 : 3,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: compact ? 1 : 1.5, minWidth: 0 }}>
        {iconEl}
        <Box
          sx={
            compact
              ? { display: 'flex', alignItems: 'baseline', gap: 1.25, minWidth: 0, flexWrap: 'nowrap' }
              : { minWidth: 0 }
          }
        >
          <Typography
            variant={compact ? 'h6' : dense ? 'h5' : 'h4'}
            fontWeight={600}
            gutterBottom={!compact && !dense && Boolean(subtitle)}
            noWrap={compact}
            sx={compact ? { fontSize: '1.15rem', lineHeight: 1.2, mb: 0 } : undefined}
          >
            {title}
          </Typography>
          {subtitle ? (
            <Typography
              variant="body2"
              color="text.secondary"
              noWrap={compact}
              sx={compact ? { fontSize: '0.78rem', minWidth: 0 } : undefined}
            >
              {subtitle}
            </Typography>
          ) : null}
        </Box>
      </Box>
      {action ? <Box sx={{ flexShrink: 0 }}>{action}</Box> : null}
    </Box>
  );
}

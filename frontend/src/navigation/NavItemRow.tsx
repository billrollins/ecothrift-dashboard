import { ListItemButton, ListItemIcon, ListItemText, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { NavWaitingBadge } from './NavWaitingBadge';
import type { ResolvedNavItem } from './navTypes';

interface NavItemRowProps {
  item: ResolvedNavItem;
  isActive: boolean;
  onClick: () => void;
  iconTint?: string;
  /** Workspace jump-letter colour. On hover the icon glows this; omitted for Essentials. */
  glowColor?: string;
  /** Work waiting behind this link; hidden when zero. */
  badgeCount?: number;
}

/** Essentials have no letter: hover just brightens the slate icon. */
const ESSENTIALS_HOVER_ICON = '#475569';

export function NavItemRow({
  item,
  isActive,
  onClick,
  iconTint,
  glowColor,
  badgeCount,
}: NavItemRowProps) {
  const theme = useTheme();
  const inactiveIconColor = iconTint ?? theme.palette.text.secondary;
  const Icon = item.Icon;
  const hoverIconColor = glowColor ?? ESSENTIALS_HOVER_ICON;

  return (
    <ListItemButton
      selected={isActive}
      onClick={onClick}
      sx={{
        borderRadius: '8px',
        mx: 1,
        mb: 0.2,
        minHeight: 38,
        minWidth: 0,
        py: 0.7,
        pl: 1.75,
        pr: 1.25,
        position: 'relative',
        overflow: 'visible',
        transition: theme.transitions.create('background-color', {
          duration: 120,
          easing: theme.transitions.easing.easeInOut,
        }),
        ...(!isActive && {
          '&:hover': { bgcolor: 'transparent' },
          '&:hover .MuiListItemIcon-root': { color: hoverIconColor },
          ...(glowColor
            ? {
                '&:hover .MuiSvgIcon-root': {
                  filter: `drop-shadow(0 0 2px ${alpha(glowColor, 0.4)})`,
                },
              }
            : {}),
        }),
        ...(isActive && {
          bgcolor: '#F8FAFC',
          '&:hover': { bgcolor: '#F1F5F9' },
          '&::after': {
            content: '""',
            position: 'absolute',
            top: 8,
            bottom: 8,
            right: 6,
            width: 3,
            borderRadius: 999,
            bgcolor: theme.palette.primary.main,
          },
        }),
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
          overflow: 'visible',
          color: isActive ? theme.palette.primary.main : inactiveIconColor,
          transition: theme.transitions.create('color', {
            duration: 120,
            easing: theme.transitions.easing.easeInOut,
          }),
          '& .MuiSvgIcon-root': {
            fontSize: 20,
            overflow: 'visible',
            transition: theme.transitions.create('filter', {
              duration: 120,
              easing: theme.transitions.easing.easeInOut,
            }),
          },
        }}
      >
        <Icon />
      </ListItemIcon>
      <ListItemText
        primary={
          <Typography
            component="span"
            variant="body2"
            fontWeight={isActive ? 600 : 500}
            color={isActive ? '#0F172A' : '#334155'}
            sx={{ fontSize: '0.8125rem', lineHeight: 1.3 }}
            noWrap
          >
            {item.label}
          </Typography>
        }
        sx={{ minWidth: 0, my: 0 }}
      />
      {badgeCount ? (
        <NavWaitingBadge count={badgeCount} />
      ) : null}
    </ListItemButton>
  );
}

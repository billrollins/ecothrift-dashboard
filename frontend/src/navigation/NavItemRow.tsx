import { ListItemButton, ListItemIcon, ListItemText, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import type { ResolvedNavItem } from './navTypes';

interface NavItemRowProps {
  item: ResolvedNavItem;
  isActive: boolean;
  onClick: () => void;
  iconTint?: string;
}

export function NavItemRow({ item, isActive, onClick, iconTint }: NavItemRowProps) {
  const theme = useTheme();
  const inactiveIconColor = iconTint ?? theme.palette.text.secondary;
  const Icon = item.Icon;

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
        transition: theme.transitions.create('background-color', {
          duration: 120,
          easing: theme.transitions.easing.easeInOut,
        }),
        ...(!isActive && { '&:hover': { bgcolor: '#F8FAFC' } }),
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
          color: isActive ? theme.palette.primary.main : inactiveIconColor,
          '& .MuiSvgIcon-root': { fontSize: 20 },
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
    </ListItemButton>
  );
}

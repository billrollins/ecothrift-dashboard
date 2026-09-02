import KeyboardArrowDownRounded from '@mui/icons-material/KeyboardArrowDownRounded';
import { Box, Typography } from '@mui/material';
import { dutyColors } from './tokens';

export function GroupHeader({
  title,
  count,
  collapsed,
  onToggle,
}: {
  title: string;
  count: number;
  /** When set with `onToggle`, the header folds its rows. Height stays the same. */
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const foldable = Boolean(onToggle);
  return (
    <Box
      component={foldable ? 'button' : 'div'}
      type={foldable ? 'button' : undefined}
      aria-expanded={foldable ? !collapsed : undefined}
      onClick={onToggle}
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1,
        width: '100%',
        px: 2,
        pt: 2,
        pb: 0.85,
        border: 'none',
        bgcolor: dutyColors.paper,
        cursor: foldable ? 'pointer' : 'default',
        font: 'inherit',
        textAlign: 'left',
        '&:hover .group-title': foldable ? { color: dutyColors.ink } : {},
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, minWidth: 0 }}>
        {foldable ? (
          <KeyboardArrowDownRounded
            sx={{
              fontSize: 18,
              color: dutyColors.ink40,
              transform: collapsed ? 'rotate(-90deg)' : 'none',
              transition: 'transform 120ms',
            }}
          />
        ) : null}
      <Typography
        className="group-title"
        sx={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '0.09em',
          textTransform: 'uppercase',
          color: dutyColors.ink60,
        }}
      >
        {title}
      </Typography>
      </Box>
      <Typography
        sx={{
          minWidth: 24,
          textAlign: 'center',
          px: 0.75,
          py: '1px',
          borderRadius: 999,
          bgcolor: dutyColors.ink08,
          fontSize: 11.5,
          fontWeight: 700,
          color: dutyColors.ink60,
        }}
      >
        {count}
      </Typography>
    </Box>
  );
}

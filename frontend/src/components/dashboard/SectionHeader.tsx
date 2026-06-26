import { Box, Tooltip, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { dashboardPalette } from './dashboardCardStyles';

interface SectionHeaderProps {
  title: string;
  hint?: string;
  action?: ReactNode;
}

export function SectionHeader({ title, hint, action }: SectionHeaderProps) {
  const label = (
    <Box sx={{ display: 'inline-flex', flexDirection: 'column', width: 'fit-content', cursor: hint ? 'default' : 'inherit' }}>
      <Typography
        component="h2"
        sx={{
          m: 0,
          fontFamily: '"DM Sans", "Inter", sans-serif',
          fontSize: { xs: '1.45rem', sm: '1.75rem' },
          fontWeight: 950,
          letterSpacing: '-0.055em',
          lineHeight: 0.9,
          textTransform: 'capitalize',
          color: dashboardPalette.textOnBackdrop,
        }}
      >
        {title}
      </Typography>
      <Box
        aria-hidden
        sx={{
          mt: 0.65,
          width: '100%',
          height: 3,
          borderRadius: 99,
          background: `linear-gradient(90deg, ${dashboardPalette.greenLine} 0%, ${dashboardPalette.green} 56%, ${dashboardPalette.greenDark} 100%)`,
          boxShadow: '0 2px 10px rgba(17, 38, 24, 0.28)',
        }}
      />
    </Box>
  );

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 1.5,
        px: 0.25,
        pt: 0.25,
        pb: 0.15,
      }}
    >
      {hint ? (
        <Tooltip title={hint} arrow>
          {label}
        </Tooltip>
      ) : (
        label
      )}
      {action}
    </Box>
  );
}

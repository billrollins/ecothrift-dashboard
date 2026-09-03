import { Box, Skeleton, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { eyebrowSx } from '../hr/ShiftPicker';
import { dutyCardSx, dutyEmptyPanelSx } from './cards';
import { dutyColors } from './tokens';

export function ColumnCard({
  title,
  count,
  loading,
  empty,
  minHeight = 280,
  children,
}: {
  title: string;
  count: number;
  loading?: boolean;
  empty: string;
  minHeight?: number;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        ...dutyCardSx,
        minHeight,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          px: 1.5,
          py: 1.25,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${dutyColors.ink08}`,
        }}
      >
        <Typography sx={{ ...eyebrowSx }}>{title}</Typography>
        <Box
          sx={{
            minWidth: 26,
            height: 22,
            px: 0.75,
            borderRadius: 99,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: count > 0 ? dutyColors.brandSoft : dutyColors.ink08,
            color: count > 0 ? dutyColors.brandDark : dutyColors.ink40,
            fontSize: 12.5,
            fontWeight: 800,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {count}
        </Box>
      </Box>
      <Box sx={{ flex: 1, p: 1.25, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {loading ? (
          <Skeleton variant="rounded" height={68} sx={{ borderRadius: '12px' }} />
        ) : count > 0 ? children : (
          <Box sx={dutyEmptyPanelSx}>
            <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: dutyColors.ink40 }}>
              {empty}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}

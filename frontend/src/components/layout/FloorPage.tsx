import { Box } from '@mui/material';
import type { ReactNode } from 'react';
import { dutyColors } from '../duty/tokens';
import { FloorPageBand } from './FloorPageBand';

export function FloorPage({
  title,
  subtitle,
  chips,
  fill,
  contained = true,
  bodyBg,
  children,
}: {
  title: string;
  subtitle?: string;
  chips?: ReactNode;
  /** Let the content column take the remaining height (Routines). */
  fill?: boolean;
  /** False for pages that draw their own body (Dashboard keeps its olive backdrop). */
  contained?: boolean;
  bodyBg?: string;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        height: fill || !contained ? '100%' : undefined,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: contained ? dutyColors.paper : (bodyBg ?? 'transparent'),
      }}
    >
      <FloorPageBand title={title} subtitle={subtitle} chips={chips} />
      <Box
        sx={
          contained
            ? {
                flex: fill ? 1 : undefined,
                minHeight: fill ? 0 : undefined,
                width: '100%',
                maxWidth: 1440,
                mx: 'auto',
                px: 3,
                py: 2.5,
                display: fill ? 'flex' : undefined,
                flexDirection: fill ? 'column' : undefined,
              }
            : {
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                bgcolor: bodyBg,
              }
        }
      >
        {children}
      </Box>
    </Box>
  );
}

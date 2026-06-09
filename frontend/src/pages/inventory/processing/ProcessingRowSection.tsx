import { Box, Paper, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { processingTokens } from './processingTokens';

/** Row detail = eco green · Quick check-in = cardboard brown · Prior check-ins = light grey */
export type ProcessingRowSectionSurface = 'rowDetail' | 'quickCheckIn' | 'priorCheckIns';

type SectionTheme = {
  borderColor: string;
  headerBg: string;
  titleColor: string;
  bodyBg: string;
};

const sectionTheme: Record<ProcessingRowSectionSurface, SectionTheme> = {
  rowDetail: {
    borderColor: processingTokens.border,
    headerBg: processingTokens.cardHeaderRowDetailBg,
    titleColor: processingTokens.cardHeaderRowDetailText,
    bodyBg: processingTokens.surfaceRaised,
  },
  quickCheckIn: {
    borderColor: processingTokens.cardboardBrownBorder,
    headerBg: processingTokens.cardHeaderQuickBg,
    titleColor: processingTokens.cardHeaderQuickText,
    bodyBg: processingTokens.surfaceRaised,
  },
  priorCheckIns: {
    borderColor: processingTokens.border,
    headerBg: processingTokens.cardHeaderPastBg,
    titleColor: processingTokens.cardHeaderPastText,
    bodyBg: processingTokens.surfaceRaised,
  },
};

export function ProcessingRowSectionHeader({
  title,
  note,
  trailing,
  surface = 'rowDetail',
}: {
  title: string;
  note?: ReactNode;
  trailing?: ReactNode;
  surface?: ProcessingRowSectionSurface;
}) {
  const theme = sectionTheme[surface];

  return (
    <Box
      sx={{
        flexShrink: 0,
        px: { xs: 1.25, md: 1.5 },
        py: 1,
        borderBottom: 1,
        borderColor: theme.borderColor,
        bgcolor: theme.headerBg,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              fontWeight: 900,
              letterSpacing: 0.8,
              textTransform: 'uppercase',
              color: theme.titleColor,
              lineHeight: 1.25,
            }}
          >
            {title}
          </Typography>
          {note ?
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                display: 'block',
                mt: 0.4,
                fontSize: '0.72rem',
                lineHeight: 1.45,
                fontWeight: 400,
                textTransform: 'none',
                letterSpacing: 0,
              }}
            >
              {note}
            </Typography>
          : null}
        </Box>
        {trailing ?
          <Box sx={{ flexShrink: 0, pt: 0.05 }}>{trailing}</Box>
        : null}
      </Box>
    </Box>
  );
}

export function ProcessingRowSection({
  title,
  note,
  trailing,
  children,
  sx,
  bodySx,
  fill = false,
  surface = 'rowDetail',
}: {
  title: string;
  note?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
  sx?: object;
  bodySx?: object;
  fill?: boolean;
  surface?: ProcessingRowSectionSurface;
}) {
  const theme = sectionTheme[surface];

  return (
    <Paper
      variant="outlined"
      sx={{
        mb: 2.5,
        overflow: 'hidden',
        borderColor: theme.borderColor,
        bgcolor: theme.bodyBg,
        boxShadow: '0 1px 3px rgba(26, 27, 24, 0.06)',
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        display: fill ? 'flex' : 'block',
        flexDirection: fill ? 'column' : undefined,
        minHeight: fill ? 0 : undefined,
        ...(fill ? { flex: 1 } : {}),
        ...sx,
      }}
    >
      <ProcessingRowSectionHeader title={title} note={note} trailing={trailing} surface={surface} />
      <Box
        sx={{
          bgcolor: theme.bodyBg,
          px: { xs: 1.25, md: 1.5 },
          py: { xs: 1.25, md: 1.5 },
          ...(fill ?
            {
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }
          : {}),
          ...bodySx,
        }}
      >
        {children}
      </Box>
    </Paper>
  );
}

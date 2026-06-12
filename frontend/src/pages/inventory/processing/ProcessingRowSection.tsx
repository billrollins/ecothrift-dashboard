import ExpandMore from '@mui/icons-material/ExpandMore';
import { Box, Paper, Typography } from '@mui/material';
import { useState, type ReactNode } from 'react';
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
  collapsed,
  onToggleCollapse,
}: {
  title: string;
  note?: ReactNode;
  trailing?: ReactNode;
  surface?: ProcessingRowSectionSurface;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const theme = sectionTheme[surface];

  return (
    <Box
      onClick={onToggleCollapse}
      role={onToggleCollapse ? 'button' : undefined}
      aria-expanded={onToggleCollapse ? !collapsed : undefined}
      sx={{
        flexShrink: 0,
        px: { xs: 1.25, md: 1.5 },
        py: 1,
        borderBottom: collapsed ? 0 : 1,
        borderColor: theme.borderColor,
        bgcolor: theme.headerBg,
        ...(onToggleCollapse ?
          { cursor: 'pointer', userSelect: 'none', '&:hover': { filter: 'brightness(0.985)' } }
        : {}),
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
        <Box sx={{ flexShrink: 0, pt: 0.05, display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {trailing}
          {onToggleCollapse ?
            <ExpandMore
              sx={{
                fontSize: 18,
                color: theme.titleColor,
                transition: 'transform 150ms',
                transform: collapsed ? 'rotate(-90deg)' : 'none',
              }}
            />
          : null}
        </Box>
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
  collapsible = false,
  defaultCollapsed = false,
}: {
  title: string;
  note?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
  sx?: object;
  bodySx?: object;
  fill?: boolean;
  surface?: ProcessingRowSectionSurface;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}) {
  const theme = sectionTheme[surface];
  const [collapsed, setCollapsed] = useState(collapsible && defaultCollapsed);
  const isCollapsed = collapsible && collapsed;

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
      <ProcessingRowSectionHeader
        title={title}
        note={isCollapsed ? undefined : note}
        trailing={trailing}
        surface={surface}
        collapsed={isCollapsed}
        onToggleCollapse={collapsible ? () => setCollapsed((c) => !c) : undefined}
      />
      {isCollapsed ? null : (
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
      )}
    </Paper>
  );
}

/**
 * One of the two product lists on a manifest row: Attached (left) and Likely (right), side by side (Dash Update #229,
 * Bill 2026-11-25: "LEFT/RIGHT areas devoted to attached products (left) and likely products on the right. Each with
 * as many visible lines as fit and they are static so if empty they still hold a fixed height").
 *
 * The pane takes the height its parent gives it and never the height of what is in it: the header is one fixed line,
 * the list scrolls inside. Nothing in a pane can move anything outside it.
 */
import type { ReactNode } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import { processingTokens } from './processingTokens';

/** Height of a pane's header line (px). Fixed, so a chip appearing in it moves nothing. */
export const PRODUCT_PANE_HEADER_PX = 30;

export function ProductPane({ title, stats, trailing, children, accent, headerBg, titleColor, testId }: {
  title: string;
  /** Counts beside the title ("2 products · 5 checked in"). */
  stats?: ReactNode;
  /** Right end of the header line. */
  trailing?: ReactNode;
  children: ReactNode;
  accent: string;
  headerBg: string;
  titleColor: string;
  testId?: string;
}) {
  return (
    <Paper
      variant="outlined"
      data-testid={testId}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        minHeight: 0,
        height: '100%',
        overflow: 'hidden',
        borderColor: processingTokens.borderStrong,
        borderLeft: 3,
        borderLeftColor: accent,
        bgcolor: processingTokens.surfaceRaised,
        boxShadow: '0 1px 4px rgba(26, 27, 24, 0.05)',
      }}
    >
      <Box
        sx={{
          flexShrink: 0,
          height: PRODUCT_PANE_HEADER_PX,
          display: 'flex',
          alignItems: 'center',
          gap: 0.9,
          px: 0.75,
          minWidth: 0,
          overflow: 'hidden',
          bgcolor: headerBg,
          borderBottom: 1,
          borderColor: processingTokens.border,
        }}
      >
        <Typography
          sx={{ flexShrink: 0, fontSize: '0.625rem', fontWeight: 900, letterSpacing: 0.7, textTransform: 'uppercase', color: titleColor, whiteSpace: 'nowrap' }}
        >
          {title}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.9, minWidth: 0, overflow: 'hidden' }}>{stats}</Box>
        <Box sx={{ flex: 1, minWidth: 0 }} />
        {trailing}
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' }}>{children}</Box>
    </Paper>
  );
}

/** A quiet line in an empty (or loading) pane; the pane keeps its height. */
export function PaneNote({ children }: { children: ReactNode }) {
  return (
    <Typography sx={{ px: 1, py: 1, fontSize: 12.5, color: 'text.secondary' }}>{children}</Typography>
  );
}

/** One count in a pane header: "2 products", "5 checked in". */
export function PaneStat({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <Typography data-testid={testId} sx={{ flexShrink: 0, fontSize: 11, fontWeight: 800, color: processingTokens.textSoft, whiteSpace: 'nowrap' }}>
      {children}
    </Typography>
  );
}

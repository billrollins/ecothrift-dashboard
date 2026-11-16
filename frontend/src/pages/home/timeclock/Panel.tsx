/**
 * The TimeClock tab's one card and one row (Dash Update #179, Bill 2026-11-16: "clean and sleek, easy to see at a
 * glance, no notes that only help the first time"). A panel is a title, an optional action on the right, and rows.
 * Rows have fixed heights and hairlines; today's row carries the rich kit's selected look (mint, a bar on the left).
 */
import { Box, Stack, type SxProps, type Theme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { MicroLabel } from '../../../components/page/RichKit';

export function Panel({ title, meta, action, children, sx, testId }: {
  title: string;
  /** Quiet text after the title ("Nov 9 - 22"). */
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  sx?: SxProps<Theme>;
  testId?: string;
}) {
  return (
    <Box
      data-testid={testId}
      sx={[
        { display: 'flex', flexDirection: 'column', minWidth: 0, borderRadius: '12px', border: 1, borderColor: 'divider', bgcolor: 'background.paper', overflow: 'hidden' },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ height: 44, flexShrink: 0, pl: 2, pr: 1 }}>
        <MicroLabel sx={{ color: 'text.primary', fontSize: '0.75rem' }}>{title}</MicroLabel>
        <Box sx={{ flex: 1, minWidth: 0, fontSize: '0.75rem', fontWeight: 600, color: 'text.secondary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {meta}
        </Box>
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flexShrink: 0 }}>{action}</Stack>
      </Stack>
      {children}
    </Box>
  );
}

/** One row of a panel: a hairline on top, a fixed height, the same side padding as the title. */
export const rowSx = (t: Theme) => ({
  display: 'grid',
  alignItems: 'center',
  columnGap: 1.5,
  minHeight: { xs: 48, sm: 40 },
  px: 2,
  borderTop: `1px solid ${t.palette.grey[100]}`,
  fontSize: '0.875rem',
}) as const;

/** Today's row: mint with a bar on the left; the same size as every other row. */
export const todayRowSx = (t: Theme) => ({
  bgcolor: alpha(t.palette.secondary.main, 0.12),
  boxShadow: `inset 3px 0 0 ${t.palette.secondary.main}`,
}) as const;

/** A panel with nothing in it yet: one quiet line where the rows would be. */
export function EmptyRow({ children }: { children: ReactNode }) {
  return (
    <Box sx={(t) => ({ ...rowSx(t), color: 'text.secondary', fontSize: '0.8125rem' })}>{children}</Box>
  );
}

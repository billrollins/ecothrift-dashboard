/**
 * Thin pill scrollbars for locked TARS panes.
 * Width never changes on hover — that would shift the grid.
 */
import { PANEL, RADIUS } from './studio/benchScale';

export const tarsPaneScrollSx = {
  overflowY: 'auto',
  overflowX: 'hidden',
  scrollbarWidth: 'thin',
  scrollbarColor: 'rgba(15,23,42,0.28) transparent',
  '&::-webkit-scrollbar': { width: 5 },
  '&::-webkit-scrollbar-track': {
    background: 'transparent',
    marginTop: '4px',
    marginBottom: '4px',
  },
  '&::-webkit-scrollbar-thumb': {
    backgroundColor: 'rgba(15,23,42,0.28)',
    borderRadius: 999,
  },
  '&:hover::-webkit-scrollbar-thumb': {
    backgroundColor: 'rgba(15,23,42,0.42)',
  },
} as const;

export const tarsPaneCardSx = {
  height: '100%',
  minHeight: 0,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  borderRadius: `${RADIUS.lg}px`,
  border: `1px solid ${PANEL.border}`,
  bgcolor: PANEL.bg,
  boxShadow: '0 1px 2px rgba(22,33,28,0.06), 0 4px 12px rgba(22,33,28,0.05)',
} as const;

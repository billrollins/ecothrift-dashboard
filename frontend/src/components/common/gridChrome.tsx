/**
 * Shared DataGrid chrome.
 *
 * Every directory-style grid in the app wears the same clothes: borderless,
 * no focus ring, bold heads, and a no-rows overlay that fills the reserved box
 * instead of collapsing it. Grew up inside Online Sales; lives here now because
 * Admin > Users wears it too.
 */
import type { ReactNode } from 'react';
import { Stack, Typography } from '@mui/material';
import type { SxProps, Theme } from '@mui/material';

/**
 * Fixed grid height. Prefer GRID_FILL_SX - a table that stops 300px short of
 * the bottom of a shop-floor monitor is wasted rows.
 */
export const GRID_HEIGHT = 520;

/** Below this a grid is too short to be worth scrolling; the page scrolls instead. */
export const GRID_MIN_HEIGHT = 320;

/**
 * Page root: fill the height MainLayout gave us and lay children out downward.
 * The layout's own padding is the only margin, so the bottom gap matches the
 * left and right ones instead of trailing dead space.
 */
export const PAGE_FILL_SX = {
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
} as const;

/** Grid wrapper: take whatever vertical room is left over. */
export const GRID_FILL_SX = {
  flex: 1,
  minHeight: GRID_MIN_HEIGHT,
} as const;

/** Tall enough for two-line cells and chips without shearing the top. */
export const GRID_ROW_HEIGHT = 56;

/** Cells are flex-centered so custom renderCell content (chips, codes) sits on
 *  the row midline instead of hugging the top - DataGrid's default
 *  overflow:hidden otherwise clips a badge. */
export const GRID_SX: SxProps<Theme> = {
  border: 'none',
  '& .MuiDataGrid-cell': {
    display: 'flex',
    alignItems: 'center',
    // Beat DataGrid's align-items: flex-start on typed cells.
    py: 0,
    lineHeight: 1.25,
  },
  // Count pills sit in narrow leading columns; the default overflow:hidden
  // shears the circle on the left/top/bottom.
  '& .MuiDataGrid-cell[data-field="unread"], & .MuiDataGrid-cell[data-field="staff_unread"], & .MuiDataGrid-cell[data-field="state_action"]': {
    overflow: 'visible',
  },
  '& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within': { outline: 'none' },
  '& .MuiDataGrid-columnHeaderTitle': { fontWeight: 700 },
  '& .MuiDataGrid-row': { cursor: 'pointer' },
  // Unread rows lead the eye without shouting. Don't set fontWeight on the
  // cell itself - it throws Chip metrics off and helps clip the badge.
  '& .os-row--unread': { bgcolor: 'action.hover' },
};

/** Same chrome for grids whose rows are not clickable. */
export const GRID_SX_STATIC: SxProps<Theme> = {
  border: 'none',
  '& .MuiDataGrid-cell': {
    display: 'flex',
    alignItems: 'center',
    py: 0,
    lineHeight: 1.25,
  },
  '& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within': { outline: 'none' },
  '& .MuiDataGrid-columnHeaderTitle': { fontWeight: 700 },
};

export const GRID_PAGE_PROPS = {
  rowHeight: GRID_ROW_HEIGHT,
  pageSizeOptions: [25, 50, 100],
  initialState: { pagination: { paginationModel: { pageSize: 25 } } },
} as const;

/** Centered overlay that fills the reserved grid box rather than collapsing it. */
export function noRowsSlot(message: string, hint?: ReactNode) {
  return {
    noRowsOverlay: () => (
      <Stack height="100%" alignItems="center" justifyContent="center" spacing={0.5} sx={{ px: 3 }}>
        <Typography variant="body2" color="text.secondary" align="center">
          {message}
        </Typography>
        {hint ? (
          <Typography variant="caption" color="text.disabled" align="center">
            {hint}
          </Typography>
        ) : null}
      </Stack>
    ),
  };
}

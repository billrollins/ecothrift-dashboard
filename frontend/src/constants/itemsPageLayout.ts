/**
 * Height of the Items split row (list + detail) on md+ so both columns share one bottom edge
 * and stop just above the viewport bottom with a small margin.
 *
 * Subtracted from 100vh (viewport):
 * - AppBar + toolbar (MUI default)
 * - MainLayout `main` vertical padding (`p: 3` top + bottom)
 * - Items page header (title + chip + `mb: 2`)
 * - Explicit gap above the bottom edge of the viewport
 */
const APP_BAR_PX = 64;
const MAIN_VERTICAL_PADDING_PX = 48; // theme.spacing(3) * 2
/** One-line h5 + chip row and `mb: 2` (~48px + 16px); was over-estimated at 96px and left a ~1-row gap above the viewport bottom. */
const ITEMS_PAGE_HEADER_PX = 64;
const BELOW_SPLIT_MARGIN_PX = 0;

const ITEMS_SPLIT_VIEWPORT_SUBTRACT_PX =
  APP_BAR_PX + MAIN_VERTICAL_PADDING_PX + ITEMS_PAGE_HEADER_PX + BELOW_SPLIT_MARGIN_PX;

/** Use for the split row `Box` on `md+` (`minHeight` / `height`). */
export const ITEMS_SPLIT_ROW_HEIGHT = `calc(100vh - ${ITEMS_SPLIT_VIEWPORT_SUBTRACT_PX}px)`;

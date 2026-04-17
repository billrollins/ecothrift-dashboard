/** Section labels (Inventory need / Search & filters / Active auctions) — shared eyebrow style. */
export const BUYING_SECTION_EYEBROW_SX = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase' as const,
  color: 'rgba(0,0,0,0.45)',
  lineHeight: 1.2,
};

/** Watch / thumbs / archive / expand / manifest — same visual size in auction list grid rows. */
export const BUYING_AUCTION_LIST_ROW_ICON_PX = 28;
/** Taller than default compact grid rows so row icons have room and align cleanly. */
export const BUYING_AUCTION_LIST_ROW_HEIGHT_PX = 64;
/** Header row: bulk icons + sort arrows + default column sort icons (aligned with header text, smaller than row icons). */
export const BUYING_AUCTION_LIST_HEADER_ICON_PX = 20;

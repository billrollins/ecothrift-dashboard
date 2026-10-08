/**
 * Eco-Thrift's own icon set (standards T75; Bill via master, 2026-10-08). One file holds the whole set.
 *
 * RECIPE: every icon follows it. Read it before adding or changing one.
 *
 * - Grid: 24 x 24, live area 2 to 22. Draw on whole and half units.
 * - Line: 1.75 stroke, round caps, round joins. The wrapper sets them once: never set stroke, strokeWidth or fill on
 *   a shape. Boxes get rounded corners (r 1 to 2). Parallel lines sit at least 2.5 apart and no closed shape is
 *   smaller than 3 across, so the icon still reads at 20 px on a phone.
 * - Three colour roles, nothing else:
 *     line   = currentColor, so the icon takes the colour of the text around it (theme green, grey, white on a band);
 *     wash   = <Wash>: the main shape again, filled with currentColor at 15%, no stroke (it sits under the line);
 *     accent = <Accent> (a stroke) or <AccentFill> (a solid dot): kraft, var(--eco-icon-accent, #b8955f), the brown
 *              of a kraft price tag and a cardboard carton, the thrift store's own material. A parent can set
 *              --eco-icon-accent (a workspace's colour, or currentColor for one colour).
 * - Page icons (sidebar pages, workspaces, page headers): a wash on the main shape and exactly one kraft detail.
 * - Action icons (buttons): line only, no wash, no accent. The button's own colour speaks (red delete, green save).
 * - Metaphor: one plain object a shop worker knows, readable at 20 px; about five strokes of detail at most.
 * - Shared shapes: when an icon uses one, copy its path data exactly, so related icons match:
 *     PAGE       <path d="M14 2.5H6.5A1.5 1.5 0 0 0 5 4v16a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 20V7.5L14 2.5z"/>
 *                fold <path d="M14 2.5V6a1.5 1.5 0 0 0 1.5 1.5H19"/>
 *     CLIPBOARD  <path d="M8.5 4H7a2 2 0 0 0-2 2v13.5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1.5"/>
 *                clip <rect x="8.5" y="2.5" width="7" height="3.5" rx="1"/>
 *     CALENDAR   <rect x="3.5" y="5" width="17" height="16" rx="2"/> header <path d="M3.5 10h17"/>
 *                rings <path d="M8 3v4M16 3v4"/>
 *     TAG        <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h7.4l9.1 9.1a1.5 1.5 0 0 1 0 2.1l-6.8 6.8a1.5 1.5 0 0 1-2.1 0L3 11.9z"/>
 *                hole <circle cx="7.5" cy="7.5" r="1.5"/>
 *     PERSON     head <circle cx="12" cy="8" r="4"/> shoulders <path d="M4.5 21c.5-4 3.6-6.5 7.5-6.5s7 2.5 7.5 6.5"/>
 *     BOX        <path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7z"/> <path d="M3.5 7 12 11.5 20.5 7M12 11.5v10"/>
 *                tape <path d="M7.75 4.75l8.5 4.5"/>
 *     TRUCK      cargo <rect x="2" y="5.5" width="12" height="10" rx="1"/> cab <path d="M14 9h3.5l3.5 4v2.5h-7"/>
 *                wheels <circle cx="6.5" cy="17.5" r="2"/> <circle cx="17" cy="17.5" r="2"/>
 *     BUBBLE     <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4.5 4v-4H6a2 2 0 0 1-2-2z"/>
 *     CLOCK      <circle cx="12" cy="12" r="8.5"/> hands <path d="M12 7.5V12l3 2"/>
 *
 * Adding an icon: one line in NOTES (name by meaning, where it is used, its metaphor) and one entry in ART. Nothing
 * else: the names the sidebar may use come from ART, so a page naming a missing icon fails the type check.
 * The look-at-them-all sheet: Admin > Icons (/admin/icons). Recipe test: ecoIcons.test.tsx.
 */
import type { ComponentType, ReactNode } from 'react';
import SvgIcon, { type SvgIconProps } from '@mui/material/SvgIcon';

export const ICON_ACCENT = 'var(--eco-icon-accent, #b8955f)';

/** The main shape again, washed with the line colour at 15%. */
function Wash({ children }: { children: ReactNode }) {
  return <g data-role="wash" fill="currentColor" fillOpacity={0.15} stroke="none">{children}</g>;
}

/** The one kraft detail of a page icon, as a stroke. */
function Accent({ children }: { children: ReactNode }) {
  return <g data-role="accent" stroke={ICON_ACCENT}>{children}</g>;
}

/** The one kraft detail of a page icon, as a solid dot or small shape. */
function AccentFill({ children }: { children: ReactNode }) {
  return <g data-role="accent" fill={ICON_ACCENT} stroke="none">{children}</g>;
}

export type IconKind = 'page' | 'action';

export interface IconNote {
  kind: IconKind;
  /** Where it is used. */
  use: string;
  /** What it shows, in one line. */
  metaphor: string;
}

// NOTES:BEGIN (one line per icon; the drawing helpers and the sheet read these lines)
export const NOTES = {
  overview: { kind: 'page', use: 'Dashboard', metaphor: 'A board of four rounded tiles; the top-right tile is kraft.' },
  today: { kind: 'page', use: 'Today (my shift)', metaphor: 'CALENDAR with a check mark in the day area; the check is kraft.' },
  timeClock: { kind: 'page', use: 'Kiosk (clock in and out)', metaphor: 'CLOCK face with hands; the short hand is kraft.' },
  routine: { kind: 'page', use: 'Routines; Admin > Routines', metaphor: 'CLIPBOARD with two ticked lines; the clip is kraft.' },
  documents: { kind: 'page', use: 'Documents', metaphor: 'PAGE with a second sheet peeking out behind its left edge; the fold is kraft.' },
  purchaseOrder: { kind: 'page', use: 'Orders (buying)', metaphor: 'A shopping cart carrying a small carton; the carton is kraft.' },
  manifest: { kind: 'page', use: 'Preprocessing (load manifests)', metaphor: 'PAGE with three ruled rows like a spreadsheet; the top row is kraft.' },
  inbound: { kind: 'page', use: 'Receiving', metaphor: 'An open tray (a dock) with a down arrow coming into it; the arrow is kraft.' },
  processing: { kind: 'page', use: 'Processing page and workspace', metaphor: 'BOX with the TAG idea: a small price tag hanging off its corner; the tag is kraft.' },
  findItem: { kind: 'page', use: 'Search items; Inventory search', metaphor: 'A magnifier whose lens holds a small tag; the tag is kraft.' },
  floorplan: { kind: 'page', use: 'Floorplans', metaphor: 'Store outline from above with three aisle bars; the middle aisle is kraft.' },
  productReview: { kind: 'page', use: 'Product review', metaphor: 'TAG with a check mark on its body; the check is kraft.' },
  count: { kind: 'page', use: 'Run count (stocktake)', metaphor: 'CLIPBOARD with four tally strokes; the cross stroke is kraft.' },
  inventories: { kind: 'page', use: 'Inventories (count events)', metaphor: 'Two stacked cartons, front views; a check on the top carton is kraft.' },
  fixit: { kind: 'page', use: 'PR Fix-it (fix product records)', metaphor: 'TAG with a small wrench across it; the wrench is kraft.' },
  reprice: { kind: 'page', use: 'Quick reprice', metaphor: 'TAG with a circular arrow on its body; the arrow is kraft.' },
  vendor: { kind: 'page', use: 'Vendors', metaphor: 'A warehouse with a gabled roof and a roll-up door; the door is kraft.' },
  register: { kind: 'page', use: 'Terminal; Cashier workspace', metaphor: 'A cash register: screen on top, keypad body, drawer at the base; the drawer is kraft.' },
  cashDrawer: { kind: 'page', use: 'Drawers', metaphor: 'An open cash drawer tray seen from above with slots; one coin in a slot is kraft.' },
  cash: { kind: 'page', use: 'Cash management', metaphor: 'A banknote with a round centre; the centre circle is kraft.' },
  receipt: { kind: 'page', use: 'Transactions', metaphor: 'A receipt strip with a zigzag tear at the bottom and lines; the total line is kraft.' },
  printables: { kind: 'page', use: 'Printables', metaphor: 'A printer with a sheet coming out of the top; the sheet is kraft.' },
  calendar: { kind: 'page', use: 'Delivery schedule', metaphor: 'CALENDAR with one day block filled; the day block is kraft.' },
  deliveryList: { kind: 'page', use: 'Delivery table (runs)', metaphor: 'A route: two map pins joined by a dashed path; the end pin is kraft.' },
  wishlist: { kind: 'page', use: 'Wishlist (buying)', metaphor: 'TAG with a small heart on its body; the heart is kraft.' },
  auction: { kind: 'page', use: 'Auctions; Buying workspace', metaphor: 'A gavel striking a sound block; the block is kraft.' },
  watchlist: { kind: 'page', use: 'Watchlist (auctions)', metaphor: 'An eye; the pupil is kraft.' },
  reportCard: { kind: 'page', use: 'Report cards (vendors)', metaphor: 'PAGE with a big letter A drawn in strokes; the A is kraft.' },
  assumptions: { kind: 'page', use: 'Assumptions (buying model)', metaphor: 'A calculator: screen and a grid of keys; the screen is kraft.' },
  registerSetup: { kind: 'page', use: 'POS setup', metaphor: 'Three horizontal sliders with knobs; the middle knob is kraft.' },
  listing: { kind: 'page', use: 'Online listings', metaphor: 'A browser window with a small tag inside; the tag is kraft.' },
  hold: { kind: 'page', use: 'Online holds (for pickup)', metaphor: 'A shopping bag with handles and a name tag tied on; the tag is kraft.' },
  messages: { kind: 'page', use: 'Online customer messages', metaphor: 'BUBBLE with three dots inside; the dots are kraft.' },
  staff: { kind: 'page', use: 'Users', metaphor: 'Two people, one in front; a name badge on the front person is kraft.' },
  departments: { kind: 'page', use: 'Departments', metaphor: 'An org tree: one box on top joined to two below; the top box is kraft.' },
  permissions: { kind: 'page', use: 'Permissions', metaphor: 'A shield with a keyhole; the keyhole is kraft.' },
  settings: { kind: 'page', use: 'Settings; Admin workspace', metaphor: 'A gear with a round hub; the hub is kraft.' },
  labelDesign: { kind: 'page', use: 'Label Studio', metaphor: 'TAG with a pen nib touching it; the nib is kraft.' },
  workbench: { kind: 'page', use: 'Bench (restoration)', metaphor: 'A wrench and a screwdriver crossed; the screwdriver handle is kraft.' },
  repairQueue: { kind: 'page', use: 'Restoration overview (queue)', metaphor: 'Three stacked rounded bars with an arrow pointing at the first; the first bar is kraft.' },
  parts: { kind: 'page', use: 'Parts requests', metaphor: 'A bolt beside a hex nut; the nut is kraft.' },
  restoration: { kind: 'page', use: 'Restorations; Restoration workspace', metaphor: 'A wrench with a small four-point sparkle (made good again); the sparkle is kraft.' },
  announce: { kind: 'page', use: 'Announcements', metaphor: 'A megaphone with two sound arcs; the arcs are kraft.' },
  blog: { kind: 'page', use: 'Blog studio', metaphor: 'PAGE with a pen laid across it; the pen is kraft.' },
  shifts: { kind: 'page', use: 'Shifts (roster)', metaphor: 'CALENDAR with a small clock in the lower right; the clock is kraft.' },
  payroll: { kind: 'page', use: 'Time and payroll', metaphor: 'CLOCK with a coin overlapping its lower right; the coin is kraft.' },
  brief: { kind: 'page', use: 'Brief (daily AI supervisor brief)', metaphor: 'PAGE with text lines and a four-point sparkle; the sparkle is kraft.' },
  thriftPlus: { kind: 'page', use: 'Thrift+', metaphor: 'A membership card with a stripe and a plus sign; the plus is kraft.' },
  requests: { kind: 'page', use: 'Requests (owner approvals)', metaphor: 'A rubber stamp above its stamped line; the stamped line is kraft.' },
  enhancement: { kind: 'page', use: 'Enhancements', metaphor: 'A light bulb with three short rays; the rays are kraft.' },
  commandCenter: { kind: 'page', use: 'Command Center (Retail QA)', metaphor: 'A half-circle gauge with tick marks and a needle; the needle is kraft.' },
  applicant: { kind: 'page', use: 'Applicants', metaphor: 'PERSON with a small plus at the upper right; the plus is kraft.' },
  interview: { kind: 'page', use: 'Interviews', metaphor: 'Two overlapping speech bubbles facing each other; the back bubble is kraft.' },
  onboarding: { kind: 'page', use: 'Onboarding', metaphor: 'An open door with an arrow walking in; the arrow is kraft.' },
  checkIn: { kind: 'page', use: 'Check-ins (30/60/90 days)', metaphor: 'PERSON with a round check badge at the lower right; the badge is kraft.' },
  deductions: { kind: 'page', use: 'Payroll deductions', metaphor: 'A stack of three coins with a minus sign beside it; the minus is kraft.' },
  email: { kind: 'page', use: 'Emails (hiring)', metaphor: 'An envelope; the flap is kraft.' },
  jobPost: { kind: 'page', use: 'Jobs and careers page', metaphor: 'A briefcase with a handle; the clasp is kraft.' },
  delivery: { kind: 'page', use: 'Deliveries workspace', metaphor: 'TRUCK; a carton on the cargo side is kraft.' },
  salesFloor: { kind: 'page', use: 'Inventory workspace (retail floor)', metaphor: 'A clothes hanger; the hook is kraft.' },
  webStore: { kind: 'page', use: 'Online Sales workspace', metaphor: 'A shop front with a scalloped awning and a door; the awning is kraft.' },
  studio: { kind: 'page', use: 'Studios workspace', metaphor: 'A painter\'s palette with a thumb hole and paint dots; one dot is kraft.' },
  people: { kind: 'page', use: 'People workspace', metaphor: 'Three people, the middle one in front; the middle head is kraft.' },
  add: { kind: 'action', use: 'Add buttons', metaphor: 'A plus.' },
  remove: { kind: 'action', use: 'Remove one / minus', metaphor: 'A minus.' },
  close: { kind: 'action', use: 'Close dialogs and panels', metaphor: 'An X.' },
  edit: { kind: 'action', use: 'Edit', metaphor: 'A pencil on a slant with its tip at lower left.' },
  delete: { kind: 'action', use: 'Delete', metaphor: 'A trash can with a lid and two lines on its side.' },
  save: { kind: 'action', use: 'Save', metaphor: 'A floppy disk: square with a cut corner, a label and a shutter.' },
  copy: { kind: 'action', use: 'Copy', metaphor: 'Two overlapping rounded squares.' },
  confirm: { kind: 'action', use: 'Done, confirm, check', metaphor: 'A check mark.' },
  more: { kind: 'action', use: 'More menu', metaphor: 'Three dots in a column.' },
  filter: { kind: 'action', use: 'Filter', metaphor: 'A funnel.' },
  search: { kind: 'action', use: 'Search fields and buttons', metaphor: 'A magnifier: lens and handle to the lower right.' },
  download: { kind: 'action', use: 'Download, export', metaphor: 'An arrow down into an open tray.' },
  upload: { kind: 'action', use: 'Upload, import a file', metaphor: 'An arrow up out of an open tray.' },
  refresh: { kind: 'action', use: 'Refresh, reload', metaphor: 'A circular arrow, almost closed.' },
  undo: { kind: 'action', use: 'Undo', metaphor: 'A hooked arrow curling back to the left.' },
  back: { kind: 'action', use: 'Back', metaphor: 'An arrow pointing left.' },
  openExternal: { kind: 'action', use: 'Open in a new window', metaphor: 'A square open at the top right with an arrow leaving through the gap.' },
  scan: { kind: 'action', use: 'Scan a barcode or QR', metaphor: 'Four corner brackets with a line across the middle.' },
  aiAssist: { kind: 'action', use: 'AI suggest, auto fill', metaphor: 'A four-point sparkle with a small one beside it.' },
  archive: { kind: 'action', use: 'Archive', metaphor: 'A box with a lid and a handle slot.' },
  print: { kind: 'action', use: 'Print', metaphor: 'A printer: body, paper tray on top, sheet out the front.' },
} satisfies Record<string, IconNote>;
// NOTES:END

// ART:BEGIN (written by the drawing step; one entry per NOTES line)
const ART: Record<keyof typeof NOTES, ReactNode> = {
  overview: (
    <>
      <Wash><rect x="2.5" y="2.5" width="8" height="8" rx="1.5"/></Wash>
      <Wash><rect x="13.5" y="2.5" width="8" height="8" rx="1.5"/></Wash>
      <Wash><rect x="2.5" y="13.5" width="8" height="8" rx="1.5"/></Wash>
      <Wash><rect x="13.5" y="13.5" width="8" height="8" rx="1.5"/></Wash>
      <rect x="2.5" y="2.5" width="8" height="8" rx="1.5"/>
      <rect x="13.5" y="2.5" width="8" height="8" rx="1.5"/>
      <rect x="2.5" y="13.5" width="8" height="8" rx="1.5"/>
      <rect x="13.5" y="13.5" width="8" height="8" rx="1.5"/>
      <Accent><rect x="13.5" y="2.5" width="8" height="8" rx="1.5"/></Accent>
    </>
  ),
  today: (
    <>
      <Wash><rect x="3.5" y="5" width="17" height="16" rx="2"/></Wash>
      <rect x="3.5" y="5" width="17" height="16" rx="2"/>
      <path d="M3.5 10h17"/>
      <path d="M8 3v4M16 3v4"/>
      <Accent><path d="M8.5 15.5l2.5 2.5 4.5-5"/></Accent>
    </>
  ),
  timeClock: (
    <>
      <Wash><circle cx="12" cy="12" r="8.5"/></Wash>
      <circle cx="12" cy="12" r="8.5"/>
      <path d="M12 7.5V12"/>
      <Accent><path d="M12 12l3 2"/></Accent>
    </>
  ),
  routine: (
    <>
      <Wash><path d="M8.5 4H7a2 2 0 0 0-2 2v13.5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1.5"/></Wash>
      <path d="M8.5 4H7a2 2 0 0 0-2 2v13.5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1.5"/>
      <path d="M8.5 10.5l1 1 2-2M13 10.5h3"/>
      <path d="M8.5 15.5l1 1 2-2M13 15.5h3"/>
      <Accent><rect x="8.5" y="2.5" width="7" height="3.5" rx="1"/></Accent>
    </>
  ),
  documents: (
    <>
      <Wash><path d="M15.5 2.5H8A1.5 1.5 0 0 0 6.5 4v16A1.5 1.5 0 0 0 8 21.5h11A1.5 1.5 0 0 0 20.5 20V7.5L15.5 2.5z"/></Wash>
      <path d="M15.5 2.5H8A1.5 1.5 0 0 0 6.5 4v16A1.5 1.5 0 0 0 8 21.5h11A1.5 1.5 0 0 0 20.5 20V7.5L15.5 2.5z"/>
      <path d="M6.5 5H5a1.5 1.5 0 0 0-1.5 1.5V19"/>
      <Accent><path d="M15.5 2.5V6a1.5 1.5 0 0 0 1.5 1.5h3.5"/></Accent>
    </>
  ),
  purchaseOrder: (
    <>
      <Wash><path d="M5 6.5h16.5l-3 8h-12z"/></Wash>
      <path d="M2 4h2.5l2 10.5h12"/>
      <path d="M5 6.5h3.5M15.5 6.5h6l-3 8"/>
      <circle cx="8.5" cy="19" r="1.5"/>
      <circle cx="17.5" cy="19" r="1.5"/>
      <Accent><rect x="8.5" y="4" width="7" height="8" rx="1"/></Accent>
    </>
  ),
  manifest: (
    <>
      <Wash><path d="M14 2.5H6.5A1.5 1.5 0 0 0 5 4v16a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 20V7.5L14 2.5z"/></Wash>
      <path d="M14 2.5H6.5A1.5 1.5 0 0 0 5 4v16a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 20V7.5L14 2.5z"/>
      <path d="M8 11.5h8M8 15h8M8 18.5h8M12 11.5v3.5"/>
      <Accent><path d="M8 8h8"/></Accent>
    </>
  ),
  inbound: (
    <>
      <Wash><rect x="6" y="11" width="12" height="8" rx="1.5"/></Wash>
      <rect x="6" y="11" width="12" height="8" rx="1.5"/>
      <path d="M12 11v3"/>
      <path d="M3 21.5h18"/>
      <Accent><path d="M12 2.5v6M9.5 6l2.5 2.5 2.5-2.5"/></Accent>
    </>
  ),
  processing: (
    <>
      <Wash><path d="M7.95 5.25L13.9 8.4V15.4L7.95 18.55L2 15.4V8.4Z"/></Wash>
      <path d="M7.95 5.25L13.9 8.4V15.4L7.95 18.55L2 15.4V8.4Z"/>
      <path d="M2 8.4L7.95 11.55L13.9 8.4M7.95 11.55V18.55"/>
      <path d="M4.975 6.825L10.925 9.975"/>
      <path d="M13.9 8.4L17 11.5"/>
      <AccentFill><path d="M16 11.95A0.45 0.45 0 0 1 16.45 11.5h2.22l2.73 2.73a0.45 0.45 0 0 1 0 0.63l-2.04 2.04a0.45 0.45 0 0 1-0.63 0L16 14.17z"/></AccentFill>
    </>
  ),
  findItem: (
    <>
      <Wash><circle cx="10" cy="10" r="6.5"/></Wash>
      <circle cx="10" cy="10" r="6.5"/>
      <path d="M14.6 14.6L20.5 20.5"/>
      <AccentFill><path d="M7.3 7.75A0.45 0.45 0 0 1 7.75 7.3h2.22l2.73 2.73a0.45 0.45 0 0 1 0 0.63l-2.04 2.04a0.45 0.45 0 0 1-0.63 0L7.3 9.97z"/></AccentFill>
    </>
  ),
  floorplan: (
    <>
      <Wash><path d="M14 21h3a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5"/></Wash>
      <path d="M14 21h3a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5"/>
      <rect x="6" y="8" width="2" height="8" rx="1"/>
      <rect x="16" y="8" width="2" height="8" rx="1"/>
      <AccentFill><rect x="11" y="8" width="2" height="8" rx="1"/></AccentFill>
    </>
  ),
  productReview: (
    <>
      <Wash><path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h7.4l9.1 9.1a1.5 1.5 0 0 1 0 2.1l-6.8 6.8a1.5 1.5 0 0 1-2.1 0L3 11.9z"/></Wash>
      <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h7.4l9.1 9.1a1.5 1.5 0 0 1 0 2.1l-6.8 6.8a1.5 1.5 0 0 1-2.1 0L3 11.9z"/>
      <circle cx="7.5" cy="7.5" r="1.5"/>
      <Accent><path d="M9 12.5L11.5 15L15.5 11"/></Accent>
    </>
  ),
  count: (
    <>
      <Wash><path d="M8.5 4H7a2 2 0 0 0-2 2v13.5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1.5"/></Wash>
      <path d="M8.5 4H7a2 2 0 0 0-2 2v13.5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1.5"/>
      <rect x="8.5" y="2.5" width="7" height="3.5" rx="1"/>
      <path d="M9 10v7.5M12 10v7.5M15 10v7.5"/>
      <Accent><path d="M7.5 16L16.5 11"/></Accent>
    </>
  ),
  inventories: (
    <>
      <Wash><rect x="3.5" y="2.5" width="17" height="10.5" rx="1.5"/><rect x="3.5" y="15.5" width="17" height="6" rx="1.5"/></Wash>
      <rect x="3.5" y="2.5" width="17" height="10.5" rx="1.5"/>
      <rect x="3.5" y="15.5" width="17" height="6" rx="1.5"/>
      <path d="M9 5h6M9 18h6"/>
      <Accent><path d="M9 9l2 2 4-4"/></Accent>
    </>
  ),
  fixit: (
    <>
      <Wash><path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h7.4l9.1 9.1a1.5 1.5 0 0 1 0 2.1l-6.8 6.8a1.5 1.5 0 0 1-2.1 0L3 11.9z"/></Wash>
      <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h7.4l9.1 9.1a1.5 1.5 0 0 1 0 2.1l-6.8 6.8a1.5 1.5 0 0 1-2.1 0L3 11.9z"/>
      <circle cx="7.5" cy="7.5" r="1.5"/>
      <Accent><path d="M8 12.5h4.75"/><path d="M15.375 10.98A1.75 1.75 0 1 0 15.375 14.02"/></Accent>
    </>
  ),
  reprice: (
    <>
      <Wash><path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h7.4l9.1 9.1a1.5 1.5 0 0 1 0 2.1l-6.8 6.8a1.5 1.5 0 0 1-2.1 0L3 11.9z"/></Wash>
      <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h7.4l9.1 9.1a1.5 1.5 0 0 1 0 2.1l-6.8 6.8a1.5 1.5 0 0 1-2.1 0L3 11.9z"/>
      <circle cx="7.5" cy="7.5" r="1.5"/>
      <Accent><path d="M13.88 10.12A2.75 2.75 0 1 0 15.25 12.5"/><path d="M16.31 13.56L15.25 12.5L14.19 13.56"/></Accent>
    </>
  ),
  vendor: (
    <>
      <Wash><path d="M3 9l9-6 9 6v12H3z"/></Wash>
      <path d="M3 9l9-6 9 6v12H3z"/>
      <Accent><rect x="8" y="13" width="8" height="8" rx="1"/><path d="M8 15.5h8M8 18h8"/></Accent>
    </>
  ),
  register: (
    <>
      <Wash><path d="M6 9h12l2.5 8h-17z"/></Wash>
      <path d="M6 9h12l2.5 8h-17z"/>
      <rect x="7" y="4" width="5" height="5" rx="1"/>
      <circle cx="9" cy="12" r="0.5"/>
      <circle cx="12" cy="12" r="0.5"/>
      <circle cx="15" cy="12" r="0.5"/>
      <circle cx="9" cy="15" r="0.5"/>
      <circle cx="12" cy="15" r="0.5"/>
      <circle cx="15" cy="15" r="0.5"/>
      <Accent><rect x="2.5" y="17.5" width="19" height="3" rx="1"/></Accent>
    </>
  ),
  cashDrawer: (
    <>
      <Wash><rect x="2.5" y="6" width="19" height="12" rx="2"/></Wash>
      <rect x="2.5" y="6" width="19" height="12" rx="2"/>
      <path d="M2.5 14.5h19"/>
      <path d="M8.5 6v8.5M12 6v8.5M15.5 6v8.5"/>
      <AccentFill><circle cx="5.5" cy="10.5" r="1.5"/></AccentFill>
    </>
  ),
  cash: (
    <>
      <Wash><rect x="2.5" y="6" width="19" height="12" rx="2"/></Wash>
      <rect x="2.5" y="6" width="19" height="12" rx="2"/>
      <path d="M6 10v4M18 10v4"/>
      <Accent><circle cx="12" cy="12" r="3"/></Accent>
    </>
  ),
  receipt: (
    <>
      <Wash><path d="M5.5 3H18.5V19L16.875 21L15.25 19L13.625 21L12 19L10.375 21L8.75 19L7.125 21L5.5 19Z"/></Wash>
      <path d="M5.5 3H18.5V19L16.875 21L15.25 19L13.625 21L12 19L10.375 21L8.75 19L7.125 21L5.5 19Z"/>
      <path d="M9 7.5h6M9 10.5h6"/>
      <Accent><path d="M9 14.5h6"/></Accent>
    </>
  ),
  printables: (
    <>
      <Wash><rect x="2.5" y="9" width="19" height="8.5" rx="2"/></Wash>
      <rect x="2.5" y="9" width="19" height="8.5" rx="2"/>
      <path d="M7 11.5h10"/>
      <path d="M6 20h12"/>
      <Accent><path d="M7 9V4.5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1V9"/></Accent>
    </>
  ),
  calendar: (
    <>
      <Wash><rect x="3.5" y="5" width="17" height="16" rx="2"/></Wash>
      <rect x="3.5" y="5" width="17" height="16" rx="2"/>
      <path d="M3.5 10h17"/>
      <path d="M8 3v4M16 3v4"/>
      <AccentFill><rect x="9.5" y="13.5" width="4.5" height="3.5" rx="1"/></AccentFill>
    </>
  ),
  deliveryList: (
    <>
      <Wash><path d="M2 6.5A3.5 3.5 0 0 1 9 6.5C9 9.5 5.5 11 5.5 14.5C5.5 11 2 9.5 2 6.5Z"/><path d="M15 14A3.5 3.5 0 0 1 22 14C22 17.5 18.5 18 18.5 22C18.5 18 15 17.5 15 14Z"/></Wash>
      <path d="M2 6.5A3.5 3.5 0 0 1 9 6.5C9 9.5 5.5 11 5.5 14.5C5.5 11 2 9.5 2 6.5Z"/>
      <path d="M8 16L10.5 17.5"/>
      <path d="M13.5 19L16 20.5"/>
      <Accent><path d="M15 14A3.5 3.5 0 0 1 22 14C22 17.5 18.5 18 18.5 22C18.5 18 15 17.5 15 14Z"/></Accent>
    </>
  ),
  wishlist: (
    <>
      <Wash><path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h7.4l9.1 9.1a1.5 1.5 0 0 1 0 2.1l-6.8 6.8a1.5 1.5 0 0 1-2.1 0L3 11.9z"/></Wash>
      <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h7.4l9.1 9.1a1.5 1.5 0 0 1 0 2.1l-6.8 6.8a1.5 1.5 0 0 1-2.1 0L3 11.9z"/>
      <circle cx="7.5" cy="7.5" r="1.5"/>
      <AccentFill><path d="M12.5 14.75C10.5 13.5 10 12.6 10 11.5C10 10.6 10.8 10 11.5 10C11.9 10 12.3 10.2 12.5 10.6C12.7 10.2 13.1 10 13.5 10C14.2 10 15 10.6 15 11.5C15 12.6 14.5 13.5 12.5 14.75Z"/></AccentFill>
    </>
  ),
  auction: (
    <>
      <Wash><path d="M15.15 4.61L19.39 8.85A1.5 1.5 0 0 1 19.39 10.97L17.97 12.39A1.5 1.5 0 0 1 15.85 12.39L11.61 8.15A1.5 1.5 0 0 1 11.61 6.03L13.03 4.61A1.5 1.5 0 0 1 15.15 4.61Z"/></Wash>
      <path d="M15.15 4.61L19.39 8.85A1.5 1.5 0 0 1 19.39 10.97L17.97 12.39A1.5 1.5 0 0 1 15.85 12.39L11.61 8.15A1.5 1.5 0 0 1 11.61 6.03L13.03 4.61A1.5 1.5 0 0 1 15.15 4.61Z"/>
      <path d="M13.73 10.27L3.5 20.5"/>
      <Accent><rect x="11.5" y="16.5" width="9" height="3" rx="1"/></Accent>
    </>
  ),
  watchlist: (
    <>
      <Wash><path d="M3 12A10 10 0 0 1 21 12A10 10 0 0 1 3 12Z"/></Wash>
      <path d="M3 12A10 10 0 0 1 21 12A10 10 0 0 1 3 12Z"/>
      <Accent><circle cx="12" cy="12" r="3"/></Accent>
    </>
  ),
  reportCard: (
    <>
      <Wash><path d="M14 2.5H6.5A1.5 1.5 0 0 0 5 4v16a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 20V7.5L14 2.5z"/></Wash>
      <path d="M14 2.5H6.5A1.5 1.5 0 0 0 5 4v16a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 20V7.5L14 2.5z"/>
      <Accent><path d="M8 18L12 7l4 11M9.5 14h5"/></Accent>
    </>
  ),
  assumptions: (
    <>
      <Wash><rect x="5.5" y="3" width="13" height="18" rx="2"/></Wash>
      <rect x="5.5" y="3" width="13" height="18" rx="2"/>
      <Accent><rect x="8" y="5.5" width="8" height="3.5" rx="1"/></Accent>
      <circle cx="10" cy="13" r="0.5"/>
      <circle cx="14" cy="13" r="0.5"/>
      <circle cx="10" cy="17" r="0.5"/>
      <circle cx="14" cy="17" r="0.5"/>
    </>
  ),
  registerSetup: (
    <>
      <Wash><circle cx="8" cy="6" r="2"/></Wash>
      <Wash><circle cx="15" cy="12" r="2"/></Wash>
      <Wash><circle cx="11" cy="18" r="2"/></Wash>
      <path d="M3 6h3M10 6h11"/>
      <path d="M3 12h10M17 12h4"/>
      <path d="M3 18h6M13 18h8"/>
      <circle cx="8" cy="6" r="2"/>
      <circle cx="15" cy="12" r="2"/>
      <circle cx="11" cy="18" r="2"/>
      <Accent><circle cx="15" cy="12" r="2"/></Accent>
    </>
  ),
  listing: (
    <>
      <Wash><rect x="3" y="4" width="18" height="16" rx="2"/></Wash>
      <rect x="3" y="4" width="18" height="16" rx="2"/>
      <path d="M3 7.5h18"/>
      <AccentFill><path d="M8.4 11.5A0.6 0.6 0 0 1 9 10.9h2.96l3.64 3.64a0.6 0.6 0 0 1 0 0.84l-2.72 2.72a0.6 0.6 0 0 1-0.84 0L8.4 14.46z"/></AccentFill>
    </>
  ),
  hold: (
    <>
      <Wash><path d="M4 8.5h16l-1.5 11.5a1.5 1.5 0 0 1-1.5 1.5H7a1.5 1.5 0 0 1-1.5-1.5z"/></Wash>
      <path d="M4 8.5h16l-1.5 11.5a1.5 1.5 0 0 1-1.5 1.5H7a1.5 1.5 0 0 1-1.5-1.5z"/>
      <path d="M8.5 8.5V6a3.5 3.5 0 0 1 7 0v2.5"/>
      <Accent><path d="M15.5 5H17"/><rect x="17" y="3.5" width="4" height="3" rx="1"/></Accent>
    </>
  ),
  messages: (
    <>
      <Wash><path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4.5 4v-4H6a2 2 0 0 1-2-2z"/></Wash>
      <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4.5 4v-4H6a2 2 0 0 1-2-2z"/>
      <AccentFill>
      <circle cx="8" cy="10" r="1.5"/>
      <circle cx="12" cy="10" r="1.5"/>
      <circle cx="16" cy="10" r="1.5"/>
      </AccentFill>
    </>
  ),
  staff: (
    <>
      <Wash>
      <circle cx="9" cy="9.5" r="3.5"/>
      <path d="M3 21c.5-3.5 3-5.5 6-5.5s5.5 2 6 5.5"/>
      </Wash>
      <circle cx="9" cy="9.5" r="3.5"/>
      <path d="M3 21c.5-3.5 3-5.5 6-5.5s5.5 2 6 5.5"/>
      <path d="M16 3.5a3.5 3.5 0 0 1 0 7"/>
      <path d="M16 13c3 0 5.5 2.5 5.5 8"/>
      <Accent><rect x="7.5" y="16.5" width="3" height="3" rx="0.5"/></Accent>
    </>
  ),
  departments: (
    <>
      <Wash>
      <rect x="8.5" y="4" width="7" height="5" rx="1.5"/>
      <rect x="3" y="15" width="7" height="5" rx="1.5"/>
      <rect x="14" y="15" width="7" height="5" rx="1.5"/>
      </Wash>
      <rect x="3" y="15" width="7" height="5" rx="1.5"/>
      <rect x="14" y="15" width="7" height="5" rx="1.5"/>
      <path d="M12 9v3M6.5 12v3M6.5 12h11v3"/>
      <Accent><rect x="8.5" y="4" width="7" height="5" rx="1.5"/></Accent>
    </>
  ),
  permissions: (
    <>
      <Wash><path d="M4.5 5.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2V11C19.5 15.5 16 19.5 12 21.5C8 19.5 4.5 15.5 4.5 11z"/></Wash>
      <path d="M4.5 5.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2V11C19.5 15.5 16 19.5 12 21.5C8 19.5 4.5 15.5 4.5 11z"/>
      <Accent><circle cx="12" cy="9.5" r="1.5"/><path d="M12 11v3"/></Accent>
    </>
  ),
  settings: (
    <>
      <Wash><path d="M10.28 3.17A9 9 0 0 1 13.72 3.17L13.81 5.24A7 7 0 0 1 15.5 5.94L17.03 4.54A9 9 0 0 1 19.46 6.97L18.06 8.5A7 7 0 0 1 18.76 10.19L20.83 10.28A9 9 0 0 1 20.83 13.72L18.76 13.81A7 7 0 0 1 18.06 15.5L19.46 17.03A9 9 0 0 1 17.03 19.46L15.5 18.06A7 7 0 0 1 13.81 18.76L13.72 20.83A9 9 0 0 1 10.28 20.83L10.19 18.76A7 7 0 0 1 8.5 18.06L6.97 19.46A9 9 0 0 1 4.54 17.03L5.94 15.5A7 7 0 0 1 5.24 13.81L3.17 13.72A9 9 0 0 1 3.17 10.28L5.24 10.19A7 7 0 0 1 5.94 8.5L4.54 6.97A9 9 0 0 1 6.97 4.54L8.5 5.94A7 7 0 0 1 10.19 5.24L10.28 3.17Z"/></Wash>
      <path d="M10.28 3.17A9 9 0 0 1 13.72 3.17L13.81 5.24A7 7 0 0 1 15.5 5.94L17.03 4.54A9 9 0 0 1 19.46 6.97L18.06 8.5A7 7 0 0 1 18.76 10.19L20.83 10.28A9 9 0 0 1 20.83 13.72L18.76 13.81A7 7 0 0 1 18.06 15.5L19.46 17.03A9 9 0 0 1 17.03 19.46L15.5 18.06A7 7 0 0 1 13.81 18.76L13.72 20.83A9 9 0 0 1 10.28 20.83L10.19 18.76A7 7 0 0 1 8.5 18.06L6.97 19.46A9 9 0 0 1 4.54 17.03L5.94 15.5A7 7 0 0 1 5.24 13.81L3.17 13.72A9 9 0 0 1 3.17 10.28L5.24 10.19A7 7 0 0 1 5.94 8.5L4.54 6.97A9 9 0 0 1 6.97 4.54L8.5 5.94A7 7 0 0 1 10.19 5.24L10.28 3.17Z"/>
      <Accent><circle cx="12" cy="12" r="3"/></Accent>
    </>
  ),
  labelDesign: (
    <>
      <Wash><path d="M3.6 4.65A1.05 1.05 0 0 1 4.65 3.6h5.18l6.37 6.37a1.05 1.05 0 0 1 0 1.47l-4.76 4.76a1.05 1.05 0 0 1-1.47 0L3.6 9.83z"/></Wash>
      <path d="M3.6 4.65A1.05 1.05 0 0 1 4.65 3.6h5.18l6.37 6.37a1.05 1.05 0 0 1 0 1.47l-4.76 4.76a1.05 1.05 0 0 1-1.47 0L3.6 9.83z"/>
      <circle cx="6.75" cy="6.75" r="1.05"/>
      <Accent><path d="M14.5 14.5L17.5 15.5L20.5 18.5L18.5 20.5L15.5 17.5Z"/><path d="M16 16L18 18"/></Accent>
    </>
  ),
  workbench: (
    <>
      <Wash><path d="M10.22 8.45L20.31 18.54L18.54 20.31L8.45 10.22A3 3 0 0 1 4.54 6.52L6.06 8.04L8.04 6.06L6.52 4.54A3 3 0 0 1 10.22 8.45Z"/></Wash>
      <path d="M10.22 8.45L20.31 18.54L18.54 20.31L8.45 10.22A3 3 0 0 1 4.54 6.52L6.06 8.04L8.04 6.06L6.52 4.54A3 3 0 0 1 10.22 8.45Z"/>
      <path d="M15.54 8.46L4.58 19.42"/>
      <AccentFill><path d="M17.48 4.05L19.95 6.52L16.77 9.7L14.3 7.23Z"/></AccentFill>
    </>
  ),
  repairQueue: (
    <>
      <Wash><rect x="9" y="3.5" width="12" height="4" rx="1.5"/><rect x="9" y="10" width="12" height="4" rx="1.5"/><rect x="9" y="16.5" width="12" height="4" rx="1.5"/></Wash>
      <rect x="9" y="10" width="12" height="4" rx="1.5"/>
      <rect x="9" y="16.5" width="12" height="4" rx="1.5"/>
      <path d="M2.5 5.5H7"/>
      <path d="M4.5 3.5L7 5.5L4.5 7.5"/>
      <Accent><rect x="9" y="3.5" width="12" height="4" rx="1.5"/></Accent>
    </>
  ),
  parts: (
    <>
      <Wash><path d="M4.5 3H8.5L10.5 6.5L8.5 10V20.5H4.5V10L2.5 6.5Z"/></Wash>
      <path d="M4.5 3H8.5L10.5 6.5L8.5 10H4.5L2.5 6.5Z"/>
      <path d="M4.5 10V20.5H8.5V10"/>
      <path d="M4.5 13.5L8.5 12"/>
      <path d="M4.5 16L8.5 14.5"/>
      <path d="M4.5 18.5L8.5 17"/>
      <Accent><path d="M16.5 7L20.5 9V14L16.5 16L12.5 14V9Z"/><circle cx="16.5" cy="11.5" r="1.5"/></Accent>
    </>
  ),
  restoration: (
    <>
      <Wash><path d="M15.85 10.27L5.06 21.06L2.94 18.94L13.73 8.15A3.5 3.5 0 0 1 18.31 3.72L16.04 5.99L18.02 7.97L20.29 5.7A3.5 3.5 0 0 1 15.85 10.27Z"/></Wash>
      <path d="M15.85 10.27L5.06 21.06L2.94 18.94L13.73 8.15A3.5 3.5 0 0 1 18.31 3.72L16.04 5.99L18.02 7.97L20.29 5.7A3.5 3.5 0 0 1 15.85 10.27Z"/>
      <AccentFill><path d="M6.5 3.5Q7.25 5.75 9.5 6.5Q7.25 7.25 6.5 9.5Q5.75 7.25 3.5 6.5Q5.75 5.75 6.5 3.5Z"/></AccentFill>
    </>
  ),
  announce: (
    <>
      <Wash><path d="M2.5 9.5H6.5L15.5 4.5V19.5L6.5 14.5H2.5Z"/></Wash>
      <path d="M2.5 9.5H6.5L15.5 4.5V19.5L6.5 14.5H2.5Z"/>
      <path d="M4 14.5V18A1.5 1.5 0 0 0 7 18V14.5"/>
      <Accent><path d="M17.8 10.07A3 3 0 0 1 17.8 13.93"/><path d="M19.71 8.46A5.5 5.5 0 0 1 19.71 15.54"/></Accent>
    </>
  ),
  blog: (
    <>
      <Wash><path d="M14 2.5H6.5A1.5 1.5 0 0 0 5 4v16a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 20V7.5L14 2.5z"/></Wash>
      <path d="M14 2.5H6.5A1.5 1.5 0 0 0 5 4v16a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 20V7.5L14 2.5z"/>
      <Accent><path d="M7.5 17L12 15.5L16.5 11L13.5 8L9 12.5ZM12 15.5L9 12.5"/></Accent>
    </>
  ),
  shifts: (
    <>
      <Wash><path d="M5.5 5H18.5A2 2 0 0 1 20.5 7V11.38A6.5 6.5 0 0 0 11.81 21H5.5A2 2 0 0 1 3.5 19V7A2 2 0 0 1 5.5 5Z"/></Wash>
      <path d="M5.5 5H18.5A2 2 0 0 1 20.5 7V11.38A6.5 6.5 0 0 0 11.81 21H5.5A2 2 0 0 1 3.5 19V7A2 2 0 0 1 5.5 5Z"/>
      <path d="M3.5 10h17"/>
      <path d="M8 3v4M16 3v4"/>
      <Accent><circle cx="16.5" cy="16.5" r="3.5"/><path d="M16.5 15V16.5H18"/></Accent>
    </>
  ),
  payroll: (
    <>
      <Wash><circle cx="10.5" cy="10.5" r="7.5"/></Wash>
      <path d="M18 11A7.5 7.5 0 1 0 11 18"/>
      <path d="M10.5 6V10.5l2.5 1.5"/>
      <AccentFill><circle cx="17" cy="17" r="4"/></AccentFill>
    </>
  ),
  brief: (
    <>
      <Wash><path d="M14 2.5H6.5A1.5 1.5 0 0 0 5 4v16a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 20V7.5L14 2.5z"/></Wash>
      <path d="M14 2.5H6.5A1.5 1.5 0 0 0 5 4v16a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 20V7.5L14 2.5z"/>
      <path d="M8 8h5"/>
      <AccentFill><path d="M12 11.5Q12 15 15.5 15Q12 15 12 18.5Q12 15 8.5 15Q12 15 12 11.5Z"/></AccentFill>
    </>
  ),
  thriftPlus: (
    <>
      <Wash><rect x="2.5" y="5" width="19" height="14" rx="2"/></Wash>
      <rect x="2.5" y="5" width="19" height="14" rx="2"/>
      <path d="M2.5 8.5H21.5"/>
      <Accent><path d="M14 13.5H19M16.5 11V16"/></Accent>
    </>
  ),
  requests: (
    <>
      <Wash><circle cx="12" cy="6" r="3"/><rect x="4" y="12" width="16" height="4.5" rx="1.5"/></Wash>
      <circle cx="12" cy="6" r="3"/>
      <path d="M10.5 9v3M13.5 9v3"/>
      <rect x="4" y="12" width="16" height="4.5" rx="1.5"/>
      <Accent><path d="M4 20h16"/></Accent>
    </>
  ),
  enhancement: (
    <>
      <Wash><path d="M10 17L9.5 15.24A4.5 4.5 0 1 1 14.5 15.24L14 17"/></Wash>
      <path d="M10 17L9.5 15.24A4.5 4.5 0 1 1 14.5 15.24L14 17"/>
      <path d="M9.5 18.5h5"/>
      <path d="M10.5 21h3"/>
      <Accent><path d="M12 5.5V2.5"/><path d="M16.24 7.26L18.36 5.14"/><path d="M7.76 7.26L5.64 5.14"/></Accent>
    </>
  ),
  commandCenter: (
    <>
      <Wash><path d="M3 16.5A9 9 0 0 1 21 16.5Z"/></Wash>
      <path d="M3 16.5A9 9 0 0 1 21 16.5Z"/>
      <path d="M7.77 14.96L5.89 14.28"/>
      <path d="M9.75 12.6L8.75 10.87"/>
      <path d="M12.78 12.07L13.13 10.1"/>
      <Accent><path d="M12 16.5L16.98 12.32"/></Accent>
    </>
  ),
  applicant: (
    <>
      <Wash>
      <circle cx="10.5" cy="8" r="4"/>
      <path d="M3 21c.5-4 3.6-6.5 7.5-6.5s7 2.5 7.5 6.5"/>
      </Wash>
      <circle cx="10.5" cy="8" r="4"/>
      <path d="M3 21c.5-4 3.6-6.5 7.5-6.5s7 2.5 7.5 6.5"/>
      <Accent><path d="M18.5 2.5v5M16 5h5"/></Accent>
    </>
  ),
  interview: (
    <>
      <Wash><path d="M2 11a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H7l-3 3.5V17a2 2 0 0 1-2-2z"/></Wash>
      <path d="M2 11a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H7l-3 3.5V17a2 2 0 0 1-2-2z"/>
      <Accent><path d="M14 10.5h1l4.5 3.5v-3.5a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v4"/></Accent>
    </>
  ),
  onboarding: (
    <>
      <Wash>
      <rect x="9.5" y="3" width="10.5" height="18" rx="1"/>
      <path d="M20 3l-5 1.5v15l5 1.5z"/>
      </Wash>
      <rect x="9.5" y="3" width="10.5" height="18" rx="1"/>
      <path d="M20 3l-5 1.5v15l5 1.5z"/>
      <circle cx="16.5" cy="12" r="0.5"/>
      <Accent><path d="M2.5 12h9M8 8.5l3.5 3.5-3.5 3.5"/></Accent>
    </>
  ),
  checkIn: (
    <>
      <Wash><circle cx="10.5" cy="8" r="4"/><path d="M3 21c.5-4 3.6-6.5 7.5-6.5h1V21z"/></Wash>
      <circle cx="10.5" cy="8" r="4"/>
      <path d="M3 21c.5-4 3.6-6.5 7.5-6.5h1"/>
      <Accent><circle cx="17.5" cy="17.5" r="3.5"/><path d="M16.5 17.5l1 1 1.5-2"/></Accent>
    </>
  ),
  deductions: (
    <>
      <Wash><path d="M3 7V17.5a5.5 2 0 0 0 11 0V7a5.5 2 0 0 0-11 0z"/></Wash>
      <ellipse cx="8.5" cy="7" rx="5.5" ry="2"/>
      <path d="M3 7v10.5M14 7v10.5"/>
      <path d="M3 10.5a5.5 2 0 0 0 11 0M3 14a5.5 2 0 0 0 11 0M3 17.5a5.5 2 0 0 0 11 0"/>
      <Accent><path d="M16.5 12h4.5"/></Accent>
    </>
  ),
  email: (
    <>
      <Wash><rect x="3" y="5.5" width="18" height="13" rx="2"/></Wash>
      <rect x="3" y="5.5" width="18" height="13" rx="2"/>
      <Accent><path d="M3 7.5l9 7 9-7"/></Accent>
    </>
  ),
  jobPost: (
    <>
      <Wash>
      <rect x="3" y="7" width="18" height="13.5" rx="2"/>
      <path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7"/>
      </Wash>
      <rect x="3" y="7" width="18" height="13.5" rx="2"/>
      <path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7"/>
      <path d="M3 13.5h7.5M13.5 13.5H21"/>
      <Accent><rect x="10.5" y="12" width="3" height="3" rx="0.75"/></Accent>
    </>
  ),
  delivery: (
    <>
      <Wash><rect x="2" y="5.5" width="12" height="10" rx="1"/><path d="M14 9h3.5l3.5 4v2.5h-7"/></Wash>
      <rect x="2" y="5.5" width="12" height="10" rx="1"/>
      <path d="M14 9h3.5l3.5 4v2.5h-7"/>
      <circle cx="6.5" cy="17.5" r="2"/>
      <circle cx="17" cy="17.5" r="2"/>
      <Accent><rect x="5" y="8" width="6" height="5" rx="1"/><path d="M5 10.5h6"/></Accent>
    </>
  ),
  salesFloor: (
    <>
      <Wash><path d="M12 9.5l-9 9h18z"/></Wash>
      <path d="M12 9.5l-9 9h18z"/>
      <Accent><path d="M10 6.5a2.5 2.5 0 1 1 2 2.5v.5"/></Accent>
    </>
  ),
  webStore: (
    <>
      <Wash><path d="M5 9.5V21h14V9.5z"/></Wash>
      <path d="M5 9.5V21h14V9.5"/>
      <path d="M10 21v-4.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V21"/>
      <Accent><path d="M3 8V4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v4a1.5 1.5 0 0 1-3 0a1.5 1.5 0 0 1-3 0a1.5 1.5 0 0 1-3 0a1.5 1.5 0 0 1-3 0a1.5 1.5 0 0 1-3 0a1.5 1.5 0 0 1-3 0z"/></Accent>
    </>
  ),
  studio: (
    <>
      <Wash><path d="M12 3C7 3 3 6.8 3 11.5C3 16.5 7 21 12 21C14 21 15 19.8 15 18.3C15 16.5 16.2 15.5 18 15.5C19.8 15.5 21 14.3 21 12C21 6.8 17 3 12 3Z"/></Wash>
      <path d="M12 3C7 3 3 6.8 3 11.5C3 16.5 7 21 12 21C14 21 15 19.8 15 18.3C15 16.5 16.2 15.5 18 15.5C19.8 15.5 21 14.3 21 12C21 6.8 17 3 12 3Z"/>
      <circle cx="10.5" cy="15.5" r="1.5"/>
      <circle cx="7.5" cy="11" r="1.25"/>
      <circle cx="15.5" cy="7.5" r="1.25"/>
      <AccentFill><circle cx="10.5" cy="7" r="1.5"/></AccentFill>
    </>
  ),
  people: (
    <>
      <Wash>
      <circle cx="12" cy="8" r="4"/>
      <path d="M4.5 21c.5-4 3.6-6.5 7.5-6.5s7 2.5 7.5 6.5"/>
      </Wash>
      <path d="M4.5 21c.5-4 3.6-6.5 7.5-6.5s7 2.5 7.5 6.5"/>
      <path d="M4.5 5.5a2.5 2.5 0 0 0 0 5"/>
      <path d="M4.5 13c-1.8.2-2.5 3.5-2.5 8"/>
      <path d="M19.5 5.5a2.5 2.5 0 0 1 0 5"/>
      <path d="M19.5 13c1.8.2 2.5 3.5 2.5 8"/>
      <Accent><circle cx="12" cy="8" r="4"/></Accent>
    </>
  ),
  add: (
    <>
      <path d="M12 5.5v13M5.5 12h13"/>
    </>
  ),
  remove: (
    <>
      <path d="M5.5 12h13"/>
    </>
  ),
  close: (
    <>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>
    </>
  ),
  edit: (
    <>
      <path d="M4.75 19.25L9.35 18.19L19.25 8.29L15.71 4.75L5.81 14.65Z"/>
      <path d="M12.88 7.58L16.42 11.12"/>
    </>
  ),
  delete: (
    <>
      <path d="M4 6h16M9.5 6V5A1.5 1.5 0 0 1 11 3.5H13A1.5 1.5 0 0 1 14.5 5V6"/>
      <path d="M6 6L7 19A1.5 1.5 0 0 0 8.5 20.5H15.5A1.5 1.5 0 0 0 17 19L18 6"/>
      <path d="M10 9.5v7M14 9.5v7"/>
    </>
  ),
  save: (
    <>
      <path d="M4 6a2 2 0 0 1 2-2h10l4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>
      <path d="M8 4v3a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V4"/>
      <rect x="7.5" y="12.5" width="9" height="5" rx="1"/>
    </>
  ),
  copy: (
    <>
      <path d="M9 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v3"/>
      <rect x="9" y="9" width="11" height="11" rx="2"/>
    </>
  ),
  confirm: (
    <>
      <path d="M4.5 12L9.5 17L19.5 7"/>
    </>
  ),
  more: (
    <>
      <circle cx="12" cy="5.5" r="0.5"/>
      <circle cx="12" cy="12" r="0.5"/>
      <circle cx="12" cy="18.5" r="0.5"/>
    </>
  ),
  filter: (
    <>
      <path d="M4 5h16l-6.5 7.5v6.5h-3v-6.5z"/>
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6"/>
      <path d="M15 15l4.5 4.5"/>
    </>
  ),
  download: (
    <>
      <path d="M12 3.5v11.5M9 12l3 3 3-3"/>
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>
    </>
  ),
  upload: (
    <>
      <path d="M12 15V3.5M9 6.5l3-3 3 3"/>
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>
    </>
  ),
  refresh: (
    <>
      <path d="M18.75 13.75A7 7 0 1 1 17 7"/>
      <path d="M14 7h3V4"/>
    </>
  ),
  undo: (
    <>
      <path d="M5 9.5h10a4 4 0 0 1 0 8H10"/>
      <path d="M8 6.5l-3 3 3 3"/>
    </>
  ),
  back: (
    <>
      <path d="M19 12H5M8 9l-3 3 3 3"/>
    </>
  ),
  openExternal: (
    <>
      <path d="M12.5 6.5H5.5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8"/>
      <path d="M10 14L20.5 3.5M17.5 3.5h3v3"/>
    </>
  ),
  scan: (
    <>
      <path d="M3.5 8V5.5a2 2 0 0 1 2-2H8M16 3.5h2.5a2 2 0 0 1 2 2V8M20.5 16v2.5a2 2 0 0 1-2 2H16M8 20.5H5.5a2 2 0 0 1-2-2V16"/>
      <path d="M6 12h12"/>
    </>
  ),
  aiAssist: (
    <>
      <path d="M10 6C10 9.5 13.5 13 17 13C13.5 13 10 16.5 10 20C10 16.5 6.5 13 3 13C6.5 13 10 9.5 10 6Z"/>
      <path d="M18 3.5v5M15.5 6h5"/>
    </>
  ),
  archive: (
    <>
      <rect x="3.5" y="3.5" width="17" height="5" rx="1.5"/>
      <path d="M5 8.5v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-10"/>
      <path d="M9.5 12.5h5"/>
    </>
  ),
  print: (
    <>
      <path d="M7 8V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v4"/>
      <path d="M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
      <rect x="7" y="13" width="10" height="8.5" rx="1"/>
    </>
  ),
};
// ART:END

export type EcoIconName = keyof typeof NOTES;

const RECIPE_LINE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function makeIcon(name: EcoIconName): ComponentType<SvgIconProps> {
  function EcoIcon(props: SvgIconProps) {
    return (
      <SvgIcon viewBox="0 0 24 24" data-eco-icon={name} {...props}>
        <g data-role="line" {...RECIPE_LINE}>{ART[name]}</g>
      </SvgIcon>
    );
  }
  EcoIcon.displayName = `EcoIcon(${name})`;
  return EcoIcon;
}

export const ICON_NAMES = Object.keys(NOTES) as EcoIconName[];

export const ECO_ICONS = Object.fromEntries(
  ICON_NAMES.map((name) => [name, makeIcon(name)]),
) as Record<EcoIconName, ComponentType<SvgIconProps>>;

export const ACTION_ICON_NAMES = ICON_NAMES.filter((name) => NOTES[name].kind === 'action');
export const PAGE_ICON_NAMES = ICON_NAMES.filter((name) => NOTES[name].kind === 'page');

/** Action icons by name, for buttons: `import { IconAdd } from '../icons/ecoIcons'`. */
export const IconAdd = ECO_ICONS.add;
export const IconRemove = ECO_ICONS.remove;
export const IconClose = ECO_ICONS.close;
export const IconEdit = ECO_ICONS.edit;
export const IconDelete = ECO_ICONS.delete;
export const IconSave = ECO_ICONS.save;
export const IconCopy = ECO_ICONS.copy;
export const IconConfirm = ECO_ICONS.confirm;
export const IconMore = ECO_ICONS.more;
export const IconFilter = ECO_ICONS.filter;
export const IconSearch = ECO_ICONS.search;
export const IconDownload = ECO_ICONS.download;
export const IconUpload = ECO_ICONS.upload;
export const IconRefresh = ECO_ICONS.refresh;
export const IconUndo = ECO_ICONS.undo;
export const IconBack = ECO_ICONS.back;
export const IconOpenExternal = ECO_ICONS.openExternal;
export const IconScan = ECO_ICONS.scan;
export const IconAiAssist = ECO_ICONS.aiAssist;
export const IconArchive = ECO_ICONS.archive;
export const IconPrint = ECO_ICONS.print;

/**
 * The page registry (Dash Update #134, Design Lab phase 1; types and checklist carried over from Dark Horse).
 *
 * Every sidebar page names its page type (`template`) and where it stands on the design checklist. The Design Lab's
 * Pages tab (/admin/design-lab?view=pages) lists them by workspace, so after a design change the owner can open each
 * page that still needs it and hand it to a coder. Pages come from the sidebar catalog (navItemCatalog.ts), so a new
 * sidebar page shows up here by itself, as "not sorted" until it gets a line in TEMPLATE.
 *
 * Checklist, in order:
 *   template  the page is built from its page type (PageShell, the kit, no hex codes) on the Eco-Thrift theme
 *   design    its phone and desktop design is approved (Bill, or the critic cycle to A+)
 *   done      nothing left to do for its plan
 * The owner ticks the steps on the Pages tab; the ticks are saved on the server (apps/core/design_lab.py) and merged
 * in with `withChecks`. Phase 2: the sidebar itself is generated from this list.
 */
import { NAV_ITEM_CATALOG } from './navItemCatalog';
import { navItemIsActive } from './navUtils';
import { SLOT_C_NAV_GROUPS, SLOT_C_WORKSPACES } from './slotCNavLayout';

/** The seven page types, plus `tool` (a full-screen station with its own layout) and `none` (reference sheets). */
export type PageTemplate =
  | 'overview'
  | 'list-detail'
  | 'record'
  | 'calendar'
  | 'report'
  | 'form'
  | 'settings'
  | 'tool'
  | 'none';

/** Which screen is designed first. The other one must still work. */
export type PageFirst = 'mobile' | 'desktop';

export interface PageChecklist {
  template: boolean;
  design: boolean;
  done: boolean;
}

export interface TemplateInfo {
  id: PageTemplate;
  label: string;
  first: PageFirst;
  /** What the page does on a phone, in a few words. */
  phone: string;
  /** What the page type is for. */
  use: string;
}

/** The page types in Design Lab order. `tool` and `none` have no demo. */
export const PAGE_TEMPLATES: TemplateInfo[] = [
  { id: 'overview', label: 'Overview', first: 'mobile', phone: 'the numbers, then what needs you', use: 'A workspace or a person at a glance: a few numbers, today, what needs a hand.' },
  { id: 'list-detail', label: 'List and detail', first: 'desktop', phone: 'the detail opens full screen', use: 'Browse many things (trucks, vendors, staff), open one beside the list.' },
  { id: 'record', label: 'Record', first: 'desktop', phone: 'opens with the record, not the page title', use: 'One thing in full: an item, a person, a truck, with its tabs and history.' },
  { id: 'calendar', label: 'Calendar', first: 'mobile', phone: 'one day at a time', use: 'Things on days: deliveries, shifts, interviews.' },
  { id: 'report', label: 'Report', first: 'desktop', phone: 'columns fold away, totals stay', use: 'Numbers for a period: totals, a chart, a table with a total row.' },
  { id: 'form', label: 'Form', first: 'mobile', phone: 'one column, the button always in reach', use: 'Fill something in or tick through a checklist.' },
  { id: 'settings', label: 'Settings', first: 'mobile', phone: 'saves as you change it', use: 'Switches and rules that are set once and left.' },
];

export const TOOL_TEMPLATE: TemplateInfo = {
  id: 'tool', label: 'Tool', first: 'desktop', phone: 'its own layout', use: 'A full-screen station with its own layout (the register, the bench, a scanner, an editor). Uses the theme and the kit pieces, not a page type.',
};

export function templateInfo(id: PageTemplate): TemplateInfo | undefined {
  if (id === 'tool') return TOOL_TEMPLATE;
  return PAGE_TEMPLATES.find((t) => t.id === id);
}

/**
 * Each sidebar page's type. First sort, 2026-11-13 (#134): correct a line when a page turns out to be another type.
 * A sidebar page with no line here shows as "not sorted".
 */
const TEMPLATE: Record<string, PageTemplate> = {
  // Home and account
  dashboard: 'overview', today: 'overview', routines: 'form', documents: 'list-detail', dashFixes: 'list-detail',
  hrRequests: 'list-detail', profile: 'record',
  // Dash Home tabs (2026-11-13): HR (staff view), Calendar (being designed), Messages
  homeHr: 'overview', homeCalendar: 'calendar', homeMessages: 'list-detail',
  // Buying
  auctions: 'list-detail', estimateProfit: 'form', vendors: 'list-detail', orders: 'list-detail', preprocessing: 'tool',
  wishlist: 'list-detail', auctionsOld: 'list-detail', watchlist: 'list-detail', reportCards: 'report',
  assumptions: 'settings',
  // Processing
  receiving: 'list-detail', processing: 'tool', processingMyNumbers: 'overview', processingCommandCenter: 'overview',
  processingReturns: 'list-detail', processingFloorIssues: 'list-detail', processingPhotoSheets: 'list-detail',
  // Restoration
  restorationQueue: 'overview', tars: 'tool', restorationPartsRequests: 'list-detail', restorationTracking: 'list-detail',
  restorations: 'overview', restorationReturns: 'overview',
  // Retail and inventory
  posTerminal: 'tool', posTestTerminal: 'tool', posTransactions: 'list-detail', customers: 'list-detail',
  posDrawers: 'list-detail', thriftPlusFinalize: 'tool', thriftPlusMembers: 'list-detail', quickReprice: 'tool',
  prFixit: 'tool', posPrintables: 'list-detail', retailQa: 'overview', posCash: 'list-detail', posSetup: 'settings',
  thriftPlus: 'overview', inventories: 'list-detail', inventoryWorkbench: 'list-detail', inventoryCount: 'tool',
  inventoryReview: 'list-detail', tagErrors: 'list-detail', floorplans: 'tool',
  // Online Sales
  onlineSalesListings: 'list-detail', onlineSalesHolds: 'list-detail', onlineSalesCustomers: 'list-detail',
  // Deliveries
  deliverySchedule: 'calendar', deliveryTable: 'list-detail',
  // Studios
  socialStudio: 'tool', labelStudio: 'tool', announcements: 'list-detail', blogStudio: 'tool',
  // Facilities
  storeMap: 'tool', signage: 'list-detail', supplies: 'list-detail', keys: 'list-detail',
  // Admin
  owner: 'overview', reports: 'report', superRequests: 'list-detail', contractors: 'list-detail',
  adminRoutines: 'list-detail', settings: 'settings', icons: 'none', designLab: 'none',
  // HR
  schedule: 'calendar', users: 'list-detail', permissions: 'settings', applicants: 'list-detail',
  interviews: 'calendar', onboarding: 'list-detail', checkins: 'list-detail', departments: 'list-detail',
  shifts: 'calendar', payrollHours: 'report', payrollDeductions: 'list-detail', jobs: 'list-detail',
  hiringEmails: 'list-detail', hrDocuments: 'list-detail',
};

export interface RegistryPage {
  id: string;
  label: string;
  path: string;
  /** The workspace whose sidebar lists it; "home" for the home pages, "none" when no sidebar lists it. */
  workspaceId: string;
  workspaceLabel: string;
  /** A sidebar shortcut in other workspaces (guest link) as well. */
  alsoIn: string[];
  template: PageTemplate | 'unsorted';
  first: PageFirst;
  superuserOnly: boolean;
  check: PageChecklist;
  /** Who ticked last, and when (ISO), from the server. */
  checkedBy?: string;
  checkedAt?: string;
}

export const HOME_WORKSPACE = { id: 'home', label: 'Home and account' };
/** Pages no workspace lists: reached from another page, the avatar menu, or kept alive at an old address. */
export const NO_WORKSPACE = { id: 'none', label: 'Not in a workspace sidebar' };
/** Home pages and the avatar menu: for everyone, outside the workspaces. */
const HOME_IDS = new Set(['dashboard', 'today', 'routines', 'documents', 'dashFixes', 'profile', 'homeHr', 'homeCalendar', 'homeMessages']);

/** The workspace that lists the page as its own; for a page only ever a shortcut (owner tools), the first that links it. */
function ownWorkspace(itemId: string) {
  return (
    SLOT_C_NAV_GROUPS.find((g) =>
      [g.itemIds, g.managerItemIds ?? [], g.setupItemIds ?? []].some((ids) => ids.includes(itemId)),
    ) ?? SLOT_C_NAV_GROUPS.find((g) => g.guestItemIds?.includes(itemId))
  );
}

function buildRegistry(): RegistryPage[] {
  const seen = new Set<string>();
  const pages: RegistryPage[] = [];
  for (const item of Object.values(NAV_ITEM_CATALOG)) {
    if (item.legacy) continue;
    const group = ownWorkspace(item.id);
    const workspace = group ? SLOT_C_WORKSPACES.find((w) => w.id === group.id) : undefined;
    // Two sidebar names for one address (Restoration from two workspaces): one page, listed once.
    const key = `${item.path}|${item.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const template = (TEMPLATE[item.id] as PageTemplate | undefined) ?? 'unsorted';
    const info = template === 'unsorted' ? undefined : templateInfo(template);
    pages.push({
      id: item.id,
      label: item.label,
      path: item.path,
      ...(workspace
        ? { workspaceId: workspace.id, workspaceLabel: workspace.label }
        : HOME_IDS.has(item.id)
          ? { workspaceId: HOME_WORKSPACE.id, workspaceLabel: HOME_WORKSPACE.label }
          : { workspaceId: NO_WORKSPACE.id, workspaceLabel: NO_WORKSPACE.label }),
      alsoIn: SLOT_C_NAV_GROUPS.filter((g) => g.id !== group?.id && g.guestItemIds?.includes(item.id)).map(
        (g) => SLOT_C_WORKSPACES.find((w) => w.id === g.id)?.label ?? g.id,
      ),
      template,
      first: info?.first ?? 'desktop',
      superuserOnly: Boolean(item.superuserOnly),
      check: { template: false, design: false, done: false },
    });
  }
  return pages;
}

export const PAGE_REGISTRY: RegistryPage[] = buildRegistry();

/** The registry with the server's ticks (getDesignPageChecks) merged in. */
export function withChecks(
  pages: RegistryPage[],
  checks: Record<string, Partial<PageChecklist> & { by?: string; at?: string }> | undefined,
): RegistryPage[] {
  if (!checks) return pages;
  return pages.map((p) => {
    const c = checks[p.id];
    if (!c) return p;
    return {
      ...p,
      check: { template: Boolean(c.template), design: Boolean(c.design), done: Boolean(c.done) },
      checkedBy: c.by,
      checkedAt: c.at,
    };
  });
}

/** Workspaces in sidebar order, Home and account first, pages outside every workspace last. */
export const REGISTRY_WORKSPACES = [
  HOME_WORKSPACE,
  ...SLOT_C_WORKSPACES.map((w) => ({ id: w.id, label: w.label })),
  NO_WORKSPACE,
];

/** The next step a page needs: "template", "design", "done", or null when finished (or a reference sheet). */
export function nextStep(page: RegistryPage): keyof PageChecklist | null {
  if (page.template === 'none') return null;
  if (!page.check.template) return 'template';
  if (!page.check.design) return 'design';
  if (!page.check.done) return 'done';
  return null;
}

/** The text handed to a coder to start a page's design update. */
export function designBrief(page: RegistryPage, origin = ''): string {
  const info = page.template === 'unsorted' ? undefined : templateInfo(page.template);
  const step = nextStep(page);
  const demo = info && info.id !== 'tool' ? `${origin}/admin/design-lab?view=${info.id}` : `${origin}/admin/design-lab?view=theme`;
  const lines = [
    `Design update: ${page.label} (${origin}${page.path}), ${page.workspaceLabel} workspace.`,
    info
      ? `Page type: ${info.label}, designed ${info.first} first; on a phone ${info.phone}.`
      : 'Page type: not sorted yet. Pick its type in navigation/pageRegistry.ts first.',
    step === 'template' || step === null
      ? `Move it onto the Eco-Thrift theme (frontend/src/theme/eco.ts) and the page kit (components/page/PageKit.tsx): no hex codes, no title in the page body. Start from the Design Lab demo: ${demo}`
      : step === 'design'
        ? `It is on its template; get its phone and desktop design approved (critic cycle to A+). Demo: ${demo}`
        : 'Its design is approved; finish what its plan still needs.',
    'When it lands, Bill ticks the step on the Design Lab Pages tab.',
  ];
  return lines.join('\n');
}

/**
 * The page's name for the top bar: the sidebar label of the page at this address (the most specific match wins).
 * Empty when no sidebar page matches.
 */
export function pageTitleFor(pathname: string, search = '', hash = ''): string {
  let best = { label: '', length: -1 };
  for (const item of Object.values(NAV_ITEM_CATALOG)) {
    if (item.legacy || !navItemIsActive(pathname, search, hash, item)) continue;
    const length = item.path.length + (item.query ? 1000 : 0);
    if (length > best.length) best = { label: item.label, length };
  }
  return best.label;
}

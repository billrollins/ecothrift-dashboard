import type { NavItemDef } from './navTypes';

/** Single source of truth for staff sidebar links (post web_ui_cleanup). */
export const NAV_ITEM_CATALOG: Record<string, NavItemDef> = {
  dashboard: {
    id: 'dashboard',
    path: '/dashboard',
    label: 'Dashboard',
    icon: 'overview',
  },
  today: {
    id: 'today',
    path: '/today',
    label: 'Today',
    icon: 'today',
    // Routines and Hours & pay open inside Today.
    pathAliases: ['/routines', '/pay'],
  },
  routines: {
    id: 'routines',
    path: '/routines',
    label: 'Routines',
    icon: 'routine',
  },
  documents: {
    id: 'documents',
    path: '/documents',
    label: 'Documents',
    icon: 'documents',
    // Parked: pages exist, routes and account-menu link are off until a later tune.
  },
  orders: {
    id: 'orders',
    path: '/inventory/orders',
    label: 'Orders',
    icon: 'purchaseOrder',
  },
  preprocessing: {
    id: 'preprocessing',
    path: '/inventory/preprocessing',
    label: 'Preprocessing',
    icon: 'manifest',
  },
  receiving: {
    id: 'receiving',
    path: '/inventory/receiving',
    label: 'Receiving',
    icon: 'inbound',
  },
  processing: {
    id: 'processing',
    path: '/inventory/processing',
    label: 'Processing',
    icon: 'processing',
  },
  inventoryWorkbench: {
    id: 'inventoryWorkbench',
    path: '/inventory/search',
    label: 'Search',
    icon: 'findItem',
    // Inventory left the workspace list (#67): its pages are shortcuts in the workspaces that use them.
    area: 'inventory',
  },
  // Weekly numbers per category: in, out, on hand, supply, stale, recovery, flags (inventory review, owner 2026-10-22).
  inventoryReview: {
    id: 'inventoryReview',
    path: '/inventory/review',
    label: 'Review',
    icon: 'reports',
    area: 'inventory',
  },
  floorplans: {
    id: 'floorplans',
    path: '/floor-ops/floorplans',
    label: 'Floorplans',
    icon: 'floorplan',
    // Studios opens to every staff login for Social Studio (2026-10-21); the rest stay managers'.
    roles: ['Manager', 'Admin'],
    need: ['floorplan:write', 'studios:manage'],
  },
  inventoryCount: {
    id: 'inventoryCount',
    path: '/inventory/count',
    label: 'Run count',
    icon: 'count',
    area: 'inventory',
  },
  // Every inventory with its numbers; each opens to Summary / Shrinkage / Order estimates / Sessions
  // (inventory_effort Phase 6, owner 2026-10-06).
  inventories: {
    id: 'inventories',
    path: '/inventory/inventories',
    label: 'Inventories',
    icon: 'inventories',
    roles: ['Manager', 'Admin'],
    need: ['inventory.inventories:manage', 'inventory:manage'],
  },
  prFixit: {
    id: 'prFixit',
    path: '/inventory/pr-fixit',
    label: 'PR Fix-it',
    icon: 'fixit',
    area: 'inventory',
  },
  // Wrong tags found on the floor, traced to who checked them in (retail_tags_and_social Phase 1).
  // Everyone: managers see every one, others the tags they checked in or found.
  tagErrors: {
    id: 'tagErrors',
    path: '/inventory/tag-errors',
    label: 'Tag errors',
    icon: 'productReview',
    area: 'inventory',
  },
  // The reprice tab of PR Fix-it, its own link in Retail since PR Fix-it left the menu (#67).
  quickReprice: {
    id: 'quickReprice',
    path: '/inventory/pr-fixit',
    query: 'tab=reprice',
    label: 'Quick reprice',
    icon: 'reprice',
    area: 'inventory',
  },
  vendors: {
    id: 'vendors',
    path: '/inventory/vendors',
    label: 'Vendors',
    icon: 'vendor',
  },
  posTerminal: {
    id: 'posTerminal',
    path: '/pos/terminal',
    // "Register" (Bill 2026-11-04, #67); it will hold checkout and returns.
    label: 'Register',
    icon: 'register',
  },
  posTestTerminal: {
    id: 'posTestTerminal',
    path: '/pos/test',
    label: 'Test terminal',
    // Always on the training register, any computer: practice and new roll-outs (owner, 2026-10-16).
    icon: 'register',
    roles: ['Employee'],
    need: ['pos.terminal:use', 'cashier:work'],
  },
  posDrawers: {
    id: 'posDrawers',
    path: '/pos/drawers',
    label: 'Drawers',
    icon: 'cashDrawer',
  },
  // The office cash, the safe and the bank (Retail 5): managers and the owner; a cashier's drops are on Drawers.
  posCash: {
    id: 'posCash',
    path: '/pos/cash',
    // "Cash Drops" (Bill 2026-11-04, #67): the drops, the safe and the bank deposit; its redesign is its own update.
    label: 'Cash Drops',
    icon: 'cash',
    roles: ['Manager', 'Admin'],
    need: ['pos.cash:manage', 'cashier:manage'],
  },
  posTransactions: {
    id: 'posTransactions',
    path: '/pos/transactions',
    label: 'Transactions',
    icon: 'receipt',
  },
  // Owner 2026-10-20: Returns is its own page (find the receipt, tick the lines, the owner PIN past the 3 days).
  posReturns: {
    id: 'posReturns',
    path: '/pos/returns',
    label: 'Returns',
    icon: 'undo',
  },
  // A cashier finishes an online join on a phone beside her, away from the register (owner 2026-10-16). All staff.
  // It opens the Thrift+ Staff app (owner 2026-10-16), on its Finalize tab.
  thriftPlusFinalize: {
    id: 'thriftPlusFinalize',
    path: '/staff/find',
    pathAliases: ['/staff/finalize', '/staff/scan'],
    label: 'Thrift+ Staff', // the staff app (owner 2026-10-16): Finalize, Members, Scan, Join QR
    icon: 'thriftPlus',
  },
  // Thrift+ member lookup (owner 2026-10-20): Find, then the member's card. All staff.
  thriftPlusMembers: {
    id: 'thriftPlusMembers',
    path: '/pos/members',
    label: 'Thrift+ members',
    icon: 'thriftPlus',
  },
  posPrintables: {
    id: 'posPrintables',
    path: '/pos/printables',
    label: 'Printables',
    icon: 'printables',
  },
  deliverySchedule: {
    id: 'deliverySchedule',
    path: '/pos/deliveries/schedule',
    pathAliases: ['/pos/deliveries/desk/schedule', '/pos/deliveries/field/schedule'],
    label: 'Schedule',
    icon: 'calendar',
  },
  deliveryTable: {
    id: 'deliveryTable',
    path: '/pos/deliveries/table',
    pathAliases: ['/pos/deliveries/desk/table', '/pos/deliveries/field/table'],
    label: 'Table',
    icon: 'deliveryList',
  },
  wishlist: {
    id: 'wishlist',
    path: '/buying/wishlist',
    label: "Today's best",
    // The morning list: auctions worth bidding on, each with a buy-at-or-under max.
    icon: 'wishlist',
  },
  estimateProfit: {
    id: 'estimateProfit',
    path: '/buying/estimate',
    label: 'Estimate Profit',
    // Paste a B-Stock link or drop its manifest: what a Target lot brings in, and the most to bid.
    icon: 'assumptions',
  },
  auctions: {
    id: 'auctions',
    path: '/buying/auctions',
    label: 'Auctions',
    icon: 'auction',
  },
  watchlist: {
    id: 'watchlist',
    path: '/buying/watchlist',
    label: 'Watchlist',
    icon: 'watchlist',
  },
  reportCards: {
    id: 'reportCards',
    path: '/buying/report-cards',
    label: 'Report cards',
    // Won trucks: predicted vs what they sold for (the valuation's check).
    icon: 'reportCard',
  },
  assumptions: {
    id: 'assumptions',
    path: '/admin/assumptions',
    label: 'Assumptions',
    icon: 'assumptions',
    roles: ['Manager', 'Admin'],
    need: ['settings:write', 'admin:manage'],
  },
  posSetup: {
    id: 'posSetup',
    path: '/admin/pos-setup',
    label: 'POS setup',
    icon: 'registerSetup',
    roles: ['Manager', 'Admin'],
    need: ['pos.setup:write', 'cashier:manage'],
  },
  onlineSalesListings: {
    id: 'onlineSalesListings',
    path: '/online-sales/listings',
    label: 'Listings',
    icon: 'listing',
    roles: ['Manager', 'Admin'],
    need: ['online_sales.listings:manage', 'online_sales:manage'],
  },
  onlineSalesHolds: {
    id: 'onlineSalesHolds',
    path: '/online-sales/holds',
    label: 'Holds',
    icon: 'hold',
    roles: ['Manager', 'Admin'],
    need: ['online_sales.listings:manage', 'online_sales:manage'],
  },
  onlineSalesCustomers: {
    id: 'onlineSalesCustomers',
    path: '/online-sales/messages',
    label: 'Messages',
    icon: 'messages',
    roles: ['Manager', 'Admin'],
    need: ['users.customers:manage', 'online_sales:manage'],
  },
  // Employees is first and default for Admin; Managers only see Customers.
  users: {
    id: 'users',
    path: '/admin/users',
    label: 'Staff',
    icon: 'staff',
    roles: ['Manager', 'Admin'],
    need: ['users.staff:manage', 'users.customers:manage', 'people:manage'],
  },
  // The Users page's Members tab, in Retail (#67: customers live in Retail). The same people who open it today.
  customers: {
    id: 'customers',
    path: '/admin/users',
    query: 'tab=members',
    label: 'Customers',
    icon: 'thriftPlus',
    roles: ['Manager', 'Admin'],
    need: ['users.customers:manage', 'people:manage'],
  },
  departments: {
    id: 'departments',
    path: '/admin/departments',
    label: 'Departments',
    icon: 'departments',
    roles: ['Manager', 'Admin'],
    need: ['hr.department:write', 'admin:manage'],
  },
  permissions: {
    id: 'permissions',
    path: '/people/permissions',
    label: 'Permissions',
    icon: 'permissions',
    roles: ['Manager', 'Admin'],
    need: ['people.permissions:read', 'people:manage'],
  },
  settings: {
    id: 'settings',
    path: '/admin/settings',
    pathAliases: ['/admin/assumptions', '/admin/permissions'],
    label: 'Settings',
    icon: 'settings',
    roles: ['Manager', 'Admin'],
    need: ['settings:write', 'admin:manage'],
  },
  labelStudio: {
    id: 'labelStudio',
    path: '/admin/label-studio',
    label: 'Label Studio',
    icon: 'labelDesign',
    roles: ['Manager', 'Admin'],
    need: ['labels:write', 'studios:manage'],
  },
  tars: {
    id: 'tars',
    path: '/restoration/bench',
    label: 'Bench',
    icon: 'workbench',
  },
  restorationQueue: {
    id: 'restorationQueue',
    path: '/restoration/overview',
    pathAliases: ['/restoration/queue'],
    label: 'Overview',
    icon: 'repairQueue',
  },
  restorationPartsRequests: {
    id: 'restorationPartsRequests',
    path: '/restoration/parts-requests',
    label: 'Parts Requests',
    icon: 'parts',
  },
  restorationTracking: {
    id: 'restorationTracking',
    path: '/restoration/tracking',
    label: 'Restoration list',
    icon: 'repairQueue',
  },
  restorations: {
    id: 'restorations',
    path: '/restoration/overview',
    pathAliases: ['/restoration/queue'],
    label: 'Restoration',
    icon: 'restoration',
    area: 'restoration',
  },
  /** @deprecated Prefer `restorations` - kept for preference migration. */
  restorationReturns: {
    id: 'restorationReturns',
    path: '/restoration/overview',
    pathAliases: ['/restoration/queue', '/inventory/restorations'],
    label: 'Restoration',
    icon: 'restoration',
    area: 'restoration',
  },
  /** Retail makes the day's post here (Lane F Phase 2); every staff login. */
  socialStudio: {
    id: 'socialStudio',
    path: '/studios/social',
    label: 'Social Studio',
    icon: 'listing',
    keywords: 'facebook post photos marketing',
  },
  announcements: {
    id: 'announcements',
    path: '/announcements',
    label: 'Announcements',
    icon: 'announce',
    roles: ['Manager', 'Admin'],
    need: ['announcements:manage', 'studios:manage'],
  },
  blogStudio: {
    id: 'blogStudio',
    path: '/blog-studio',
    label: 'Blog studio',
    icon: 'blog',
    superuserOnly: true,
    openInNewWindow: true,
    need: ['blog:write', 'studios:full'],
  },
  shifts: {
    id: 'shifts',
    path: '/admin/shifts',
    label: 'Shifts',
    icon: 'shifts',
    roles: ['Manager', 'Admin'],
    need: ['hr.shifts:write', 'admin:manage'],
  },
  payrollHours: {
    id: 'payrollHours',
    path: '/admin/time-payroll',
    label: 'Time & payroll',
    icon: 'payroll',
    superuserOnly: true,
    need: ['hr.payroll:read', 'hr.mod_requests:triage', 'admin:full'],
  },
  owner: {
    id: 'owner',
    path: '/owner',
    label: 'Owner',
    // The owner's home (2026-10-21): Scorecard, Needs you, owner links and AI spend. Replaced the morning brief.
    icon: 'owner',
    superuserOnly: true,
    pathAliases: ['/brief'],
    need: ['owner.page', 'admin:full'],
  },
  // Supply lists, the weekly count and (owner) the order (owner, 2026-10-26). Every staff login counts, so the
  // Facilities link is for everyone (it was on everyone's avatar menu before #67).
  supplies: {
    id: 'supplies',
    path: '/supplies',
    label: 'Supplies',
    icon: 'purchaseOrder',
  },
  reports: {
    id: 'reports',
    path: '/owner/reports',
    label: 'Reports',
    // A tab of the Owner page since Dash Updates #5 (2026-11-02); /reports redirects.
    pathAliases: ['/reports'],
    // The owner's monthly reports (2026-10-14), one tab each: sales tax for now.
    icon: 'reports',
    superuserOnly: true,
    need: ['owner.page', 'admin:full'],
  },
  thriftPlus: {
    id: 'thriftPlus',
    path: '/thrift-plus',
    label: 'Thrift+',
    // Member service, ThriftBucks and the reward engine. Superuser-only until the Thrift+ launch (2026-10-20).
    icon: 'thriftPlus',
    superuserOnly: true,
    need: ['thriftplus:owner', 'cashier:full'],
  },
  keys: {
    id: 'keys',
    path: '/admin/keys',
    label: 'Keys',
    // Every key and key ring, and where each one is (owner, 2026-10-26). Owner and Admin only: the photos show the cuts.
    icon: 'permissions',
    roles: ['Admin'],
    need: ['keys:manage', 'admin:full'],
  },
  contractors: {
    id: 'contractors',
    path: '/admin/contractors',
    label: 'Contractors',
    // Contractor agreements to e-sign, and their templates (apps/esign, #21). Owner only; contractors have no Dash
    // account, so it stays off the staff side. Listed on the Owner page.
    icon: 'documents',
    superuserOnly: true,
    // The server's check is the superuser alone (apps/core/esign_host.py); the page also sends anyone else away.
    need: ['owner.page', 'admin:full'],
  },
  hrDocuments: {
    id: 'hrDocuments',
    path: '/hr/requests/documents',
    label: 'HR documents',
    // Documents sent to staff to e-sign (apps/esign, #62): HR > Requests > Documents. Owner only; staff sign theirs in
    // HR > Requests.
    icon: 'documents',
    superuserOnly: true,
    // The server's check is the superuser alone (apps/core/esign_host.py); the page also sends anyone else away.
    need: ['owner.page', 'admin:full'],
  },
  superRequests: {
    id: 'superRequests',
    path: '/owner/approvals',
    // "Approvals" (#67) so the only "Requests" is Home's.
    label: 'Approvals',
    // The Owner page's Approvals tab since Dash Updates #5 (2026-11-02); /admin/requests redirects.
    pathAliases: ['/admin/requests'],
    // Routine data work staged in production for the owner to approve (data_platform Phase 1).
    icon: 'requests',
    superuserOnly: true,
    need: ['owner.page', 'admin:full'],
  },
  icons: {
    id: 'icons',
    path: '/admin/icons',
    label: 'Icons',
    // Eco-Thrift's own icon set on one sheet (T75): every icon at 20 and 40 px, light and dark.
    icon: 'studio',
    superuserOnly: true,
    need: ['admin:full'],
  },
  // Everything planned for Dash (replaces Enhancements). Reached from the avatar menu and the bell; in no workspace sidebar.
  dashFixes: {
    id: 'dashFixes',
    path: '/dash-updates',
    label: 'Dash Updates',
    icon: 'enhancement',
  },
  /** Routine Control: every routine with its history, quick edits, retire / restore / delete. */
  adminRoutines: {
    id: 'adminRoutines',
    path: '/admin/routines',
    label: 'Routines',
    icon: 'routine',
    superuserOnly: true,
    need: ['routines:write', 'admin:full'],
  },
  retailQa: {
    id: 'retailQa',
    path: '/admin/retail-qa',
    label: 'Command Center',
    icon: 'commandCenter',
    roles: ['Manager', 'Admin'],
    need: ['retail_qa:manage', 'admin:manage'],
  },
  // My HR (#67, Bill 2026-11-04): every request kind in one place (/hr) and my profile & PIN. Every staff login.
  hrRequests: {
    id: 'hrRequests',
    // /hr/requests is the HR page's first tab; plain /hr would light up on every HR tab.
    path: '/hr/requests',
    label: 'Requests',
    icon: 'requests',
  },
  profile: {
    id: 'profile',
    path: '/me',
    pathAliases: ['/hr/me'],
    label: 'Profile',
    icon: 'checkIn',
  },
  /** Hiring: everyone who applied at ecothrift.us/careers, plus walk-ins. */
  applicants: {
    id: 'applicants',
    path: '/people/applicants',
    label: 'Applicants',
    icon: 'applicant',
    roles: ['Manager', 'Admin'],
    keywords: 'hiring applications candidates resumes careers',
    need: ['hiring:manage', 'people:manage'],
  },
  /** Booked interviews, the weekly interview hours, extra openings and blocks, scorecards. */
  interviews: {
    id: 'interviews',
    path: '/people/interviews',
    label: 'Interviews',
    icon: 'interview',
    roles: ['Manager', 'Admin'],
    keywords: 'hiring interview calendar schedule scorecard',
    need: ['hiring:manage', 'people:manage'],
  },
  /** Every hiring email: one version for all roles, or a role's own version; AI help on each. */
  /** New hires' first weeks: the first-day email, the checklist, the I-9 (Admin), the handbook. */
  onboarding: {
    id: 'onboarding',
    path: '/people/onboarding',
    label: 'Onboarding',
    icon: 'onboarding',
    roles: ['Manager', 'Admin'],
    keywords: 'onboarding new hire checklist i9 i-9 handbook first day quickbooks',
    need: ['hiring:manage', 'people:manage'],
  },
  /** The week's schedule: everyone reads it (Dash Updates #6), managers edit it on the page. In HR for all (#67). */
  schedule: {
    id: 'schedule',
    path: '/people/schedule',
    pathAliases: ['/hr/schedule'],
    label: 'Schedule',
    icon: 'calendar',
  },
  /** 30, 60 and 90-day check-ins: due this week, coming up, done (filled in a meeting, signed by both). */
  checkins: {
    id: 'checkins',
    path: '/people/checkins',
    label: 'Check-ins',
    icon: 'checkIn',
    roles: ['Manager', 'Admin'],
    keywords: 'check-ins checkin 30 60 90 day review new hire meeting',
    need: ['hiring:manage', 'people:manage'],
  },
  /** Staff purchases by payroll deduction, per pay period, to enter in QuickBooks Payroll. */
  payrollDeductions: {
    id: 'payrollDeductions',
    path: '/people/payroll-deductions',
    label: 'Payroll deductions',
    icon: 'deductions',
    roles: ['Manager', 'Admin'],
    keywords: 'payroll deduction staff purchases quickbooks paycheck',
    need: ['people.pay:read', 'people:manage'],
  },
  hiringEmails: {
    id: 'hiringEmails',
    path: '/people/emails',
    label: 'Emails',
    icon: 'email',
    roles: ['Manager', 'Admin'],
    keywords: 'hiring emails templates auto-reply not now interview reminder',
    need: ['hiring:manage', 'people:manage'],
  },
  /** The roles, the careers page, the form and the hiring emails (one YAML / JSON file). */
  jobs: {
    id: 'jobs',
    path: '/people/jobs',
    label: 'Jobs & careers page',
    icon: 'jobPost',
    roles: ['Manager', 'Admin'],
    keywords: 'hiring job postings careers page roles',
    need: ['hiring:manage', 'people:manage'],
  },
};

import { t } from '../../i18n/routines';

/**
 * Which routes are designed phone-first.
 *
 * The floor is the default: a new page is a phone page unless it is listed
 * below. Desk workspaces opt out because they are wide data grids someone
 * drives with a mouse and keyboard, and squeezing those into a phone frame
 * would cost real work.
 */
const DESK_WORKSPACES = [
  '/inventory',
  '/pos',
  '/restoration',
  '/admin',
  '/online-sales',
  '/consignment',
  '/buying',
  '/floor-ops',
];

/** Wins over `DESK_WORKSPACES`: the delivery driver's screens live inside `/pos`. */
const PHONE_FIRST_OVERRIDES = ['/pos/deliveries/field'];

/**
 * Floor routes that use MainLayout's slim top bar + PhoneTabBar.
 * Routines list/catalog share the bar. Fill, demo, and edit replace it
 * with RoutinePhoneBar (save/cancel or the demo/preview chip).
 */
const PHONE_TAB_BAR_PATHS = ['/dashboard', '/today', '/pay'] as const;

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function normalizePath(pathname: string): string {
  return (pathname || '/').toLowerCase().replace(/\/+$/, '') || '/';
}

export function isPhoneFirstPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  if (PHONE_FIRST_OVERRIDES.some((prefix) => matchesPrefix(path, prefix))) return true;
  return !DESK_WORKSPACES.some((prefix) => matchesPrefix(path, prefix));
}

function isRoutinePhoneList(path: string, search: string): boolean {
  if (!matchesPrefix(path, '/routines')) return false;
  if (matchesPrefix(path, '/routines/run')) return false;
  if (path === '/routines/new' || /\/routines\/\d+\/edit$/.test(path)) return false;
  const params = new URLSearchParams(search.replace(/^\?/, ''));
  if (params.get('run')) return false;
  if (matchesPrefix(path, '/routines/catalog') && params.get('view')) return false;
  return true;
}

export function showsPhoneTabBar(pathname: string, search = ''): boolean {
  const path = normalizePath(pathname);
  if (isRoutinePhoneList(path, search)) return true;
  return PHONE_TAB_BAR_PATHS.some((prefix) => matchesPrefix(path, prefix));
}

export function phoneShellTitle(pathname: string, language?: string | null): string {
  const path = normalizePath(pathname);
  if (matchesPrefix(path, '/today')) return t('today', language);
  if (matchesPrefix(path, '/pay')) return t('pay', language);
  if (matchesPrefix(path, '/routines')) return t('routines', language);
  return t('dashboard', language);
}

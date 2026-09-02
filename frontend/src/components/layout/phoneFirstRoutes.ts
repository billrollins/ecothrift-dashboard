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

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function isPhoneFirstPath(pathname: string): boolean {
  const path = (pathname || '/').toLowerCase().replace(/\/+$/, '') || '/';
  if (PHONE_FIRST_OVERRIDES.some((prefix) => matchesPrefix(path, prefix))) return true;
  return !DESK_WORKSPACES.some((prefix) => matchesPrefix(path, prefix));
}

import type { DashboardTab } from './dashboardTabs';

/**
 * Dash Home's tabs (desk FloorNav and the phone tab bar), Bill 2026-11-13. `navId` is the catalog item whose icon each
 * tab borrows; `badgeId` (default navId) is the badge count it shows: routines waiting now show on Routines.
 */
export const FLOOR_TABS: ReadonlyArray<{ id: DashboardTab; labelKey: string; navId: string; badgeId?: string }> = [
  { id: 'store', labelKey: 'store', navId: 'dashboard' },
  { id: 'myday', labelKey: 'timeClock', navId: 'today', badgeId: 'timeClock' },
  { id: 'hr', labelKey: 'hrTab', navId: 'homeHr' },
  { id: 'routines', labelKey: 'routines', navId: 'routines', badgeId: 'today' },
  { id: 'calendar', labelKey: 'calendarTab', navId: 'homeCalendar' },
  { id: 'messages', labelKey: 'messagesTab', navId: 'homeMessages' },
  { id: 'profile', labelKey: 'profileTab', navId: 'profile' },
];

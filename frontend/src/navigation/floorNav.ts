import type { DashboardTab } from './dashboardTabs';

/**
 * The Dashboard's two tabs (desk FloorNav and the phone tab bar): Store, then My day.
 * `navId` is the catalog item whose icon and waiting badge each tab borrows.
 */
export const FLOOR_TABS: ReadonlyArray<{ id: DashboardTab; labelKey: string; navId: string }> = [
  { id: 'store', labelKey: 'store', navId: 'dashboard' },
  { id: 'myday', labelKey: 'myDay', navId: 'today' },
];

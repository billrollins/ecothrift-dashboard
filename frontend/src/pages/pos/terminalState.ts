import type { Cart, Drawer, POSDeviceConfig } from '../../types/pos.types';

// ── Terminal state machine ─────────────────────────────────────────────────

export type TerminalState =
  | 'unconfigured'    // no localStorage device config
  | 'loading'         // register mode, waiting for drawer data
  | 'no_drawer'       // register, no drawer opened today
  | 'drawer_open_other' // register, drawer open but owned by someone else
  | 'ready'           // register, my drawer open, no active cart
  | 'active_sale'     // cart in progress (any device type)
  | 'drawer_closed'   // register, today's drawer is closed
  | 'manager_mode';   // non-register device (manager, mobile, etc.)

export function deriveTerminalState({
  config,
  isRegister,
  loading,
  todayDrawer,
  cart,
  userId,
  sharedDrawer = false,
}: {
  config: POSDeviceConfig | null;
  isRegister: boolean;
  loading: boolean;
  todayDrawer: Drawer | null;
  cart: Cart | null;
  userId: number | undefined;
  /** The test terminal (2026-10-16): one practice drawer for every computer, so nobody has to take it over. */
  sharedDrawer?: boolean;
}): TerminalState {
  if (!config) return 'unconfigured';
  if (!isRegister) return cart ? 'active_sale' : 'manager_mode';
  if (loading) return 'loading';
  if (cart) return 'active_sale';
  if (!todayDrawer) return 'no_drawer';
  if (todayDrawer.status === 'closed') return 'drawer_closed';
  // Drawer is open
  if (sharedDrawer) return 'ready';
  if (userId != null && Number(todayDrawer.current_cashier) === userId) return 'ready';
  return 'drawer_open_other';
}

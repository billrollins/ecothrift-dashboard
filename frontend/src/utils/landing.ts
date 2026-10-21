import type { User } from '../types/accounts.types';
import { isRegisterDevice } from '../hooks/useDeviceConfig';

/**
 * Where a signed-in person starts (critic review 2026-10-21, point 8): a cashier (Employee role) on a computer set up
 * as a register starts at the Terminal; everyone else at the Dashboard. A `?next=` page always wins (LoginPage).
 */
export function landingPath(user: Pick<User, 'role' | 'is_superuser'> | null | undefined): string {
  if (user && !user.is_superuser && user.role === 'Employee' && isRegisterDevice()) return '/pos/terminal';
  return '/dashboard';
}

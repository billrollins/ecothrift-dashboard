/** View as (owner 2026-10-21): who may be viewed as. The server checks the same (`services/view_as.py`). */
import type { User } from '../../types/accounts.types';

const STAFF_ROLES = ['Admin', 'Manager', 'Employee', 'Consignee'];

/** The owner (a superuser, not already viewing) may view as any switched-on staff login but another owner or self. */
export function canViewAs(viewer: User | null | undefined, target: Pick<User, 'id' | 'is_active' | 'is_superuser' | 'is_staff' | 'role'> | null | undefined): boolean {
  if (!viewer?.is_superuser || viewer.view_as || !target) return false;
  if (target.id === viewer.id || target.is_superuser || !target.is_active) return false;
  return Boolean(target.is_staff || (target.role && STAFF_ROLES.includes(target.role)));
}

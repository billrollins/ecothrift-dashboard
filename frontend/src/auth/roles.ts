import type { UserRole } from '../types/accounts.types';

/** Single rank table. Admin is highest. Missing / null is -1. */
export const ROLE_RANK: Record<UserRole, number> = {
  Admin: 4,
  Manager: 3,
  Employee: 2,
  Consignee: 1,
  Customer: 0,
};

export const STAFF_ROLES: UserRole[] = ['Admin', 'Manager', 'Employee'];

export function roleRank(role: UserRole | null | undefined): number {
  if (!role) return -1;
  return ROLE_RANK[role] ?? -1;
}

export function isStaffRole(role: UserRole | null | undefined): boolean {
  return role != null && STAFF_ROLES.includes(role);
}

import type { PaginatedResponse } from '../types/index';
import type { User, LoginResponse } from '../types/accounts.types';
import api from './client';

export type { User, LoginResponse };

export interface RefreshResponse {
  access: string;
}

export interface UserParams {
  page?: number;
  page_size?: number;
  search?: string;
  [key: string]: unknown;
}

// Auth endpoints
/** ``ident``: a username or an email (T61). */
export function login(ident: string, password: string): Promise<{ data: LoginResponse }> {
  return api.post<LoginResponse>('/auth/login/', { login: ident, password });
}

export function refreshToken(): Promise<{ data: RefreshResponse }> {
  return api.post<RefreshResponse>('/auth/refresh/', {});
}

export function logout(): Promise<{ data: unknown }> {
  return api.post('/auth/logout/', {});
}

export function getMe(): Promise<{ data: User }> {
  return api.get<User>('/auth/me/');
}

export function patchMe(data: { language: 'en' | 'es' }): Promise<{ data: User }> {
  return api.patch<User>('/auth/me/', data);
}

export interface CapabilityRow {
  id: string;
  area: string;
  label: string;
  holders: string[];
  source: string;
}

export function getMyCapabilities(): Promise<{ data: { capabilities: string[] } }> {
  return api.get('/auth/capabilities/');
}

export function getCapabilityCatalog(): Promise<{ data: { results: CapabilityRow[] } }> {
  return api.get('/accounts/capability-catalog/');
}

export function changePassword(
  oldPassword: string,
  newPassword: string
): Promise<{ data: unknown }> {
  return api.post('/auth/change-password/', { old_password: oldPassword, new_password: newPassword });
}

// User management endpoints
export function getUsers(params?: UserParams): Promise<{ data: PaginatedResponse<User> }> {
  return api.get<PaginatedResponse<User>>('/accounts/users/', { params });
}

export function getUser(id: number): Promise<{ data: User }> {
  return api.get<User>(`/accounts/users/${id}/`);
}

export function createUser(data: Record<string, unknown>): Promise<{ data: User }> {
  return api.post<User>('/accounts/users/', data);
}

export function updateUser(id: number, data: Partial<User>): Promise<{ data: User }> {
  return api.patch<User>(`/accounts/users/${id}/`, data);
}

export function updateEmployeeProfile(
  userId: number,
  data: Record<string, unknown>
): Promise<{ data: unknown }> {
  return api.patch(`/accounts/users/${userId}/employee_profile/`, data);
}

export function updateConsigneeProfile(
  userId: number,
  data: Record<string, unknown>
): Promise<{ data: unknown }> {
  return api.patch(`/accounts/users/${userId}/consignee_profile/`, data);
}

export function deleteUser(id: number): Promise<{ data: void }> {
  return api.delete(`/accounts/users/${id}/`);
}

// Customer management endpoints
export interface Customer {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  full_name: string;
  customer_number: string;
  customer_since: string;
  notes: string;
  is_active: boolean;
  email_verified: boolean;
  /** Holds matching this email address. Annotated on the list. */
  holds_count?: number;
  last_hold_at?: string | null;
}

/** Per-person totals for the customer detail drawer. */
export interface CustomerRollup {
  holds_total: number;
  holds_active: number;
  holds_completed: number;
  lifetime_spend: string;
  conversations: number;
  needs_reply: number;
  last_activity: string | null;
  first_hold_at: string | null;
}

export interface CustomerStats {
  total: number;
  active: number;
  inactive: number;
  verified: number;
  verified_pct: number;
  new_this_month: number;
  new_last_month: number;
  holds_this_month: number;
  needs_reply: number;
}

export interface EmployeeStats {
  active: number;
  inactive: number;
  admins: number;
  managers: number;
  employees: number;
  on_the_clock: number;
  new_hires_90d: number;
  no_password: number;
}

export function getCustomers(params?: Record<string, unknown>): Promise<{ data: PaginatedResponse<Customer> }> {
  return api.get<PaginatedResponse<Customer>>('/accounts/customers/', { params });
}

export function getCustomerStats(): Promise<{ data: CustomerStats }> {
  return api.get<CustomerStats>('/accounts/customers/stats/');
}

export function getCustomerRollup(id: number): Promise<{ data: CustomerRollup }> {
  return api.get<CustomerRollup>(`/accounts/customers/${id}/rollup/`);
}

export function getEmployeeStats(): Promise<{ data: EmployeeStats }> {
  return api.get<EmployeeStats>('/accounts/users/stats/');
}

export function getCustomer(id: number): Promise<{ data: Customer }> {
  return api.get<Customer>(`/accounts/customers/${id}/`);
}

export function createCustomer(data: Record<string, unknown>): Promise<{ data: Customer }> {
  return api.post<Customer>('/accounts/customers/', data);
}

export function updateCustomer(id: number, data: Record<string, unknown>): Promise<{ data: Customer }> {
  return api.patch<Customer>(`/accounts/customers/${id}/`, data);
}

/** Soft-deactivates the account (keeps history). */
export function deleteCustomer(id: number): Promise<{ data: Customer }> {
  return api.delete<Customer>(`/accounts/customers/${id}/`);
}

export function reactivateCustomer(id: number): Promise<{ data: Customer }> {
  return api.post<Customer>(`/accounts/customers/${id}/reactivate/`);
}

export function sendCustomerSignInLink(id: number): Promise<{ data: { detail: string } }> {
  return api.post<{ detail: string }>(`/accounts/customers/${id}/send-sign-in-link/`);
}

export function lookupCustomer(customerNumber: string): Promise<{ data: Customer }> {
  return api.get<Customer>(`/accounts/customers/lookup/${encodeURIComponent(customerNumber)}/`);
}

/** Set password (T61): a one-time link, 48 hours, shown once with a QR. Nothing is emailed. */
export interface SetPasswordLink {
  link: string;
  expires_at: string;
  username: string | null;
}

export function getSetPasswordLink(userId: number): Promise<{ data: SetPasswordLink }> {
  return api.post<SetPasswordLink>(`/accounts/users/${userId}/set-password-link/`);
}

// Password reset endpoints
/** Emails a single-use reset link. No password is ever shown to the admin. */
export function sendEmployeePasswordReset(userId: number): Promise<{ data: { detail: string } }> {
  return api.post(`/accounts/users/${userId}/send-password-reset/`);
}

export function sendCustomerPasswordReset(id: number): Promise<{ data: { detail: string } }> {
  return api.post(`/accounts/customers/${id}/send-password-reset-link/`);
}

export function forgotPassword(email: string): Promise<{ data: { detail: string } }> {
  return api.post('/auth/forgot-password/', { email });
}

export function resetPassword(token: string, newPassword: string): Promise<{ data: { detail: string } }> {
  return api.post('/auth/reset-password/', { token, new_password: newPassword });
}

// ── Merge a customer login into a staff login (owner 2026-10-15; superuser) ────────────────────

/** A customer login (not staff) that may be the staff member's, or a search hit. */
export interface LoginCandidate {
  user_id: number;
  name: string;
  email: string;
  phone: string;
  customer_number: string;
  /** Why it was suggested: "same email name", "same phone", "same name" (empty for a search hit). */
  why: string[];
  joined: string | null;
  last_login: string | null;
}

export interface LoginCandidates {
  suggestions: LoginCandidate[];
  results: LoginCandidate[];
}

/** What a login merge would do; nothing changes. */
export interface LoginMergePreview {
  source: LoginCandidate;
  staff: { user_id: number; name: string; email: string };
  /** Rows that move to the staff login, by what they are ("conversations", "holds", ...). */
  moves: Record<string, number>;
  /** The website customer account: moves to the staff login, combines with theirs (the earlier number stays), or none. */
  profile: { action: 'move' | 'combine' | 'none' | 'make'; customer_number: string; drops?: string };
  /** A Thrift+ membership with the customer email: it merges into the staff member's own, or a note why not. */
  thriftplus: {
    account: number | null;
    note: string;
    name?: string;
    bucks?: string;
    credit?: string;
    moves?: Record<string, number>;
    staff_account?: number | null;
    refused?: boolean;
  } | null;
  /** The customer login's email afterwards (switched off; the address is free again). */
  source_after: string;
}

export interface LoginMergeResult {
  source_user: number;
  staff_user: number;
  source_email_was: string;
  source_email_now: string;
  moved: Record<string, number>;
  /** Rows that could not move (a clash with one the staff login has already). */
  left: string[];
  profile: 'moved' | 'combined' | 'none';
  customer_number: string | null;
  sign_in_links_spent: number;
  tokens_blacklisted: number;
  thriftplus: {
    merged: boolean;
    source_account: number | null;
    staff_account?: number;
    moved?: Record<string, number>;
    now?: { bucks: string; credit: string };
    note?: string;
  } | null;
}

/** Customer logins that may be this staff member's, and (with ``q``) a search by email, name or phone. */
export async function fetchLoginCandidates(staffUser: number, q = ''): Promise<LoginCandidates> {
  const { data } = await api.get<LoginCandidates>('/accounts/login-merge/candidates/', {
    params: { staff_user: staffUser, ...(q ? { q } : {}) },
  });
  return data;
}

export async function fetchLoginMergePreview(staffUser: number, sourceUser: number): Promise<LoginMergePreview> {
  const { data } = await api.get<LoginMergePreview>('/accounts/login-merge/preview/', {
    params: { staff_user: staffUser, source_user: sourceUser },
  });
  return data;
}

/** The owner: merge the customer login into the staff login (the staff login survives). */
export async function mergeCustomerLogin(staffUser: number, sourceUser: number): Promise<LoginMergeResult> {
  const { data } = await api.post<LoginMergeResult>('/accounts/login-merge/merge/', {
    staff_user: staffUser, source_user: sourceUser,
  });
  return data;
}

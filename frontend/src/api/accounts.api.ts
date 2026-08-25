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
export function login(email: string, password: string): Promise<{ data: LoginResponse }> {
  return api.post<LoginResponse>('/auth/login/', { email, password });
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

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
}

export function getCustomers(params?: Record<string, unknown>): Promise<{ data: PaginatedResponse<Customer> }> {
  return api.get<PaginatedResponse<Customer>>('/accounts/customers/', { params });
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

export function deleteCustomer(id: number): Promise<{ data: void }> {
  return api.delete(`/accounts/customers/${id}/`);
}

export function lookupCustomer(customerNumber: string): Promise<{ data: Customer }> {
  return api.get<Customer>(`/accounts/customers/lookup/${encodeURIComponent(customerNumber)}/`);
}

// Password reset endpoints
export function adminResetPassword(userId: number): Promise<{ data: { detail: string; temporary_password: string } }> {
  return api.post(`/accounts/users/${userId}/reset-password/`);
}

export function forgotPassword(email: string): Promise<{ data: { detail: string; reset_token?: string } }> {
  return api.post('/auth/forgot-password/', { email });
}

export function resetPassword(token: string, newPassword: string): Promise<{ data: { detail: string } }> {
  return api.post('/auth/reset-password/', { token, new_password: newPassword });
}

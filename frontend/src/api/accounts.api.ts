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

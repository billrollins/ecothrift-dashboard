/**
 * User role types (from Django Group membership)
 */
export type UserRole = 'Admin' | 'Manager' | 'Employee' | 'Consignee' | 'Customer';

/**
 * Employment type for EmployeeProfile
 */
export type EmploymentType = 'full_time' | 'part_time' | 'seasonal';

/**
 * Payout method for ConsigneeProfile
 */
export type PayoutMethod = 'cash' | 'check' | 'store_credit';

export interface EmployeeProfile {
  id: number;
  employee_number: string;
  department: number | null;
  department_name: string | null;
  position: string;
  employment_type: EmploymentType;
  pay_rate: string;
  hire_date: string;
  termination_date: string | null;
  termination_type: string;
  termination_type_display: string;
  termination_notes: string;
  work_location: number | null;
  work_location_name: string | null;
  emergency_name: string;
  emergency_phone: string;
  notes: string;
  created_at: string;
}

export interface ConsigneeProfile {
  id: number;
  consignee_number: string;
  commission_rate: string;
  payout_method: PayoutMethod;
  status: 'active' | 'paused' | 'closed';
  join_date: string;
  notes: string;
  created_at: string;
}

export interface CustomerProfile {
  id: number;
  customer_number: string;
  customer_since: string;
  notes: string;
}

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  is_active: boolean;
  is_staff: boolean;
  /** Django superuser ("Super Admin"). Gates owner-only tooling like the Blog Studio. */
  is_superuser: boolean;
  language?: 'en' | 'es';
  date_joined: string;
  updated_at: string;
  /** Null until the account signs in for the first time. */
  last_login: string | null;
  role: UserRole | null;
  /** Canonical Django groups (Admin…Customer), priority order - from `GET /api/auth/me/`. */
  roles?: UserRole[];
  full_name: string;
  /** False when the account has no usable password and cannot sign in yet. */
  has_password: boolean;
  /** Only meaningful for customers; staff accounts report false. */
  email_verified: boolean;
  employee?: EmployeeProfile | null;
  consignee?: ConsigneeProfile | null;
  customer?: CustomerProfile | null;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access: string;
  user: User;
}

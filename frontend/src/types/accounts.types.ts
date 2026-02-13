/**
 * User role types (from Django Group membership)
 */
export type UserRole = 'Admin' | 'Manager' | 'Employee' | 'Consignee';

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
  date_joined: string;
  updated_at: string;
  role: UserRole | null;
  full_name: string;
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

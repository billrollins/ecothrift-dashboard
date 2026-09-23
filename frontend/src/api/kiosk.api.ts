/** Time kiosk API. Hosted calls ride the staff JWT client; public calls use
 * the cookie-only client so a 401 never triggers the refresh/redirect dance. */
import api, { apiPublic } from './client';
import type { ClockTile } from './hr.api';

export type KioskRoute = 'kiosk' | 'clock';

export type BoardStatus = 'in' | 'break' | 'expected' | 'late' | 'called_in' | 'left' | 'out';

export interface BoardRow {
  id: number;
  name: string;
  shift_name: string;
  expected_time: string;
  status: BoardStatus;
  department_id: number | null;
  department_name: string;
  department_slug: string;
  department_icon: string;
  department_sort: number;
  other: boolean;
  /** Hosted only */
  in_time?: string;
  late_minutes?: number | null;
  on_roster?: boolean;
}

export interface BoardDepartment {
  id: number | null;
  name: string;
  slug: string;
  icon: string;
  sort: number;
  other: boolean;
}

export interface KioskBoard {
  day: string;
  generated_at: string;
  store_open: boolean;
  departments: BoardDepartment[];
  rows: BoardRow[];
  redacted: boolean;
}

export type KioskTile = ClockTile & { department_id: number; time_in: string; time_out: string };

export interface GateStale {
  kind: 'stale_punch';
  since: string;
  suggested_clock_out: string;
}
export interface GateMissed {
  kind: 'missed_routines';
  runs: Array<{ id: number; title: string; due_at: string; subject: string }>;
}
export interface GateNudge {
  kind: 'nudge';
  nudges: Array<{ id: number; message: string; routine_title: string; created_at: string }>;
}
export type GateItem = GateStale | GateMissed | GateNudge;

export interface KioskPreview {
  id: number;
  state: 'out' | 'in' | 'break' | 'stale';
  name: string;
  full_name?: string;
  punch: {
    id: number;
    clock_in: string;
    shift: string;
    shift_name: string;
    on_break: boolean;
    break_started_at: string | null;
  } | null;
  suggested_shift: {
    punch_code: string;
    name: string;
    department: string;
    department_id: number;
    time_in: string;
    time_out: string;
  } | null;
  suggested_shift_unmatched: boolean;
  tiles: KioskTile[];
  warnings: {
    store_closed: boolean;
    overtime: boolean;
    late: { minutes: number; shift_name: string } | null;
  };
  stale: { since: string; suggested_clock_out: string } | null;
  gate: GateItem[];
  now: string;
  result?: { action: string; at?: string; shift?: string; kind?: string; request_id?: number };
}

export interface GatePayload {
  missed_routines?: Array<{ run: number; reason: string; note?: string }>;
  nudge?: number[];
}

export interface KioskErrorBody {
  detail: string;
  code?: string;
}

function clientFor(route: KioskRoute) {
  return route === 'kiosk' ? api : apiPublic;
}

function base(route: KioskRoute) {
  return route === 'kiosk' ? '/hr/kiosk' : '/hr/clock';
}

export function getKioskBoard(route: KioskRoute) {
  return clientFor(route).get<KioskBoard>(`${base(route)}/board/`);
}

export function kioskIdentify(route: KioskRoute, token: string) {
  return clientFor(route).post<KioskPreview>(`${base(route)}/identify/`, { token });
}

export function kioskClockIn(route: KioskRoute, token: string, shift: string, gate: GatePayload) {
  return clientFor(route).post<KioskPreview>(`${base(route)}/clock-in/`, { token, shift, gate });
}

export function kioskClockOut(route: KioskRoute, token: string) {
  return clientFor(route).post<KioskPreview>(`${base(route)}/clock-out/`, { token });
}

export function kioskBreak(route: KioskRoute, token: string, action: 'start' | 'end') {
  return clientFor(route).post<KioskPreview>(`${base(route)}/break/`, { token, action });
}

export function kioskFixStale(route: KioskRoute, token: string) {
  return clientFor(route).post<KioskPreview>(`${base(route)}/fix-stale/`, { token });
}

/** Hosted only. */
export function kioskSetShift(token: string, shift: string) {
  return api.post<KioskPreview>('/hr/kiosk/set-shift/', { token, shift });
}

/** Hosted only. */
export function kioskRequestEdit(token: string, kind: 'wrong_start' | 'forgot_break', value: string | number) {
  return api.post<KioskPreview>('/hr/kiosk/request-edit/', { token, kind, value });
}

/** Hosted only. Audit row for leaving the kiosk. Exit takes no password. */
export function kioskExit() {
  return api.post<{ ok: boolean }>('/hr/kiosk/exit/', {});
}

export function verifyPassword(password: string) {
  return api.post<{ ok: boolean }>('/auth/verify-password/', { password });
}

export function keepHostAlive() {
  return api.post<{ access: string }>('/auth/refresh/', {});
}

/** Employee card admin (Users -> employee -> Badge). */
export function issueBadge(userId: number) {
  return api.post<{ token: string; badge_status: string }>(`/accounts/users/${userId}/badge/`, {});
}
export function reprintBadge(userId: number) {
  return api.post<{ token: string; badge_status: string }>(`/accounts/users/${userId}/badge/reprint/`, {});
}
export function revokeBadge(userId: number) {
  return api.post<{ ok: boolean; badge_status: string }>(`/accounts/users/${userId}/badge/revoke/`, {});
}

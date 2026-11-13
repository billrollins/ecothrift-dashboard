/** Texts (Dash Update #132): the inbox for our toll-free number, and staff texts from it. Backend: apps/texting/inbox_views.py. */
import { useQuery } from '@tanstack/react-query';
import api from './client';

export type TextingStatus = { staff_texts_live: boolean; waiting_on: string[]; unread: number };

export type Conversation = {
  phone: string;
  name: string;
  user_id: number | null;
  kind: '' | 'staff' | 'thriftplus';
  last_body: string;
  last_at: string;
  unread: number;
  count: number;
  stopped: boolean;
};

export type ThreadMessage = {
  id: string;
  from: 'them' | 'us';
  body: string;
  at: string;
  keyword?: string;
  media?: number;
  read?: boolean;
  status?: string;
  status_label?: string;
  reason?: string;
  key?: string;
  by?: string;
};

export type Thread = {
  phone: string;
  name: string;
  user_id: number | null;
  kind: Conversation['kind'];
  stopped: boolean;
  messages: ThreadMessage[];
  /** Replies go out from our number (staff texts on, and the replies switch). */
  replies_live: boolean;
  waiting_on: string[];
};

export type StaffTextResult = { status: string; status_label: string; reason: string; sent: boolean; to: string };

export const getTextingStatus = () => api.get<TextingStatus>('/texting/status/');
export const getInbox = () => api.get<{ conversations: Conversation[]; unread: number }>('/texting/inbox/');
export const getThread = (phone: string) => api.get<Thread>(`/texting/inbox/${encodeURIComponent(phone)}/`);
export const replyToThread = (phone: string, body: string) =>
  api.post<Thread & { message: ThreadMessage }>(`/texting/inbox/${encodeURIComponent(phone)}/reply/`, { body });
export const textSetPasswordLink = (link: string, phone?: string) =>
  api.post<StaffTextResult>('/texting/set-password-link/', { link, phone: phone || '' });

/** Owner and managers: texts not read yet (the bell's Texts row). Polls like the other bell rows. */
export function useUnreadTexts(enabled: boolean): number {
  const query = useQuery({
    queryKey: ['texting', 'status'],
    queryFn: () => getTextingStatus().then((r) => r.data),
    enabled,
    refetchInterval: 30_000,
    retry: false,
  });
  return enabled ? (query.data?.unread ?? 0) : 0;
}

/** "(402) 555-0101" for a 10-digit number; anything else as given. */
export function prettyPhone(phone: string): string {
  return /^\d{10}$/.test(phone) ? `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}` : phone;
}

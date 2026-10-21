/** Staff messages in Dash (owner 2026-10-21): never email or text. */
import api from './client';

export interface ThreadRow {
  id: number;
  subject: string;
  audience: string;
  started_by: string;
  last_message_at: string;
  unread: number;
  preview: string;
  preview_from: string;
}

export interface MessageSecret {
  state: 'waiting' | 'shown';
  for: string;
  shown_at: string | null;
  /** Only the one person it is for, and only before it is shown. */
  can_show: boolean;
}

export interface ThreadMessage {
  id: number;
  body: string;
  created_at: string;
  sender: string;
  sender_id: number | null;
  mine: boolean;
  secret: MessageSecret | null;
  read_by: Array<{ name: string; at: string }>;
}

export interface Thread {
  id: number;
  subject: string;
  audience: string;
  started_by: string;
  members: Array<{ id: number; name: string }>;
  messages: ThreadMessage[];
}

export interface Audiences {
  people: Array<{ id: number; name: string }>;
  departments: Array<{ id: number; name: string }>;
}

export const getThreads = () => api.get<ThreadRow[]>('/accounts/messages/');
export const getUnread = () => api.get<{ unread: number }>('/accounts/messages/unread/');
export const getAudiences = () => api.get<Audiences>('/accounts/messages/audiences/');
export const getThread = (id: number) => api.get<Thread>(`/accounts/messages/${id}/`);
export const startThread = (data: {
  subject: string;
  body: string;
  to_user?: number;
  to_department?: number;
  secret?: string;
}) => api.post<Thread>('/accounts/messages/', data);
export const replyToThread = (id: number, body: string) => api.post<Thread>(`/accounts/messages/${id}/reply/`, { body });
/** The one-time secret. Keep it in component state only: never in the query cache or storage. */
export const showSecret = (messageId: number) =>
  api.post<{ secret: string }>(`/accounts/messages/secret/${messageId}/show/`, {});

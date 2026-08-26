import api from './client';
import type { PaginatedResponse } from '../types';

export interface MailboxTemplate {
  id: number;
  key: string;
  name: string;
  subject: string;
  html_body: string;
}

export interface MailboxMessage {
  id: number;
  graph_message_id: string;
  graph_conversation_id: string;
  from_email: string;
  to_emails: string[];
  subject: string;
  html_body: string;
  text_body: string;
  received_at: string | null;
  is_read: boolean;
  classification: 'online_sales' | 'general' | 'unknown';
  conversation: number | null;
  attachment_names: string[];
  created_at: string;
  updated_at: string;
}

export async function getMailboxTemplates(): Promise<{ data: MailboxTemplate[] }> {
  return api.get('/mailbox/templates/');
}

export async function getMailboxMessages(params?: {
  classification?: string;
  search?: string;
  ordering?: string;
  is_read?: boolean;
  page_size?: number;
}): Promise<{ data: PaginatedResponse<MailboxMessage> }> {
  return api.get('/mailbox/messages/', { params });
}

export async function getMailboxMessage(id: number): Promise<{ data: MailboxMessage }> {
  return api.get(`/mailbox/messages/${id}/`);
}

export async function replyMailboxMessage(
  id: number,
  htmlBody: string,
): Promise<{ data: { sent: boolean; html_body: string } }> {
  return api.post(`/mailbox/messages/${id}/reply/`, { html_body: htmlBody });
}

export async function syncMailbox(): Promise<{
  data: { created: number; updated: number; skipped: number; delta_link: string };
}> {
  return api.post('/mailbox/sync/');
}

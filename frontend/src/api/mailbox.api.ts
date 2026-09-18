import api from './client';

export interface MailboxTemplate {
  id: number;
  key: string;
  name: string;
  subject: string;
  html_body: string;
}

export async function getMailboxTemplates(): Promise<{ data: MailboxTemplate[] }> {
  return api.get('/mailbox/templates/');
}

import type { Stage } from '../../api/hiring.api';

export const STAGES: { key: Stage; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'reviewed', label: 'Reviewed' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'interview_scheduled', label: 'Interview scheduled' },
  { key: 'interviewed', label: 'Interviewed' },
  { key: 'offer', label: 'Offer' },
  { key: 'hired', label: 'Hired' },
  { key: 'not_now', label: 'Not now' },
];

export const STAGE_LABEL: Record<string, string> = Object.fromEntries(STAGES.map((s) => [s.key, s.label]));

/** The next stage a person usually moves to, for the one-tap button. */
export function nextStage(stage: Stage): Stage | null {
  const order: Stage[] = ['new', 'reviewed', 'contacted', 'interview_scheduled', 'interviewed', 'offer', 'hired'];
  const i = order.indexOf(stage);
  return i >= 0 && i < order.length - 1 ? order[i + 1] : null;
}

export function errorText(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  if (!data) return fallback;
  if (typeof data === 'string') return data.slice(0, 200) || fallback;
  if (typeof data === 'object') {
    const record = data as Record<string, unknown>;
    if (typeof record.detail === 'string') return record.detail;
    const first = Object.values(record)[0];
    if (typeof first === 'string') return first;
    if (Array.isArray(first) && typeof first[0] === 'string') return first[0];
  }
  return fallback;
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return `Today ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function answerText(answer: unknown): string {
  if (answer === null || answer === undefined || answer === '') return '-';
  if (Array.isArray(answer)) return answer.join(', ');
  if (answer === 'yes') return 'Yes';
  if (answer === 'no') return 'No';
  return String(answer);
}

/** Digits for tel: and sms: links. */
export function phoneHref(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 ? `+1${digits}` : digits ? `+${digits}` : '';
}

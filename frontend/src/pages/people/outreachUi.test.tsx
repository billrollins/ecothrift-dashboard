import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ApplicationDetail, ApplicationRow, Outreach } from '../../api/hiring.api';
import { CandidateMarks, OutreachCard, onPhone, smsHref } from './outreachUi';

vi.mock('../../api/hiring.api', async (orig) => ({
  ...(await orig<typeof import('../../api/hiring.api')>()),
  getTextDraft: vi.fn(async () => ({ data: { which: 'initial', phone: '(402) 555-0101', body: 'Hi Ana, it\'s Eco-Thrift. Pick a time: https://x/t' } })),
  markTextSent: vi.fn(async () => ({ data: { id: 1 } })),
}));

const step = (at: string | null, due: boolean, extra = {}) => ({ at, due, ...extra });

function outreach(extra: Partial<Outreach> = {}): Outreach {
  return {
    active: true,
    email_initial: step(null, true),
    email_reminder: step(null, false),
    text_initial: step(null, true),
    text_reminder: step(null, false),
    ...extra,
  };
}

function row(extra: Partial<ApplicationRow> = {}): ApplicationRow {
  return {
    id: 1, first_name: 'Ana', last_name: 'Diaz', full_name: 'Ana Diaz', email: 'ana@example.com', phone: '(402) 555-0101',
    jobs: [{ id: 1, slug: 'retail', title: 'Retail Associate' }], stage: 'new', stage_label: 'New', stage_changed_at: null,
    rating: null, red_flags: 0, flags: [{ key: 'lift', label: 'Can lift', ok: true }], source: 'web', source_label: 'Careers page',
    has_resume: true, lead_interest: '', employee_user: null, not_now_reason: '', is_practice: false,
    created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(), next_interview: null, offer_status: '',
    outreach: outreach(), returning: { worked_here: true, interviewed_before: false }, ...extra,
  } as ApplicationRow;
}

describe('candidate marks (owner 2026-10-12)', () => {
  it('new: the role and marks for resume, email, text, must-haves and worked here (no days, no interview)', () => {
    render(<CandidateMarks row={row()} />);
    const marks = screen.getByTestId('candidate-marks');
    expect(marks).toHaveTextContent('Retail Associate');
    expect(marks).not.toHaveTextContent('2d');
    expect(within(marks).getByLabelText('Resume uploaded')).toBeInTheDocument();
    expect(marks).toHaveTextContent('✓');
    expect(within(marks).getByLabelText('Worked here before')).toBeInTheDocument();
    expect(within(marks).queryByLabelText('Interviewed before')).not.toBeInTheDocument();
  });

  it('contacted: how many times; interview scheduled and later: the resume only', () => {
    const contacted = row({ stage: 'contacted', outreach: outreach({ email_initial: step('2026-10-10T15:00:00Z', false), text_initial: step('2026-10-10T16:00:00Z', false) }) });
    const { unmount } = render(<CandidateMarks row={contacted} />);
    expect(screen.getByTestId('contact-count')).toHaveTextContent('Contacted 2×');
    unmount();
    render(<CandidateMarks row={row({ stage: 'interview_scheduled' })} />);
    const marks = screen.getByTestId('candidate-marks');
    expect(within(marks).getByLabelText('Resume uploaded')).toBeInTheDocument();
    expect(within(marks).queryByLabelText('Worked here before')).not.toBeInTheDocument();
    expect(marks).not.toHaveTextContent('✓');
  });
});

describe('reach them (owner 2026-10-12)', () => {
  it('lists the four steps; the text opens copy boxes and Text sent records it', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    const app = { ...row(), outreach: outreach({ email_reminder: step(null, false, { auto_at: null }) }) } as unknown as ApplicationDetail;
    render(<OutreachCard app={app} busy={false} onSendEmail={vi.fn()} onSendReminder={vi.fn()} onChanged={onChanged} />);
    expect(screen.getByTestId('outreach-email_initial')).toBeInTheDocument();
    expect(screen.getAllByText('Due now')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Send Initial Email' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send Reminder Text' })).not.toBeInTheDocument(); // after the first text
    await user.click(screen.getByRole('button', { name: 'Send Initial Text' }));
    expect(await screen.findByTestId('copy-phone')).toHaveTextContent('(402) 555-0101');
    expect(screen.getByTestId('copy-body')).toHaveTextContent("Hi Ana, it's Eco-Thrift.");
    await user.click(screen.getByRole('button', { name: 'Text sent' }));
    expect(onChanged).toHaveBeenCalled();
  });

  it('shows nothing once they booked', () => {
    const app = { ...row(), outreach: outreach({ active: false }) } as unknown as ApplicationDetail;
    const { container } = render(<OutreachCard app={app} busy={false} onSendEmail={vi.fn()} onSendReminder={vi.fn()} onChanged={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('text from a phone (owner 2026-10-12)', () => {
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
  const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36';
  const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36';

  it('fills in the number and the words, the way each phone reads them', () => {
    expect(smsHref('(402) 555-0101', 'Hi Ana & co: https://x/t', IPHONE, 5)).toBe('sms:4025550101&body=Hi%20Ana%20%26%20co%3A%20https%3A%2F%2Fx%2Ft');
    expect(smsHref('(402) 555-0101', 'Hi', ANDROID, 5)).toBe('sms:4025550101?body=Hi');
    expect(onPhone(IPHONE, 5)).toBe(true);
    expect(onPhone(ANDROID, 5)).toBe(true);
    expect(onPhone(WINDOWS, 0)).toBe(false);
  });

  it('on a phone the dialog opens Messages, and copying each part still works', async () => {
    const ua = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ANDROID);
    const user = userEvent.setup();
    const app = { ...row(), outreach: outreach({ email_reminder: step(null, false, { auto_at: null }) }) } as unknown as ApplicationDetail;
    render(<OutreachCard app={app} busy={false} onSendEmail={vi.fn()} onSendReminder={vi.fn()} onChanged={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Send Initial Text' }));
    const open = await screen.findByTestId('open-sms');
    expect(open).toHaveAttribute('href', expect.stringMatching(/^sms:4025550101\?body=Hi%20Ana/));
    expect(screen.getByTestId('copy-phone')).toBeInTheDocument();
    expect(screen.getByTestId('copy-body')).toBeInTheDocument();
    ua.mockRestore();
  });
});

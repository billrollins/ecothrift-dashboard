import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ApplicationDetail, ApplicationRow, Outreach } from '../../api/hiring.api';
import { CandidateMarks, OutreachCard } from './outreachUi';

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
  it('shows the role and age, and marks for interview, resume, email, text, must-haves and worked here', () => {
    render(<CandidateMarks row={row()} />);
    const marks = screen.getByTestId('candidate-marks');
    expect(marks).toHaveTextContent('Retail Associate · 2d');
    expect(marks).toHaveTextContent('✓');
    expect(within(marks).getByLabelText('Worked here before')).toBeInTheDocument();
    expect(within(marks).queryByLabelText('Interviewed before')).not.toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Text' }));
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

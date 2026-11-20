import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EmailDraft } from '../../api/hiring.api';
import { EmailCompose } from './EmailReview';
import { AiWriteBox } from './ReplyUi';

const AI_DRAFT: EmailDraft = {
  key: 'follow_up',
  label: 'Follow-up email',
  to: ['dana@example.com'],
  from: 'Eco-Thrift <retail@ecothrift.us>',
  subject: 'About your application',
  body: 'Hi Dana,\n\nWe have one store.\n\nBill Rollins\nEco-Thrift',
  values: {},
  fields: {},
  attachments: [],
  practice: false,
  source: 'Written by AI from your words. Read it before you send.',
  ai: true,
};

describe('Follow up / Not now written by AI (Dash #192)', () => {
  it('the AI draft says where its words come from and has no template link', () => {
    render(<EmailCompose draft={AI_DRAFT} onChange={() => undefined} />);
    expect(screen.getByText('Written by AI from your words. Read it before you send.')).toBeInTheDocument();
    expect(screen.queryByText('Edit the template')).not.toBeInTheDocument();
    expect(screen.getByText('The AI’s words, as they will go out.')).toBeInTheDocument();
  });

  it('Write it with AI waits for words, then shows the seconds while it writes', async () => {
    const onWrite = vi.fn();
    function Harness({ writing }: { writing: boolean }) {
      const [value, setValue] = useState('');
      return <AiWriteBox value={value} onChange={setValue} onWrite={onWrite} writing={writing} seconds={6} />;
    }
    const { rerender } = render(<Harness writing={false} />);
    const button = screen.getByRole('button', { name: 'Write it with AI' });
    expect(button).toBeDisabled();
    await userEvent.type(screen.getByLabelText('What do you want to tell them?'), 'we only have one location');
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(onWrite).toHaveBeenCalledTimes(1);
    rerender(<Harness writing />);
    expect(screen.getByRole('button', { name: 'Writing… 6s' })).toBeDisabled();
  });
});

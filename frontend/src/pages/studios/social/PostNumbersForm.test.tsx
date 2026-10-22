import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SnackbarProvider } from 'notistack';
import { describe, expect, it, vi } from 'vitest';
import type { PostNumbers } from '../../../api/marketing.api';
import PostNumbersForm from './PostNumbersForm';
import { signedPct } from './SocialNumbersPage';

const api = vi.hoisted(() => ({ savePostNumbers: vi.fn() }));
vi.mock('../../../api/marketing.api', async (orig) => ({ ...(await orig<object>()), ...api }));

function wrap(node: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <SnackbarProvider>{node}</SnackbarProvider>
    </QueryClientProvider>,
  );
}

const DAY1 = { reach: 1200, reactions: 40, comments: 5, shares: 3, messages: 2, link_clicks: 0, engagement: 50, entered_by_name: 'Carrie', entered_at: null };

describe('PostNumbersForm', () => {
  it('opens on the channel and mark that are due and saves what was typed', async () => {
    const numbers: PostNumbers = {
      channels: [
        { key: 'facebook', label: 'Facebook', day1: DAY1, day7: DAY1, due: [] },
        { key: 'instagram', label: 'Instagram', day1: DAY1, day7: null, due: [7] },
      ],
      due: [{ channel: 'instagram', label: 'Instagram', mark: 7 }],
    };
    const next: PostNumbers = { ...numbers, due: [] };
    api.savePostNumbers.mockResolvedValue(next);
    const onSaved = vi.fn();
    wrap(<PostNumbersForm postId={5} numbers={numbers} onSaved={onSaved} />);
    expect(screen.getByText(/Due: after 7 days/)).toBeTruthy();
    expect(screen.getByText(/insights on Instagram/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Reach'), { target: { value: '2,000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Instagram 7-day numbers' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(next));
    expect(api.savePostNumbers).toHaveBeenCalledWith(5, 'instagram', 7, expect.objectContaining({ reach: '2000', comments: '0' }));
  });

  it('switches channel and shows numbers already typed', () => {
    const numbers: PostNumbers = {
      channels: [
        { key: 'facebook', label: 'Facebook', day1: DAY1, day7: null, due: [] },
        { key: 'google', label: 'Google Business Profile', day1: null, day7: null, due: [] },
      ],
      due: [],
    };
    wrap(<PostNumbersForm postId={5} numbers={numbers} onSaved={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /After 1 day/ }));
    expect((screen.getByLabelText('Reach') as HTMLInputElement).value).toBe('1200');
    expect(screen.getByText(/Engagement 50 · Carrie/)).toBeTruthy();
    fireEvent.click(screen.getByText('Google Business Profile'));
    expect(screen.getByRole('button', { name: 'Save Google Business Profile 7-day numbers' })).toBeTruthy();
    expect((screen.getByLabelText('Reach') as HTMLInputElement).value).toBe('');
  });
});

describe('signedPct', () => {
  it('signs a lift and shows a dash for none', () => {
    expect(signedPct('12.5')).toBe('+12.5%');
    expect(signedPct('-3')).toBe('-3.0%');
    expect(signedPct(null)).toBe('-');
  });
});

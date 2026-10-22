import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SnackbarProvider } from 'notistack';
import { describe, expect, it, vi } from 'vitest';
import type { SocialPostDetail } from '../../../api/marketing.api';
import { PostIdeas, RewriteButtons } from './PostIdeas';

const api = vi.hoisted(() => ({
  requestSocialIdeas: vi.fn(),
  applySocialIdea: vi.fn(),
  rewriteSocialPost: vi.fn(),
}));
vi.mock('../../../api/marketing.api', async (orig) => ({ ...(await orig<object>()), ...api }));

function wrap(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>{node}</SnackbarProvider>
    </QueryClientProvider>,
  );
}

const POST = {
  id: 7,
  idea_photos: { '11': '/t/11.jpg' },
  ideas: {
    state: 'done',
    error: '',
    by: 'Morning ideas',
    finished_at: null,
    ideas: [
      {
        title: 'Fresh toys',
        hook: 'New toys just hit the floor',
        body: 'Ride-ons and puzzles.',
        call_to_action: 'come_in',
        photo_ids: [11],
        shots: [{ shot: 'The ride-on, low angle', sku: 'ITM1', title: 'Ride-on car', tag_price: '$45', location: 'B2' }],
        flags: ['save'],
      },
    ],
  },
} as unknown as SocialPostDetail;

describe('PostIdeas', () => {
  it('shows each idea with its photos, what to shoot and words to change, and uses one', async () => {
    api.applySocialIdea.mockResolvedValue({ id: 7, hook: 'New toys just hit the floor', body: 'Ride-ons and puzzles.' });
    const onChange = vi.fn();
    wrap(<PostIdeas post={POST} locked={false} onChange={onChange} />);
    expect(screen.getByText('New toys just hit the floor')).toBeTruthy();
    expect(screen.getByText(/The ride-on, low angle \(Ride-on car, \$45, B2\)/)).toBeTruthy();
    expect(screen.getByText(/Change these words before posting: save/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New ideas' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Use this idea' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), true));
    expect(api.applySocialIdea).toHaveBeenCalledWith(7, 0);
  });

  it('offers Get post ideas before the first, and shows the AI writing', () => {
    const empty = { ...POST, ideas: null } as SocialPostDetail;
    const { unmount } = wrap(<PostIdeas post={empty} locked={false} onChange={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Get post ideas' })).toBeTruthy();
    unmount();
    const drafting = { ...POST, ideas: { ...POST.ideas!, state: 'drafting', ideas: [] } } as SocialPostDetail;
    wrap(<PostIdeas post={drafting} locked={false} onChange={() => undefined} />);
    expect(screen.getByText(/Writing ideas/)).toBeTruthy();
  });
});

describe('RewriteButtons', () => {
  it('brings back options and uses the one tapped', async () => {
    api.rewriteSocialPost.mockResolvedValue(['Toys galore', 'Fresh toys today']);
    const onPick = vi.fn();
    wrap(<RewriteButtons postId={7} part="hook" current="Toys" onPick={onPick} />);
    fireEvent.click(screen.getByText('New hooks'));
    await waitFor(() => expect(screen.getByText('Fresh toys today')).toBeTruthy());
    expect(api.rewriteSocialPost).toHaveBeenCalledWith(7, 'hook', 'new', 'Toys');
    fireEvent.click(screen.getByText('Fresh toys today'));
    expect(onPick).toHaveBeenCalledWith('Fresh toys today');
  });
});

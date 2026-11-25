import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PhotoDrawerDialog } from './PhotoDrawerDialog';

const api = vi.hoisted(() => ({
  getPhotoDrops: vi.fn(),
  getPhotoDrawerOwners: vi.fn(),
  getPhotoDropThumb: vi.fn(),
  getPhotoDropFile: vi.fn(),
  markPhotoDropUsed: vi.fn(),
  addPhotoDrop: vi.fn(),
  deletePhotoDrop: vi.fn(),
}));
vi.mock('../../api/photoDrops.api', () => api);

const who = vi.hoisted(() => ({ user: { is_superuser: true } as { is_superuser: boolean } | null }));
vi.mock('../../contexts/AuthContext', () => ({ useAuthUser: () => who.user }));

const drop = (id: number) => ({
  id, created_at: '2026-11-25T15:00:00Z', used_at: null, used_where: '', width: 800, height: 600, size: 1234,
  filename: `photo-${id}.jpg`,
});

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PhotoDrawerDialog open onClose={() => {}} onPhotos={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  who.user = { is_superuser: true };
  api.getPhotoDrops.mockImplementation((owner?: number) => Promise.resolve({ data: owner === 12 ? [drop(31), drop(30)] : [drop(7)] }));
  api.getPhotoDrawerOwners.mockResolvedValue({ data: [{ id: 12, name: 'Ann Bench', photos: 2 }] });
  api.getPhotoDropThumb.mockResolvedValue({ data: new Blob(['t'], { type: 'image/jpeg' }) });
  URL.createObjectURL = vi.fn(() => 'blob:test');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Whose drawer (owner 2026-11-25)', () => {
  it('the owner starts on Mine and can open another person\'s drawer', async () => {
    show();
    expect(await screen.findAllByTestId('photo-drop')).toHaveLength(1);
    expect(api.getPhotoDrops).toHaveBeenCalledWith();

    await userEvent.click(screen.getByRole('combobox', { name: 'Whose drawer' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Ann Bench (2)' }));

    await waitFor(() => expect(api.getPhotoDrops).toHaveBeenCalledWith(12));
    await waitFor(() => expect(screen.getAllByTestId('photo-drop')).toHaveLength(2));
  });

  it('remembers the last drawer for the next time', async () => {
    const first = show();
    await userEvent.click(await screen.findByRole('combobox', { name: 'Whose drawer' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Ann Bench (2)' }));
    await waitFor(() => expect(api.getPhotoDrops).toHaveBeenCalledWith(12));
    first.unmount();
    api.getPhotoDrops.mockClear();

    show();
    await waitFor(() => expect(api.getPhotoDrops).toHaveBeenCalledWith(12));
    expect(await screen.findAllByTestId('photo-drop')).toHaveLength(2);
  });

  it('a remembered person with no photos left opens Mine', async () => {
    window.localStorage.setItem('photoDrawer.whose', '99');
    show();
    await waitFor(() => expect(api.getPhotoDrawerOwners).toHaveBeenCalled());
    await waitFor(() => expect(api.getPhotoDrops).toHaveBeenCalledWith());
    expect(await screen.findAllByTestId('photo-drop')).toHaveLength(1);
  });

  it('everyone else sees only their own drawer, with no picker', async () => {
    who.user = { is_superuser: false };
    window.localStorage.setItem('photoDrawer.whose', '12');
    show();
    expect(await screen.findAllByTestId('photo-drop')).toHaveLength(1);
    expect(screen.queryByRole('combobox', { name: 'Whose drawer' })).toBeNull();
    expect(api.getPhotoDrawerOwners).not.toHaveBeenCalled();
    expect(api.getPhotoDrops).toHaveBeenCalledWith();
    expect(api.getPhotoDrops).not.toHaveBeenCalledWith(12);
  });
});

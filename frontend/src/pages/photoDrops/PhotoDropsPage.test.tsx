import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NARROW_WINDOW_QUERY, TOUCH_ONLY_QUERY } from '../../components/photos/photoMethods';
import PhotoDropsPage from './PhotoDropsPage';

const api = vi.hoisted(() => ({
  getPhotoDrops: vi.fn(),
  getPhotoDropThumb: vi.fn(),
  getPhotoDropFile: vi.fn(),
  markPhotoDropUsed: vi.fn(),
  addPhotoDrop: vi.fn(),
  deletePhotoDrop: vi.fn(),
}));
vi.mock('../../api/photoDrops.api', () => api);
// The test browser never finishes loading a picture, so the shrink step hands the photo straight back.
vi.mock('../../components/photos/photoFile', async (original) => ({
  ...(await original<typeof import('../../components/photos/photoFile')>()),
  shrinkPhoto: async (blob: Blob) => blob,
}));

const drop = (id: number, extra = {}) => ({
  id, created_at: '2026-11-10T15:00:00Z', used_at: null, used_where: '', width: 800, height: 600, size: 1234,
  filename: `photo-${id}.jpg`, ...extra,
});

function device(phone: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: phone && (query === NARROW_WINDOW_QUERY || query === TOUCH_ONLY_QUERY),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <PhotoDropsPage />
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

const photo = (name: string) => new File([name], name, { type: 'image/jpeg' });
const realMatchMedia = window.matchMedia;

beforeEach(() => {
  api.getPhotoDrops.mockResolvedValue({ data: [] });
  api.getPhotoDropThumb.mockResolvedValue({ data: new Blob(['t'], { type: 'image/jpeg' }) });
  api.getPhotoDropFile.mockResolvedValue({ data: new Blob(['full'], { type: 'image/jpeg' }) });
  api.deletePhotoDrop.mockResolvedValue({});
  URL.createObjectURL = vi.fn(() => 'blob:test');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  window.matchMedia = realMatchMedia;
  vi.clearAllMocks();
});

describe('Photo drops', () => {
  it('a phone leads with Take photo', async () => {
    device(true);
    show();
    const page = await screen.findByTestId('photo-drops-page');
    expect(within(page).getAllByRole('button').map((button) => button.textContent).slice(0, 2)).toEqual(['Take photo', 'From files']);
  });

  it('a computer leads with From files and says how a phone photo gets here', async () => {
    device(false);
    show();
    const page = await screen.findByTestId('photo-drops-page');
    expect(within(page).getAllByRole('button').map((button) => button.textContent).slice(0, 2)).toEqual(['From files', 'Take photo']);
    expect(page).toHaveTextContent('On your phone, open Photo drops and take a photo.');
  });

  it('a photo is saved the moment it is taken: no extra tap', async () => {
    device(true);
    api.addPhotoDrop.mockResolvedValue({ data: drop(11) });
    show();
    await userEvent.upload(await screen.findByTestId('photo-drops-camera-input'), photo('a.jpg'));
    await waitFor(() => expect(api.addPhotoDrop).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId('photo-drop')).toHaveAttribute('data-drop-id', '11');
    expect(screen.queryByTestId('photo-touch-up')).toBeNull();
  });

  it('From files takes several photos in one pick and saves every one', async () => {
    device(false);
    let next = 20;
    api.addPhotoDrop.mockImplementation(async () => ({ data: drop(next++) }));
    show();
    const input = await screen.findByTestId('photo-drops-file-input') as HTMLInputElement;
    expect(input.multiple).toBe(true);
    await userEvent.upload(input, [photo('a.jpg'), photo('b.jpg'), photo('c.jpg')]);
    await waitFor(() => expect(api.addPhotoDrop).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.getAllByTestId('photo-drop')).toHaveLength(3));
  });

  it('a save that fails stays on screen as Not saved, and Try again sends it', async () => {
    device(true);
    api.addPhotoDrop.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ data: drop(31) });
    show();
    await userEvent.upload(await screen.findByTestId('photo-drops-camera-input'), photo('a.jpg'));
    const pending = await screen.findByTestId('photo-drop-pending');
    await waitFor(() => expect(pending).toHaveAttribute('data-failed', 'yes'));
    expect(pending).toHaveTextContent('Not saved');
    await userEvent.click(within(pending).getByTestId('photo-drop-retry'));
    await waitFor(() => expect(api.addPhotoDrop).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId('photo-drop')).toHaveAttribute('data-drop-id', '31');
    expect(screen.queryByTestId('photo-drop-pending')).toBeNull();
  });

  it('a turned photo takes the old one in place, and Cancel leaves it as it was', async () => {
    device(true);
    api.getPhotoDrops.mockResolvedValue({ data: [drop(8), drop(5)] });
    api.addPhotoDrop.mockResolvedValue({ data: drop(9) });
    show();
    const tiles = await screen.findAllByTestId('photo-drop');
    expect(tiles.map((tile) => tile.getAttribute('data-drop-id'))).toEqual(['8', '5']);
    await userEvent.click(within(tiles[1]).getByRole('button', { name: 'Open photo' }));
    const big = await screen.findByTestId('photo-touch-up');
    // Nothing changed yet: Done, and the Cancel spot is kept but hidden.
    expect(within(big).getByTestId('photo-touch-up-cancel')).not.toBeVisible();
    expect(within(big).getByTestId('photo-touch-up-close')).toBeInTheDocument();
    await userEvent.click(within(big).getByTestId('photo-touch-up-close'));
    await waitFor(() => expect(screen.queryByTestId('photo-touch-up')).toBeNull());
    expect(api.addPhotoDrop).not.toHaveBeenCalled();
  });

  it('a tap opens the photo big; delete asks first, with the photo shown', async () => {
    device(true);
    api.getPhotoDrops.mockResolvedValue({ data: [drop(5, { used_at: '2026-11-10T16:00:00Z', used_where: 'Receiving' })] });
    show();
    const tile = await screen.findByTestId('photo-drop');
    expect(within(tile).getByTestId('photo-drop-used')).toHaveTextContent('Used · Receiving');
    expect(within(tile).getByTestId('photo-drop-used-where')).toHaveTextContent('Receiving');
    await userEvent.click(within(tile).getByRole('button', { name: 'Open photo' }));
    const big = await screen.findByTestId('photo-touch-up');
    expect(api.getPhotoDropFile).toHaveBeenCalledWith(5);
    expect(within(big).getByTestId('photo-save')).toHaveTextContent('Done');
    await userEvent.click(within(big).getByTestId('photo-touch-up-delete'));
    const ask = await screen.findByTestId('photo-drop-delete-dialog');
    expect(ask).toHaveTextContent('Delete this photo?');
    expect(ask).toHaveTextContent('Used in Receiving');
    expect(api.deletePhotoDrop).not.toHaveBeenCalled();
    await userEvent.click(within(ask).getByTestId('photo-drop-delete-yes'));
    await waitFor(() => expect(api.deletePhotoDrop).toHaveBeenCalledWith(5));
  });
});

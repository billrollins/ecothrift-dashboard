import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddPhoto } from './AddPhoto';
import { markPhotosUsed } from './photoFile';
import { NARROW_WINDOW_QUERY, TOUCH_ONLY_QUERY, photoMethodOrder } from './photoMethods';

const api = vi.hoisted(() => ({
  getPhotoDrops: vi.fn(),
  getPhotoDropThumb: vi.fn(),
  getPhotoDropFile: vi.fn(),
  markPhotoDropUsed: vi.fn(),
  addPhotoDrop: vi.fn(),
  deletePhotoDrop: vi.fn(),
}));
vi.mock('../../api/photoDrops.api', () => api);

const DROP = {
  id: 7, created_at: '2026-11-10T15:00:00Z', used_at: null, used_where: '', width: 800, height: 600, size: 1234,
  filename: 'photo-20261110-090000.jpg',
};

/** Answer the two device questions the control asks: is the window narrow, is this a touch-only device. */
function device({ narrow = false, touchOnly = false }) {
  window.matchMedia = ((query: string) => ({
    matches: query === NARROW_WINDOW_QUERY ? narrow : query === TOUCH_ONLY_QUERY ? touchOnly : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function show(props: Partial<React.ComponentProps<typeof AddPhoto>> = {}) {
  const onPhotos = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AddPhoto onPhotos={onPhotos} {...props} />
    </QueryClientProvider>,
  );
  return onPhotos;
}

async function menuOrder() {
  await userEvent.click(screen.getByTestId('add-photo'));
  const menu = await screen.findByTestId('add-photo-menu');
  return within(menu).getAllByRole('menuitem').map((item) => item.textContent);
}

const realMatchMedia = window.matchMedia;

beforeEach(() => {
  api.getPhotoDrops.mockResolvedValue({ data: [DROP] });
  api.getPhotoDropThumb.mockResolvedValue({ data: new Blob(['t'], { type: 'image/jpeg' }) });
  api.getPhotoDropFile.mockResolvedValue({ data: new Blob(['full'], { type: 'image/jpeg' }) });
  api.markPhotoDropUsed.mockResolvedValue({ data: { ...DROP, used_at: '2026-11-10T15:05:00Z' } });
  URL.createObjectURL = vi.fn(() => 'blob:test');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  window.matchMedia = realMatchMedia;
  vi.clearAllMocks();
});

describe('the order of the three ways', () => {
  it('is camera first on a phone and drawer first on a computer', () => {
    expect(photoMethodOrder(true)).toEqual(['take', 'drawer', 'files']);
    expect(photoMethodOrder(false)).toEqual(['drawer', 'files', 'take']);
  });

  it('a computer lists Photo drawer, From files, Take photo', async () => {
    device({ narrow: false, touchOnly: false });
    show();
    expect(await menuOrder()).toEqual(['Photo drawer', 'From files', 'Take photo']);
  });

  it('a phone lists Take photo, Photo drawer, From files', async () => {
    device({ narrow: true, touchOnly: true });
    show();
    expect(await menuOrder()).toEqual(['Take photo', 'Photo drawer', 'From files']);
  });

  it('a wide tablet with no mouse counts as a phone', async () => {
    device({ narrow: false, touchOnly: true });
    show();
    expect(await menuOrder()).toEqual(['Take photo', 'Photo drawer', 'From files']);
  });
});

describe('Add photo', () => {
  it('says Add photo unless the screen gives its own words', () => {
    device({});
    show();
    expect(screen.getByTestId('add-photo')).toHaveTextContent('Add photo');
  });

  it('From files hands the picked photos over, and only photos', async () => {
    device({});
    const onPhotos = show({ multiple: true, max: 2 });
    const input = screen.getByTestId('add-photo-file-input') as HTMLInputElement;
    expect(input.multiple).toBe(true);
    const files = [
      new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'b.png', { type: 'image/png' }),
      new File(['c'], 'c.jpg', { type: 'image/jpeg' }),
    ];
    await userEvent.upload(input, files);
    expect(onPhotos).toHaveBeenCalledTimes(1);
    expect(onPhotos.mock.calls[0][0].map((file: File) => file.name)).toEqual(['a.jpg', 'b.png']);
  });

  it('a phone has a camera input that opens the back camera', () => {
    device({ narrow: true, touchOnly: true });
    show();
    const camera = screen.getByTestId('add-photo-camera-input');
    expect(camera).toHaveAttribute('capture', 'environment');
    expect(camera).toHaveAttribute('accept', 'image/*');
  });

  it('Photo drawer: a tap uses the photo, and the drop is marked used with the place', async () => {
    device({});
    const onPhotos = show({ usedWhere: 'Processing' });
    await userEvent.click(screen.getByTestId('add-photo'));
    await userEvent.click(await screen.findByTestId('add-photo-drawer'));
    const dialog = await screen.findByTestId('photo-drawer-dialog');
    const tile = await within(dialog).findByTestId('photo-drop');
    await userEvent.click(within(tile).getByRole('button'));
    await waitFor(() => expect(onPhotos).toHaveBeenCalledTimes(1));
    const [file] = onPhotos.mock.calls[0][0] as File[];
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('photo-20261110-090000.jpg');
    expect(file.type).toBe('image/jpeg');
    expect(api.getPhotoDropFile).toHaveBeenCalledWith(7);
    expect(api.markPhotoDropUsed).toHaveBeenCalledWith(7, 'Processing');
  });

  it('a form that saves later does not mark the photo used on the pick; it marks it when it saves', async () => {
    device({});
    const onPhotos = show({ usedWhere: 'Add item', usedOn: 'save' });
    await userEvent.click(screen.getByTestId('add-photo'));
    await userEvent.click(await screen.findByTestId('add-photo-drawer'));
    const dialog = await screen.findByTestId('photo-drawer-dialog');
    const tile = await within(dialog).findByTestId('photo-drop');
    await userEvent.click(within(tile).getByRole('button'));
    await waitFor(() => expect(onPhotos).toHaveBeenCalledTimes(1));
    expect(api.markPhotoDropUsed).not.toHaveBeenCalled();
    const [file] = onPhotos.mock.calls[0][0] as File[];
    // A cancelled form never gets here. A saved one does, and a file that is not from the drawer is skipped.
    await markPhotosUsed([file, new File(['x'], 'other.jpg', { type: 'image/jpeg' }), null], 'Add item');
    expect(api.markPhotoDropUsed).toHaveBeenCalledTimes(1);
    expect(api.markPhotoDropUsed).toHaveBeenCalledWith(7, 'Add item');
  });

  it('a computer with no camera offers the other two ways as buttons', async () => {
    device({});
    show();
    await userEvent.click(screen.getByTestId('add-photo'));
    await userEvent.click(await screen.findByTestId('add-photo-take'));
    const camera = await screen.findByTestId('photo-camera-dialog');
    expect(await within(camera).findByTestId('photo-camera-none')).toBeInTheDocument();
    expect(within(camera).queryByTestId('photo-camera-take')).toBeNull();
    await userEvent.click(within(camera).getByTestId('photo-camera-use-drawer'));
    expect(await screen.findByTestId('photo-drawer-dialog')).toBeInTheDocument();
  });

  it('an empty drawer says how to fill it', async () => {
    device({});
    api.getPhotoDrops.mockResolvedValue({ data: [] });
    show();
    await userEvent.click(screen.getByTestId('add-photo'));
    await userEvent.click(await screen.findByTestId('add-photo-drawer'));
    const empty = await screen.findByTestId('photo-drawer-empty');
    expect(empty).toHaveTextContent('No photos in your drawer yet.');
    expect(empty).toHaveTextContent('Photo drops');
  });
});

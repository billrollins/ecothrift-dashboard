/**
 * Scanning help with the camera on (owner 2026-10-15, APP D13 to D15): the zoom chips from the phone's own range, pinch,
 * the remembered level, the digital and telephoto fallbacks, and every code the camera reads getting an answer, with
 * [Scan again] ignoring that same code for 3 s. jsdom has no camera, so a fake one stands in: a track with (or without)
 * zoom capabilities, and a BarcodeDetector that reads whatever `cam.codes` holds.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { thriftPlusMockControls } from '../../../api/thriftPlusMock';
import ThriftPlusScannerPage from './ThriftPlusScannerPage';

vi.mock('../../../api/thriftPlusScanner.api', async () => {
  const mock = await vi.importActual<typeof import('../../../api/thriftPlusMock')>('../../../api/thriftPlusMock');
  return {
    ...mock,
    confirmPasswordReset: vi.fn(),
    getMe: vi.fn(async () => ({ credit: '0.00', rewards: [] })),
    removePerson: vi.fn(),
    setUpLogin: vi.fn(),
    isOpen: vi.fn(async () => true),
    fetchTestTags: vi.fn(async () => []),
    getMyCard: vi.fn(async () => ({ code: '402155831907', display: '4021 5583 1907', qr: 'TP402155831907', first_name: 'Dana', ready: true })),
    setPreviewCode: vi.fn(),
  };
});

/** What the fake decoder reads in every frame. */
const cam = vi.hoisted(() => ({ codes: [] as Array<{ rawValue: string; format: string }>, reads: 0 }));

class FakeDetector {
  static async getSupportedFormats() {
    return ['qr_code', 'code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e'];
  }
  async detect() {
    cam.reads += 1;
    return cam.codes;
  }
}

interface FakeTrack {
  applyConstraints: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  getCapabilities: () => object;
  getSettings: () => object;
}

/** A phone camera: `zoom` is its zoom range (none: an iPhone browser), `devices` what enumerateDevices names. */
function installCamera({ zoom, devices = [] }: { zoom?: { min: number; max: number }; devices?: Array<Partial<MediaDeviceInfo>> } = {}) {
  const tracks: FakeTrack[] = [];
  const getUserMedia = vi.fn(async (_constraints: MediaStreamConstraints) => {
    const track: FakeTrack = {
      applyConstraints: vi.fn(async () => undefined),
      stop: vi.fn(),
      getCapabilities: () => (zoom ? { zoom: { ...zoom, step: 0.1 } } : {}),
      getSettings: () => ({ zoom: 1 }),
    };
    tracks.push(track);
    return { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
  });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia, enumerateDevices: vi.fn(async () => devices) },
  });
  return { getUserMedia, last: () => tracks[tracks.length - 1] };
}

const zoomCalls = (track: FakeTrack) =>
  track.applyConstraints.mock.calls.map(([c]) => (c as { advanced: Array<{ zoom?: number }> }).advanced[0].zoom).filter((z) => z != null);

/** Two (or fewer) fingers on the camera. */
function touch(el: Element, type: string, points: Array<[number, number]>) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'touches', { value: points.map(([clientX, clientY]) => ({ clientX, clientY })) });
  act(() => {
    el.dispatchEvent(e);
  });
  return e;
}

function renderPage(path = '/scan') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <ThriftPlusScannerPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

type User = ReturnType<typeof userEvent.setup>;

async function scanWithoutSigningIn(user: User) {
  await user.click(await screen.findByRole('button', { name: 'Scan without signing in' }));
}

const vibrate = vi.fn();

beforeAll(() => {
  (window as unknown as { BarcodeDetector: unknown }).BarcodeDetector = FakeDetector;
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
  // The video "plays" with a 1280 x 720 frame ready to read.
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: async () => undefined });
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get: () => 4 });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 1280 });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 720 });
  // No canvas in jsdom: the decoder reads the video itself.
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => null });
});

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  thriftPlusMockControls.reset();
  thriftPlusMockControls.setLatency(0);
  cam.codes = [];
  vibrate.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  window.sessionStorage.clear();
});

describe('Zoom in the camera window (owner 2026-10-15, APP D13)', () => {
  it('shows the phone\'s own levels, applies a chip, pinches with the chips following, and remembers the level', async () => {
    const camera = installCamera({ zoom: { min: 0.5, max: 10 } });
    const user = userEvent.setup();
    const first = renderPage();
    await scanWithoutSigningIn(user);
    const pill = await screen.findByTestId('zoom-pill');
    expect(within(pill).getAllByRole('button').map((b) => b.textContent)).toEqual(['.5×', '1×', '2×', '3×']);
    expect(within(pill).getByTestId('zoom-1')).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(pill).getByTestId('zoom-2'));
    await waitFor(() => expect(camera.last().applyConstraints).toHaveBeenCalledWith({ advanced: [{ zoom: 2 }] }));
    expect(within(pill).getByTestId('zoom-2')).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem('tp-scan-zoom')).toBe('2');
    expect(screen.getByTestId('camera-video')).toHaveAttribute('data-zoom', '1'); // the camera zooms, not the picture

    // Pinch: fingers 100 px apart, then 150: 2× becomes 3×; back to 130: 2.6×, shown on the lit 2× chip.
    const surface = screen.getByTestId('camera-card');
    expect(touch(surface, 'touchstart', [[100, 300], [200, 300]]).defaultPrevented).toBe(true); // not the page's zoom
    touch(surface, 'touchmove', [[75, 300], [225, 300]]);
    expect(within(pill).getByTestId('zoom-3')).toHaveAttribute('aria-pressed', 'true');
    touch(surface, 'touchmove', [[85, 300], [215, 300]]);
    expect(within(pill).getByTestId('zoom-2')).toHaveAttribute('aria-pressed', 'true');
    expect(within(pill).getByTestId('zoom-2')).toHaveTextContent('2.6×');
    touch(surface, 'touchend', [[85, 300]]);
    await waitFor(() => expect(zoomCalls(camera.last()).at(-1)).toBe(2.6));
    expect(window.localStorage.getItem('tp-scan-zoom')).toBe('2.6');

    // Typing a tag number hides the pill.
    await user.click(screen.getByRole('button', { name: /Type tag #/ }));
    expect(screen.queryByTestId('zoom-pill')).toBeNull();
    first.unmount();

    // Next time the scanner opens, the level goes straight back on.
    renderPage();
    const again = await screen.findByTestId('zoom-pill');
    await waitFor(() => expect(zoomCalls(camera.last())).toEqual([2.6]));
    expect(within(again).getByTestId('zoom-2')).toHaveTextContent('2.6×');
  });

  it('a phone with no zoom setting zooms digitally: 1× 2× 3×, the picture magnified, nothing asked of the camera', async () => {
    const camera = installCamera();
    const user = userEvent.setup();
    renderPage();
    await scanWithoutSigningIn(user);
    const pill = await screen.findByTestId('zoom-pill');
    expect(within(pill).getAllByRole('button').map((b) => b.textContent)).toEqual(['1×', '2×', '3×']);
    await user.click(within(pill).getByTestId('zoom-2'));
    expect(screen.getByTestId('camera-video')).toHaveAttribute('data-zoom', '2');
    // A pinch magnifies the picture smoothly, up to 3×.
    const surface = screen.getByTestId('camera-card');
    touch(surface, 'touchstart', [[100, 300], [200, 300]]);
    touch(surface, 'touchmove', [[0, 300], [300, 300]]);
    expect(screen.getByTestId('camera-video')).toHaveAttribute('data-zoom', '3');
    touch(surface, 'touchend', []);
    expect(window.localStorage.getItem('tp-scan-zoom')).toBe('3');
    expect(zoomCalls(camera.last())).toEqual([]);
    expect(camera.getUserMedia).toHaveBeenCalledTimes(1); // no telephoto here: 3× stays digital
  });

  it('3× opens the telephoto when the phone has one and no zoom setting (iPhone Pro), and 1× goes back', async () => {
    const camera = installCamera({
      devices: [
        { kind: 'videoinput', label: 'Back Camera', deviceId: 'main' },
        { kind: 'videoinput', label: 'Back Telephoto Camera', deviceId: 'tele-1' },
      ],
    });
    const user = userEvent.setup();
    renderPage();
    await scanWithoutSigningIn(user);
    const pill = await screen.findByTestId('zoom-pill');
    await waitFor(() => expect(window.localStorage.getItem('tp-scan-tele')).toBe('tele-1'));

    await user.click(within(pill).getByTestId('zoom-3'));
    await waitFor(() => expect(camera.getUserMedia).toHaveBeenCalledTimes(2));
    expect(camera.getUserMedia.mock.calls[1][0]).toMatchObject({ video: { deviceId: { exact: 'tele-1' } } });
    await waitFor(() => expect(within(screen.getByTestId('zoom-pill')).getByTestId('zoom-3')).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByTestId('camera-video')).toHaveAttribute('data-zoom', '1'); // the lens zooms, not the picture

    await user.click(within(screen.getByTestId('zoom-pill')).getByTestId('zoom-1'));
    await waitFor(() => expect(camera.getUserMedia).toHaveBeenCalledTimes(3));
    expect(camera.getUserMedia.mock.calls[2][0]).toMatchObject({ video: { facingMode: { ideal: 'environment' } } });
    await waitFor(() => expect(within(screen.getByTestId('zoom-pill')).getByTestId('zoom-1')).toHaveAttribute('aria-pressed', 'true'));
  });

  it('hides the pill in type-only mode, where the camera never starts', async () => {
    const camera = installCamera({ zoom: { min: 1, max: 8 } });
    const user = userEvent.setup();
    renderPage('/scan?type=1');
    await scanWithoutSigningIn(user);
    expect(await screen.findByLabelText('Tag number')).toBeInTheDocument();
    expect(screen.queryByTestId('zoom-pill')).toBeNull();
    expect(camera.getUserMedia).not.toHaveBeenCalled();
  });
});

describe('Every code the camera reads gets an answer (owner 2026-10-15, APP D14 and D15)', () => {
  it('a product barcode buzzes, flashes and says "That\'s not our price tag"; Scan again ignores it for 3 s', async () => {
    // Only Date is faked: the camera's frames and the page's timers stay real, and the 3 s window is read off a
    // clock the test moves, so it is checked exactly instead of waited out.
    vi.useFakeTimers({ toFake: ['Date'] });
    installCamera();
    cam.codes = [{ rawValue: '0123456789012', format: 'ean_13' }];
    const user = userEvent.setup();
    renderPage();
    await scanWithoutSigningIn(user);
    expect(await screen.findByTestId('answer-not-ours')).toBeInTheDocument();
    expect(vibrate).toHaveBeenCalledWith(15);

    const at = Date.now();
    await user.click(screen.getByTestId('scan-again'));
    await waitFor(() => expect(screen.queryByTestId('scan-card')).toBeNull());
    // Still in view at 2.9 s: frame after frame reads the code, and it stays ignored.
    vi.setSystemTime(at + 2900);
    const seen = cam.reads;
    await waitFor(() => {
      expect(screen.queryByTestId('answer-not-ours')).toBeNull();
      expect(cam.reads).toBeGreaterThan(seen + 5);
    });
    expect(screen.queryByTestId('answer-not-ours')).toBeNull();
    // It comes back once the 3 s are up.
    vi.setSystemTime(at + 3100);
    expect(await screen.findByTestId('answer-not-ours')).toBeInTheDocument();

    // Another code is answered at once: one of our links, with the clock standing still.
    await user.click(screen.getByTestId('scan-again'));
    cam.codes = [{ rawValue: 'https://ecothrift.us/terms', format: 'qr_code' }];
    expect(await screen.findByTestId('answer-link')).toHaveTextContent('It opens ecothrift.us/terms.');
  });

  it("a tag's QR beats a product barcode in the same picture", async () => {
    installCamera();
    cam.codes = [{ rawValue: '0123456789012', format: 'ean_13' }, { rawValue: 'TP0000001', format: 'qr_code' }];
    const user = userEvent.setup();
    renderPage();
    await scanWithoutSigningIn(user);
    expect(await screen.findByText('Cordless Drill Kit')).toBeInTheDocument();
    expect(screen.queryByTestId('answer-not-ours')).toBeNull();
  });
});

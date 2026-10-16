import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { STALL_MS, useQrCamera, type CameraStatus } from './useQrCamera';

/**
 * A black or frozen camera restarts by itself (owner 2026-10-16): a track the phone ended, no new frame for STALL_MS,
 * at most three times a minute, then "stalled" until a tap. jsdom plays a camera that never shows a frame unless the
 * test says so.
 */

class FakeTrack extends EventTarget {
  readyState: 'live' | 'ended' = 'live';
  muted = false;
  stop = vi.fn(() => {
    this.readyState = 'ended';
  });
  applyConstraints = vi.fn(async () => undefined);
  getCapabilities = () => ({});
  getSettings = () => ({});
}

let tracks: FakeTrack[] = [];
const getUserMedia = vi.fn(async () => {
  const track = new FakeTrack();
  tracks.push(track);
  return { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
});

/** Frames "arrive" while this is true: the video reports a picture and its time moves on. */
let showingFrames = false;

let seen: { status: CameraStatus; wake: () => void } = { status: 'off', wake: () => undefined };

function Camera({ paused = false }: { paused?: boolean }) {
  const cam = useQrCamera({ enabled: true, paused, onDecode: () => undefined });
  seen = { status: cam.status, wake: cam.wake };
  return <video ref={cam.videoRef} data-testid="video" />;
}

/** Time passes a second at a time, so React re-runs the camera between steps as a phone would. */
async function tick(ms: number) {
  for (let left = ms; left > 0; left -= 1000) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(Math.min(1000, left));
    });
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame'] });
  tracks = [];
  showingFrames = false;
  getUserMedia.mockClear();
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia, enumerateDevices: async () => [] }, configurable: true });
  (window as unknown as { BarcodeDetector: unknown }).BarcodeDetector = class {
    static getSupportedFormats = async () => ['qr_code'];
    detect = async () => [];
  };
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockReturnValue(false);
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockImplementation(() => (showingFrames ? 4 : 0));
  vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockImplementation(() => (showingFrames ? 1280 : 0));
  vi.spyOn(HTMLMediaElement.prototype, 'currentTime', 'get').mockImplementation(() => (showingFrames ? Date.now() / 1000 : 0));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useQrCamera heals a black camera', () => {
  it('starts again when the phone ends the camera track', async () => {
    showingFrames = true;
    render(<Camera />);
    await tick(50);
    expect(seen.status).toBe('live');
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    act(() => {
      tracks[0].readyState = 'ended';
      tracks[0].dispatchEvent(new Event('ended'));
    });
    await tick(50);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(seen.status).toBe('live');
  });

  it('starts again when no new frame comes for a few seconds, and keeps a working camera alone', async () => {
    showingFrames = true;
    render(<Camera />);
    await tick(STALL_MS * 3);
    expect(getUserMedia).toHaveBeenCalledTimes(1); // frames keep coming: nothing to fix

    showingFrames = false; // the picture freezes
    await tick(STALL_MS + 1500);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });

  it('after three restarts in a minute it waits for a tap ("stalled"); the tap starts it again', async () => {
    render(<Camera />);
    await tick((STALL_MS + 1100) * 4);
    expect(getUserMedia).toHaveBeenCalledTimes(4); // the first start and three restarts
    expect(seen.status).toBe('stalled');
    await tick(STALL_MS * 3);
    expect(getUserMedia).toHaveBeenCalledTimes(4);

    showingFrames = true;
    act(() => seen.wake());
    await tick(50);
    expect(getUserMedia).toHaveBeenCalledTimes(5);
    expect(seen.status).toBe('live');
  });

  it('does not count a still picture while an item card covers the camera', async () => {
    render(<Camera paused />);
    await tick(STALL_MS * 4);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });
});

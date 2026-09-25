import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * off: not started. starting: asking for the camera. live: decoding.
 * resting: stopped after the idle timeout (tap to wake). blocked: permission or
 * hardware error. unsupported: no camera API (or not HTTPS).
 */
export type CameraStatus = 'off' | 'starting' | 'live' | 'resting' | 'blocked' | 'unsupported';

/** Price tags are QR; Code 128 covers older barcode tags. Fewer formats decode faster. */
const FORMATS = ['qr_code', 'code_128'];
/** The decoder only looks at the middle of the frame, scaled to this width. */
const CROP_FRACTION = 0.7;
const CROP_MAX_PX = 720;

interface Detected {
  rawValue: string;
}
interface Detector {
  detect(source: HTMLVideoElement | ImageData): Promise<Detected[]>;
}
interface DetectorCtor {
  new (opts: { formats: string[] }): Detector;
  getSupportedFormats?: () => Promise<string[]>;
}

export type DecoderKind = 'native' | 'wasm';

let detectorPromise: Promise<{ detector: Detector; kind: DecoderKind }> | null = null;

/**
 * The fastest decoder this phone has: the built-in BarcodeDetector (Android
 * Chrome, hardware accelerated), else ZXing compiled to WebAssembly (iPhone,
 * desktop). The WebAssembly file is served from our own build, never a CDN.
 * Cached for the page's lifetime; call early to warm it up.
 */
export function loadDetector(): Promise<{ detector: Detector; kind: DecoderKind }> {
  if (detectorPromise) return detectorPromise;
  detectorPromise = (async () => {
    const Native = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
    if (typeof Native === 'function') {
      try {
        const supported = (await Native.getSupportedFormats?.()) ?? [];
        const formats = FORMATS.filter((f) => supported.includes(f));
        if (formats.includes('qr_code')) return { detector: new Native({ formats }), kind: 'native' as const };
      } catch {
        // Fall through to WebAssembly.
      }
    }
    const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
      import('barcode-detector/ponyfill'),
      import('zxing-wasm/reader/zxing_reader.wasm?url'),
    ]);
    await prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
      },
      fireImmediately: true,
    });
    return {
      detector: new BarcodeDetector({ formats: FORMATS as never[] }) as unknown as Detector,
      kind: 'wasm' as const,
    };
  })();
  detectorPromise.catch(() => {
    detectorPromise = null;
  });
  return detectorPromise;
}

export function cameraSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  );
}

function cameraErrorText(err: unknown): string {
  const name = err && typeof err === 'object' && 'name' in err ? String((err as { name?: unknown }).name) : '';
  if (name === 'NotAllowedError') return 'The camera is blocked.';
  if (name === 'NotFoundError') return 'No camera found.';
  if (name === 'NotReadableError') return 'Another app is using the camera.';
  return "The camera didn't start.";
}

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

/**
 * Always-on rear camera that reads tag codes. The stream stays up while
 * `paused` (an item card is on top) so the next scan is instant; only
 * decoding stops. After `idleMs` with no scan or touch the camera rests to
 * save battery; `wake()` restarts it. Decodes on every new video frame, one
 * frame at a time.
 */
export function useQrCamera({
  enabled,
  paused,
  onDecode,
  idleMs = 5 * 60_000,
}: {
  enabled: boolean;
  paused: boolean;
  onDecode: (raw: string) => void;
  idleMs?: number;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<CameraStatus>('off');
  const [error, setError] = useState('');
  const [decoder, setDecoder] = useState<DecoderKind | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [resting, setResting] = useState(false);
  const [visible, setVisible] = useState(() =>
    typeof document === 'undefined' ? true : document.visibilityState !== 'hidden',
  );
  const pausedRef = useRef(paused);
  const onDecodeRef = useRef(onDecode);
  const idleTimer = useRef<number | null>(null);
  pausedRef.current = paused;
  onDecodeRef.current = onDecode;

  // Release the camera when the phone locks or switches apps.
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  /** Any scan or touch: push the idle timeout back. */
  const poke = useCallback(() => {
    if (idleTimer.current != null) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setResting(true), idleMs);
  }, [idleMs]);

  const wake = useCallback(() => {
    setResting(false);
    setAttempt((n) => n + 1);
    poke();
  }, [poke]);

  useEffect(() => {
    poke();
    return () => {
      if (idleTimer.current != null) window.clearTimeout(idleTimer.current);
    };
  }, [poke]);

  const active = enabled && visible && !resting;

  useEffect(() => {
    if (!active) {
      setStatus(resting && enabled ? 'resting' : 'off');
      return;
    }
    if (!cameraSupported()) {
      setStatus('unsupported');
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let frameHandle: number | null = null;
    let usedVfc = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const stop = () => {
      const v = videoRef.current as VideoWithFrameCallback | null;
      if (frameHandle != null) {
        if (usedVfc && v?.cancelVideoFrameCallback) v.cancelVideoFrameCallback(frameHandle);
        else cancelAnimationFrame(frameHandle);
      }
      frameHandle = null;
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    const start = async () => {
      setStatus('starting');
      setError('');
      try {
        // Ask for the camera and warm the decoder at the same time.
        const [media, loaded] = await Promise.all([
          navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          }),
          loadDetector(),
        ]);
        stream = media;
        if (cancelled) {
          stop();
          return;
        }
        const track = media.getVideoTracks()[0];
        try {
          await track?.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] });
        } catch {
          // Not every camera takes focus hints.
        }
        const video = videoRef.current as VideoWithFrameCallback | null;
        if (!video) throw new Error('Video element not ready');
        video.srcObject = media;
        video.muted = true;
        video.setAttribute('playsinline', 'true');
        await video.play();
        if (cancelled) return;
        setDecoder(loaded.kind);
        setStatus('live');

        let busy = false;
        const schedule = () => {
          if (cancelled) return;
          if (video.requestVideoFrameCallback) {
            usedVfc = true;
            frameHandle = video.requestVideoFrameCallback(onFrame);
          } else {
            frameHandle = requestAnimationFrame(onFrame);
          }
        };
        const onFrame = () => {
          if (cancelled) return;
          if (!busy && !pausedRef.current && video.readyState >= 2 && video.videoWidth > 0) {
            busy = true;
            void decodeOnce(video, loaded.detector, loaded.kind)
              .then((raw) => {
                if (raw && !cancelled && !pausedRef.current) onDecodeRef.current(raw);
              })
              .catch(() => {
                // A bad frame; keep going.
              })
              .finally(() => {
                busy = false;
              });
          }
          schedule();
        };

        const decodeOnce = async (v: HTMLVideoElement, d: Detector, kind: DecoderKind) => {
          if (kind === 'native' || !ctx) {
            return (await d.detect(v)).find((c) => c.rawValue)?.rawValue;
          }
          // WebAssembly: decode only the middle of the frame, scaled down. Much faster, and
          // it is where the viewfinder is.
          const side = Math.floor(Math.min(v.videoWidth, v.videoHeight) * CROP_FRACTION);
          const sx = Math.floor((v.videoWidth - side) / 2);
          const sy = Math.floor((v.videoHeight - side) / 2);
          const out = Math.min(side, CROP_MAX_PX);
          if (canvas.width !== out) {
            canvas.width = out;
            canvas.height = out;
          }
          ctx.drawImage(v, sx, sy, side, side, 0, 0, out, out);
          const image = ctx.getImageData(0, 0, out, out);
          return (await d.detect(image)).find((c) => c.rawValue)?.rawValue;
        };

        schedule();
      } catch (err) {
        if (cancelled) return;
        stop();
        setStatus('blocked');
        setError(cameraErrorText(err));
      }
    };
    void start();

    return () => {
      cancelled = true;
      stop();
    };
  }, [active, attempt, enabled, resting]);

  return { videoRef, status, error, decoder, wake, poke };
}

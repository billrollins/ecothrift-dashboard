import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DIGITAL_RANGE,
  TELE_AT,
  clampZoom,
  pickTele,
  saveTele,
  saveZoom,
  savedTele,
  savedZoom,
  wantsTele,
  zoomLevels,
  type ZoomRange,
} from './cameraZoom';

/**
 * off: not started. starting: asking for the camera. live: decoding.
 * resting: stopped after the idle timeout (tap to wake). blocked: permission or
 * hardware error. unsupported: no camera API (or not HTTPS).
 */
export type CameraStatus = 'off' | 'starting' | 'live' | 'resting' | 'blocked' | 'unsupported';

/**
 * Price tags are QR; Code 128 covers older barcode tags. EAN-13, EAN-8, UPC-A and UPC-E are read only so a product
 * barcode gets an answer ("That's not our price tag", owner 2026-10-15, APP D14a).
 */
const FORMATS = ['qr_code', 'code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e'];
/** When one frame holds several codes, a tag's beats a product barcode beside it. */
const TAG_FORMATS = new Set(['qr_code', 'code_128']);
/** The decoder only looks at the middle of the frame, scaled to this width. */
const CROP_FRACTION = 0.7;
const CROP_MAX_PX = 720;
const SIZE = { width: { ideal: 1280 }, height: { ideal: 720 } };

interface Detected {
  rawValue: string;
  format?: string;
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

/** The code to answer from one frame: a tag's code first (QR, Code 128), else the first one read. */
function pickCode(codes: Detected[]): Detected | undefined {
  const read = codes.filter((c) => c.rawValue);
  return read.find((c) => !c.format || TAG_FORMATS.has(c.format)) ?? read[0];
}

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

/**
 * The zoom control's state (owner 2026-10-15, APP D13).
 * - native: the camera's own zoom, read from `getCapabilities().zoom` and set with `applyConstraints` (Android Chrome
 *   and any browser that offers it).
 * - digital: a phone with no zoom setting. 1× and 2× magnify the picture and decode a scaled-up centre crop; 3× opens
 *   the telephoto camera when the phone has one, else it is digital too.
 */
export interface CameraZoom {
  kind: 'native' | 'digital';
  levels: number[];
  value: number;
  range: ZoomRange;
  /** How much the picture is magnified on screen (always 1 with native zoom). */
  digital: number;
  /** Go to a level. `live`: a pinch on its way (not remembered, no camera switch until it ends). */
  set: (z: number, opts?: { live?: boolean }) => void;
}

interface ZoomInfo {
  kind: 'native' | 'digital';
  range: ZoomRange;
  levels: number[];
}

type Lens = 'main' | 'tele';

/** Start on the telephoto when 3× was the last level and this phone's telephoto is known. */
function firstLens(): Lens {
  const z = savedZoom();
  return z != null && wantsTele(z) && savedTele() ? 'tele' : 'main';
}

/**
 * Always-on rear camera that reads tag codes. The stream stays up while
 * `paused` (an item card is on top) so the next scan is instant; only
 * decoding stops. After `idleMs` with no scan or touch the camera rests to
 * save battery; `wake()` restarts it. Decodes on every new video frame, one
 * frame at a time. `onDecode` gets the text and, from the camera's decoder, its format.
 */
export function useQrCamera({
  enabled,
  paused,
  onDecode,
  idleMs = 5 * 60_000,
}: {
  enabled: boolean;
  paused: boolean;
  onDecode: (raw: string, format?: string) => void;
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
  const [zoomInfo, setZoomInfo] = useState<ZoomInfo | null>(null);
  const [zoomValue, setZoomValue] = useState(1);
  const [digital, setDigital] = useState(1);
  const [lens, setLens] = useState<Lens>(firstLens);
  const [switching, setSwitching] = useState(false);
  const pausedRef = useRef(paused);
  const onDecodeRef = useRef(onDecode);
  const idleTimer = useRef<number | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const digitalRef = useRef(1);
  const zoomInfoRef = useRef<ZoomInfo | null>(null);
  const lensRef = useRef<Lens>(lens);
  const applying = useRef<{ busy: boolean; next: number | null }>({ busy: false, next: null });
  pausedRef.current = paused;
  onDecodeRef.current = onDecode;
  zoomInfoRef.current = zoomInfo;
  lensRef.current = lens;

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

  /** The camera's own zoom, one change at a time: a pinch sends many, only the latest waiting one is applied. */
  const applyNative = useCallback((z: number) => {
    const q = applying.current;
    q.next = z;
    if (q.busy) return;
    q.busy = true;
    void (async () => {
      while (q.next != null) {
        const value = q.next;
        q.next = null;
        try {
          await trackRef.current?.applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] });
        } catch {
          // The camera keeps the zoom it had.
        }
      }
      q.busy = false;
    })();
  }, []);

  const setDigitalZoom = (d: number) => {
    digitalRef.current = d;
    setDigital(d);
  };

  const setZoom = useCallback(
    (z: number, { live = false }: { live?: boolean } = {}) => {
      const info = zoomInfoRef.current;
      if (!info) return;
      const value = clampZoom(z, info.range);
      setZoomValue(value);
      if (info.kind === 'native') {
        applyNative(value);
        if (!live) saveZoom(value);
        return;
      }
      const onTele = lensRef.current === 'tele';
      if (live) {
        // The picture follows a pinch on the main camera; on the telephoto it waits for the fingers to lift.
        if (!onTele) setDigitalZoom(value);
        return;
      }
      const tele = wantsTele(value) && !!savedTele();
      saveZoom(tele ? TELE_AT : value);
      if (tele && !onTele) {
        setZoomValue(TELE_AT);
        setSwitching(true);
        setLens('tele');
      } else if (!tele && onTele) {
        setDigitalZoom(value);
        setSwitching(true);
        setLens('main');
      } else {
        setDigitalZoom(tele ? 1 : value);
      }
    },
    [applyNative],
  );

  const active = enabled && visible && !resting;

  useEffect(() => {
    if (!active) {
      setStatus(resting && enabled ? 'resting' : 'off');
      setSwitching(false);
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
    const teleId = lens === 'tele' ? savedTele() : null;

    const stop = () => {
      const v = videoRef.current as VideoWithFrameCallback | null;
      if (frameHandle != null) {
        if (usedVfc && v?.cancelVideoFrameCallback) v.cancelVideoFrameCallback(frameHandle);
        else cancelAnimationFrame(frameHandle);
      }
      frameHandle = null;
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      trackRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    /** The zoom this camera offers, and the remembered level put back (APP D13). */
    const setUpZoom = (track: MediaStreamTrack | undefined) => {
      const caps = (track?.getCapabilities?.() ?? {}) as { zoom?: { min?: number; max?: number } };
      const saved = savedZoom();
      const min = caps.zoom?.min;
      const max = caps.zoom?.max;
      if (!teleId && typeof min === 'number' && typeof max === 'number' && max > min) {
        const range = { min, max };
        const now = (track?.getSettings?.() as { zoom?: number } | undefined)?.zoom ?? 1;
        const z = clampZoom(saved ?? now, range);
        setDigitalZoom(1);
        setZoomInfo({ kind: 'native', range, levels: zoomLevels(range) });
        setZoomValue(z);
        if (Math.abs(z - now) > 0.01) applyNative(z);
        return;
      }
      // No zoom setting: digital, and the telephoto for 3× when the phone has one.
      const z = teleId ? TELE_AT : clampZoom(saved ?? 1, DIGITAL_RANGE);
      setDigitalZoom(teleId ? 1 : z);
      setZoomInfo({ kind: 'digital', range: DIGITAL_RANGE, levels: zoomLevels(DIGITAL_RANGE) });
      setZoomValue(z);
      if (!teleId) {
        // Camera names are readable once the camera is allowed.
        void navigator.mediaDevices.enumerateDevices?.()
          .then((devices) => {
            if (!cancelled) saveTele(pickTele(devices));
          })
          .catch(() => undefined);
      }
    };

    const start = async () => {
      setStatus('starting');
      setError('');
      try {
        // Ask for the camera and warm the decoder at the same time.
        const loading = loadDetector();
        const video = teleId ? { deviceId: { exact: teleId }, ...SIZE } : { facingMode: { ideal: 'environment' }, ...SIZE };
        let media: MediaStream;
        try {
          media = await navigator.mediaDevices.getUserMedia({ audio: false, video });
        } catch (err) {
          if (!teleId || cancelled) throw err;
          // The telephoto is gone (a new phone, a browser update): forget it and open the main camera at 3× digital.
          saveTele(null);
          setLens('main');
          return;
        }
        stream = media;
        const loaded = await loading;
        if (cancelled) {
          stop();
          return;
        }
        const track = media.getVideoTracks()[0];
        trackRef.current = track ?? null;
        try {
          await track?.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] });
        } catch {
          // Not every camera takes focus hints.
        }
        const el = videoRef.current as VideoWithFrameCallback | null;
        if (!el) throw new Error('Video element not ready');
        el.srcObject = media;
        el.muted = true;
        el.setAttribute('playsinline', 'true');
        await el.play();
        if (cancelled) return;
        setUpZoom(track);
        setDecoder(loaded.kind);
        setStatus('live');
        setSwitching(false);

        let busy = false;
        const schedule = () => {
          if (cancelled) return;
          if (el.requestVideoFrameCallback) {
            usedVfc = true;
            frameHandle = el.requestVideoFrameCallback(onFrame);
          } else {
            frameHandle = requestAnimationFrame(onFrame);
          }
        };
        const onFrame = () => {
          if (cancelled) return;
          if (!busy && !pausedRef.current && el.readyState >= 2 && el.videoWidth > 0) {
            busy = true;
            void decodeOnce(el, loaded.detector, loaded.kind)
              .then((code) => {
                if (code && !cancelled && !pausedRef.current) onDecodeRef.current(code.rawValue, code.format);
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
          const zoom = digitalRef.current;
          if (!ctx || (kind === 'native' && zoom <= 1.01)) return pickCode(await d.detect(v));
          // Decode only the middle of the frame: faster, and it is where the viewfinder is. Zoomed digitally, the
          // middle shrinks with the picture and is scaled up, so a small or far code still reads.
          const side = Math.max(16, Math.floor((Math.min(v.videoWidth, v.videoHeight) * CROP_FRACTION) / zoom));
          const sx = Math.floor((v.videoWidth - side) / 2);
          const sy = Math.floor((v.videoHeight - side) / 2);
          const out = Math.min(CROP_MAX_PX, Math.round(side * zoom));
          if (canvas.width !== out) {
            canvas.width = out;
            canvas.height = out;
          }
          ctx.drawImage(v, sx, sy, side, side, 0, 0, out, out);
          return pickCode(await d.detect(ctx.getImageData(0, 0, out, out)));
        };

        schedule();
      } catch (err) {
        if (cancelled) return;
        stop();
        setStatus('blocked');
        setSwitching(false);
        setError(cameraErrorText(err));
      }
    };
    void start();

    return () => {
      cancelled = true;
      stop();
    };
    // `applyNative` is stable; the lens is read once per start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, attempt, enabled, resting, lens]);

  const zoom: CameraZoom | null = zoomInfo
    ? { kind: zoomInfo.kind, levels: zoomInfo.levels, range: zoomInfo.range, value: zoomValue, digital, set: setZoom }
    : null;

  return { videoRef, status, error, decoder, wake, poke, zoom, switching };
}

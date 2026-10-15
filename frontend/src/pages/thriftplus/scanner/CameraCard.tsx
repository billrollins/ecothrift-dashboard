import { useEffect, useRef, useState, type ChangeEvent, type RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Box, ButtonBase, CircularProgress, InputBase } from '@mui/material';
import KeyboardRounded from '@mui/icons-material/KeyboardRounded';
import NoPhotographyRounded from '@mui/icons-material/NoPhotographyRounded';
import PhotoCameraRounded from '@mui/icons-material/PhotoCameraRounded';
import { fetchTestTags } from '../../../api/thriftPlusScanner.api';
import { tbNumber } from '../../../components/thriftplus/ThriftBucks';
import { activeLevel, chipText, onLevel, pinchZoom, zoomText } from './cameraZoom';
import type { CameraStatus, CameraZoom } from './useQrCamera';
import { sc, u } from './scannerTheme';

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  status: CameraStatus;
  error: string;
  /** The camera's zoom (APP D13); null until the camera runs. */
  zoom?: CameraZoom | null;
  /** The camera is switching lens for a zoom level: the control stays up. */
  switching?: boolean;
  /** True while an item card sits on top: this card shows as the plain back card of the stack. */
  underneath: boolean;
  /** Brief green flash on the viewfinder when a code is read. */
  flash: boolean;
  onWake: () => void;
  /** Typed tag number or a sample tag. */
  onCode: (code: string) => void;
  /** "Camera not working?" help (the popup grows from the link). */
  onHelp: (from: HTMLElement) => void;
  /** Testing without a camera (/scan?type=1, owner 2026-10-10): only the tag box, no camera. */
  typeOnly?: boolean;
}

/** The camera's card face: the design's white card, green edge. */
const cardFaceSx = {
  position: 'absolute',
  inset: 0,
  borderRadius: u(36),
  bgcolor: sc.card,
  border: `${u(3)} solid ${sc.cardEdge}`,
  boxShadow: sc.cardShadow,
  overflow: 'hidden',
} as const;

/**
 * The bottom card of the stack: the live camera. It never unmounts, so when an
 * item card is swiped away the scanner is already running underneath.
 */
export function CameraCard({ videoRef, status, error, zoom = null, switching = false, underneath, flash, onWake, onCode, onHelp, typeOnly = false }: Props) {
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const noCamera = !typeOnly && (status === 'unsupported' || status === 'blocked');
  // Test mode: pick a tag from a short list (owner 2026-10-10). If the list can't load, type one instead.
  const testTags = useQuery({ queryKey: ['thriftPlus', 'testTags'], queryFn: fetchTestTags, enabled: typeOnly, staleTime: 300_000 });
  const pickList = typeOnly && (testTags.data?.length ?? 0) > 0;
  const panelOpen = typing || noCamera || typeOnly;
  // Zoom (APP D13): only while the camera runs, never in type-only mode or with the tag box open.
  const pinchable = !typeOnly && !underneath && status === 'live' && !!zoom;
  const showZoom = !typeOnly && !underneath && !panelOpen && !!zoom && zoom.levels.length > 1 && (status === 'live' || switching);
  const rootRef = usePinch(pinchable, zoom);

  const submitTyped = () => {
    const code = typed.trim();
    if (!code) return;
    setTyped('');
    setTyping(false);
    onCode(code);
  };

  return (
    <Box
      ref={rootRef}
      data-testid="camera-card"
      aria-hidden={underneath}
      sx={{
        ...cardFaceSx,
        zIndex: 1,
        bgcolor: sc.night,
        transform: underneath ? `translate(${u(24)}, ${u(22)})` : 'none',
        transition: 'transform 200ms ease-out',
        pointerEvents: underneath ? 'none' : 'auto',
        fontFamily: sc.font,
        // Two fingers on the picture zoom the camera, not the page.
        touchAction: pinchable ? 'none' : undefined,
      }}
    >
      <Box
        component="video"
        data-testid="camera-video"
        data-zoom={zoom?.digital ?? 1}
        ref={videoRef}
        muted
        playsInline
        autoPlay
        // A phone with no zoom setting: the picture is magnified (and the decoder reads the same middle, scaled up).
        // Inline, since a pinch moves it every frame.
        style={{ transform: zoom && zoom.digital > 1.001 ? `scale(${zoom.digital})` : 'none' }}
        sx={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: status === 'live' ? 1 : 0,
          transformOrigin: '50% 50%',
          transition: 'opacity 160ms ease, transform 120ms ease-out',
        }}
      />

      {/* Viewfinder: the decoder reads the middle of the frame. */}
      {status === 'live' && (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            left: '50%',
            top: '46%',
            width: '62%',
            aspectRatio: '1 / 1',
            transform: 'translate(-50%, -50%)',
            borderRadius: u(28),
            boxShadow: '0 0 0 999px rgba(0,0,0,0.26)',
          }}
        >
          {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
            <Box
              key={c}
              sx={{
                position: 'absolute',
                width: '22%',
                height: '22%',
                borderColor: flash ? sc.greenBright : '#fff',
                borderStyle: 'solid',
                borderWidth: 0,
                transition: 'border-color 120ms ease',
                ...(c[0] === 't' ? { top: -3, borderTopWidth: 5 } : { bottom: -3, borderBottomWidth: 5 }),
                ...(c[1] === 'l' ? { left: -3, borderLeftWidth: 5 } : { right: -3, borderRightWidth: 5 }),
                borderRadius:
                  c === 'tl' ? '14px 0 0 0' : c === 'tr' ? '0 14px 0 0' : c === 'bl' ? '0 0 0 14px' : '0 0 14px 0',
              }}
            />
          ))}
        </Box>
      )}

      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          p: u(50),
          color: '#fff',
          pointerEvents: 'none',
        }}
      >
        {typeOnly && (
          <>
            <KeyboardRounded sx={{ fontSize: u(96), opacity: 0.8 }} />
            <Box sx={{ mt: u(12), fontSize: u(32), opacity: 0.85, mb: u(160) }}>Test mode: pick a tag</Box>
          </>
        )}
        {!typeOnly && status === 'starting' && (
          <>
            <CircularProgress size={32} sx={{ color: '#fff' }} />
            <Box sx={{ mt: u(24), fontSize: u(32), opacity: 0.85 }}>Starting camera</Box>
          </>
        )}
        {status === 'resting' && (
          <ButtonBase onClick={onWake} sx={{ pointerEvents: 'auto', flexDirection: 'column', borderRadius: u(30), p: u(40) }}>
            <PhotoCameraRounded sx={{ fontSize: u(120) }} />
            <Box sx={{ mt: u(12), fontSize: u(44), fontWeight: 700 }}>Tap to scan</Box>
            <Box sx={{ fontSize: u(28), opacity: 0.75, mt: u(6) }}>The camera rests after 5 quiet minutes.</Box>
          </ButtonBase>
        )}
        {noCamera && (
          <Box sx={{ pointerEvents: 'auto', mb: u(160) }}>
            <NoPhotographyRounded sx={{ fontSize: u(96), opacity: 0.8 }} />
            <Box sx={{ mt: u(12), fontSize: u(32), fontWeight: 500, opacity: 0.92, lineHeight: 1.35 }}>
              {status === 'blocked' ? error : "This browser can't open the camera here."}
            </Box>
            <ButtonBase
              onClick={(e) => onHelp(e.currentTarget)}
              sx={{ mt: u(22), px: u(34), py: u(16), borderRadius: 99, bgcolor: '#fff', color: sc.priceGreen, fontWeight: 700, fontSize: u(30) }}
            >
              Camera not working?
            </ButtonBase>
          </Box>
        )}
      </Box>

      {showZoom && zoom && <ZoomPill zoom={zoom} />}

      {/* Type a tag number (sample tags live here too while this is a mock). */}
      <Box sx={{ position: 'absolute', left: u(24), right: u(24), bottom: u(24) }}>
        {pickList ? (
          <Box sx={{ bgcolor: 'rgba(16,21,17,0.86)', borderRadius: u(32), p: u(16), backdropFilter: 'blur(8px)' }}>
            <Box
              component="select"
              aria-label="Pick a test item"
              value=""
              onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                if (e.target.value) onCode(e.target.value);
              }}
              sx={{ width: '100%', fontSize: 16, p: u(20), borderRadius: 99, border: 0, bgcolor: '#fff', color: sc.ink }}
            >
              <option value="">Pick a test item…</option>
              {testTags.data!.map((t) => (
                <option key={t.sku} value={t.sku}>
                  {`${t.title} · $${t.price} · ${Number(t.reward) > 0 ? `${tbNumber(t.reward)} ThriftBucks` : 'no ThriftBucks yet'}`}
                </option>
              ))}
            </Box>
          </Box>
        ) : panelOpen ? (
          <Box sx={{ bgcolor: 'rgba(16,21,17,0.86)', borderRadius: u(32), p: u(16), backdropFilter: 'blur(8px)' }}>
            <Box
              component="form"
              onSubmit={(e) => {
                e.preventDefault();
                submitTyped();
              }}
              sx={{ display: 'flex', gap: u(12), bgcolor: '#fff', borderRadius: 99, p: u(8), pl: u(30) }}
            >
              <InputBase
                autoFocus={typing || typeOnly}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="Tag number"
                inputProps={{ 'aria-label': 'Tag number', autoCapitalize: 'characters', autoCorrect: 'off', spellCheck: false, enterKeyHint: 'search' }}
                sx={{ flex: 1, minWidth: 0, fontSize: 16 }}
              />
              <ButtonBase
                type="submit"
                sx={{ px: u(30), borderRadius: 99, bgcolor: sc.green, color: '#fff', fontWeight: 700, fontSize: u(30), whiteSpace: 'nowrap' }}
              >
                Look up
              </ButtonBase>
            </Box>
            {typing && !noCamera && !typeOnly && (
              <ButtonBase onClick={() => setTyping(false)} sx={{ mt: u(10), width: '100%', py: u(10), color: '#fff', fontSize: u(26), opacity: 0.85, borderRadius: u(16) }}>
                Back to the camera
              </ButtonBase>
            )}
          </Box>
        ) : (
          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
            <ButtonBase
              onClick={() => setTyping(true)}
              sx={{
                gap: u(10),
                px: u(26),
                py: u(12),
                borderRadius: 99,
                bgcolor: 'rgba(16,21,17,0.55)',
                border: '1px solid rgba(255,255,255,0.25)',
                color: '#fff',
                fontSize: u(28),
                fontWeight: 500,
                whiteSpace: 'nowrap',
                backdropFilter: 'blur(6px)',
              }}
            >
              <KeyboardRounded sx={{ fontSize: u(36) }} />
              Type tag #
            </ButtonBase>
          </Box>
        )}
      </Box>

      {/* Underneath, the camera card looks like the design's plain back card. */}
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          inset: 0,
          bgcolor: sc.card,
          opacity: underneath ? 1 : 0,
          transition: 'opacity 180ms ease',
          pointerEvents: 'none',
        }}
      />
    </Box>
  );
}

/**
 * The zoom chips, centred over the bottom of the camera, just above "Type tag #", like a phone's camera app
 * (APP D13). The lit chip shows the zoom itself between levels ("1.4×") while a pinch moves it.
 */
function ZoomPill({ zoom }: { zoom: CameraZoom }) {
  const lit = activeLevel(zoom.levels, zoom.value);
  return (
    <Box sx={{ position: 'absolute', left: 0, right: 0, bottom: u(124), display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <Box
        role="group"
        aria-label="Zoom"
        data-testid="zoom-pill"
        sx={{ pointerEvents: 'auto', display: 'flex', gap: u(6), p: u(6), borderRadius: 99, bgcolor: 'rgba(16,21,17,0.55)',
          border: '1px solid rgba(255,255,255,0.25)', backdropFilter: 'blur(6px)' }}
      >
        {zoom.levels.map((level) => {
          const on = level === lit;
          return (
            <ButtonBase
              key={level}
              data-testid={`zoom-${level}`}
              aria-label={`Zoom ${chipText(level)}`}
              aria-pressed={on}
              onClick={() => zoom.set(level)}
              sx={{ minWidth: u(88), height: u(72), px: u(14), borderRadius: 99, fontFamily: sc.font, fontWeight: 800, fontSize: u(30),
                bgcolor: on ? '#ffffff' : 'transparent', color: on ? sc.titleGreen : '#ffffff', whiteSpace: 'nowrap',
                transition: 'background-color 120ms, color 120ms' }}
            >
              {on && !onLevel(level, zoom.value) ? zoomText(zoom.value) : chipText(level)}
            </ButtonBase>
          );
        })}
      </Box>
    </Box>
  );
}

/**
 * Pinch on the camera picture zooms smoothly within the camera's range, and the chips follow. Native listeners, so
 * the page itself doesn't zoom (React's touch listeners can't stop that).
 */
function usePinch(on: boolean, zoom: CameraZoom | null) {
  const ref = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEffect(() => {
    const el = ref.current;
    if (!el || !on) return;
    let start: { distance: number; zoom: number } | null = null;
    let last = 1;
    const spread = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e: TouchEvent) => {
      const z = zoomRef.current;
      if (e.touches.length !== 2 || !z) return;
      e.preventDefault();
      start = { distance: spread(e.touches), zoom: z.value };
      last = z.value;
    };
    const onMove = (e: TouchEvent) => {
      const z = zoomRef.current;
      if (!start || e.touches.length !== 2 || !z) return;
      e.preventDefault();
      last = pinchZoom(start.zoom, start.distance, spread(e.touches), z.range);
      z.set(last, { live: true });
    };
    const onEnd = (e: TouchEvent) => {
      if (!start || e.touches.length >= 2) return;
      start = null;
      zoomRef.current?.set(last);
    };
    const stopPageZoom = (e: Event) => e.preventDefault(); // Safari's own pinch gesture
    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    el.addEventListener('gesturestart', stopPageZoom);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
      el.removeEventListener('gesturestart', stopPageZoom);
    };
  }, [on]);
  return ref;
}

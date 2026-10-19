/**
 * The selfie camera (owner 2026-10-19: "make sure they put their face in a face shape, to ensure it's not too far away"):
 * the front camera live in the app, with an oval to fit the face in. The photo is cropped to the frame around the oval,
 * so a face that fills the oval fills the photo. Mirrored on screen like a mirror; the photo itself is not mirrored.
 * Where the browser can't open the camera here (blocked, unsupported), the step falls back to the phone's own camera.
 */
import { useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { cameraSupported } from './useQrCamera';
import { sc, u } from './scannerTheme';
import { BigButton } from './tripUi';

/** The frame on screen and in the photo: portrait 3:4. */
const FRAME_W = 3;
const FRAME_H = 4;
/** The oval, as a share of the frame: a face this size is close enough for staff to match it to the ID. */
export const OVAL = { width: 0.62, height: 0.66, top: 0.12 } as const;
/** The photo's size (px), 3:4. */
const PHOTO_W = 960;
const PHOTO_H = 1280;

export function selfieCameraAvailable(): boolean {
  return cameraSupported();
}

export default function SelfieCamera({ onPhoto, onFail }: {
  /** The photo, a JPEG cropped to the frame. */
  onPhoto: (photo: Blob) => void;
  /** The camera couldn't open here: use the phone's own camera instead. */
  onFail: () => void;
}) {
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stopped = false;
    (async () => {
      try {
        const ask = () => navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 1280 } },
        });
        let media: MediaStream;
        try {
          media = await ask();
        } catch (first) {
          // The scanner's back camera may take a moment to let go (phones open one camera at a time): one more try.
          const name = first && typeof first === 'object' && 'name' in first ? String((first as { name?: unknown }).name) : '';
          if (name === 'NotAllowedError' || stopped) throw first;
          await new Promise((r) => window.setTimeout(r, 700));
          media = await ask();
        }
        if (stopped) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = media;
        const el = video.current;
        if (el) {
          el.srcObject = media;
          await el.play().catch(() => undefined);
        }
        setReady(true);
      } catch {
        if (!stopped) onFail();
      }
    })();
    return () => {
      stopped = true;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The frame the person saw (the middle 3:4 of the camera picture, as object-fit: cover shows it), not mirrored. */
  const take = () => {
    const el = video.current;
    if (!el || !el.videoWidth || !el.videoHeight) return;
    setBusy(true);
    const vw = el.videoWidth;
    const vh = el.videoHeight;
    const want = FRAME_W / FRAME_H;
    let sw = vw;
    let sh = vh;
    if (vw / vh > want) sw = Math.round(vh * want);
    else sh = Math.round(vw / want);
    const sx = Math.round((vw - sw) / 2);
    const sy = Math.round((vh - sh) / 2);
    const canvas = document.createElement('canvas');
    canvas.width = PHOTO_W;
    canvas.height = PHOTO_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setBusy(false);
      onFail();
      return;
    }
    ctx.drawImage(el, sx, sy, sw, sh, 0, 0, PHOTO_W, PHOTO_H);
    canvas.toBlob(
      (blob) => {
        setBusy(false);
        if (blob) {
          stream.current?.getTracks().forEach((t) => t.stop());
          onPhoto(blob);
        } else onFail();
      },
      'image/jpeg',
      0.85,
    );
  };

  const ovalLeft = (1 - OVAL.width) / 2;
  return (
    <Box data-testid="selfie-camera">
      <Box
        sx={{
          position: 'relative', mt: u(30), mx: 'auto', width: u(560), maxWidth: '100%', aspectRatio: `${FRAME_W} / ${FRAME_H}`,
          borderRadius: u(36), overflow: 'hidden', bgcolor: '#111', boxShadow: sc.tileShadow,
        }}
      >
        <Box
          component="video"
          ref={video}
          muted
          playsInline
          autoPlay
          sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
        />
        {/* Dark outside the oval, a bright oval line: put your face here. */}
        <Box
          component="svg"
          aria-hidden
          viewBox="0 0 300 400"
          preserveAspectRatio="none"
          sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          <defs>
            <mask id="selfie-oval">
              <rect width="300" height="400" fill="white" />
              <ellipse
                cx="150"
                cy={400 * (OVAL.top + OVAL.height / 2)}
                rx={150 * OVAL.width}
                ry={200 * OVAL.height}
                fill="black"
              />
            </mask>
          </defs>
          <rect width="300" height="400" fill="rgba(0,0,0,0.55)" mask="url(#selfie-oval)" />
          <ellipse
            cx="150"
            cy={400 * (OVAL.top + OVAL.height / 2)}
            rx={150 * OVAL.width}
            ry={200 * OVAL.height}
            fill="none"
            stroke="#ffffff"
            strokeWidth="4"
            strokeDasharray="10 7"
          />
        </Box>
        <Box
          data-testid="selfie-oval-hint"
          sx={{
            position: 'absolute', left: `${ovalLeft * 100}%`, right: `${ovalLeft * 100}%`, bottom: u(26), textAlign: 'center',
            color: '#fff', fontWeight: 700, fontSize: u(30), textShadow: '0 1px 6px rgba(0,0,0,0.7)',
          }}
        >
          {ready ? 'Fit your face in the oval' : 'Opening the camera…'}
        </Box>
      </Box>
      <Box sx={{ mt: u(30), display: 'flex', flexDirection: 'column', gap: u(18) }}>
        <BigButton primary onClick={take} disabled={!ready || busy} testId="selfie-shoot">Take photo</BigButton>
      </Box>
    </Box>
  );
}

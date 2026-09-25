import { useState, type RefObject } from 'react';
import { Box, ButtonBase, CircularProgress, InputBase } from '@mui/material';
import KeyboardRounded from '@mui/icons-material/KeyboardRounded';
import NoPhotographyRounded from '@mui/icons-material/NoPhotographyRounded';
import PhotoCameraRounded from '@mui/icons-material/PhotoCameraRounded';
import { thriftPlusMockControls } from '../../../api/thriftPlusMock';
import { cardFaceSx } from './ItemCard';
import type { CameraStatus } from './useQrCamera';
import { sc, u } from './scannerTheme';

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  status: CameraStatus;
  error: string;
  /** True while an item card sits on top: this card shows as the plain back card of the stack. */
  underneath: boolean;
  /** Brief green flash on the viewfinder when a code is read. */
  flash: boolean;
  onWake: () => void;
  /** Typed tag number or a sample tag. */
  onCode: (code: string) => void;
  /** "Camera not working?" help (the popup grows from the link). */
  onHelp: (from: HTMLElement) => void;
}

/**
 * The bottom card of the stack: the live camera. It never unmounts, so when an
 * item card is swiped away the scanner is already running underneath.
 */
export function CameraCard({ videoRef, status, error, underneath, flash, onWake, onCode, onHelp }: Props) {
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const noCamera = status === 'unsupported' || status === 'blocked';
  const panelOpen = typing || noCamera;

  const submitTyped = () => {
    const code = typed.trim();
    if (!code) return;
    setTyped('');
    setTyping(false);
    onCode(code);
  };

  return (
    <Box
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
      }}
    >
      <Box
        component="video"
        ref={videoRef}
        muted
        playsInline
        autoPlay
        sx={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: status === 'live' ? 1 : 0,
          transition: 'opacity 160ms ease',
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
        {status === 'starting' && (
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

      {/* Type a tag number (sample tags live here too while this is a mock). */}
      <Box sx={{ position: 'absolute', left: u(24), right: u(24), bottom: u(24) }}>
        {panelOpen ? (
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
                autoFocus={typing}
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
            <Box sx={{ display: 'flex', gap: u(10), flexWrap: 'wrap', mt: u(14), alignItems: 'center' }}>
              <Box sx={{ color: 'rgba(255,255,255,0.7)', fontSize: u(24), mr: u(4) }}>Samples:</Box>
              {thriftPlusMockControls.sampleTags().slice(0, 4).map((t) => (
                <ButtonBase
                  key={t.sku}
                  onClick={() => {
                    setTyping(false);
                    onCode(t.sku);
                  }}
                  sx={{ px: u(18), py: u(8), borderRadius: 99, bgcolor: 'rgba(255,255,255,0.14)', color: '#fff', fontSize: u(24) }}
                >
                  {t.title}
                </ButtonBase>
              ))}
            </Box>
            {typing && !noCamera && (
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

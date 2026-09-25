import { useState, type RefObject } from 'react';
import { Box, ButtonBase, CircularProgress, InputBase, Typography } from '@mui/material';
import KeyboardRounded from '@mui/icons-material/KeyboardRounded';
import NoPhotographyRounded from '@mui/icons-material/NoPhotographyRounded';
import PhotoCameraRounded from '@mui/icons-material/PhotoCameraRounded';
import QrCode2Rounded from '@mui/icons-material/QrCode2Rounded';
import { thriftPlusMockControls } from '../../../api/thriftPlusMock';
import type { CameraStatus } from './useQrCamera';
import { sc } from './scannerTheme';

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  status: CameraStatus;
  error: string;
  /** True while an item card sits on top (this card peeks out behind it). */
  underneath: boolean;
  /** Brief green flash on the viewfinder when a code is read. */
  flash: boolean;
  onWake: () => void;
  /** Typed tag number or a sample tag. */
  onCode: (code: string) => void;
}

/**
 * The bottom card of the stack: the live camera. It never unmounts, so when
 * an item card is swiped away the scanner is already running underneath.
 */
export function CameraCard({ videoRef, status, error, underneath, flash, onWake, onCode }: Props) {
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [samples, setSamples] = useState(false);
  const noCamera = status === 'unsupported' || status === 'blocked';

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
        position: 'absolute',
        inset: 0,
        zIndex: 1,
        borderRadius: '22px',
        overflow: 'hidden',
        bgcolor: sc.night,
        border: `2px solid ${sc.cardEdge}`,
        boxShadow: sc.shadow,
        transform: underneath ? 'translate(10px, 12px) scale(0.97)' : 'none',
        transition: 'transform 200ms ease-out',
        pointerEvents: underneath ? 'none' : 'auto',
        containerType: 'size',
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
            width: 'min(62%, 62cqh)',
            aspectRatio: '1 / 1',
            transform: 'translate(-50%, -50%)',
            borderRadius: 3,
            boxShadow: '0 0 0 999px rgba(0,0,0,0.28)',
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
          p: 3,
          color: '#fff',
          pointerEvents: 'none',
        }}
      >
        {status === 'starting' && (
          <>
            <CircularProgress size={34} sx={{ color: '#fff' }} />
            <Typography sx={{ mt: 1.5, fontSize: 16, opacity: 0.85 }}>Starting camera</Typography>
          </>
        )}
        {status === 'resting' && (
          <ButtonBase onClick={onWake} sx={{ pointerEvents: 'auto', flexDirection: 'column', borderRadius: 4, p: 3 }}>
            <PhotoCameraRounded sx={{ fontSize: 56 }} />
            <Typography sx={{ mt: 1, fontSize: 20, fontWeight: 800 }}>Tap to scan</Typography>
            <Typography sx={{ fontSize: 14, opacity: 0.75 }}>The camera rests after 5 quiet minutes.</Typography>
          </ButtonBase>
        )}
        {noCamera && (
          <Box sx={{ pointerEvents: 'auto' }}>
            <NoPhotographyRounded sx={{ fontSize: 48, opacity: 0.8 }} />
            <Typography sx={{ mt: 1, fontSize: 16, opacity: 0.9, maxWidth: 280 }}>
              {status === 'blocked' ? error : 'This browser cannot open the camera here. Type the tag number instead.'}
            </Typography>
            {status === 'blocked' && (
              <ButtonBase
                onClick={onWake}
                sx={{ mt: 1.5, px: 2, py: 1, borderRadius: 99, bgcolor: 'rgba(255,255,255,0.16)', fontWeight: 700 }}
              >
                Try again
              </ButtonBase>
            )}
          </Box>
        )}
      </Box>

      {status === 'live' && !typing && !samples && (
        <Typography
          sx={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 14,
            textAlign: 'center',
            color: '#fff',
            fontSize: 16,
            fontWeight: 600,
            textShadow: '0 1px 4px rgba(0,0,0,0.6)',
          }}
        >
          Point at a price tag
        </Typography>
      )}

      {/* Type a tag number, or try a sample tag (mock). */}
      <Box sx={{ position: 'absolute', left: 12, right: 12, bottom: 12 }}>
        {typing || (noCamera && !samples) ? (
          <Box
            component="form"
            onSubmit={(e) => {
              e.preventDefault();
              submitTyped();
            }}
            sx={{ display: 'flex', gap: 1, bgcolor: '#fff', borderRadius: 99, p: 0.5, pl: 2 }}
          >
            <InputBase
              autoFocus={typing}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Tag number, e.g. ITM0012345"
              inputProps={{ 'aria-label': 'Tag number', autoCapitalize: 'characters', autoCorrect: 'off', spellCheck: false, enterKeyHint: 'search' }}
              sx={{ flex: 1, fontSize: 16 }}
            />
            <ButtonBase
              type="submit"
              sx={{ px: 2, borderRadius: 99, bgcolor: sc.green, color: '#fff', fontWeight: 800, fontSize: 15 }}
            >
              Look up
            </ButtonBase>
          </Box>
        ) : samples ? (
          <Box sx={{ bgcolor: 'rgba(16,21,17,0.86)', borderRadius: 3, p: 1.25 }}>
            <Typography sx={{ color: '#fff', fontSize: 13, opacity: 0.8, mb: 1 }}>Sample tags (mock)</Typography>
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
              {thriftPlusMockControls.sampleTags().map((t) => (
                <ButtonBase
                  key={t.sku}
                  onClick={() => {
                    setSamples(false);
                    onCode(t.sku);
                  }}
                  sx={{ px: 1.25, py: 0.6, borderRadius: 99, bgcolor: 'rgba(255,255,255,0.14)', color: '#fff', fontSize: 13 }}
                >
                  {t.title}
                </ButtonBase>
              ))}
            </Box>
          </Box>
        ) : null}
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: typing || samples || noCamera ? 1 : 0 }}>
          <Pill
            icon={<KeyboardRounded fontSize="small" />}
            label={typing ? 'Use camera' : 'Type tag #'}
            onClick={() => {
              setSamples(false);
              setTyping((v) => !v);
            }}
          />
          <Pill
            icon={<QrCode2Rounded fontSize="small" />}
            label={samples ? 'Close samples' : 'Try a sample'}
            onClick={() => {
              setTyping(false);
              setSamples((v) => !v);
            }}
          />
        </Box>
      </Box>
    </Box>
  );
}

function Pill({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        gap: 0.75,
        px: 1.5,
        py: 0.75,
        borderRadius: 99,
        bgcolor: 'rgba(16,21,17,0.6)',
        border: '1px solid rgba(255,255,255,0.25)',
        color: '#fff',
        fontSize: 14,
        fontWeight: 600,
        backdropFilter: 'blur(6px)',
      }}
    >
      {icon}
      {label}
    </ButtonBase>
  );
}

import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  LinearProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ErrorRounded from '@mui/icons-material/ErrorRounded';
import { BrowserQRCodeReader } from '@zxing/library';
import { FieldSheet } from './FieldSheet';
import {
  ScanDedupe,
  type ScanMismatchInfo,
  cameraErrorMessage,
  describeScanMismatch,
  extractScanErrorDetail,
  extractScanMismatch,
  extractSkuFromScannedPayload,
  readScannerCapabilityEnv,
  resolveScannerMode,
  supportsNativeQrDetector,
  waitForVideoFrames,
} from '../fieldBarcodeScanner';
import { ecoField, ecoFieldPrimaryButtonSx } from '../ecoFieldTheme';

type ScanFeedback =
  | { tone: 'idle'; message: string }
  | { tone: 'checking'; message: string }
  | { tone: 'match'; message: string }
  | { tone: 'mismatch'; message: string };

type NativeBarcodeDetector = {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
};

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  expectedSku?: string;
  scanCount?: number;
  scansRequired?: number;
  verified?: boolean;
  /** True while the server is checking the decoded code. */
  paused?: boolean;
  onScan: (code: string, opts?: { allow_mismatch?: boolean }) => void | Promise<void>;
  /** Skip verification (no SKU / can’t scan). */
  onSkipScan?: () => void;
};

export function FieldBarcodeScannerSheet({
  open,
  onClose,
  title,
  eyebrow = 'Live QR scanner',
  expectedSku,
  scanCount = 0,
  scansRequired = 1,
  verified = false,
  paused = false,
  onScan,
  onSkipScan,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserQRCodeReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopTimerRef = useRef<number | null>(null);
  const dedupeRef = useRef(new ScanDedupe(1400));
  const pausedRef = useRef(paused);
  const typeModeRef = useRef(false);
  const submittingRef = useRef(false);
  const awaitingDecisionRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);
  const expectedSkuRef = useRef(expectedSku);
  const onScanRef = useRef(onScan);
  const scanCountRef = useRef(scanCount);
  const scansRequiredRef = useRef(scansRequired);

  expectedSkuRef.current = expectedSku;
  onScanRef.current = onScan;
  scanCountRef.current = scanCount;
  scansRequiredRef.current = scansRequired;

  const [starting, setStarting] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [mismatch, setMismatch] = useState<ScanMismatchInfo | null>(null);
  const [typeMode, setTypeMode] = useState(false);
  const [typedSku, setTypedSku] = useState('');
  /** Bump to tear down and re-acquire the camera (resume / leave type mode). */
  const [cameraEpoch, setCameraEpoch] = useState(0);
  const [feedback, setFeedback] = useState<ScanFeedback>({
    tone: 'idle',
    message: 'Point the viewfinder at the QR code',
  });
  const verifiedRef = useRef(verified);
  verifiedRef.current = verified;

  pausedRef.current = paused;
  typeModeRef.current = typeMode;

  const restartCamera = () => setCameraEpoch((n) => n + 1);

  const stopLoop = () => {
    if (loopTimerRef.current != null) {
      window.clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
  };

  const cleanupLive = () => {
    stopLoop();
    try {
      readerRef.current?.reset();
    } catch {
      // Ignore teardown races from closing/backgrounding.
    }
    readerRef.current = null;
    const stream = streamRef.current;
    stream?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }
  };

  const resumeAfterDecision = () => {
    awaitingDecisionRef.current = false;
    setMismatch(null);
    dedupeRef.current.clear();
    setFeedback({ tone: 'idle', message: 'Point the viewfinder at the QR code' });
  };

  const acceptDecode = async (raw: string, allowMismatch = false) => {
    const code = extractSkuFromScannedPayload(raw);
    if (!code || pausedRef.current || submittingRef.current) return;
    if (!allowMismatch && awaitingDecisionRef.current) return;
    if (!allowMismatch && !dedupeRef.current.shouldAccept(code)) return;

    submittingRef.current = true;
    setFeedback({ tone: 'checking', message: `Checking ${code}…` });
    try {
      await onScanRef.current(code, { allow_mismatch: allowMismatch });
      const required = scansRequiredRef.current;
      const count = scanCountRef.current;
      setMismatch(null);
      awaitingDecisionRef.current = false;
      setFeedback({
        tone: 'match',
        message:
          required > 1 && count + 1 < required
            ? `Match — scan ${count + 1} of ${required}`
            : `Match — ${code}`,
      });
      window.setTimeout(() => dedupeRef.current.clear(), 500);
    } catch (err) {
      const info = extractScanMismatch(err);
      if (info && !allowMismatch) {
        awaitingDecisionRef.current = true;
        setMismatch(info);
        setFeedback({ tone: 'mismatch', message: describeScanMismatch(info) });
      } else {
        setFeedback({ tone: 'mismatch', message: extractScanErrorDetail(err) });
        window.setTimeout(() => dedupeRef.current.clear(), 900);
      }
    } finally {
      submittingRef.current = false;
    }
  };

  useEffect(() => {
    if (!open) {
      cleanupLive();
      if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
      setStarting(false);
      setCameraError('');
      setMismatch(null);
      setTypeMode(false);
      setTypedSku('');
      awaitingDecisionRef.current = false;
      setFeedback({ tone: 'idle', message: 'Point the viewfinder at the QR code' });
      submittingRef.current = false;
      dedupeRef.current.clear();
      return;
    }

    if (resolveScannerMode(readScannerCapabilityEnv()) !== 'live') {
      setCameraError(
        'Live camera requires HTTPS. Restart with start_mobile_dashboard.bat and open the https phone URL.',
      );
      return;
    }

    // Type-SKU mode keeps the sheet open but must not hold the camera LED on.
    if (typeModeRef.current || verifiedRef.current) {
      cleanupLive();
      return;
    }

    let cancelled = false;
    const start = async () => {
      setStarting(true);
      setCameraError('');
      setMismatch(null);
      awaitingDecisionRef.current = false;
      setFeedback({ tone: 'idle', message: 'Starting rear camera…' });
      cleanupLive();
      try {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        const video = videoRef.current;
        if (cancelled || !video) throw new Error('Video element not ready');

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        video.muted = true;
        await video.play();
        await waitForVideoFrames(video);
        if (cancelled) return;

        const useNative = supportsNativeQrDetector();
        let nativeDetector: NativeBarcodeDetector | null = null;
        if (useNative) {
          const Detector = (
            window as unknown as Window & {
              BarcodeDetector: new (opts: { formats: string[] }) => NativeBarcodeDetector;
            }
          ).BarcodeDetector;
          nativeDetector = new Detector({ formats: ['qr_code'] });
        } else {
          readerRef.current = new BrowserQRCodeReader(120);
        }

        setStarting(false);
        setFeedback({ tone: 'idle', message: 'Point the viewfinder at the QR code' });

        const tick = async () => {
          if (cancelled) return;
          const activeVideo = videoRef.current;
          if (
            activeVideo &&
            !pausedRef.current &&
            !typeModeRef.current &&
            !submittingRef.current &&
            !awaitingDecisionRef.current &&
            activeVideo.videoWidth > 0
          ) {
            try {
              if (nativeDetector) {
                const codes = await nativeDetector.detect(activeVideo);
                const raw = codes.find((c) => c.rawValue)?.rawValue;
                if (raw) await acceptDecode(raw);
              } else if (readerRef.current) {
                const result = readerRef.current.decode(activeVideo);
                if (result) await acceptDecode(result.getText());
              }
            } catch {
              // NotFound / empty frame / transient canvas errors — keep looping.
            }
          }
          if (!cancelled) {
            loopTimerRef.current = window.setTimeout(() => {
              void tick();
            }, 140);
          }
        };
        void tick();
      } catch (err) {
        if (cancelled) return;
        cleanupLive();
        setStarting(false);
        setCameraError(cameraErrorMessage(err));
      }
    };
    void start();

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        cleanupLive();
        return;
      }
      if (
        document.visibilityState === 'visible' &&
        !typeModeRef.current &&
        !verifiedRef.current
      ) {
        restartCamera();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      cleanupLive();
    };
    // cameraEpoch restarts after backgrounding or leaving type mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cameraEpoch]);

  useEffect(() => {
    if (!open || !verified) return;
    setFeedback({ tone: 'match', message: 'Match — item verified' });
    cleanupLive();
    closeTimerRef.current = window.setTimeout(onClose, 850);
    return () => {
      if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
    };
  }, [open, verified, onClose]);

  const overlayBusy =
    starting || paused || feedback.tone === 'checking' || Boolean(mismatch);

  return (
    <FieldSheet open={open} onClose={onClose} eyebrow={eyebrow} title={title}>
      <Stack spacing={1.25}>
        <Stack direction="row" alignItems="baseline" justifyContent="space-between" spacing={1}>
          <Typography variant="body2" fontWeight={700} color="text.secondary">
            {expectedSku ? `Expected · ${expectedSku}` : 'Scan item QR code'}
          </Typography>
          {scansRequired > 1 && (
            <Typography variant="caption" fontWeight={800} color="text.secondary">
              {scanCount} / {scansRequired}
            </Typography>
          )}
        </Stack>

        {scansRequired > 1 && (
          <LinearProgress
            variant="determinate"
            value={scansRequired > 0 ? (scanCount / scansRequired) * 100 : 0}
            sx={{ height: 7, borderRadius: 99 }}
          />
        )}

        <Box
          sx={{
            position: 'relative',
            borderRadius: 2.5,
            overflow: 'hidden',
            bgcolor: '#0B1210',
            aspectRatio: '4 / 3',
          }}
        >
          <Box
            component="video"
            ref={videoRef}
            muted
            playsInline
            autoPlay
            sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
          <Box
            sx={{
              position: 'absolute',
              inset: '18% 14%',
              border: `2px solid ${
                feedback.tone === 'mismatch'
                  ? ecoField.red
                  : feedback.tone === 'match'
                    ? ecoField.greenGlow
                    : '#fff'
              }`,
              borderRadius: 2,
              boxShadow: '0 0 0 999px rgba(0,0,0,.30)',
              pointerEvents: 'none',
              transition: 'border-color 140ms ease',
            }}
          />
          {overlayBusy && !mismatch && (
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                bgcolor: 'rgba(0,0,0,.35)',
              }}
            >
              <CircularProgress size={30} sx={{ color: '#fff' }} />
            </Box>
          )}
        </Box>

        {cameraError ? (
          <Alert severity="error" sx={{ borderRadius: 2 }}>
            {cameraError}
          </Alert>
        ) : mismatch ? (
          <Stack spacing={1.1}>
            <Alert severity="warning" icon={<ErrorRounded />} sx={{ borderRadius: 2 }}>
              <Typography fontWeight={800} sx={{ mb: 0.35 }}>
                Wrong item code
              </Typography>
              <Typography variant="body2" fontWeight={650}>
                {describeScanMismatch(mismatch)}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }} fontWeight={650}>
                Looking for {mismatch.expectedDescription || 'this item'}
                {mismatch.expectedSku ? ` · ${mismatch.expectedSku}` : ''}.
              </Typography>
            </Alert>
            <Button
              fullWidth
              variant="contained"
              onClick={resumeAfterDecision}
              sx={{ ...ecoFieldPrimaryButtonSx, minHeight: 52 }}
            >
              Scan another
            </Button>
            <Button
              fullWidth
              variant="outlined"
              disabled={paused || submittingRef.current}
              onClick={() => {
                void acceptDecode(mismatch.scannedCode, true);
              }}
              sx={{ minHeight: 52, borderRadius: 2, fontWeight: 750 }}
            >
              This is the right ID
            </Button>
          </Stack>
        ) : typeMode ? (
          <Stack spacing={1.1}>
            <TextField
              autoFocus
              fullWidth
              label="Type SKU"
              value={typedSku}
              onChange={(e) => setTypedSku(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && typedSku.trim()) {
                  void acceptDecode(typedSku);
                }
              }}
              slotProps={{
                htmlInput: {
                  enterKeyHint: 'done',
                  autoComplete: 'off',
                  autoCorrect: 'off',
                  spellCheck: false,
                },
              }}
            />
            <Button
              fullWidth
              variant="contained"
              disabled={!typedSku.trim() || paused}
              onClick={() => void acceptDecode(typedSku)}
              sx={{ ...ecoFieldPrimaryButtonSx, minHeight: 52 }}
            >
              Submit SKU
            </Button>
            <Button
              fullWidth
              variant="text"
              onClick={() => {
                setTypeMode(false);
                setTypedSku('');
                setFeedback({ tone: 'idle', message: 'Point the viewfinder at the QR code' });
                restartCamera();
              }}
              sx={{ fontWeight: 750 }}
            >
              Back to camera
            </Button>
          </Stack>
        ) : (
          <Stack spacing={1.1}>
            <Alert
              severity={
                feedback.tone === 'match'
                  ? 'success'
                  : feedback.tone === 'mismatch'
                    ? 'error'
                    : 'info'
              }
              icon={
                feedback.tone === 'match' ? (
                  <CheckCircleRounded />
                ) : feedback.tone === 'mismatch' ? (
                  <ErrorRounded />
                ) : undefined
              }
              sx={{ borderRadius: 2, fontWeight: 700 }}
            >
              {feedback.message}
            </Alert>
            {feedback.tone !== 'match' && feedback.tone !== 'checking' && (
              <Stack direction="row" spacing={1}>
                {onSkipScan && (
                  <Button
                    fullWidth
                    variant="outlined"
                    disabled={paused}
                    onClick={onSkipScan}
                    sx={{ minHeight: 48, borderRadius: 2, fontWeight: 750 }}
                  >
                    No SKU
                  </Button>
                )}
                <Button
                  fullWidth
                  variant="outlined"
                  disabled={paused}
                  onClick={() => {
                    awaitingDecisionRef.current = false;
                    setMismatch(null);
                    cleanupLive();
                    setTypeMode(true);
                    setFeedback({ tone: 'idle', message: 'Type the SKU' });
                  }}
                  sx={{ minHeight: 48, borderRadius: 2, fontWeight: 750 }}
                >
                  Type SKU
                </Button>
              </Stack>
            )}
          </Stack>
        )}
      </Stack>
    </FieldSheet>
  );
}

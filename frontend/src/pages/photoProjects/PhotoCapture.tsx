/**
 * Photo projects, the phone capture loop (owner 2026-11-24): 1) scan the tag (camera or typed), 2) take the photo,
 * add a note if you like, Save. Then it is back to scanning for the next item. Uses the member scanner's camera card.
 */
import { useEffect, useRef, useState } from 'react';
import { Box, Button, CircularProgress, IconButton, Paper, TextField, Typography } from '@mui/material';
import CameraAltRounded from '@mui/icons-material/CameraAltRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import { useSnackbar } from 'notistack';
import { addPhoto, lookupCode } from '../../api/photoProjects.api';
import { CameraCard } from '../thriftplus/scanner/CameraCard';
import { InfoPopup } from '../thriftplus/scanner/Explainers';
import { ScanGate, classifyCode } from '../thriftplus/scanner/scannerLogic';
import { UNIT_CSS, useScannerFonts } from '../thriftplus/scanner/scannerTheme';
import { loadDetector, useQrCamera } from '../thriftplus/scanner/useQrCamera';
import { PhotoInput } from '../studios/social/PhotoLibrary';

interface Scanned {
  key: number;
  code: string;
  title: string | null;
  looking: boolean;
}

export function PhotoCapture({ projectId, projectName, count, onClose, onSaved }: {
  projectId: number;
  projectName: string;
  count: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  useScannerFonts();
  const { enqueueSnackbar } = useSnackbar();
  const [scanned, setScanned] = useState<Scanned | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [help, setHelp] = useState(false);
  const [flash, setFlash] = useState(false);
  const gate = useRef(new ScanGate(2000));
  const scannedRef = useRef<Scanned | null>(null);
  scannedRef.current = scanned;
  const camera = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadDetector().catch(() => undefined);
  }, []);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const handleRef = useRef<(raw: string, from: 'camera' | 'typed', format?: string) => void>(() => undefined);
  const cam = useQrCamera({
    enabled: true,
    paused: !!scanned || help,
    onDecode: (raw, format) => handleRef.current(raw, 'camera', format),
  });

  const start = (code: string) => {
    navigator.vibrate?.(15);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 260);
    const key = Date.now();
    setScanned({ key, code, title: null, looking: !!code });
    if (!code) return;
    lookupCode(code)
      .then((r) => setScanned((s) => (s && s.key === key ? { ...s, looking: false, title: r.found ? `${r.sku} · ${r.title}` : null } : s)))
      .catch(() => setScanned((s) => (s && s.key === key ? { ...s, looking: false } : s)));
  };

  handleRef.current = (raw, from, format) => {
    cam.poke();
    if (scannedRef.current) return;
    const code = classifyCode(raw, format);
    const text = raw.trim();
    const value = code.kind === 'tag' ? code.sku : text.toUpperCase();
    if (from === 'camera' && !gate.current.accept(value)) return;
    start(value);
  };

  const reset = () => {
    const s = scannedRef.current;
    if (s?.code) gate.current.ignore(s.code, 3000);
    setScanned(null);
    setFile(null);
    setPreview(null);
    setNote('');
    cam.poke();
  };

  const pick = (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const save = async () => {
    if (!file || !scanned) return;
    setSaving(true);
    try {
      await addPhoto(projectId, file, scanned.code, note);
      enqueueSnackbar('Saved', { variant: 'success', autoHideDuration: 1200 });
      onSaved();
      reset();
    } catch {
      enqueueSnackbar('Could not save the photo. Check the signal and try again.', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box
      data-testid="photo-capture"
      sx={{ position: 'fixed', inset: 0, zIndex: 1300, display: 'flex', justifyContent: 'center', bgcolor: '#e6e7e1', '--u': UNIT_CSS }}
    >
      <Box sx={{ position: 'relative', width: '100%', maxWidth: 480, height: '100%', display: 'flex', flexDirection: 'column', p: 1.5, gap: 1.25 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography noWrap sx={{ fontWeight: 800, fontSize: 18, color: '#1b5e20' }}>{projectName}</Typography>
            <Typography sx={{ fontSize: 13 }}>{count} photo{count === 1 ? '' : 's'} · {scanned ? '2. Take the photo' : '1. Scan the tag'}</Typography>
          </Box>
          <IconButton aria-label="Close" onClick={onClose}><CloseRounded /></IconButton>
        </Box>
        <Box sx={{ position: 'relative', flex: 1, minHeight: 0 }}>
          <CameraCard
            videoRef={cam.videoRef}
            status={cam.status}
            error={cam.error}
            zoom={cam.zoom}
            switching={cam.switching}
            underneath={false}
            flash={flash}
            onWake={cam.wake}
            onRestart={cam.restart}
            onCode={(code) => handleRef.current(code, 'typed')}
            onHelp={() => setHelp(true)}
          />
          {!scanned ? (
            <Button
              size="small"
              onClick={() => start('')}
              sx={{ position: 'absolute', right: 8, top: 8, zIndex: 4, bgcolor: 'rgba(255,255,255,0.9)', '&:hover': { bgcolor: '#fff' } }}
            >
              No tag
            </Button>
          ) : null}
          {scanned ? (
            <Paper elevation={6} sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 5, maxHeight: '100%', overflowY: 'auto', p: 1.75, borderRadius: '16px' }}>
              <Typography sx={{ fontWeight: 800, fontSize: 16 }}>
                {scanned.code ? (scanned.looking ? `Tag ${scanned.code}` : scanned.title ?? `Tag ${scanned.code} (not found, saved as typed)`) : 'No tag'}
              </Typography>
              {preview ? (
                <Box component="img" src={preview} alt="" sx={{ display: 'block', width: '100%', maxHeight: 260, objectFit: 'contain', borderRadius: '8px', mt: 1, bgcolor: '#f3f3f3' }} />
              ) : null}
              <Button
                fullWidth
                size="large"
                variant={file ? 'outlined' : 'contained'}
                startIcon={<CameraAltRounded />}
                onClick={() => camera.current?.click()}
                sx={{ mt: 1.25 }}
              >
                {file ? 'Retake photo' : 'Take photo'}
              </Button>
              <PhotoInput ref={camera} onFiles={pick} />
              <TextField
                fullWidth
                size="small"
                label="Note (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                multiline
                maxRows={3}
                sx={{ mt: 1.25 }}
              />
              <Button
                fullWidth
                size="large"
                variant="contained"
                disabled={!file || saving}
                startIcon={saving ? <CircularProgress size={18} color="inherit" /> : undefined}
                onClick={save}
                sx={{ mt: 1.25 }}
              >
                Save and scan next
              </Button>
              <Button fullWidth onClick={reset} sx={{ mt: 0.5 }}>Cancel</Button>
            </Paper>
          ) : null}
        </Box>
        {help && <InfoPopup topic="camera" origin={null} onClose={() => setHelp(false)} onRetryCamera={cam.wake} />}
      </Box>
    </Box>
  );
}

/**
 * Social Studio, the Scan tab (owner 2026-10-22, F7: "on scan a tag this should pop up the camera like the scanner
 * app does"). The member scanner's camera card (with its "Type tag #" box) reads the tag; the item's tag facts come
 * from `/api/marketing/tag/<sku>/` (price, retail only when it passed the check, today's ThriftBucks, 3-day returns
 * or AS IS). Take photos of it and they go in the library with the item, tag on; one more tap puts them in today's
 * post. Phone first: a desk has the Photos page, where the tag can be typed.
 */
import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Paper, Typography } from '@mui/material';
import CameraAltRounded from '@mui/icons-material/CameraAltRounded';
import QrCodeScannerRounded from '@mui/icons-material/QrCodeScannerRounded';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  getTodaysPost,
  lookupSocialTag,
  setSocialPostPhotos,
  uploadSocialPhotos,
  type SocialPhoto,
  type SocialTagLookup,
} from '../../../api/marketing.api';
import { ccTokens } from '../../../theme';
import { CameraCard } from '../../thriftplus/scanner/CameraCard';
import { InfoPopup } from '../../thriftplus/scanner/Explainers';
import { ScanGate, classifyCode } from '../../thriftplus/scanner/scannerLogic';
import { UNIT_CSS, useScannerFonts } from '../../thriftplus/scanner/scannerTheme';
import { loadDetector, useQrCamera } from '../../thriftplus/scanner/useQrCamera';
import { PhotoInput } from './PhotoLibrary';
import { tagWords } from './tagOverlay';

/** Scan again ignores the same code this long (as the member scanner). */
const SCAN_AGAIN_IGNORE_MS = 3000;

interface Top {
  key: number;
  sku: string;
  gateKey: string;
  lookup: SocialTagLookup | null;
  error: boolean;
  /** The code was not one of our tags. */
  notOurs: boolean;
}

function errorText(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
}

function TagFacts({ lookup }: { lookup: Extract<SocialTagLookup, { status: 'found' }> }) {
  const words = tagWords(lookup.item);
  return (
    <Box>
      <Typography sx={{ fontWeight: 800, fontSize: 18, lineHeight: 1.2 }}>{lookup.item.title}</Typography>
      <Typography sx={{ fontSize: 13, color: ccTokens.ink3, mb: 0.75 }}>{lookup.item.sku}</Typography>
      {words.retail ? <Typography sx={{ fontSize: 14, color: ccTokens.ink3, textDecoration: 'line-through' }}>{words.retail}</Typography> : null}
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: 34, fontWeight: 800, color: '#1b5e20', lineHeight: 1.1 }}>{words.price}</Typography>
        <Chip size="small" label={words.returns} sx={{ fontWeight: 800, bgcolor: lookup.item.returnable ? '#1b5e20' : '#222', color: '#fff' }} />
      </Box>
      {words.bucks ? (
        <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#2e7d32', mt: 0.5 }}>{words.bucks} {words.bucksFor}</Typography>
      ) : null}
      {!lookup.item.available ? <Alert severity="warning" sx={{ mt: 1, py: 0 }}>This item is sold or off the floor.</Alert> : null}
    </Box>
  );
}

export default function SocialScanPage() {
  useScannerFonts();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [top, setTop] = useState<Top | null>(null);
  const [taken, setTaken] = useState<SocialPhoto[]>([]);
  const [help, setHelp] = useState(false);
  const [flash, setFlash] = useState(false);
  const gate = useRef(new ScanGate(2000));
  const topRef = useRef<Top | null>(null);
  topRef.current = top;
  const camera = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadDetector().catch(() => undefined);
  }, []);

  const today = useQuery({ queryKey: ['marketing', 'today'], queryFn: getTodaysPost });
  const todayPost = today.data?.post ?? null;

  const handleRef = useRef<(raw: string, from: 'camera' | 'typed', format?: string) => void>(() => undefined);
  const cam = useQrCamera({
    enabled: true,
    paused: !!top || help,
    onDecode: (raw, format) => handleRef.current(raw, 'camera', format),
  });

  handleRef.current = (raw, from, format) => {
    cam.poke();
    if (topRef.current) return;
    const code = classifyCode(raw, format);
    const text = raw.trim();
    const sku = code.kind === 'tag' ? code.sku : text.toUpperCase();
    const gateKey = code.kind === 'tag' ? code.sku : `raw:${text}`;
    if (from === 'camera' && !gate.current.accept(gateKey)) return;
    navigator.vibrate?.(15);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 260);
    const key = Date.now();
    setTaken([]);
    // A typed number is tried as a tag; a camera code that is not one of ours is named, not looked up.
    const notOurs = from === 'camera' && code.kind !== 'tag';
    setTop({ key, sku, gateKey, lookup: null, error: false, notOurs });
    if (notOurs) return;
    lookupSocialTag(sku)
      .then((lookup) => setTop((t) => (t && t.key === key ? { ...t, lookup } : t)))
      .catch(() => setTop((t) => (t && t.key === key ? { ...t, error: true } : t)));
  };

  const scanAgain = () => {
    const t = topRef.current;
    if (t) gate.current.ignore(t.gateKey, SCAN_AGAIN_IGNORE_MS);
    setTop(null);
    setTaken([]);
    cam.poke();
  };

  const upload = useMutation({
    mutationFn: (files: File[]) => uploadSocialPhotos(files, { sku: top?.sku ?? '' }),
    onSuccess: (res) => {
      setTaken((prev) => [...prev, ...res.photos]);
      queryClient.invalidateQueries({ queryKey: ['marketing', 'photos'] });
      if (res.failed.length) enqueueSnackbar(`${res.failed.length} could not be read: ${res.failed[0].detail}`, { variant: 'warning' });
    },
    onError: (err) => enqueueSnackbar(errorText(err, 'Could not upload.'), { variant: 'error' }),
  });

  const addToToday = useMutation({
    mutationFn: () => {
      if (!todayPost) throw new Error('No post today.');
      const ids = [...todayPost.photo_ids, ...taken.map((p) => p.id).filter((id) => !todayPost.photo_ids.includes(id))];
      return setSocialPostPhotos(todayPost.id, ids);
    },
    onSuccess: () => {
      enqueueSnackbar("Added to today's post", { variant: 'success' });
      queryClient.invalidateQueries({ queryKey: ['marketing'] });
      scanAgain();
    },
    onError: (err) => enqueueSnackbar(errorText(err, "Could not add them to today's post."), { variant: 'error' }),
  });

  const found = top?.lookup?.status === 'found' ? top.lookup : null;
  const canAddToday = Boolean(todayPost && todayPost.status !== 'posted' && taken.length);

  return (
    <Box data-testid="social-scan" sx={{ height: '100%', display: 'flex', justifyContent: 'center', bgcolor: '#e6e7e1', overflow: 'hidden', '--u': UNIT_CSS }}>
      <Box sx={{ position: 'relative', width: '100%', maxWidth: 480, height: '100%', display: 'flex', flexDirection: 'column', p: 1.5, gap: 1.25 }}>
        <Box sx={{ flexShrink: 0 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 20, color: '#1b5e20' }}>Scan a tag</Typography>
          <Typography sx={{ fontSize: 13.5, color: ccTokens.ink2 }}>Then take photos of the item. Its price and tag go on the photos.</Typography>
        </Box>
        <Box data-testid="stage" sx={{ position: 'relative', flex: 1, minHeight: 0 }}>
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
          {top ? (
            <Paper
              elevation={6}
              data-testid="social-scan-card"
              sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 5, maxHeight: '100%', overflowY: 'auto', p: 1.75, borderRadius: '16px' }}
            >
              {top.notOurs ? (
                <Typography>That is not one of our tags. Scan the tag on the item.</Typography>
              ) : top.error ? (
                <Typography>Could not reach the store. Check the signal and scan again.</Typography>
              ) : !top.lookup ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress /></Box>
              ) : !found ? (
                <Typography>We can't find tag {top.sku}. Check the number and scan again.</Typography>
              ) : (
                <>
                  <TagFacts lookup={found} />
                  {taken.length ? (
                    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1.25 }}>
                      {taken.map((p) => (
                        <Box key={p.id} component="img" src={p.thumb_url ?? undefined} alt="" sx={{ width: 64, height: 64, objectFit: 'cover', borderRadius: '8px' }} />
                      ))}
                    </Box>
                  ) : null}
                  <Button
                    fullWidth
                    size="large"
                    variant={taken.length ? 'outlined' : 'contained'}
                    startIcon={upload.isPending ? <CircularProgress size={18} color="inherit" /> : <CameraAltRounded />}
                    disabled={upload.isPending}
                    onClick={() => camera.current?.click()}
                    sx={{ mt: 1.5 }}
                  >
                    {taken.length ? 'Take more photos' : 'Take photos of it'}
                  </Button>
                  <PhotoInput ref={camera} onFiles={(files) => upload.mutate(files)} />
                  {taken.length ? (
                    <Typography sx={{ fontSize: 13, color: ccTokens.ink2, mt: 1 }}>
                      {taken.length} photo{taken.length === 1 ? '' : 's'} in the library with the tag on.
                    </Typography>
                  ) : null}
                  {canAddToday ? (
                    <Button fullWidth size="large" variant="contained" disabled={addToToday.isPending} onClick={() => addToToday.mutate()} sx={{ mt: 1 }}>
                      Add to today's post
                    </Button>
                  ) : null}
                </>
              )}
              <Button fullWidth startIcon={<QrCodeScannerRounded />} onClick={scanAgain} sx={{ mt: 1 }} data-testid="social-scan-again">
                Scan another
              </Button>
            </Paper>
          ) : null}
        </Box>
        {help && <InfoPopup topic="camera" origin={null} onClose={() => setHelp(false)} onRetryCamera={cam.wake} />}
      </Box>
    </Box>
  );
}

/**
 * Post it (owner call F5: copy and paste until the Meta API). The photos are drawn as they go out (tag overlays) the
 * moment it opens.
 *
 * - **Phone:** one tap copies the text and hands every photo to the share sheet (then the Facebook or Instagram app).
 * - **Desk** (owner 2026-10-22, "a drawer we can select all photos and drag into the facebook screen"): a drawer on the
 *   right, no backdrop, so Facebook can sit beside it. Copy the text; then the photos: drag one out, Copy one (paste it
 *   into the Facebook post with Ctrl+V), or tick them and Download.
 *
 * Both end with the Facebook link, which marks the post Posted.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  IconButton,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import { useMutation } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { markSocialPostPosted, type SocialPostDetail } from '../../../api/marketing.api';
import { ccTokens } from '../../../theme';
import { usePhotoImages, useTagAssets } from './TagPhoto';
import { renderTagJpeg } from './tagOverlay';

type ApiError = { response?: { data?: { detail?: string } } };

function errorText(err: unknown, fallback: string): string {
  const detail = (err as ApiError)?.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
}

/** The post's photos drawn as they go out, as files (null while drawing). */
function useRenderedPhotos(post: SocialPostDetail): { files: File[] | null; failed: string } {
  const images = usePhotoImages(post.photos);
  const { logo, ready: assetsReady } = useTagAssets();
  const [files, setFiles] = useState<File[] | null>(null);
  const [failed, setFailed] = useState('');
  const ready = assetsReady && post.photos.every((p) => images.has(p.id));
  useEffect(() => {
    if (!ready || files) return;
    let alive = true;
    (async () => {
      const out: File[] = [];
      for (let i = 0; i < post.photos.length; i += 1) {
        const photo = post.photos[i];
        const blob = await renderTagJpeg({
          size: post.size,
          photo: images.get(photo.id) ?? null,
          tag: photo.tag,
          overlay: photo.tag_overlay,
          corner: photo.tag_corner,
          logo,
        });
        out.push(new File([blob], `ecothrift-${post.slot_date}-${i + 1}.jpg`, { type: 'image/jpeg' }));
      }
      if (alive) setFiles(out);
    })().catch((err) => { if (alive) setFailed(err instanceof Error ? err.message : 'Could not draw the photos.'); });
    return () => { alive = false; };
  }, [ready, files, post, images, logo]);
  return { files, failed };
}

function download(files: File[]) {
  files.forEach((file) => {
    const href = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = href;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 4000);
  });
}

/** Copy one photo for pasting (browsers take PNG on the clipboard). */
async function copyPhoto(file: File): Promise<void> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
  const png = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not copy the photo.'))), 'image/png');
  });
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
}

function PostedLink({ post, onPosted, primary }: { post: SocialPostDetail; onPosted: () => void; primary: boolean }) {
  const { enqueueSnackbar } = useSnackbar();
  const [url, setUrl] = useState('');
  const posted = useMutation({
    mutationFn: () => markSocialPostPosted(post.id, url.trim()),
    onSuccess: () => { enqueueSnackbar('Posted. Nice work.', { variant: 'success' }); onPosted(); },
    onError: (err) => enqueueSnackbar(errorText(err, 'Could not mark it posted.'), { variant: 'error' }),
  });
  return (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
      <TextField
        size="small"
        fullWidth
        placeholder="https://www.facebook.com/…"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        slotProps={{ htmlInput: { inputMode: 'url' } }}
      />
      <Button
        variant={primary ? 'contained' : 'outlined'}
        disabled={!url.trim() || posted.isPending}
        onClick={() => posted.mutate()}
        sx={{ flex: { xs: '1 1 100%', sm: '0 0 auto' }, whiteSpace: 'nowrap' }}
      >
        Mark posted
      </Button>
    </Box>
  );
}

function PhoneSheet({ post, onClose, onPosted }: { post: SocialPostDetail; onClose: () => void; onPosted: () => void }) {
  const { enqueueSnackbar } = useSnackbar();
  const { files, failed } = useRenderedPhotos(post);
  const [sent, setSent] = useState(false);
  const n = post.photos.length;

  const copyAndShare = () => {
    if (!files) return;
    // Both start inside the tap: browsers only allow the clipboard and the share sheet right after one.
    const copied = navigator.clipboard?.writeText(post.text).then(() => true).catch(() => false) ?? Promise.resolve(false);
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    const shared = nav.canShare && nav.canShare({ files })
      ? nav.share({ files }).then(() => true).catch(() => false)
      : Promise.resolve(false);
    shared.then((ok) => { if (!ok) download(files); });
    copied.then((ok) => {
      setSent(true);
      enqueueSnackbar(ok ? 'Text copied. Paste it into the Facebook post.' : 'Copy the text below by hand.', { variant: ok ? 'success' : 'warning' });
    });
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Post it</DialogTitle>
      <DialogContent dividers>
        {failed ? <Alert severity="error" sx={{ mb: 1.5 }}>{failed}</Alert> : null}
        <Typography sx={{ fontWeight: 700, mb: 0.75 }}>1. Copy the text and save the {n} photo{n === 1 ? '' : 's'}</Typography>
        <Button
          fullWidth
          size="large"
          variant="contained"
          disabled={!files}
          startIcon={files ? null : <CircularProgress size={18} color="inherit" />}
          onClick={copyAndShare}
        >
          {files ? 'Copy text + save photos' : 'Drawing the photos…'}
        </Button>
        <Typography sx={{ fontWeight: 700, mt: 2, mb: 0.75 }}>2. On Facebook: new post, add the photos, paste the text</Typography>
        <TextField multiline fullWidth minRows={4} maxRows={10} value={post.text} slotProps={{ input: { readOnly: true } }} size="small" />
        <Typography sx={{ fontWeight: 700, mt: 2, mb: 0.75 }}>3. Paste the link to the post</Typography>
        <PostedLink post={post} onPosted={onPosted} primary={sent} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

function DeskDrawer({ post, onClose, onPosted }: { post: SocialPostDetail; onClose: () => void; onPosted: () => void }) {
  const { enqueueSnackbar } = useSnackbar();
  const { files, failed } = useRenderedPhotos(post);
  const urls = useMemo(() => (files ?? []).map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  const [picked, setPicked] = useState<boolean[]>([]);
  useEffect(() => { if (files) setPicked(files.map(() => true)); }, [files]);
  const chosen = (files ?? []).filter((_f, i) => picked[i]);

  const copyText = () => {
    navigator.clipboard?.writeText(post.text)
      .then(() => enqueueSnackbar('Text copied. Paste it into the Facebook post.', { variant: 'success' }))
      .catch(() => enqueueSnackbar('Copy the text by hand.', { variant: 'warning' }));
  };

  return (
    <Drawer
      anchor="right"
      open
      onClose={onClose}
      hideBackdrop
      ModalProps={{ disableEnforceFocus: true, disableScrollLock: true }}
      slotProps={{ paper: { sx: { width: 420, maxWidth: '100vw', p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 } } }}
      sx={{ pointerEvents: 'none', '& .MuiDrawer-paper': { pointerEvents: 'auto' } }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <Typography sx={{ fontWeight: 800, fontSize: 18, flex: 1 }}>Post it</Typography>
        <IconButton aria-label="Close" onClick={onClose}><CloseRounded /></IconButton>
      </Box>
      <Typography sx={{ fontSize: 13, color: ccTokens.ink2 }}>
        Open Facebook beside this drawer. Copy the text, then bring the photos over: drag them, copy one at a time, or
        download the ones ticked.
      </Typography>
      {failed ? <Alert severity="error">{failed}</Alert> : null}
      <Box>
        <Typography sx={{ fontWeight: 700, mb: 0.75 }}>1. The text</Typography>
        <Button fullWidth variant="contained" startIcon={<ContentCopyRounded />} onClick={copyText}>Copy text</Button>
        <TextField multiline fullWidth minRows={3} maxRows={6} value={post.text} slotProps={{ input: { readOnly: true } }} size="small" sx={{ mt: 1 }} />
      </Box>
      <Box sx={{ minHeight: 0, flex: 1, overflowY: 'auto' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.75 }}>
          <Typography sx={{ fontWeight: 700, flex: 1 }}>2. The photos</Typography>
          <Button size="small" disabled={!files} onClick={() => setPicked((p) => p.map(() => !p.every(Boolean)))}>
            {picked.every(Boolean) ? 'Untick all' : 'Tick all'}
          </Button>
          <Button size="small" startIcon={<DownloadRounded />} disabled={!chosen.length} onClick={() => download(chosen)}>
            Download {chosen.length || ''}
          </Button>
        </Box>
        {!files ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}><CircularProgress size={18} /> Drawing the photos…</Box>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
            {files.map((file, i) => (
              <Box key={file.name} sx={{ position: 'relative' }}>
                <Box
                  component="img"
                  src={urls[i]}
                  alt={`Photo ${i + 1}`}
                  draggable
                  onDragStart={(e: React.DragEvent) => {
                    // Chrome: dropping on the desktop or a folder saves the file; Facebook takes the dragged picture.
                    e.dataTransfer.setData('DownloadURL', `image/jpeg:${file.name}:${urls[i]}`);
                  }}
                  sx={{ width: '100%', display: 'block', borderRadius: '8px', cursor: 'grab', outline: picked[i] ? '3px solid #2e7d32' : 'none' }}
                />
                <Checkbox
                  size="small"
                  checked={Boolean(picked[i])}
                  onChange={(e) => setPicked((p) => p.map((v, j) => (j === i ? e.target.checked : v)))}
                  inputProps={{ 'aria-label': `Tick photo ${i + 1}` }}
                  sx={{ position: 'absolute', top: 2, left: 2, bgcolor: 'rgba(255,255,255,.85)', p: 0.25, '&:hover': { bgcolor: '#fff' } }}
                />
                <Tooltip title="Copy, then paste into Facebook">
                  <IconButton
                    size="small"
                    aria-label={`Copy photo ${i + 1}`}
                    onClick={() => copyPhoto(file)
                      .then(() => enqueueSnackbar(`Photo ${i + 1} copied. Paste it into the post.`, { variant: 'success' }))
                      .catch(() => enqueueSnackbar('This browser cannot copy photos. Drag or download it.', { variant: 'warning' }))}
                    sx={{ position: 'absolute', top: 2, right: 2, bgcolor: 'rgba(255,255,255,.85)', '&:hover': { bgcolor: '#fff' } }}
                  >
                    <ContentCopyRounded sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            ))}
          </Box>
        )}
      </Box>
      <Box>
        <Typography sx={{ fontWeight: 700, mb: 0.75 }}>3. Paste the link to the post</Typography>
        <PostedLink post={post} onPosted={onPosted} primary />
      </Box>
    </Drawer>
  );
}

export default function PostIt({ post, desk, onClose, onPosted }: {
  post: SocialPostDetail;
  desk: boolean;
  onClose: () => void;
  onPosted: () => void;
}) {
  return desk
    ? <DeskDrawer post={post} onClose={onClose} onPosted={onPosted} />
    : <PhoneSheet post={post} onClose={onClose} onPosted={onPosted} />;
}

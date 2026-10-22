/**
 * Post it (owner call F5: copy and paste until the Meta API). Phase 6: one post, every channel that is on
 * (`post.channels`: Facebook, then Instagram, Google Business Profile, Nextdoor, TikTok as the owner turns them on).
 * Pick a channel: its own words, its how-to line, the photos drawn at its size (tag overlays; Instagram also offers
 * 9:16 for a Story), and its link. Posting one moves on to the next channel not yet posted.
 *
 * - **Phone:** one tap copies the channel's text and hands every photo to the share sheet (then that app).
 * - **Desk** (owner 2026-10-22, "a drawer we can select all photos and drag into the facebook screen"): a drawer on the
 *   right, no backdrop, so the channel's site can sit beside it. Copy the text; then the photos: drag one out, Copy one
 *   (paste it with Ctrl+V), or tick them and Download.
 *
 * Facebook's link marks the post itself Posted (and closes the day's Today's post routine).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  IconButton,
  Link,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import { useMutation } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  markChannelPosted,
  type PhotoSize,
  type PostChannel,
  type SocialChannel,
  type SocialPostDetail,
} from '../../../api/marketing.api';
import { ccTokens } from '../../../theme';
import { usePhotoImages, useTagAssets } from './TagPhoto';
import { renderTagJpeg } from './tagOverlay';

type ApiError = { response?: { data?: { detail?: string } } };

function errorText(err: unknown, fallback: string): string {
  const detail = (err as ApiError)?.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
}

const URL_HINTS: Record<SocialChannel, string> = {
  facebook: 'https://www.facebook.com/…',
  instagram: 'https://www.instagram.com/p/…',
  google: 'The post\'s link on Google (Share → Copy link)',
  nextdoor: 'https://nextdoor.com/…',
  tiktok: 'https://www.tiktok.com/@…',
};

const SIZE_LABELS: Record<PhotoSize, string> = { '4:5': 'Feed 4:5', '1:1': 'Square 1:1', '9:16': 'Story 9:16', '4:3': '4:3' };

/** The channel to open on: the first not posted yet, else Facebook. */
export function firstOpenChannel(channels: PostChannel[]): PostChannel | undefined {
  return channels.find((c) => !c.posted_url) ?? channels[0];
}

/** The post's photos drawn at `size` as they go out, as files (null while drawing). */
function useRenderedPhotos(post: SocialPostDetail, size: PhotoSize): { files: File[] | null; failed: string } {
  const images = usePhotoImages(post.photos);
  const { logo, ready: assetsReady } = useTagAssets();
  const [drawn, setDrawn] = useState<{ size: PhotoSize; files: File[] } | null>(null);
  const [failed, setFailed] = useState('');
  const ready = assetsReady && post.photos.every((p) => images.has(p.id));
  const files = drawn && drawn.size === size ? drawn.files : null;
  useEffect(() => {
    if (!ready || files) return;
    let alive = true;
    (async () => {
      const out: File[] = [];
      for (let i = 0; i < post.photos.length; i += 1) {
        const photo = post.photos[i];
        const blob = await renderTagJpeg({
          size,
          photo: images.get(photo.id) ?? null,
          tag: photo.tag,
          overlay: photo.tag_overlay,
          corner: photo.tag_corner,
          logo,
        });
        out.push(new File([blob], `ecothrift-${post.slot_date}-${size.replace(':', 'x')}-${i + 1}.jpg`, { type: 'image/jpeg' }));
      }
      if (alive) setDrawn({ size, files: out });
    })().catch((err) => { if (alive) setFailed(err instanceof Error ? err.message : 'Could not draw the photos.'); });
    return () => { alive = false; };
  }, [ready, files, post, images, logo, size]);
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

/** The channels as chips; a posted one carries a check. */
function ChannelPicker({ channels, value, onChange }: { channels: PostChannel[]; value: SocialChannel; onChange: (key: SocialChannel) => void }) {
  if (channels.length < 2) return null;
  return (
    <Box role="group" aria-label="Channel" sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
      {channels.map((c) => (
        <Chip
          key={c.key}
          label={c.label}
          icon={c.posted_url ? <CheckCircleRounded /> : undefined}
          color={c.key === value ? 'primary' : 'default'}
          variant={c.key === value ? 'filled' : 'outlined'}
          onClick={() => onChange(c.key)}
          aria-pressed={c.key === value}
        />
      ))}
    </Box>
  );
}

function SizePicker({ channel, size, onChange }: { channel: PostChannel; size: PhotoSize; onChange: (s: PhotoSize) => void }) {
  if (channel.sizes.length < 2) return null;
  return (
    <ToggleButtonGroup exclusive size="small" value={size} onChange={(_e, v: PhotoSize | null) => v && onChange(v)} aria-label="Photo size">
      {channel.sizes.map((s) => <ToggleButton key={s} value={s} sx={{ textTransform: 'none' }}>{SIZE_LABELS[s]}</ToggleButton>)}
    </ToggleButtonGroup>
  );
}

function PostedLink({ post, channel, onPosted, primary }: {
  post: SocialPostDetail;
  channel: PostChannel;
  onPosted: (next: SocialPostDetail, channel: SocialChannel) => void;
  primary: boolean;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const [url, setUrl] = useState('');
  useEffect(() => setUrl(''), [channel.key]);
  const posted = useMutation({
    mutationFn: () => markChannelPosted(post.id, channel.key, url.trim()),
    onSuccess: (next) => { enqueueSnackbar(`Posted on ${channel.label}. Nice work.`, { variant: 'success' }); onPosted(next, channel.key); },
    onError: (err) => enqueueSnackbar(errorText(err, 'Could not mark it posted.'), { variant: 'error' }),
  });
  if (channel.posted_url) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <CheckCircleRounded sx={{ color: 'primary.main', fontSize: 20 }} />
        <Typography sx={{ fontSize: 14 }}>
          Posted{channel.posted_by_name ? ` by ${channel.posted_by_name}` : ''}:{' '}
          <Link href={channel.posted_url} target="_blank" rel="noopener" sx={{ overflowWrap: 'anywhere' }}>{channel.posted_url}</Link>
        </Typography>
      </Box>
    );
  }
  return (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
      <TextField
        size="small"
        fullWidth
        placeholder={URL_HINTS[channel.key]}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        slotProps={{ htmlInput: { inputMode: 'url', 'aria-label': `Link to the post on ${channel.label}` } }}
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

type SheetProps = {
  post: SocialPostDetail;
  onClose: () => void;
  onPosted: (next: SocialPostDetail, channel: SocialChannel) => void;
};

/** The chosen channel and size, moving on to the next open channel after one is posted. */
function useChannel(post: SocialPostDetail) {
  const [key, setKey] = useState<SocialChannel>(() => firstOpenChannel(post.channels)?.key ?? 'facebook');
  const channel = post.channels.find((c) => c.key === key) ?? post.channels[0];
  const [size, setSize] = useState<PhotoSize>(channel?.sizes[0] ?? post.size);
  const pick = (next: SocialChannel) => {
    setKey(next);
    const c = post.channels.find((x) => x.key === next);
    if (c) setSize(c.sizes[0]);
  };
  const onPostedMove = (next: SocialPostDetail) => {
    const open = next.channels.find((c) => !c.posted_url);
    if (open) pick(open.key);
  };
  return { channel, size, setSize, pick, onPostedMove };
}

function PhoneSheet({ post, onClose, onPosted }: SheetProps) {
  const { enqueueSnackbar } = useSnackbar();
  const { channel, size, setSize, pick, onPostedMove } = useChannel(post);
  const { files, failed } = useRenderedPhotos(post, size);
  const [sent, setSent] = useState(false);
  const n = post.photos.length;
  if (!channel) return null;

  const copyAndShare = () => {
    if (!files) return;
    // Both start inside the tap: browsers only allow the clipboard and the share sheet right after one.
    const copied = navigator.clipboard?.writeText(channel.text).then(() => true).catch(() => false) ?? Promise.resolve(false);
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    const shared = nav.canShare && nav.canShare({ files })
      ? nav.share({ files }).then(() => true).catch(() => false)
      : Promise.resolve(false);
    shared.then((ok) => { if (!ok) download(files); });
    copied.then((ok) => {
      setSent(true);
      enqueueSnackbar(ok ? `Text copied. Paste it into ${channel.label}.` : 'Copy the text below by hand.', { variant: ok ? 'success' : 'warning' });
    });
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Post it</DialogTitle>
      <DialogContent dividers>
        <ChannelPicker channels={post.channels} value={channel.key} onChange={(k) => { pick(k); setSent(false); }} />
        <Typography sx={{ fontSize: 13, color: ccTokens.ink2, mt: 1 }}>{channel.how}</Typography>
        {failed ? <Alert severity="error" sx={{ my: 1.5 }}>{failed}</Alert> : null}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 1.5, mb: 0.75 }}>
          <Typography sx={{ fontWeight: 700, flex: 1 }}>1. Copy the text and save the {n} photo{n === 1 ? '' : 's'}</Typography>
          <SizePicker channel={channel} size={size} onChange={setSize} />
        </Box>
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
        <Typography sx={{ fontWeight: 700, mt: 2, mb: 0.75 }}>2. On {channel.label}: add the photos, paste the text</Typography>
        <TextField multiline fullWidth minRows={4} maxRows={10} value={channel.text} slotProps={{ input: { readOnly: true } }} size="small" />
        <Typography sx={{ fontWeight: 700, mt: 2, mb: 0.75 }}>3. Paste the link to the post</Typography>
        <PostedLink post={post} channel={channel} primary={sent} onPosted={(next, k) => { onPosted(next, k); onPostedMove(next); setSent(false); }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

function DeskDrawer({ post, onClose, onPosted }: SheetProps) {
  const { enqueueSnackbar } = useSnackbar();
  const { channel, size, setSize, pick, onPostedMove } = useChannel(post);
  const { files, failed } = useRenderedPhotos(post, size);
  const urls = useMemo(() => (files ?? []).map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  const [picked, setPicked] = useState<boolean[]>([]);
  useEffect(() => { if (files) setPicked(files.map(() => true)); }, [files]);
  const chosen = (files ?? []).filter((_f, i) => picked[i]);
  if (!channel) return null;

  const copyText = () => {
    navigator.clipboard?.writeText(channel.text)
      .then(() => enqueueSnackbar(`Text copied. Paste it into ${channel.label}.`, { variant: 'success' }))
      .catch(() => enqueueSnackbar('Copy the text by hand.', { variant: 'warning' }));
  };

  return (
    <Drawer
      anchor="right"
      open
      onClose={onClose}
      hideBackdrop
      ModalProps={{ disableEnforceFocus: true, disableScrollLock: true }}
      slotProps={{ paper: { sx: { width: 440, maxWidth: '100vw', p: 2, display: 'flex', flexDirection: 'column', gap: 1.25 } } }}
      sx={{ pointerEvents: 'none', '& .MuiDrawer-paper': { pointerEvents: 'auto' } }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <Typography sx={{ fontWeight: 800, fontSize: 18, flex: 1 }}>Post it</Typography>
        <IconButton aria-label="Close" onClick={onClose}><CloseRounded /></IconButton>
      </Box>
      <ChannelPicker channels={post.channels} value={channel.key} onChange={pick} />
      <Typography sx={{ fontSize: 13, color: ccTokens.ink2 }}>
        Open {channel.label} beside this drawer. {channel.how} Bring the photos over: drag them, copy one at a time, or
        download the ones ticked.
      </Typography>
      {failed ? <Alert severity="error">{failed}</Alert> : null}
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.75 }}>
          <Typography sx={{ fontWeight: 700, flex: 1 }}>1. The text</Typography>
          <Typography sx={{ fontSize: 12, color: channel.text.length > channel.max_chars ? 'error.main' : ccTokens.ink3 }}>
            {channel.text.length.toLocaleString()} / {channel.max_chars.toLocaleString()}
          </Typography>
        </Box>
        <Button fullWidth variant="contained" startIcon={<ContentCopyRounded />} onClick={copyText}>Copy text</Button>
        <TextField multiline fullWidth minRows={3} maxRows={6} value={channel.text} slotProps={{ input: { readOnly: true } }} size="small" sx={{ mt: 1 }} />
      </Box>
      <Box sx={{ minHeight: 0, flex: 1, overflowY: 'auto' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75, flexWrap: 'wrap' }}>
          <Typography sx={{ fontWeight: 700, flex: 1 }}>2. The photos</Typography>
          <SizePicker channel={channel} size={size} onChange={setSize} />
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
          <Box sx={{ display: 'grid', gridTemplateColumns: size === '9:16' ? 'repeat(3, minmax(0, 1fr))' : 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
            {files.map((file, i) => (
              <Box key={file.name} sx={{ position: 'relative' }}>
                <Box
                  component="img"
                  src={urls[i]}
                  alt={`Photo ${i + 1}`}
                  draggable
                  onDragStart={(e: React.DragEvent) => {
                    // Chrome: dropping on the desktop or a folder saves the file; the site takes the dragged picture.
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
                <Tooltip title="Copy, then paste into the post">
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
        <PostedLink post={post} channel={channel} primary onPosted={(next, k) => { onPosted(next, k); onPostedMove(next); }} />
      </Box>
    </Drawer>
  );
}

export default function PostIt({ post, desk, onClose, onPosted }: {
  post: SocialPostDetail;
  desk: boolean;
  onClose: () => void;
  /** A channel was marked posted; `next` is the post detail as it is now. */
  onPosted: (next: SocialPostDetail, channel: SocialChannel) => void;
}) {
  return desk
    ? <DeskDrawer post={post} onClose={onClose} onPosted={onPosted} />
    : <PhoneSheet post={post} onClose={onClose} onPosted={onPosted} />;
}

/**
 * Social Studio post editor (`/studios/social/post/:id`). Desk: the live frame on the left, the words, photos and
 * checks on the right. Phone: the frame on top, then the same steps. Tap a photo spot (or drop a library photo on
 * it) to fill it from the library or the camera. The Always-include list must pass before Ready; Post it copies
 * the caption and saves the framed PNGs in one tap, then the Facebook link marks it Posted.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Link,
  MenuItem,
  Rating,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import RadioButtonUncheckedRounded from '@mui/icons-material/RadioButtonUncheckedRounded';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  CTA_LABELS,
  getSocialPost,
  markSocialPostPosted,
  markSocialPostReady,
  patchSocialPost,
  POST_TYPE_IDEAS,
  POST_TYPE_LABELS,
  rateSocialPost,
  setSocialPostPhotos,
  uploadSocialPhotos,
  type SocialCta,
  type SocialLayout,
  type SocialPhoto,
  type SocialPostDetail,
  type SocialSize,
} from '../../../api/marketing.api';
import { ccTokens } from '../../../theme';
import { FrameCanvas, loadFrameFonts, loadLogo, usePhotoImages } from './FrameCanvas';
import { CameraButtons, CategorySelect, PhotoGrid, SOCIAL_CATEGORIES } from './PhotoLibrary';
import { exportPlan, LAYOUT_LABELS, LAYOUT_ZONES, renderPng } from './socialFrame';
import { formatDay, pageSx, StatusChip, StudioHeader } from './socialParts';

type ApiError = { response?: { data?: { detail?: string } } };

function errorText(err: unknown, fallback: string): string {
  const detail = (err as ApiError)?.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
}

/** Put `photoId` in `zone`: a photo already in the post moves there (trading places), a new one takes the spot. */
export function placePhoto(ids: number[], zone: number, photoId: number): number[] {
  const next = [...ids];
  const from = next.indexOf(photoId);
  if (zone >= next.length) {
    if (from >= 0) next.splice(from, 1);
    next.push(photoId);
    return next;
  }
  if (from >= 0) {
    [next[zone], next[from]] = [next[from], next[zone]];
    return next;
  }
  next[zone] = photoId;
  return next;
}

function Step({ n, title, children, done }: { n: number; title: string; children: React.ReactNode; done?: boolean }) {
  return (
    <Card variant="outlined" sx={{ p: 1.5, mb: 1.25 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Box sx={{
          width: 24, height: 24, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800,
          bgcolor: done ? 'primary.main' : ccTokens.neuTint, color: done ? '#fff' : ccTokens.ink2,
        }}
        >
          {n}
        </Box>
        <Typography sx={{ fontWeight: 800 }}>{title}</Typography>
      </Box>
      {children}
    </Card>
  );
}

function PickerDialog({
  open,
  zone,
  filled,
  selectedIds,
  defaultCategory,
  onPick,
  onUploaded,
  onRemove,
  onClose,
}: {
  open: boolean;
  zone: number;
  filled: boolean;
  selectedIds: number[];
  defaultCategory: string;
  onPick: (photo: SocialPhoto) => void;
  onUploaded: (photos: SocialPhoto[]) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const { enqueueSnackbar } = useSnackbar();
  const upload = useMutation({
    mutationFn: (files: File[]) => uploadSocialPhotos(files, { category: defaultCategory }),
    onSuccess: (res) => onUploaded(res.photos),
    onError: (err) => enqueueSnackbar(errorText(err, 'Could not upload.'), { variant: 'error' }),
  });
  return (
    <Dialog open={open} onClose={onClose} fullScreen={phone} fullWidth maxWidth="md">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ flex: 1 }}>Photo spot {zone + 1}</Box>
        <IconButton aria-label="Close" onClick={onClose}><CloseRounded /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ mb: 1.5 }}>
          <CameraButtons onFiles={(files) => upload.mutate(files)} busy={upload.isPending} size="medium" />
        </Box>
        <PhotoGrid categories={SOCIAL_CATEGORIES} onPick={onPick} selectedIds={selectedIds} defaultUnused />
      </DialogContent>
      {filled ? (
        <DialogActions>
          <Button color="error" onClick={onRemove}>Take this photo out</Button>
        </DialogActions>
      ) : null}
    </Dialog>
  );
}

function PostItDialog({ post, onClose, onPosted }: { post: SocialPostDetail; onClose: () => void; onPosted: () => void }) {
  const { enqueueSnackbar } = useSnackbar();
  const images = usePhotoImages(post.photo_ids);
  const [files, setFiles] = useState<File[] | null>(null);
  const [failed, setFailed] = useState('');
  const [sent, setSent] = useState(false);
  const [url, setUrl] = useState('');
  const plan = useMemo(() => exportPlan(post.layout, post.photo_ids.length), [post.layout, post.photo_ids.length]);
  const ready = post.photo_ids.every((id) => images.has(id));

  // Render the PNGs as soon as the photos are in, so the one tap below can hand them over straight away.
  useEffect(() => {
    if (!ready || files) return;
    let alive = true;
    (async () => {
      await loadFrameFonts();
      const logo = await loadLogo();
      const out: File[] = [];
      for (let i = 0; i < plan.length; i += 1) {
        const step = plan[i];
        const ids = post.photo_ids.slice(step.from, step.from + step.count);
        const blob = await renderPng({
          layout: step.layout,
          size: post.size,
          hook: step.withHook ? post.hook : '',
          withHook: step.withHook,
          address: post.brand.address,
          hours: post.brand.hours,
          logo,
          photos: ids.map((id) => images.get(id) ?? null),
        });
        out.push(new File([blob], `ecothrift-${post.slot_date}-${i + 1}.png`, { type: 'image/png' }));
      }
      if (alive) setFiles(out);
    })().catch((err) => { if (alive) setFailed(err instanceof Error ? err.message : 'Could not draw the images.'); });
    return () => { alive = false; };
  }, [ready, files, plan, post, images]);

  const copyAndSave = () => {
    if (!files) return;
    // Both start inside the tap: browsers only allow the clipboard and the share sheet right after one.
    const copied = navigator.clipboard?.writeText(post.text).then(() => true).catch(() => false) ?? Promise.resolve(false);
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    const shared = nav.canShare && nav.canShare({ files })
      ? nav.share({ files }).then(() => true).catch(() => false)
      : Promise.resolve(false);
    shared.then((ok) => {
      if (ok) return;
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
    });
    copied.then((ok) => {
      setSent(true);
      enqueueSnackbar(ok ? 'Text copied. Paste it into the Facebook post.' : 'Copy the text below by hand.', { variant: ok ? 'success' : 'warning' });
    });
  };

  const posted = useMutation({
    mutationFn: () => markSocialPostPosted(post.id, url.trim()),
    onSuccess: () => { enqueueSnackbar('Posted. Nice work.', { variant: 'success' }); onPosted(); },
    onError: (err) => enqueueSnackbar(errorText(err, 'Could not mark it posted.'), { variant: 'error' }),
  });

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Post it</DialogTitle>
      <DialogContent dividers>
        {failed ? <Alert severity="error" sx={{ mb: 1.5 }}>{failed}</Alert> : null}
        <Typography sx={{ fontWeight: 700, mb: 0.75 }}>1. Copy the text and save the {plan.length} image{plan.length === 1 ? '' : 's'}</Typography>
        <Button
          fullWidth
          size="large"
          variant="contained"
          disabled={!files}
          startIcon={files ? null : <CircularProgress size={18} color="inherit" />}
          onClick={copyAndSave}
        >
          {files ? 'Copy text + save images' : 'Drawing the images…'}
        </Button>
        <Typography sx={{ fontWeight: 700, mt: 2, mb: 0.75 }}>2. On Facebook: new post, add the images, paste the text</Typography>
        <TextField
          multiline
          fullWidth
          minRows={4}
          maxRows={10}
          value={post.text}
          slotProps={{ input: { readOnly: true } }}
          size="small"
        />
        <Typography sx={{ fontWeight: 700, mt: 2, mb: 0.75 }}>3. Paste the link to the post</Typography>
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
            variant={sent ? 'contained' : 'outlined'}
            disabled={!url.trim() || posted.isPending}
            onClick={() => posted.mutate()}
            sx={{ flex: { xs: '1 1 100%', sm: '0 0 auto' }, whiteSpace: 'nowrap' }}
          >
            Mark posted
          </Button>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function SocialPostEditorPage() {
  const { id } = useParams();
  const postId = Number(id);
  const navigate = useNavigate();
  const theme = useTheme();
  const desk = useMediaQuery(theme.breakpoints.up('md'));
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const key = ['marketing', 'post', postId];
  const query = useQuery({ queryKey: key, queryFn: () => getSocialPost(postId), enabled: Number.isFinite(postId) });
  const post = query.data;

  const [hook, setHook] = useState('');
  const [body, setBody] = useState('');
  const [picker, setPicker] = useState<number | null>(null);
  const [postIt, setPostIt] = useState(false);
  useEffect(() => {
    if (!post) return;
    setHook(post.hook);
    setBody(post.body);
    // Only when another post opens; typing must not be overwritten by a save coming back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.id]);

  const apply = (next: SocialPostDetail | unknown) => {
    queryClient.setQueryData(key, (old: SocialPostDetail | undefined) => (old ? { ...old, ...(next as object) } : old));
    queryClient.invalidateQueries({ queryKey: ['marketing', 'week'] });
    queryClient.invalidateQueries({ queryKey: ['marketing', 'today'] });
  };
  const onError = (err: unknown) => enqueueSnackbar(errorText(err, 'Could not save.'), { variant: 'error' });
  const patch = useMutation({ mutationFn: (data: Parameters<typeof patchSocialPost>[1]) => patchSocialPost(postId, data), onSuccess: apply, onError });
  const photos = useMutation({
    mutationFn: (ids: number[]) => setSocialPostPhotos(postId, ids),
    onSuccess: (next) => { apply(next); queryClient.invalidateQueries({ queryKey: key }); queryClient.invalidateQueries({ queryKey: ['marketing', 'photos'] }); },
    onError,
  });
  const ready = useMutation({ mutationFn: () => markSocialPostReady(postId), onSuccess: apply, onError });
  const rate = useMutation({ mutationFn: (value: number | null) => rateSocialPost(postId, value), onSuccess: apply, onError });

  if (query.isLoading) return <Box sx={{ ...pageSx, display: 'flex', justifyContent: 'center', pt: 8 }}><CircularProgress /></Box>;
  if (!post) return <Box sx={pageSx}><Alert severity="error">This post is not available.</Alert></Box>;

  const locked = post.status === 'posted';
  const zones = LAYOUT_ZONES[post.layout];
  const limit = post.rules.hook_max_chars;
  const saveText = () => {
    if (locked) return;
    const data: Parameters<typeof patchSocialPost>[1] = {};
    if (hook !== post.hook) data.hook = hook;
    if (body !== post.body) data.body = body;
    if (Object.keys(data).length) patch.mutate(data);
  };
  const fillZone = (zone: number, photoId: number) => {
    // An empty spot takes the next free place, so the photos stay in order.
    photos.mutate(placePhoto(post.photo_ids, Math.min(zone, post.photo_ids.length), photoId));
  };
  const openZone = (zone: number) => { if (!locked) setPicker(zone); };
  const failing = post.checks.filter((c) => !c.ok);

  const frame = (
    <FrameCanvas
      layout={post.layout}
      size={post.size}
      hook={hook}
      address={post.brand.address}
      hours={post.brand.hours}
      photoIds={post.photo_ids}
      activeZone={locked ? -1 : Math.min(post.photo_ids.length, zones - 1)}
      onZone={locked ? undefined : openZone}
      onDropPhoto={locked ? undefined : fillZone}
      maxHeight={desk ? 'calc(100vh - 170px)' : undefined}
    />
  );

  const extras = post.photos.slice(zones);
  const form = (
    <Box sx={{ minWidth: 0 }}>
      <Step n={1} title="The idea" done={Boolean(post.category || post.post_type === 'scheduled')}>
        <Typography sx={{ fontSize: 14, color: ccTokens.ink2, mb: 1 }}>{POST_TYPE_IDEAS[post.post_type]}</Typography>
        <CategorySelect
          value={post.category}
          onChange={(category) => patch.mutate({ category })}
          categories={SOCIAL_CATEGORIES}
        />
      </Step>

      <Step n={2} title="Photos and frame" done={post.checks.find((c) => c.key === 'frame')?.ok && post.checks.find((c) => c.key === 'photos')?.ok}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.25 }}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={post.layout}
            disabled={locked}
            onChange={(_e, layout: SocialLayout | null) => layout && patch.mutate({ layout })}
          >
            {(Object.keys(LAYOUT_LABELS) as SocialLayout[]).map((l) => <ToggleButton key={l} value={l} sx={{ textTransform: 'none' }}>{LAYOUT_LABELS[l]}</ToggleButton>)}
          </ToggleButtonGroup>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={post.size}
            disabled={locked}
            onChange={(_e, size: SocialSize | null) => size && patch.mutate({ size })}
          >
            <ToggleButton value="4:5" sx={{ textTransform: 'none' }}>4:5</ToggleButton>
            <ToggleButton value="1:1" sx={{ textTransform: 'none' }}>1:1</ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <Typography sx={{ fontSize: 13, color: ccTokens.ink2, mb: 1 }}>
          Tap a spot in the frame to fill it{desk ? ', or drag a photo onto it' : ''}. Photos past the frame go out as extra framed images.
        </Typography>
        {!locked ? (
          <Button size="small" variant="outlined" onClick={() => setPicker(post.photo_ids.length)}>
            {post.photo_ids.length >= zones ? 'Add an extra photo' : `Fill spot ${post.photo_ids.length + 1}`}
          </Button>
        ) : null}
        {extras.length ? (
          <Box sx={{ display: 'flex', gap: 0.75, mt: 1.25, flexWrap: 'wrap' }}>
            {extras.map((photo) => (
              <Box key={photo.id} sx={{ position: 'relative', width: 72, height: 72, borderRadius: '8px', overflow: 'hidden', bgcolor: '#e8f5e9' }}>
                {photo.thumb_url ? <Box component="img" src={photo.thumb_url} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
                {!locked ? (
                  <IconButton
                    size="small"
                    aria-label="Take this photo out"
                    onClick={() => photos.mutate(post.photo_ids.filter((pid) => pid !== photo.id))}
                    sx={{ position: 'absolute', top: 2, right: 2, bgcolor: 'rgba(255,255,255,.85)', p: 0.25 }}
                  >
                    <CloseRounded sx={{ fontSize: 16 }} />
                  </IconButton>
                ) : null}
              </Box>
            ))}
          </Box>
        ) : null}
      </Step>

      <Step n={3} title="The words" done={post.checks.find((c) => c.key === 'hook')?.ok && post.checks.find((c) => c.key === 'cta')?.ok}>
        <TextField
          fullWidth
          size="small"
          label="Hook line"
          placeholder="What it is and why now"
          value={hook}
          disabled={locked}
          onChange={(e) => setHook(e.target.value)}
          onBlur={saveText}
          error={hook.trim().length > limit}
          helperText={`${hook.trim().length}/${limit}`}
          sx={{ mb: 1.25 }}
        />
        <TextField
          fullWidth
          multiline
          minRows={3}
          size="small"
          label="More words (optional)"
          value={body}
          disabled={locked}
          onChange={(e) => setBody(e.target.value)}
          onBlur={saveText}
          sx={{ mb: 1.25 }}
        />
        <TextField
          select
          size="small"
          label="Call to action"
          value={post.call_to_action}
          disabled={locked}
          onChange={(e) => patch.mutate({ call_to_action: e.target.value as SocialCta })}
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="">Pick one</MenuItem>
          {(Object.keys(CTA_LABELS) as Array<keyof typeof CTA_LABELS>).map((c) => <MenuItem key={c} value={c}>{CTA_LABELS[c]}</MenuItem>)}
        </TextField>
        <Typography sx={{ fontSize: 12.5, color: ccTokens.ink3, mt: 1 }}>
          The address, hours and Thrift+ line are added to the text and the frame by themselves.
        </Typography>
      </Step>

      <Step n={4} title="Always include" done={post.passes}>
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {post.checks.map((c) => (
            <Box component="li" key={c.key} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', py: 0.4 }}>
              {c.ok
                ? <CheckCircleRounded sx={{ fontSize: 20, color: 'primary.main', mt: '1px' }} />
                : <RadioButtonUncheckedRounded sx={{ fontSize: 20, color: ccTokens.ink3, mt: '1px' }} />}
              <Box>
                <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{c.label}</Typography>
                {!c.ok ? <Typography sx={{ fontSize: 13, color: ccTokens.badText }}>{c.missing}</Typography> : null}
              </Box>
            </Box>
          ))}
        </Box>
        <Typography sx={{ fontSize: 12.5, color: ccTokens.ink3, mt: 0.75 }}>
          Never: money pictures, AI-made products, a retail price that failed its check.
        </Typography>
      </Step>

      <Step n={5} title={locked ? 'Posted' : 'Post it'} done={locked}>
        {locked ? (
          <>
            <Typography sx={{ fontSize: 14 }}>
              {post.posted_by_name || 'Someone'} · {post.posted_at ? new Date(post.posted_at).toLocaleString() : '—'}
            </Typography>
            {post.posted_url ? <Link href={post.posted_url} target="_blank" rel="noopener" sx={{ fontSize: 14, overflowWrap: 'anywhere' }}>{post.posted_url}</Link> : null}
            {post.can_rate ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                <Typography sx={{ fontSize: 13, color: ccTokens.ink2 }}>Your rating</Typography>
                <Rating value={post.rating} onChange={(_e, value) => rate.mutate(value)} />
              </Box>
            ) : null}
          </>
        ) : post.status === 'ready' ? (
          <Button fullWidth size="large" variant="contained" onClick={() => { saveText(); setPostIt(true); }}>Post it</Button>
        ) : (
          <>
            {failing.length ? <Typography sx={{ fontSize: 13, color: ccTokens.ink2, mb: 1 }}>{failing.length} to go before it can be Ready.</Typography> : null}
            <Button fullWidth size="large" variant="contained" disabled={!post.passes || ready.isPending} onClick={() => ready.mutate()}>
              Mark ready
            </Button>
          </>
        )}
      </Step>
    </Box>
  );

  return (
    <Box sx={pageSx}>
      <StudioHeader
        title={`${formatDay(post.slot_date, 'long')} · ${POST_TYPE_LABELS[post.post_type]}`}
        actions={(
          <>
            <StatusChip status={post.status} />
            <IconButton aria-label="Back to the week" onClick={() => navigate('/studios/social')}><ArrowBackRounded /></IconButton>
          </>
        )}
      />
      {desk ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(380px, 1fr)', gap: 2.5, alignItems: 'start' }}>
          <Box sx={{ position: 'sticky', top: 16 }}>{frame}</Box>
          {form}
        </Box>
      ) : (
        <>
          <Box sx={{ mb: 1.5 }}>{frame}</Box>
          {form}
        </>
      )}
      <PickerDialog
        open={picker != null}
        zone={picker ?? 0}
        filled={picker != null && picker < post.photo_ids.length}
        selectedIds={post.photo_ids}
        defaultCategory={post.category}
        onClose={() => setPicker(null)}
        onPick={(photo) => { if (picker != null) fillZone(picker, photo.id); setPicker(null); }}
        onUploaded={(uploaded) => {
          if (picker == null || !uploaded.length) return;
          let ids = placePhoto(post.photo_ids, Math.min(picker, post.photo_ids.length), uploaded[0].id);
          uploaded.slice(1).forEach((p) => { ids = [...ids, p.id]; });
          photos.mutate(ids);
          setPicker(null);
        }}
        onRemove={() => {
          if (picker == null) return;
          photos.mutate(post.photo_ids.filter((_pid, i) => i !== picker));
          setPicker(null);
        }}
      />
      {postIt ? (
        <PostItDialog
          post={post}
          onClose={() => setPostIt(false)}
          onPosted={() => { setPostIt(false); queryClient.invalidateQueries({ queryKey: ['marketing'] }); }}
        />
      ) : null}
    </Box>
  );
}

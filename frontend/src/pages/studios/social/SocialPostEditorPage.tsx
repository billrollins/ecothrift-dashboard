/**
 * Social Studio post editor (`/studios/social/post/:id`; in the phone app `/social/post/:id` and the Post tab).
 * Each photo goes out as its own image at the post's size, a product photo carrying its tag (owner 2026-10-22, F6:
 * photo overlays, not templates). Desk: the photos on the left, the idea, words, checks and Post it on the right.
 * Phone: the same steps, one under the other. The idea step holds the AI's post ideas (Phase 4: Use this idea fills
 * the words and adds the photos), and the hook and the words have fast AI rewrites. The Always-include list must
 * pass before Ready; Post it (PostIt.tsx: the share sheet on a phone, a drawer on a desk) hands over the text and
 * the photos, then the Facebook link marks it Posted.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Link,
  MenuItem,
  Rating,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import RadioButtonUncheckedRounded from '@mui/icons-material/RadioButtonUncheckedRounded';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  CTA_LABELS,
  getSocialPost,
  markSocialPostReady,
  patchSocialPost,
  POST_TYPE_IDEAS,
  POST_TYPE_LABELS,
  rateSocialPost,
  setSocialPostPhotos,
  uploadSocialPhotos,
  type SocialCta,
  type SocialPhoto,
  type SocialPostDetail,
  type SocialSize,
} from '../../../api/marketing.api';
import { ccTokens } from '../../../theme';
import { CameraButtons, CategorySelect, PhotoGrid, SOCIAL_CATEGORIES } from './PhotoLibrary';
import SocialPhotoEditor from './SocialPhotoEditor';
import { formatDay, pageSx, StatusChip, StudioHeader } from './socialParts';
import { useStudioPaths } from './studioPaths';
import PostIt from './PostIt';
import PostNumbersForm from './PostNumbersForm';
import { PostIdeas, RewriteButtons } from './PostIdeas';
import { TagPhoto, usePhotoImages } from './TagPhoto';

type ApiError = { response?: { data?: { detail?: string } } };

function errorText(err: unknown, fallback: string): string {
  const detail = (err as ApiError)?.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
}

/** Move the photo at `from` one place left (-1) or right (+1). */
export function movePhoto(ids: number[], from: number, step: -1 | 1): number[] {
  const to = from + step;
  if (from < 0 || from >= ids.length || to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
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
  selectedIds,
  defaultCategory,
  onPick,
  onUploaded,
  onClose,
}: {
  open: boolean;
  selectedIds: number[];
  defaultCategory: string;
  onPick: (photo: SocialPhoto) => void;
  onUploaded: (photos: SocialPhoto[]) => void;
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
        <Box sx={{ flex: 1 }}>Add photos</Box>
        <IconButton aria-label="Close" onClick={onClose}><CloseRounded /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ mb: 1.5 }}>
          <CameraButtons onFiles={(files) => upload.mutate(files)} busy={upload.isPending} size="medium" />
        </Box>
        <PhotoGrid categories={SOCIAL_CATEGORIES} onPick={onPick} selectedIds={selectedIds} defaultUnused />
      </DialogContent>
    </Dialog>
  );
}

function PhotoTile({
  photo,
  image,
  size,
  index,
  count,
  locked,
  onEdit,
  onMove,
  onRemove,
}: {
  photo: SocialPhoto;
  image: HTMLImageElement | null;
  size: SocialSize;
  index: number;
  count: number;
  locked: boolean;
  onEdit: () => void;
  onMove: (step: -1 | 1) => void;
  onRemove: () => void;
}) {
  const tagOff = Boolean(photo.tag) && !photo.tag_overlay;
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box
        component={locked ? 'div' : 'button'}
        type={locked ? undefined : 'button'}
        onClick={locked ? undefined : onEdit}
        aria-label={locked ? undefined : `Edit photo ${index + 1}`}
        sx={{ display: 'block', width: '100%', p: 0, border: 0, bgcolor: 'transparent', cursor: locked ? 'default' : 'pointer' }}
      >
        <TagPhoto photo={photo} image={image} size={size} />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, mt: 0.5, flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: ccTokens.ink2, mr: 0.5 }}>{index + 1}</Typography>
        {photo.tag ? <Chip size="small" label={photo.tag.sku} sx={{ height: 20, fontSize: 11 }} /> : null}
        {tagOff ? <Chip size="small" color="warning" label="Tag off" sx={{ height: 20, fontSize: 11 }} /> : null}
        {photo.tag && !photo.tag.available ? <Chip size="small" color="error" label="Sold" sx={{ height: 20, fontSize: 11 }} /> : null}
        <Box sx={{ flex: 1 }} />
        {!locked ? (
          <>
            <Tooltip title="Edit"><IconButton size="small" aria-label="Edit photo" onClick={onEdit}><EditRounded fontSize="small" /></IconButton></Tooltip>
            <IconButton size="small" aria-label="Move left" disabled={index === 0} onClick={() => onMove(-1)}><ChevronLeftRounded fontSize="small" /></IconButton>
            <IconButton size="small" aria-label="Move right" disabled={index === count - 1} onClick={() => onMove(1)}><ChevronRightRounded fontSize="small" /></IconButton>
            <IconButton size="small" aria-label="Take this photo out" onClick={onRemove}><CloseRounded fontSize="small" /></IconButton>
          </>
        ) : null}
      </Box>
    </Box>
  );
}

export default function SocialPostEditorPage({ postId: fixedId }: { postId?: number } = {}) {
  const { id } = useParams();
  const postId = fixedId ?? Number(id);
  const navigate = useNavigate();
  const paths = useStudioPaths();
  const theme = useTheme();
  const desk = useMediaQuery(theme.breakpoints.up('md'));
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const key = ['marketing', 'post', postId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => getSocialPost(postId),
    enabled: Number.isFinite(postId),
    // While the AI writes ideas, look again every few seconds.
    refetchInterval: (q) => (q.state.data?.ideas?.state === 'drafting' ? 3000 : false),
  });
  const post = query.data;
  const images = usePhotoImages(post?.photos ?? []);

  const [hook, setHook] = useState('');
  const [body, setBody] = useState('');
  const [picker, setPicker] = useState(false);
  const [editing, setEditing] = useState<SocialPhoto | null>(null);
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
  const reload = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ['marketing', 'photos'] });
  };
  const onError = (err: unknown) => enqueueSnackbar(errorText(err, 'Could not save.'), { variant: 'error' });
  const patch = useMutation({ mutationFn: (data: Parameters<typeof patchSocialPost>[1]) => patchSocialPost(postId, data), onSuccess: apply, onError });
  const photos = useMutation({
    mutationFn: (ids: number[]) => setSocialPostPhotos(postId, ids),
    onSuccess: (next) => { apply(next); reload(); },
    onError,
  });
  const ready = useMutation({ mutationFn: () => markSocialPostReady(postId), onSuccess: apply, onError });
  const rate = useMutation({ mutationFn: (value: number | null) => rateSocialPost(postId, value), onSuccess: apply, onError });

  if (query.isLoading) return <Box sx={{ ...pageSx, display: 'flex', justifyContent: 'center', pt: 8 }}><CircularProgress /></Box>;
  if (!post) return <Box sx={pageSx}><Alert severity="error">This post is not available.</Alert></Box>;

  const locked = post.status === 'posted';
  const limit = post.rules.hook_max_chars;
  const saveText = () => {
    if (locked) return;
    const data: Parameters<typeof patchSocialPost>[1] = {};
    if (hook !== post.hook) data.hook = hook;
    if (body !== post.body) data.body = body;
    if (Object.keys(data).length) patch.mutate(data);
  };
  const failing = post.checks.filter((c) => !c.ok);
  const check = (k: string) => post.checks.find((c) => c.key === k)?.ok;
  const ids = post.photo_ids;

  const photoStep = (
    <Step n={2} title="Photos" done={check('photos') && check('tags')}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', mb: 1.25 }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={post.size}
          disabled={locked}
          onChange={(_e, size: SocialSize | null) => size && patch.mutate({ size })}
        >
          <ToggleButton value="4:5" sx={{ textTransform: 'none' }}>4:5 tall</ToggleButton>
          <ToggleButton value="1:1" sx={{ textTransform: 'none' }}>1:1 square</ToggleButton>
        </ToggleButtonGroup>
        {!locked ? <Button size="small" variant="outlined" onClick={() => setPicker(true)}>Add photos</Button> : null}
      </Box>
      <Typography sx={{ fontSize: 13, color: ccTokens.ink2, mb: 1.25 }}>
        Each photo goes out on its own, product photos with their tag. Tap a photo to crop, brighten or move its tag.
      </Typography>
      {post.photos.length ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' }, gap: 1.25 }}>
          {post.photos.map((photo, index) => (
            <PhotoTile
              key={`${photo.id}:${photo.edited_at ?? ''}`}
              photo={photo}
              image={images.get(photo.id) ?? null}
              size={post.size}
              index={index}
              count={post.photos.length}
              locked={locked}
              onEdit={() => setEditing(photo)}
              onMove={(step) => photos.mutate(movePhoto(ids, index, step))}
              onRemove={() => photos.mutate(ids.filter((pid) => pid !== photo.id))}
            />
          ))}
        </Box>
      ) : (
        <Typography sx={{ py: 2, color: ccTokens.ink2 }}>No photos yet. Add the ones staff took, or take some now.</Typography>
      )}
    </Step>
  );

  const ideaStep = (
    <Step n={1} title="The idea" done={Boolean(post.category || post.post_type === 'scheduled')}>
      <Typography sx={{ fontSize: 14, color: ccTokens.ink2, mb: 1 }}>{POST_TYPE_IDEAS[post.post_type]}</Typography>
      <CategorySelect
        value={post.category}
        onChange={(category) => patch.mutate({ category })}
        categories={SOCIAL_CATEGORIES}
      />
      <PostIdeas
        post={post}
        locked={locked}
        onChange={(next, usedIdea) => {
          apply(next);
          if (usedIdea) {
            setHook(next.hook);
            setBody(next.body);
            reload();
          }
        }}
      />
    </Step>
  );

  const rest = (
    <>
      <Step n={3} title="The words" done={check('hook') && check('cta')}>
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
          helperText={`${hook.trim().length}/${limit} · the first line of the post`}
          sx={{ mb: 1.25 }}
        />
        {!locked ? (
          <RewriteButtons
            postId={post.id}
            part="hook"
            current={hook}
            onPick={(text) => { setHook(text); patch.mutate({ hook: text }); }}
          />
        ) : null}
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
        {!locked ? (
          <RewriteButtons
            postId={post.id}
            part="body"
            current={body}
            onPick={(text) => { setBody(text); patch.mutate({ body: text }); }}
          />
        ) : null}
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
          The address, hours and Thrift+ line are added to the text by themselves.
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
              {post.posted_by_name || 'Someone'} · {post.posted_at ? new Date(post.posted_at).toLocaleString() : '-'}
            </Typography>
            {post.posted_url ? <Link href={post.posted_url} target="_blank" rel="noopener" sx={{ fontSize: 14, overflowWrap: 'anywhere' }}>{post.posted_url}</Link> : null}
            {post.can_rate ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                <Typography sx={{ fontSize: 13, color: ccTokens.ink2 }}>Your rating</Typography>
                <Rating value={post.rating} onChange={(_e, value) => rate.mutate(value)} />
              </Box>
            ) : null}
            <Box sx={{ mt: 1.5 }}>
              <PostNumbersForm
                postId={post.id}
                numbers={post.numbers}
                onSaved={(numbers) => apply({ numbers, numbers_due: numbers.due })}
              />
            </Box>
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
    </>
  );

  return (
    <Box sx={pageSx}>
      <StudioHeader
        title={`${formatDay(post.slot_date, 'long')} · ${POST_TYPE_LABELS[post.post_type]}`}
        actions={(
          <>
            <StatusChip status={post.status} />
            {fixedId == null ? (
              <IconButton aria-label="Back to the week" onClick={() => navigate(paths.week)}><ArrowBackRounded /></IconButton>
            ) : null}
          </>
        )}
      />
      {desk ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(380px, 1fr)', gap: 2.5, alignItems: 'start' }}>
          <Box sx={{ minWidth: 0 }}>{photoStep}</Box>
          <Box sx={{ minWidth: 0 }}>{ideaStep}{rest}</Box>
        </Box>
      ) : (
        <Box sx={{ minWidth: 0 }}>
          {ideaStep}
          {photoStep}
          {rest}
        </Box>
      )}
      <PickerDialog
        open={picker}
        selectedIds={ids}
        defaultCategory={post.category}
        onClose={() => setPicker(false)}
        onPick={(photo) => {
          if (!ids.includes(photo.id)) photos.mutate([...ids, photo.id]);
          setPicker(false);
        }}
        onUploaded={(uploaded) => {
          photos.mutate([...ids, ...uploaded.map((p) => p.id).filter((pid) => !ids.includes(pid))]);
          setPicker(false);
        }}
      />
      {editing ? (
        <SocialPhotoEditor
          photo={editing}
          size={post.size}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      ) : null}
      {postIt ? (
        <PostIt
          post={post}
          desk={desk}
          onClose={() => setPostIt(false)}
          onPosted={() => { setPostIt(false); queryClient.invalidateQueries({ queryKey: ['marketing'] }); }}
        />
      ) : null}
    </Box>
  );
}

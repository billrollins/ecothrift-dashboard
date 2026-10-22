/**
 * The AI's post ideas and fast rewrites (Lane F Phase 4, apps/marketing/services/ideas.py).
 *
 * - **PostIdeas:** 3 to 5 ideas for the day from the store's data and this week's photos (written each posting
 *   morning, or on Get ideas). Each shows its hook, words, photos and what is still worth photographing. **Use this
 *   idea** puts its words in the post and adds its photos.
 * - **RewriteButtons:** under the hook or the words, New / Shorter bring back 3 options in a few seconds; tap one to
 *   use it. Nothing changes until one is picked.
 */
import { useState } from 'react';
import { Alert, Box, Button, Card, Chip, CircularProgress, LinearProgress, Typography } from '@mui/material';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import { useMutation } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  applySocialIdea,
  requestSocialIdeas,
  rewriteSocialPost,
  type RewriteMode,
  type RewritePart,
  type SocialPost,
  type SocialPostDetail,
} from '../../../api/marketing.api';
import { ccTokens } from '../../../theme';

type ApiError = { response?: { data?: { detail?: string } } };

function errorText(err: unknown, fallback: string): string {
  const detail = (err as ApiError)?.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
}

export function PostIdeas({ post, locked, onChange }: {
  post: SocialPostDetail;
  locked: boolean;
  /** The post came back changed (ideas asked for, or one used). */
  onChange: (next: SocialPost, usedIdea: boolean) => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const ask = useMutation({
    mutationFn: () => requestSocialIdeas(post.id),
    onSuccess: (next) => onChange(next, false),
    onError: (err) => enqueueSnackbar(errorText(err, 'Could not ask for ideas.'), { variant: 'error' }),
  });
  const use = useMutation({
    mutationFn: (index: number) => applySocialIdea(post.id, index),
    onSuccess: (next) => { onChange(next, true); enqueueSnackbar('Idea in. Change anything you like.', { variant: 'success' }); },
    onError: (err) => enqueueSnackbar(errorText(err, 'Could not use that idea.'), { variant: 'error' }),
  });
  const state = post.ideas?.state;
  const ideas = post.ideas?.ideas ?? [];
  const drafting = state === 'drafting' || ask.isPending;

  if (locked && !ideas.length) return null;
  return (
    <Box sx={{ mt: 1.25 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography sx={{ fontWeight: 700, flex: 1, minWidth: 160 }}>Post ideas</Typography>
        {!locked ? (
          <Button
            size="small"
            variant={ideas.length ? 'outlined' : 'contained'}
            startIcon={<AutoAwesomeRounded />}
            disabled={drafting}
            onClick={() => ask.mutate()}
          >
            {ideas.length ? 'New ideas' : 'Get post ideas'}
          </Button>
        ) : null}
      </Box>
      {!ideas.length && !drafting && state !== 'failed' ? (
        <Typography sx={{ fontSize: 13, color: ccTokens.ink2, mt: 0.5 }}>
          Ideas from the store: new stock, this week's photos, loads coming, sales and the season.
        </Typography>
      ) : null}
      {drafting ? (
        <Box sx={{ mt: 1 }}>
          <LinearProgress />
          <Typography sx={{ fontSize: 13, color: ccTokens.ink2, mt: 0.5 }}>Writing ideas from today's store data…</Typography>
        </Box>
      ) : null}
      {state === 'failed' && post.ideas?.error ? <Alert severity="warning" sx={{ mt: 1 }}>{post.ideas.error}</Alert> : null}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
        {ideas.map((idea, index) => (
          <Card key={`${index}-${idea.hook}`} variant="outlined" sx={{ p: 1.25, bgcolor: '#fbfdfb' }}>
            <Typography sx={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: ccTokens.ink3 }}>
              {idea.title}
            </Typography>
            <Typography sx={{ fontWeight: 700, mt: 0.25 }}>{idea.hook}</Typography>
            {idea.body ? (
              <Typography sx={{ fontSize: 13.5, color: ccTokens.ink2, whiteSpace: 'pre-line', mt: 0.25 }}>{idea.body}</Typography>
            ) : null}
            {idea.photo_ids.length ? (
              <Box sx={{ display: 'flex', gap: 0.5, mt: 0.75, flexWrap: 'wrap' }}>
                {idea.photo_ids.map((pk) => {
                  const thumb = post.idea_photos?.[String(pk)];
                  return thumb ? (
                    <Box key={pk} component="img" src={thumb} alt="" sx={{ width: 44, height: 44, objectFit: 'cover', borderRadius: '6px' }} />
                  ) : null;
                })}
              </Box>
            ) : null}
            {idea.shots.length ? (
              <Box sx={{ mt: 0.75 }}>
                <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: ccTokens.ink2 }}>Still to photograph</Typography>
                {idea.shots.map((s, i) => (
                  <Typography key={i} sx={{ fontSize: 12.5, color: ccTokens.ink2 }}>
                    • {s.shot}{s.title ? ` (${s.title}, ${s.tag_price}${s.location ? `, ${s.location}` : ''})` : ''}
                  </Typography>
                ))}
              </Box>
            ) : null}
            {idea.flags.length ? (
              <Alert severity="warning" sx={{ mt: 0.75, py: 0 }}>Change these words before posting: {idea.flags.join(', ')}</Alert>
            ) : null}
            {!locked ? (
              <Button size="small" variant="contained" sx={{ mt: 1 }} disabled={use.isPending || drafting} onClick={() => use.mutate(index)}>
                Use this idea
              </Button>
            ) : null}
          </Card>
        ))}
      </Box>
    </Box>
  );
}

const MODES: Record<RewritePart, Array<{ mode: RewriteMode; label: string }>> = {
  hook: [{ mode: 'new', label: 'New hooks' }, { mode: 'shorter', label: 'Shorter' }],
  body: [{ mode: 'new', label: 'Another take' }, { mode: 'shorter', label: 'Shorter' }],
};

export function RewriteButtons({ postId, part, current, disabled, onPick }: {
  postId: number;
  part: RewritePart;
  current: string;
  disabled?: boolean;
  onPick: (text: string) => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const [options, setOptions] = useState<string[]>([]);
  const run = useMutation({
    mutationFn: (mode: RewriteMode) => rewriteSocialPost(postId, part, mode, current),
    onSuccess: setOptions,
    onError: (err) => enqueueSnackbar(errorText(err, 'The AI did not answer. Try again.'), { variant: 'error' }),
  });
  return (
    <Box sx={{ mt: -0.5, mb: 1.25 }}>
      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
        <AutoAwesomeRounded sx={{ fontSize: 16, color: ccTokens.ink3 }} />
        {MODES[part].map(({ mode, label }) => (
          <Chip
            key={mode}
            size="small"
            label={label}
            variant="outlined"
            disabled={disabled || run.isPending || (mode === 'shorter' && !current.trim())}
            onClick={() => run.mutate(mode)}
          />
        ))}
        {run.isPending ? <CircularProgress size={16} /> : null}
      </Box>
      {options.length ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 0.75 }}>
          {options.map((text) => (
            <Box
              key={text}
              component="button"
              type="button"
              onClick={() => { onPick(text); setOptions([]); }}
              sx={{
                textAlign: 'left', font: 'inherit', fontSize: 14, whiteSpace: 'pre-line', cursor: 'pointer',
                border: `1px solid ${ccTokens.line}`, borderRadius: '8px', bgcolor: '#fff', px: 1.25, py: 0.75,
                '&:hover': { borderColor: 'primary.main', bgcolor: '#f4faf4' },
              }}
            >
              {text}
            </Box>
          ))}
          <Button size="small" onClick={() => setOptions([])} sx={{ alignSelf: 'flex-start' }}>Keep mine</Button>
        </Box>
      ) : null}
    </Box>
  );
}

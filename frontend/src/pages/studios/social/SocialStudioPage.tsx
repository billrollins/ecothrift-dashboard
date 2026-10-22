/**
 * Studios → Social Studio (Lane F Phase 2): the week's posts. One slot per open posting day (Tue-Sat) plus a
 * scheduled one for the closed days, each with a post type and a category from the rotation (apps/marketing
 * services/cadence.py). Desk: a seven-column week. Phone: a day list, today first. Swap trades two days'
 * type and category. The owner (superuser) rates posted ones 1-5 here.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  Chip,
  CircularProgress,
  IconButton,
  Rating,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  getSocialWeek,
  POST_TYPE_IDEAS,
  POST_TYPE_LABELS,
  rateSocialPost,
  swapSocialPosts,
  type SocialPost,
  type SocialWeek,
} from '../../../api/marketing.api';
import { ccTokens } from '../../../theme';
import { formatDay, pageSx, StatusChip, StudioHeader } from './socialParts';
import { useStudioPaths } from './studioPaths';

type Day = SocialWeek['days'][number];

function errorText(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
}

function PostCard({
  day,
  isToday,
  canRate,
  swapFrom,
  onOpen,
  onSwapPick,
  onRate,
  dense,
}: {
  day: Day;
  isToday: boolean;
  canRate: boolean;
  swapFrom: number | null;
  onOpen: (post: SocialPost) => void;
  onSwapPick: (post: SocialPost) => void;
  onRate: (post: SocialPost, value: number | null) => void;
  dense: boolean;
}) {
  const post = day.post;
  const passed = post ? post.checks.filter((c) => c.ok).length : 0;
  const swapping = swapFrom != null;
  const isSwapSource = post && swapFrom === post.id;
  const canSwapHere = Boolean(post && swapping && !isSwapSource && post.status !== 'posted');
  return (
    <Card
      variant="outlined"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: dense ? 0 : 260,
        borderColor: isToday ? 'primary.main' : isSwapSource ? '#F0C766' : ccTokens.line,
        borderWidth: isToday || isSwapSource ? 2 : 1,
        bgcolor: post ? '#fff' : '#fafbf9',
      }}
    >
      <Box sx={{ px: 1.25, pt: 1, pb: 0.5, display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
        <Typography sx={{ fontWeight: 800, fontSize: 14 }}>{formatDay(day.date)}</Typography>
        {isToday ? <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'primary.main' }}>Today</Typography> : null}
        <Box sx={{ flex: 1 }} />
        {!day.open ? <Typography sx={{ fontSize: 12, color: ccTokens.ink3 }}>Closed</Typography> : null}
      </Box>
      {post ? (
        <>
          <CardActionArea
            onClick={() => (canSwapHere ? onSwapPick(post) : onOpen(post))}
            sx={{ flex: 1, px: 1.25, py: 0.75, display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start' }}
          >
            <Typography sx={{ fontWeight: 700, fontSize: 15, lineHeight: 1.25 }}>{POST_TYPE_LABELS[post.post_type]}</Typography>
            <Typography sx={{ fontSize: 13, color: ccTokens.ink2, minHeight: 18 }}>{post.category || '-'}</Typography>
            <Typography sx={{ fontSize: 13, mt: 0.75, color: post.hook ? ccTokens.ink : ccTokens.ink3, overflowWrap: 'anywhere' }}>
              {post.hook || POST_TYPE_IDEAS[post.post_type]}
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1, flexWrap: 'wrap' }}>
              <StatusChip status={post.status} />
              {post.numbers_due?.length ? <Chip size="small" color="warning" label="Numbers due" /> : null}
              <Typography sx={{ fontSize: 12, color: ccTokens.ink2, fontVariantNumeric: 'tabular-nums' }}>
                {post.photo_ids.length} photo{post.photo_ids.length === 1 ? '' : 's'} · {passed}/{post.checks.length}
              </Typography>
            </Box>
            {canSwapHere ? (
              <Typography sx={{ mt: 0.75, fontSize: 12.5, fontWeight: 700, color: 'primary.main' }}>Tap to swap here</Typography>
            ) : null}
          </CardActionArea>
          <Box sx={{
            px: 1, pb: 0.75, display: (canRate || post.status !== 'posted') ? 'flex' : 'none', alignItems: 'center', gap: 0.5, minHeight: 36,
          }}
          >
            {canRate && post.status === 'posted' ? (
              <Tooltip title="Your rating (only you see this control)">
                <Rating
                  size="small"
                  value={post.rating}
                  onChange={(_e, value) => onRate(post, value)}
                  aria-label={`Rate the ${formatDay(day.date)} post`}
                />
              </Tooltip>
            ) : null}
            <Box sx={{ flex: 1 }} />
            {post.status !== 'posted' ? (
              <Tooltip title={isSwapSource ? 'Cancel the swap' : 'Swap this day with another'}>
                <IconButton size="small" onClick={() => onSwapPick(post)} aria-label="Swap this day">
                  <SwapHorizRounded fontSize="small" />
                </IconButton>
              </Tooltip>
            ) : null}
          </Box>
        </>
      ) : (
        <Box sx={{ flex: 1, px: 1.25, pb: 1.25 }}>
          <Typography sx={{ fontSize: 13, color: ccTokens.ink3 }}>No post</Typography>
        </Box>
      )}
    </Card>
  );
}

export default function SocialStudioPage() {
  const theme = useTheme();
  const desk = useMediaQuery(theme.breakpoints.up('md'));
  const navigate = useNavigate();
  const paths = useStudioPaths();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [start, setStart] = useState<string | undefined>(undefined);
  const [swapFrom, setSwapFrom] = useState<number | null>(null);

  const week = useQuery({ queryKey: ['marketing', 'week', start ?? 'now'], queryFn: () => getSocialWeek(start) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['marketing'] });

  const swap = useMutation({
    mutationFn: ({ a, b }: { a: number; b: number }) => swapSocialPosts(a, b),
    onSuccess: () => { setSwapFrom(null); refresh(); enqueueSnackbar('Swapped', { variant: 'success' }); },
    onError: (err) => enqueueSnackbar(errorText(err, 'Could not swap.'), { variant: 'error' }),
  });
  const rate = useMutation({
    mutationFn: ({ id, value }: { id: number; value: number | null }) => rateSocialPost(id, value),
    onSuccess: refresh,
    onError: (err) => enqueueSnackbar(errorText(err, 'Could not save the rating.'), { variant: 'error' }),
  });

  const data = week.data;
  const isThisWeek = data ? data.today >= data.start && data.today < data.next : true;
  // Phone: today and the days after it first, the days already gone this week after them.
  const phoneDays = useMemo(() => {
    if (!data) return { ahead: [] as Day[], earlier: [] as Day[] };
    if (!isThisWeek) return { ahead: data.days, earlier: [] as Day[] };
    return {
      ahead: data.days.filter((d) => d.date >= data.today),
      earlier: data.days.filter((d) => d.date < data.today),
    };
  }, [data, isThisWeek]);

  const onSwapPick = (post: SocialPost) => {
    if (swapFrom == null) { setSwapFrom(post.id); return; }
    if (swapFrom === post.id) { setSwapFrom(null); return; }
    swap.mutate({ a: swapFrom, b: post.id });
  };

  const card = (day: Day, dense: boolean) => (
    <PostCard
      key={day.date}
      day={day}
      dense={dense}
      isToday={Boolean(data && day.date === data.today)}
      canRate={Boolean(data?.can_rate)}
      swapFrom={swapFrom}
      onOpen={(post) => navigate(paths.post(post.id))}
      onSwapPick={onSwapPick}
      onRate={(post, value) => rate.mutate({ id: post.id, value })}
    />
  );

  const weekNav = (
    <Box sx={{ display: 'flex', alignItems: 'center' }}>
      <IconButton size="small" aria-label="Last week" onClick={() => data && setStart(data.prev)}><ChevronLeftRounded /></IconButton>
      <Button size="small" onClick={() => setStart(undefined)} disabled={isThisWeek}>This week</Button>
      <IconButton size="small" aria-label="Next week" onClick={() => data && setStart(data.next)}><ChevronRightRounded /></IconButton>
      {paths.inApp ? <Button size="small" variant="outlined" onClick={() => navigate(paths.numbers)} sx={{ ml: 0.5 }}>Numbers</Button> : null}
    </Box>
  );

  return (
    <Box sx={pageSx}>
      <StudioHeader
        title={data ? `Week of ${formatDay(data.start, 'long').replace(/^\w+, /, '')}` : 'This week'}
        actions={weekNav}
      />
      {swapFrom != null ? (
        <Alert severity="info" sx={{ mb: 1.5 }} action={<Button color="inherit" size="small" onClick={() => setSwapFrom(null)}>Cancel</Button>}>
          Pick the day to swap with.
        </Alert>
      ) : null}
      {week.isError ? <Alert severity="error">Could not load the week.</Alert> : null}
      {week.isLoading ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box> : null}
      {data && desk ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { md: 'repeat(4, minmax(0, 1fr))', lg: 'repeat(7, minmax(0, 1fr))' }, gap: 1.25, alignItems: 'stretch' }}>
          {data.days.map((day) => card(day, false))}
        </Box>
      ) : null}
      {data && !desk ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {phoneDays.ahead.filter((d) => d.post || d.date === data.today).map((day) => card(day, true))}
          {phoneDays.earlier.some((d) => d.post) ? (
            <Typography sx={{ mt: 1, fontSize: 11.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: ccTokens.ink3 }}>
              Earlier this week
            </Typography>
          ) : null}
          {phoneDays.earlier.filter((d) => d.post).map((day) => card(day, true))}
        </Box>
      ) : null}
    </Box>
  );
}

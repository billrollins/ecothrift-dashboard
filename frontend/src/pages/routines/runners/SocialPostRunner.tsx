import { useEffect } from 'react';
import { Alert, Box, Button, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getTodaysPost, POST_TYPE_IDEAS, POST_TYPE_LABELS } from '../../../api/marketing.api';
import type { SocialPostResponses } from '../../../api/routines.api';
import { dutyColors } from '../../../components/duty/tokens';
import { RunnerBand, RunnerBody, RunnerCard, RunnerHead } from './runnerParts';

const STATUS_LABEL = { draft: 'Draft', ready: 'Ready to post', posted: 'Posted' } as const;

/**
 * Retail, open days: make today's post in Social Studio and post it. The run closes by itself when the post is
 * marked Posted (apps/marketing); this runner shows where the post stands and opens the Studio.
 *
 * `preview` (catalog and editor): a static picture, no requests.
 */
export function SocialPostRunner({
  title,
  subject,
  responses,
  onChange,
  readOnly,
  preview,
}: {
  title: string;
  subject?: string;
  responses: SocialPostResponses;
  onChange?: (next: SocialPostResponses) => void;
  readOnly?: boolean;
  preview?: boolean;
}) {
  const navigate = useNavigate();
  const today = useQuery({
    queryKey: ['marketing', 'today'],
    queryFn: getTodaysPost,
    enabled: !preview,
    refetchOnWindowFocus: true,
  });
  const post = today.data?.post ?? null;

  useEffect(() => {
    if (!onChange || readOnly || preview || !today.data) return;
    const next = { post_id: post?.id ?? null, post_status: post?.status ?? null };
    if (next.post_id !== responses.post_id || next.post_status !== responses.post_status) onChange(next);
  }, [onChange, readOnly, preview, today.data, post?.id, post?.status, responses.post_id, responses.post_status]);

  const posted = post?.status === 'posted' || responses.post_status === 'posted';
  const passed = post ? post.checks.filter((c) => c.ok).length : 0;
  const progress = posted ? 1 : post ? (passed / Math.max(post.checks.length, 1)) * 0.9 : 0;
  const progressLabel = posted ? 'Posted' : post ? `${passed}/${post.checks.length} always-include` : 'Not started';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: dutyColors.paper }}>
      <RunnerHead title={title} subject={subject || 'Social Studio'} progress={preview ? 0 : progress} progressLabel={preview ? 'Not started' : progressLabel} />
      <RunnerBody>
        {today.isError && !preview ? (
          <Box sx={{ mx: 1.25, mt: 1.25 }}>
            <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => today.refetch()}>Retry</Button>}>
              Could not load today&apos;s post.
            </Alert>
          </Box>
        ) : null}
        <RunnerBand title="Today's post" hint={post ? `${POST_TYPE_LABELS[post.post_type]}${post.category ? ` · ${post.category}` : ''}` : ' '} />
        <RunnerCard tone={posted ? 'good' : 'plain'}>
          {preview ? (
            <Typography variant="body2" color="text.secondary">
              Shows today&apos;s slot from Social Studio and opens it. Done when the post is marked Posted.
            </Typography>
          ) : post ? (
            <>
              <Typography sx={{ fontWeight: 700 }}>{STATUS_LABEL[post.status]}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {post.hook || POST_TYPE_IDEAS[post.post_type]}
              </Typography>
              {!posted ? (
                <Box component="ul" sx={{ m: 0, mb: 1, pl: 2.25 }}>
                  {post.checks.filter((c) => !c.ok).map((c) => (
                    <Typography component="li" variant="body2" key={c.key}>{c.missing}</Typography>
                  ))}
                </Box>
              ) : null}
              <Button
                variant={posted ? 'outlined' : 'contained'}
                size="small"
                onClick={() => navigate(`/studios/social/post/${post.id}`)}
              >
                {posted ? 'View the post' : 'Open in Social Studio'}
              </Button>
            </>
          ) : today.isLoading ? (
            <Typography variant="body2" color="text.secondary">Loading…</Typography>
          ) : (
            <>
              <Typography variant="body2" sx={{ mb: 1 }}>No post is planned for today.</Typography>
              <Button size="small" variant="outlined" onClick={() => navigate('/studios/social')}>Open Social Studio</Button>
            </>
          )}
        </RunnerCard>
      </RunnerBody>
    </Box>
  );
}

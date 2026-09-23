import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Collapse, LinearProgress, Typography } from '@mui/material';
import { visuallyHidden } from '@mui/utils';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useLocation } from 'react-router-dom';
import type { BstockPullResponses } from '../../../api/routines.api';
import {
  deleteBstockLogin,
  fetchManifestPull,
  postBstockLogin,
  postManifestPull,
  stopManifestPull,
} from '../../../api/buying.api';
import type { ManifestPullJob, ManifestPullState } from '../../../types/buying.types';
import { dutyColors } from '../../../components/duty/tokens';
import { RunnerBand, RunnerBody, RunnerCard, RunnerHead } from './runnerParts';
import {
  BSTOCK_LOGIN_URL,
  bstockBookmarklet,
  clearPendingBstockToken,
  markBstockRunnerOpen,
  minutesLeft,
  onBstockLogin,
  peekPendingBstockToken,
  rememberBstockReturn,
} from './bstockHandoff';

const QUERY_KEY = ['buying', 'manifest-pull'] as const;
const SETUP_ID = 'bstock-bookmark-setup';
// A pull of a few dozen manifests needs a few minutes of login left.
const MIN_PULL_SECONDS = 3 * 60;

type ApiError = { response?: { status?: number; data?: { detail?: string } } };

function isLive(job: ManifestPullJob | null | undefined): boolean {
  return job?.status === 'queued' || job?.status === 'running';
}

function isToday(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString();
}

/**
 * Superuser, daily: hand the app your B-Stock login, then pull manifests for the
 * auctions ending soon. The pull runs on the server; this page starts, stops, and
 * watches it. Works the same on a phone at home as at the desk.
 *
 * `preview` (catalog and editor): a static picture, no requests at all.
 */
export function BstockPullRunner({
  title,
  subject,
  responses,
  onChange,
  readOnly,
  preview,
}: {
  title: string;
  subject?: string;
  responses: BstockPullResponses;
  onChange?: (next: BstockPullResponses) => void;
  readOnly?: boolean;
  preview?: boolean;
}) {
  const location = useLocation();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [showSetup, setShowSetup] = useState(false);
  const [pending, setPending] = useState<string | null>(() => (preview || readOnly ? null : peekPendingBstockToken()));
  const jobId = responses.job_id;
  const earlierIds = responses.earlier_job_ids ?? [];
  const interactive = !preview && !readOnly;

  const state = useQuery({
    queryKey: [...QUERY_KEY, jobId],
    queryFn: () => fetchManifestPull(jobId),
    enabled: !preview,
    // Always start from the server: a cached "no job yet" from a minute ago would hide a pull.
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: (query) => {
      if (readOnly) return false;
      return isLive(query.state.data?.job) ? 5000 : 30_000;
    },
  });
  const earlierJobs = useQueries({
    queries: earlierIds.map((id) => ({
      queryKey: [...QUERY_KEY, id],
      queryFn: () => fetchManifestPull(id),
      enabled: !preview,
      staleTime: Infinity,
    })),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  // The hand-off tab announces a new login; show it here without waiting for a poll.
  useEffect(() => (interactive ? onBstockLogin(refresh) : undefined), [interactive]);

  // Let the hand-off tab know this runner is open, so it closes instead of opening a second one.
  useEffect(() => {
    if (!interactive) return undefined;
    markBstockRunnerOpen();
    const timer = setInterval(markBstockRunnerOpen, 10_000);
    return () => clearInterval(timer);
  }, [interactive]);

  const data = state.data;
  const login = data?.login;
  const latest = data?.job ?? null;
  const job = jobId ? latest : null;
  const running = isLive(job);
  const stalled = Boolean(job?.stalled);
  const shortlist = data?.shortlist_count ?? 0;
  const waiting = data?.waiting_retry_count ?? 0;
  const connected = Boolean(login?.connected);
  const secondsLeft = login?.seconds_left ?? 0;
  const nothingToPull = Boolean(data) && shortlist === 0 && !running;

  function update(patch: Partial<BstockPullResponses>) {
    onChange?.({ ...responses, ...patch });
  }

  // One patch per render, so two corrections never overwrite each other:
  // - a pull started for this run but not recorded on it (a quick Cancel, another tab):
  //   today's latest job belongs to today's run, so attach it;
  // - keep the run's copy of the job status and of "nothing to pull" current, so Submit
  //   knows when it can go.
  const attached = useRef(false);
  useEffect(() => {
    if (!interactive || !data) return;
    const patch: Partial<BstockPullResponses> = {};
    if (!jobId && !attached.current && latest && isToday(latest.created_at)) {
      attached.current = true;
      patch.job_id = latest.id;
      patch.job_status = latest.status;
    } else if (job && job.status !== responses.job_status) {
      patch.job_status = job.status;
    }
    const attachedLive = patch.job_id ? isLive(latest) : running;
    const quiet = shortlist === 0 && !attachedLive;
    if (quiet !== Boolean(responses.nothing_to_pull)) patch.nothing_to_pull = quiet;
    if (Object.keys(patch).length) update(patch);
  }, [interactive, data, jobId, latest, job, running, shortlist, responses.job_status, responses.nothing_to_pull]);

  const sendLogin = useMutation({
    mutationFn: postBstockLogin,
    onSuccess: () => {
      clearPendingBstockToken();
      setPending(null);
      refresh();
    },
    onError: (err: ApiError) => {
      if (err.response?.status === 400) {
        clearPendingBstockToken();
        setPending(null);
      }
      enqueueSnackbar(err.response?.data?.detail || 'B-Stock login was not accepted.', { variant: 'error' });
    },
  });

  const startPull = useMutation({
    mutationFn: postManifestPull,
    onSuccess: (next: ManifestPullState) => {
      if (next.job) {
        queryClient.setQueryData([...QUERY_KEY, next.job.id], next);
        const earlier = job && job.id !== next.job.id ? [...earlierIds, job.id] : earlierIds;
        update({ job_id: next.job.id, job_status: next.job.status, earlier_job_ids: earlier });
      }
      refresh();
    },
    onError: (err: ApiError) => {
      enqueueSnackbar(err.response?.data?.detail || 'Could not start the pull.', { variant: 'error' });
      refresh();
    },
  });

  const stopPull = useMutation({ mutationFn: stopManifestPull, onSuccess: refresh });
  const disconnect = useMutation({ mutationFn: deleteBstockLogin, onSuccess: refresh });

  function openBstock() {
    rememberBstockReturn(`${location.pathname}${location.search}`);
    window.open(BSTOCK_LOGIN_URL, '_blank', 'noopener');
  }

  async function copyBookmark() {
    try {
      await navigator.clipboard.writeText(bstockBookmarklet(window.location.origin));
      enqueueSnackbar('Bookmark address copied.', { variant: 'success' });
    } catch {
      enqueueSnackbar('Could not copy. Long-press the address below instead.', { variant: 'warning' });
      setShowSetup(true);
    }
  }

  const loginTooShort = connected && secondsLeft < MIN_PULL_SECONDS;
  const canPull = interactive
    && connected
    && !loginTooShort
    && (!running || stalled)
    && (stalled || shortlist > 0);

  const progress = job?.total ? job.done / job.total : job && !running ? 1 : 0;
  const progressLabel = !job
    ? nothingToPull ? 'Nothing to pull today' : 'Not pulled yet'
    : job.status === 'done'
      ? `${job.ok} of ${job.total} pulled`
      : job.status === 'failed'
        ? 'Stopped: see why below'
        : job.status === 'stopped'
          ? `Stopped · ${job.ok} pulled`
          : stalled
            ? 'Stopped answering'
            : `${job.done} of ${job.total || '…'} checked`;

  let pullLabel = 'Pull manifests';
  if (stalled) pullLabel = 'Resume the pull';
  else if (job && !running) pullLabel = 'Pull the rest';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: dutyColors.paper }}>
      <RunnerHead title={title} subject={subject || 'Buying'} progress={progress} progressLabel={progressLabel} />
      {/* Screen readers hear progress and the end of a pull; the bar only changes attributes. */}
      <Box sx={visuallyHidden} role="status" aria-live="polite">
        {preview ? '' : progressLabel}
      </Box>
      <RunnerBody>
        {state.isError && !preview ? (
          <Box sx={{ mx: 1.25, mt: 1.25 }}>
            <Alert
              severity="error"
              action={<Button color="inherit" size="small" onClick={() => state.refetch()}>Retry</Button>}
            >
              Could not load the pull status.
            </Alert>
          </Box>
        ) : null}

        {!readOnly ? (
          <>
            <RunnerBand title="1. Log in to B-Stock" hint="Opens in a new tab. Stay logged in." />
            <RunnerCard>
              <Button variant="outlined" size="small" onClick={openBstock} disabled={preview}>
                Open B-Stock
              </Button>
            </RunnerCard>

            <RunnerBand title="2. Send your login here" hint="On B-Stock, tap your Send to Eco-Thrift bookmark." />
            {pending ? (
              <RunnerCard tone="warn">
                <Typography sx={{ fontSize: 14, fontWeight: 700, color: dutyColors.ink }}>
                  {connected ? 'A newer B-Stock login is waiting to be sent.' : 'A B-Stock login is waiting to be sent.'}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                  <Button size="small" variant="contained" onClick={() => sendLogin.mutate(pending)} disabled={sendLogin.isPending}>
                    Send it
                  </Button>
                  <Button
                    size="small"
                    onClick={() => {
                      clearPendingBstockToken();
                      setPending(null);
                    }}
                  >
                    Discard
                  </Button>
                </Box>
              </RunnerCard>
            ) : null}
            <RunnerCard tone={connected ? 'good' : 'plain'}>
              <Box>
                <Typography sx={{ fontSize: 14, fontWeight: 700, color: dutyColors.ink }}>
                  {preview
                    ? 'Not connected'
                    : !data
                      ? 'Checking…'
                      : connected
                        ? `Connected · ${minutesLeft(secondsLeft)}`
                        : 'Not connected'}
                </Typography>
              </Box>
              <Typography sx={{ mt: 0.25, fontSize: 12.5, color: dutyColors.ink60 }}>
                B-Stock logins last about an hour. The bookmark opens a tab here; send the login there, then come back.
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mt: 0.75, flexWrap: 'wrap' }}>
                <Button
                  size="small"
                  sx={{ px: 0 }}
                  onClick={() => setShowSetup((open) => !open)}
                  aria-expanded={showSetup}
                  aria-controls={SETUP_ID}
                >
                  {showSetup ? 'Hide bookmark setup' : 'Set up the bookmark (once per device)'}
                </Button>
                {connected && interactive ? (
                  <Button size="small" color="inherit" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
                    Disconnect
                  </Button>
                ) : null}
              </Box>
              <Collapse in={showSetup} id={SETUP_ID}>
                <BookmarkSetup onCopy={copyBookmark} />
              </Collapse>
            </RunnerCard>

            <RunnerBand
              title="3. Pull manifests"
              hint={
                preview || !data
                  ? ' '
                  : shortlist > 0
                    ? `${shortlist} auction${shortlist === 1 ? '' : 's'} ending soon need one`
                    : 'Nothing to pull right now'
              }
            />
            <RunnerCard>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button
                  variant="contained"
                  size="small"
                  disabled={!canPull || startPull.isPending}
                  onClick={() => startPull.mutate()}
                >
                  {pullLabel}
                </Button>
                {running && interactive ? (
                  <Button size="small" variant="outlined" color="error" onClick={() => stopPull.mutate()} disabled={stopPull.isPending}>
                    Stop
                  </Button>
                ) : null}
              </Box>
              {interactive && data && !connected ? (
                <Typography sx={{ mt: 0.75, fontSize: 12.5, color: dutyColors.ink60 }}>Send your login first.</Typography>
              ) : null}
              {interactive && loginTooShort ? (
                <Typography sx={{ mt: 0.75, fontSize: 12.5, color: dutyColors.red }}>
                  Under 3 minutes of login left. Send a fresh one first.
                </Typography>
              ) : null}
              {interactive && data && nothingToPull && !job ? (
                <Typography sx={{ mt: 0.75, fontSize: 12.5, color: dutyColors.ink60 }}>
                  {waiting > 0
                    ? 'Nothing to pull right now. You can finish the routine, or pull again after the retry wait.'
                    : 'Nothing needs a pull today. You can finish the routine.'}
                </Typography>
              ) : null}
              {interactive && data && waiting > 0 ? (
                <Typography sx={{ mt: 0.75, fontSize: 12.5, color: dutyColors.ink60 }}>
                  {waiting} more failed recently. A Pull after the retry wait tries them again.
                </Typography>
              ) : null}
            </RunnerCard>
          </>
        ) : null}

        {job ? <JobResults job={job} /> : null}
        {earlierJobs.map((query, index) => (
          query.data?.job ? (
            <JobResults key={earlierIds[index]} job={query.data.job} heading="Earlier pull" />
          ) : null
        ))}
      </RunnerBody>
    </Box>
  );
}

function BookmarkSetup({ onCopy }: { onCopy: () => void }) {
  const address = bstockBookmarklet(window.location.origin);
  return (
    <Box sx={{ mt: 1, fontSize: 12.5, color: dutyColors.ink60, lineHeight: 1.5 }}>
      <Button size="small" variant="outlined" onClick={onCopy}>
        Copy bookmark address
      </Button>
      <Box component="ol" sx={{ pl: 2.25, my: 1 }}>
        <li>Bookmark any page and name it Send to Eco-Thrift.</li>
        <li>Edit that bookmark and replace its address with the one you copied.</li>
        <li>
          To use it: open an auction or seller page on B-Stock, then tap the bookmark. On Android
          Chrome, type Send to Eco-Thrift in the address bar and tap the bookmark that appears.
        </li>
      </Box>
      <Box
        component="textarea"
        readOnly
        aria-label="Bookmark address"
        value={address}
        onFocus={(e: React.FocusEvent<HTMLTextAreaElement>) => e.currentTarget.select()}
        sx={{
          width: '100%',
          height: 72,
          // 16px keeps iOS Safari from zooming the page when the field takes focus.
          fontSize: 16,
          fontFamily: 'monospace',
          border: `1px solid ${dutyColors.ink15}`,
          borderRadius: '6px',
          p: 0.75,
          resize: 'none',
        }}
      />
    </Box>
  );
}

function JobResults({ job, heading }: { job: ManifestPullJob; heading?: string }) {
  const running = isLive(job);
  return (
    <>
      <RunnerBand
        title={heading ?? (running ? 'Pulling' : job.status === 'done' ? 'Pulled' : 'Pull stopped')}
        hint={running ? 'You can close this; it keeps going and shows here when you come back.' : ' '}
      />
      {running ? (
        <Box sx={{ mx: 1.25, mb: 1 }}>
          <LinearProgress
            variant={job.total ? 'determinate' : 'indeterminate'}
            value={job.total ? (job.done / job.total) * 100 : undefined}
            aria-label={job.total ? `${job.done} of ${job.total} checked` : 'Starting'}
          />
          {job.stalled ? (
            <Typography sx={{ mt: 0.75, fontSize: 12.5, color: dutyColors.red }}>
              This pull stopped answering. Resume it, or Stop it.
            </Typography>
          ) : null}
        </Box>
      ) : null}
      {job.error ? (
        <RunnerCard tone={job.status === 'stopped' ? 'plain' : 'warn'}>
          <Typography sx={{ fontSize: 13, color: job.status === 'stopped' ? dutyColors.ink60 : dutyColors.red }}>
            {job.error}
          </Typography>
        </RunnerCard>
      ) : null}
      {job.status === 'done' && job.total === 0 ? (
        <RunnerCard>
          <Typography sx={{ fontSize: 13, color: dutyColors.ink60 }}>Nothing to pull right now.</Typography>
        </RunnerCard>
      ) : null}
      {job.results.map((row, index) => (
        <RunnerCard key={`${index}-${row.auction_id}`} tone={row.ok ? 'good' : row.skipped ? 'plain' : 'warn'}>
          <Typography
            component="a"
            href={`/buying/auctions/${row.auction_id}`}
            target="_blank"
            rel="noopener noreferrer"
            sx={{ display: 'block', fontSize: 13, fontWeight: 600, color: dutyColors.ink, textDecoration: 'none' }}
          >
            {row.title || `Auction ${row.auction_id}`}
          </Typography>
          <Typography sx={{ fontSize: 12, color: row.ok || row.skipped ? dutyColors.ink60 : dutyColors.red }}>
            {row.ok
              ? `${row.rows} lines${row.unmapped_keys ? ` · ${row.unmapped_keys} categories still to map` : ''}`
              : row.error}
          </Typography>
        </RunnerCard>
      ))}
    </>
  );
}

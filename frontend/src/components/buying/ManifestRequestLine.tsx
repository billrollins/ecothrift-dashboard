import { useEffect, useRef } from 'react';
import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { fetchManifestRequest, postManifestRequest } from '../../api/buying.api';
import {
  markBstockRunnerOpen,
  onBstockLogin,
  rememberBstockReturn,
} from '../../pages/routines/runners/bstockHandoff';
import type { ManifestRequestState } from '../../types/buying.types';

// A pull that sits this long is waiting on a restart (the Scheduler runs every 10 minutes).
const SLOW_PULL_MS = 3 * 60 * 1000;

function ago(iso: string): string {
  return formatDistanceToNow(parseISO(iso), { addSuffix: true });
}

function errorText(err: unknown): string {
  const e = err as { response?: { data?: { detail?: string } } };
  return e.response?.data?.detail || 'Could not reach the app. Try again.';
}

/**
 * Get manifest on one auction (Dash #76, superuser). One button and one fixed-height line:
 * what happens next, in plain words. While the request waits or pulls it checks every 5 s;
 * when the rows arrive it calls `onPulled` so the page loads them in place.
 */
export default function ManifestRequestLine({
  auctionId,
  bstockUrl,
  onPulled,
}: {
  auctionId: number;
  bstockUrl: string | null | undefined;
  onPulled: () => void;
}) {
  const queryClient = useQueryClient();
  const key = ['buying', 'manifestRequest', auctionId];
  const { data: req } = useQuery({
    queryKey: key,
    queryFn: () => fetchManifestRequest(auctionId),
    refetchInterval: (q) => {
      const s = (q.state.data as ManifestRequestState | null | undefined)?.status;
      return s === 'requested' || s === 'pulling' ? 5000 : false;
    },
  });
  const ask = useMutation({
    mutationFn: () => postManifestRequest(auctionId),
    onSuccess: (next) => queryClient.setQueryData(key, next),
  });

  const status = req?.status;
  const waitingForLogin = status === 'requested' && !req?.login_live;

  // A login sent from the B-Stock tab: look again now instead of on the next tick.
  useEffect(
    () => onBstockLogin(() => void queryClient.invalidateQueries({ queryKey: ['buying', 'manifestRequest', auctionId] })),
    [queryClient, auctionId],
  );

  // While waiting for the login, tell the hand-off tab this page is open so it can close itself.
  useEffect(() => {
    if (!waitingForLogin) return undefined;
    markBstockRunnerOpen();
    const t = window.setInterval(markBstockRunnerOpen, 10_000);
    return () => window.clearInterval(t);
  }, [waitingForLogin]);

  const pulledSeen = useRef(false);
  useEffect(() => {
    if (status === 'pulled' && !pulledSeen.current) {
      pulledSeen.current = true;
      onPulled();
    }
  }, [status, onPulled]);

  const canAsk = !status || status === 'failed';
  let line: React.ReactNode;
  if (ask.isError) {
    line = <Typography variant="body2" color="error">{errorText(ask.error)}</Typography>;
  } else if (!req) {
    line = (
      <Typography variant="body2" color="text.secondary">
        Pulls it from B-Stock in about a minute while your B-Stock login is on.
      </Typography>
    );
  } else if (status === 'requested' && waitingForLogin) {
    line = (
      <Stack spacing={0.5} alignItems="center">
        <Typography variant="body2">
          Requested {ago(req.requested_at)}. Your B-Stock login is off.
        </Typography>
        <Button
          size="small"
          variant="outlined"
          component="a"
          href={bstockUrl || 'https://bstock.com/'}
          target="_blank"
          rel="noopener"
          startIcon={<OpenInNewIcon sx={{ fontSize: 16 }} />}
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            rememberBstockReturn(window.location.pathname);
          }}
        >
          Connect B-Stock
        </Button>
        <Typography variant="caption" color="text.secondary">
          On B-Stock, tap your Send to Eco-Thrift bookmark (Chrome: type &quot;Send to&quot; in the address bar;
          Safari: Bookmarks).
        </Typography>
      </Stack>
    );
  } else if (status === 'requested') {
    line = (
      <Typography variant="body2" color={req.note ? 'warning.main' : 'text.secondary'}>
        Requested {ago(req.requested_at)}. {req.note || 'Starting…'}
      </Typography>
    );
  } else if (status === 'pulling') {
    const slow = Date.now() - parseISO(req.requested_at).getTime() > SLOW_PULL_MS;
    line = (
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
        <CircularProgress size={14} />
        <Typography variant="body2">
          {slow ? 'Still pulling. If it stalled, it restarts by itself within 10 minutes.' : 'Pulling from B-Stock…'}
        </Typography>
      </Stack>
    );
  } else if (status === 'failed') {
    line = (
      <Typography variant="body2" color="error">
        Failed: {req.note || 'B-Stock did not send it.'} Tap Retry, or upload the CSV.
      </Typography>
    );
  } else {
    line = <Typography variant="body2" color="success.main">Pulled. Loading the rows…</Typography>;
  }

  return (
    <Stack
      spacing={0.75}
      alignItems="center"
      onClick={(e) => e.stopPropagation()}
      sx={{ width: '100%', maxWidth: 420 }}
      data-testid="manifest-request"
    >
      {canAsk ? (
        <Button variant="contained" size="small" disabled={ask.isPending} onClick={() => ask.mutate()}>
          {ask.isPending ? <CircularProgress size={16} color="inherit" /> : status === 'failed' ? 'Retry' : 'Get manifest'}
        </Button>
      ) : null}
      <Box sx={{ minHeight: 44, textAlign: 'center' }} role="status">
        {line}
      </Box>
    </Stack>
  );
}

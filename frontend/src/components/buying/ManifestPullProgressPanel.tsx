import { Box, LinearProgress, Stack, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import type { BuyingManifestPullLive } from '../../api/buying.api';
import { formatNumber } from '../../utils/format';
import type { ManifestMappingPhase } from './ManifestUploadProgress';

export interface ManifestPullProgressPanelProps {
  live: BuyingManifestPullLive | null;
  /** DB row count from poll; used when ``live`` is null (different gunicorn worker). */
  rowsDownloaded: number;
  /** Elapsed ms while the HTTP pull is in flight. */
  elapsedMs: number;
  /** True while ``postBuyingPullManifest`` is pending. */
  pullActive: boolean;
  /**
   * True after an API pull finishes but client-side AI batches still run
   * (``manifestSource === 'api_pull'`` + mapping phase).
   */
  manifestFollowUpActive: boolean;
  /** Wall time when follow-up mapping started (for elapsed clock). */
  mappingFollowUpAt: number | null;
  mappingPhase: ManifestMappingPhase;
  mappingKeysRemaining: number | null;
  unmappedKeyCountStart: number;
}

function phaseLabel(
  phase: string | null,
  pullActive: boolean,
  followUpOnly: boolean
): string {
  if (followUpOnly) return 'AI categorizing';
  switch (phase) {
    case 'resolving_template':
      return 'Preparing template';
    case 'pulling':
      return 'Downloading manifest';
    case 'ai_mapping':
      return 'AI categorizing';
    case 'finalizing':
      return 'Finalizing';
    default:
      return pullActive ? 'Downloading manifest' : 'Downloading manifest';
  }
}

export function ManifestPullProgressPanel({
  live,
  rowsDownloaded,
  elapsedMs,
  pullActive,
  manifestFollowUpActive,
  mappingFollowUpAt,
  mappingPhase,
  mappingKeysRemaining,
  unmappedKeyCountStart,
}: ManifestPullProgressPanelProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!pullActive && !manifestFollowUpActive) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [pullActive, manifestFollowUpActive]);

  const followUpElapsedMs =
    mappingFollowUpAt != null ? now - mappingFollowUpAt : 0;

  const total = live?.total_rows_hint ?? null;
  const rowsFetched = live?.rows_fetched ?? 0;
  const saved = live != null ? live.rows_saved : rowsDownloaded;

  const rateW1 =
    live != null && elapsedMs > 1500 ? live.rows_fetched / (elapsedMs / 1000) : null;
  const rateW2 =
    elapsedMs > 1500 && saved > 0 ? saved / (elapsedMs / 1000) : null;

  const etaSec = useMemo(() => {
    if (total == null || rateW2 == null || rateW2 < 0.1) return null;
    const remaining = total - saved;
    if (remaining <= 0) return 0;
    return Math.ceil(remaining / rateW2);
  }, [total, rateW2, saved]);

  const showFetchBars = pullActive;

  const showAiBar =
    (pullActive && live?.phase === 'ai_mapping') ||
    (manifestFollowUpActive && mappingPhase === 'mapping');

  const aiFromBackend = pullActive && live?.phase === 'ai_mapping';
  const aiKeysTotal =
    aiFromBackend && live
      ? Math.max(0, live.ai_mappings_created + (live.keys_remaining ?? 0))
      : 0;
  const aiDoneBackend = live?.ai_mappings_created ?? 0;

  const aiDoneClient =
    unmappedKeyCountStart > 0 && mappingKeysRemaining != null
      ? unmappedKeyCountStart - mappingKeysRemaining
      : 0;
  const aiTotalClient = unmappedKeyCountStart;

  const aiPct = useMemo(() => {
    if (live?.ai_error === 'ai_not_configured') return 0;
    if (aiFromBackend && aiKeysTotal > 0) {
      return Math.min(100, (aiDoneBackend / aiKeysTotal) * 100);
    }
    if (manifestFollowUpActive && mappingPhase === 'mapping' && aiTotalClient > 0) {
      return Math.min(100, (aiDoneClient / aiTotalClient) * 100);
    }
    if (aiFromBackend && aiKeysTotal === 0 && (live?.keys_remaining ?? 0) === 0) {
      return 100;
    }
    return 0;
  }, [
    aiFromBackend,
    aiKeysTotal,
    aiDoneBackend,
    manifestFollowUpActive,
    mappingPhase,
    aiTotalClient,
    aiDoneClient,
    live?.keys_remaining,
    live?.ai_error,
  ]);

  const lagHint =
    live != null && live.rows_saved < live.rows_fetched
      ? 'Worker 2 lagging'
      : live != null && live.rows_fetched > 0 && live.rows_saved >= live.rows_fetched
        ? 'Caught up'
        : null;

  const headerElapsedSec = pullActive
    ? Math.floor(elapsedMs / 1000)
    : Math.floor(followUpElapsedMs / 1000);

  const followUpOnly = manifestFollowUpActive && !pullActive;
  const phase = phaseLabel(live?.phase ?? null, pullActive, followUpOnly);

  const indeterminateBars = showFetchBars && (live == null || total == null);

  return (
    <Box
      sx={{
        p: 1.25,
        borderRadius: 1,
        border: 1,
        borderColor: 'primary.light',
        bgcolor: (t) => (t.palette.mode === 'dark' ? 'primary.dark' : 'primary.50'),
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
        sx={{ mb: 0.75 }}
        flexWrap="wrap"
      >
        <Typography variant="body2" fontWeight={600}>
          {pullActive ? 'Downloading manifest via API…' : 'Finishing AI mapping…'}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {phase} · {headerElapsedSec}s elapsed
          {etaSec != null && pullActive && total != null ? ` · ~${etaSec}s remaining` : ''}
        </Typography>
      </Stack>

      {showFetchBars ? (
        <>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ mb: 0.25 }}
          >
            <Typography variant="caption" color="text.secondary">
              Fetching from B-Stock
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {live == null
                ? '—'
                : total != null
                  ? `${formatNumber(rowsFetched)} / ${formatNumber(total)} rows`
                  : 'Warming up…'}
              {rateW1 != null && live != null ? ` · ~${rateW1.toFixed(1)} rows/s` : ''}
            </Typography>
          </Stack>
          <LinearProgress
            variant={indeterminateBars ? 'indeterminate' : 'determinate'}
            value={
              indeterminateBars || !total ? undefined : (rowsFetched / total) * 100
            }
            sx={{ height: 6, borderRadius: 3, mb: 0.75 }}
          />

          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ mb: 0.25 }}
          >
            <Typography variant="caption" color="text.secondary">
              Processing + fast_cat
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {total != null ? (
                <>
                  {formatNumber(saved)} / {formatNumber(total)} rows
                  {rateW2 != null ? ` · ~${rateW2.toFixed(1)} rows/s` : ''}
                  {lagHint ? ` · ${lagHint}` : ''}
                </>
              ) : (
                'Warming up…'
              )}
            </Typography>
          </Stack>
          <LinearProgress
            variant={indeterminateBars ? 'indeterminate' : 'determinate'}
            value={indeterminateBars || !total ? undefined : (saved / total) * 100}
            color="secondary"
            sx={{ height: 6, borderRadius: 3, mb: 0.75 }}
          />
        </>
      ) : null}

      {showAiBar ? (
        <>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ mb: 0.25, mt: showFetchBars ? 0 : 0 }}
          >
            <Typography variant="caption" color="text.secondary">
              AI categorizing new keys
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {live?.ai_error === 'ai_not_configured'
                ? 'AI unavailable — set API key and retry'
                : aiFromBackend && live
                  ? `${formatNumber(aiDoneBackend)} / ${formatNumber(aiKeysTotal)} keys`
                  : `${formatNumber(aiDoneClient)} / ${formatNumber(aiTotalClient)} keys`}
            </Typography>
          </Stack>
          <LinearProgress
            variant={live?.ai_error === 'ai_not_configured' ? 'indeterminate' : 'determinate'}
            value={live?.ai_error === 'ai_not_configured' ? undefined : aiPct}
            sx={{ height: 6, borderRadius: 3, mb: 0.75 }}
          />
        </>
      ) : null}

      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
        B-Stock caps the manifest API at 10 rows/page; the worker saves each batch to the DB
        as it arrives. AI categorization runs after rows are saved (or continues below if keys
        remain).
      </Typography>
    </Box>
  );
}

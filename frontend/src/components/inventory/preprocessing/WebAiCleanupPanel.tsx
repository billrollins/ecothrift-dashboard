import { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  LinearProgress,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import AutoFixHighOutlined from '@mui/icons-material/AutoFixHighOutlined';
import PauseCircleOutline from '@mui/icons-material/PauseCircleOutline';
import PlayCircleOutline from '@mui/icons-material/PlayCircleOutline';
import ReplayOutlined from '@mui/icons-material/ReplayOutlined';
import { useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  aiCleanupBatch,
  aiCleanupComplete,
  getAICleanupStatus,
} from '../../../api/inventory.api';
import { useAICleanupStatus, useCancelAICleanup } from '../../../hooks/useInventory';
import {
  AI_CLEANUP_BATCH_SIZE,
  AI_CLEANUP_DEFAULT_CONCURRENCY,
  partitionRowIds,
  runCleanupPool,
  type CleanupPoolProgress,
} from '../../../utils/aiCleanupPool';
import { preprocessingFonts } from './preprocessingTokens';

interface WebAiCleanupPanelProps {
  orderId: number;
}

type RunState = 'idle' | 'running' | 'pausing';

const CONCURRENCY_CHOICES = [1, 2, 4, 8];

/**
 * Step 2 primary path: click-to-run AI cleanup as a browser worker pool of small
 * `ai-cleanup-batch` POSTs (verdict: batch 10, concurrency default 4, cap 8).
 * Pause is client-side (in-flight batches finish and save); resume re-fetches
 * `uncleaned_row_ids` and processes only what's left. A generation bump
 * (undo / Cancel cleanup) stops the pool — the server discards those saves.
 */
export function WebAiCleanupPanel({ orderId }: WebAiCleanupPanelProps) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const statusQuery = useAICleanupStatus(orderId);
  const cancelCleanup = useCancelAICleanup();

  const [runState, setRunState] = useState<RunState>('idle');
  const [concurrency, setConcurrency] = useState(AI_CLEANUP_DEFAULT_CONCURRENCY);
  const [progress, setProgress] = useState<CleanupPoolProgress | null>(null);
  const [banner, setBanner] = useState<{ severity: 'success' | 'info' | 'warning' | 'error'; message: string } | null>(null);
  const pausedRef = useRef(false);
  const startedAtRef = useRef(0);

  const status = statusQuery.data ?? null;
  const totalRows = status?.total_rows ?? 0;
  const cleanedRows = status?.cleaned_rows ?? 0;
  const remainingRows = status?.remaining_rows ?? 0;
  const isRunning = runState !== 'idle';

  const invalidateAfterRun = () => {
    void queryClient.invalidateQueries({ queryKey: ['aiCleanupStatus', orderId] });
    void queryClient.invalidateQueries({ queryKey: ['preprocessingStatus', orderId] });
    void queryClient.invalidateQueries({ queryKey: ['preprocessingReview', orderId] });
  };

  const rate = useMemo(() => {
    if (!progress || !startedAtRef.current) return null;
    const elapsedS = (Date.now() - startedAtRef.current) / 1000;
    if (elapsedS <= 0 || progress.rowsSaved <= 0) return null;
    const rowsPerSec = progress.rowsSaved / elapsedS;
    const batchesLeft = progress.batchesTotal - progress.batchesDone;
    const etaS = rowsPerSec > 0 ? Math.round((batchesLeft * AI_CLEANUP_BATCH_SIZE) / rowsPerSec) : null;
    return { rowsPerSec, etaS };
  }, [progress]);

  const handleRun = async () => {
    setBanner(null);
    pausedRef.current = false;
    setRunState('running');
    startedAtRef.current = Date.now();
    try {
      const { data: fresh } = await getAICleanupStatus(orderId);
      const uncleaned = fresh.uncleaned_row_ids ?? [];
      if (!uncleaned.length) {
        const { data: completion } = await aiCleanupComplete(orderId);
        setBanner({
          severity: 'success',
          message: `All ${completion.total_rows} row(s) already cleaned — match candidates refreshed (${completion.match_candidates.rows_with_candidates} row(s) with candidates).`,
        });
        invalidateAfterRun();
        return;
      }

      const batches = partitionRowIds(uncleaned, AI_CLEANUP_BATCH_SIZE);
      setProgress({ batchesDone: 0, batchesTotal: batches.length, rowsSaved: 0, rowsDiscarded: 0, failedBatches: 0 });

      const outcome = await runCleanupPool(
        batches,
        concurrency,
        async (rowIds) => {
          const { data } = await aiCleanupBatch(orderId, { row_ids: rowIds });
          return {
            rowIds,
            rowsSaved: data.rows_saved,
            discarded: data.discarded_rows.length,
            cancelled: data.cancelled,
          };
        },
        {
          isPaused: () => pausedRef.current,
          onProgress: setProgress,
        },
      );

      if (outcome.stoppedByGeneration) {
        setBanner({
          severity: 'warning',
          message: 'Cleanup was cancelled or undone while running — stopped. Nothing from in-flight batches was saved.',
        });
        return;
      }
      if (outcome.stoppedByPause) {
        setBanner({
          severity: 'info',
          message: `Paused — ${outcome.rowsSaved} row(s) saved this run. Click Run AI Cleanup to resume the remaining rows.`,
        });
        return;
      }

      const failedRowCount = outcome.failedBatches.reduce((sum, f) => sum + f.rowIds.length, 0);
      const discardNote = outcome.rowsDiscarded ? ` ${outcome.rowsDiscarded} row(s) need another pass (model output discarded).` : '';
      if (outcome.failedBatches.length || outcome.rowsDiscarded) {
        setBanner({
          severity: 'warning',
          message:
            `Finished with gaps: ${outcome.rowsSaved} row(s) saved, ${failedRowCount} row(s) in ${outcome.failedBatches.length} failed batch(es).` +
            `${discardNote} Click Run AI Cleanup to retry just the remaining rows.`,
        });
        return;
      }

      const { data: after } = await getAICleanupStatus(orderId);
      if ((after.remaining_rows ?? 0) === 0) {
        const { data: completion } = await aiCleanupComplete(orderId);
        setBanner({
          severity: 'success',
          message: `Cleaned ${outcome.rowsSaved} row(s). Match candidates generated for ${completion.match_candidates.rows_with_candidates} row(s) (${completion.match_candidates.auto_selected} auto-selected).`,
        });
      } else {
        setBanner({
          severity: 'info',
          message: `Saved ${outcome.rowsSaved} row(s); ${after.remaining_rows} still uncleaned. Run again to continue.`,
        });
      }
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setBanner({ severity: 'error', message: detail || 'AI cleanup run failed.' });
    } finally {
      invalidateAfterRun();
      setRunState('idle');
      pausedRef.current = false;
    }
  };

  const handlePause = () => {
    pausedRef.current = true;
    setRunState('pausing');
    enqueueSnackbar('Pausing — in-flight batches will finish and save.', { variant: 'info' });
  };

  // Full undo: clears ai_* + final_* + match decisions, resets order flags, bumps the
  // generation (server cancel-ai-cleanup now mirrors the timeline "Before AI cleanup").
  const handleUndoCleanup = () => {
    if (!window.confirm('Undo AI cleanup? This clears all AI titles, prices, and product match decisions for this order.')) return;
    cancelCleanup.mutate(orderId, {
      onSuccess: (data) => {
        setBanner({ severity: 'info', message: `Cleanup undone — ${data.rows_cleared} row(s) reset to standardized.` });
        invalidateAfterRun();
      },
      onError: () => setBanner({ severity: 'error', message: 'Failed to undo cleanup.' }),
    });
  };

  const pct = progress && progress.batchesTotal > 0 ? Math.round((progress.batchesDone / progress.batchesTotal) * 100) : 0;

  return (
    <Box sx={{ border: '1px solid #B8D4C8', borderRadius: '8px', p: 3, mb: 2, bgcolor: '#FBFDFC' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5, mb: 1 }}>
        <Box>
          <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#1B4332', fontFamily: preprocessingFonts.sans }}>
            Run AI Cleanup
          </Typography>
          <Typography sx={{ fontSize: 13, color: '#666', fontFamily: preprocessingFonts.sans }}>
            Cleans rows in small batches of {AI_CLEANUP_BATCH_SIZE} — progress saves as it goes, and you can pause and resume any time.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Chip
            size="small"
            label={`${cleanedRows}/${totalRows} cleaned`}
            sx={{ bgcolor: remainingRows === 0 && totalRows > 0 ? '#D4EDDA' : '#F0F7F4', color: '#1B4332', fontWeight: 600 }}
          />
          <TextField
            select
            size="small"
            label="Workers"
            value={concurrency}
            onChange={(e) => setConcurrency(Number(e.target.value))}
            disabled={isRunning}
            sx={{ width: 96 }}
          >
            {CONCURRENCY_CHOICES.map((n) => (
              <MenuItem key={n} value={n}>{n}</MenuItem>
            ))}
          </TextField>
          {!isRunning && remainingRows === 0 && totalRows > 0 ? (
            <Button
              variant="outlined"
              color="warning"
              startIcon={<ReplayOutlined />}
              onClick={handleUndoCleanup}
              disabled={cancelCleanup.isPending}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              {cancelCleanup.isPending ? 'Undoing…' : 'Undo cleanup'}
            </Button>
          ) : !isRunning ? (
            <Button
              variant="contained"
              startIcon={remainingRows < totalRows && remainingRows > 0 ? <PlayCircleOutline /> : <AutoFixHighOutlined />}
              onClick={() => void handleRun()}
              disabled={statusQuery.isLoading || totalRows === 0}
              sx={{ bgcolor: '#2D6A4F', textTransform: 'none', fontWeight: 600 }}
            >
              {remainingRows < totalRows && remainingRows > 0
                ? `Resume (${remainingRows} left)`
                : 'Run AI Cleanup'}
            </Button>
          ) : (
            <Button
              variant="outlined"
              color="warning"
              startIcon={<PauseCircleOutline />}
              onClick={handlePause}
              disabled={runState === 'pausing'}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              {runState === 'pausing' ? 'Pausing…' : 'Pause'}
            </Button>
          )}
        </Box>
      </Box>

      {isRunning && progress && (
        <Box sx={{ mt: 1.5 }}>
          <LinearProgress variant="determinate" value={pct} sx={{ height: 8, borderRadius: 4 }} />
          <Box sx={{ display: 'flex', gap: 2, mt: 0.75, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: 12, color: '#555', fontFamily: preprocessingFonts.mono }}>
              batch {progress.batchesDone}/{progress.batchesTotal}
            </Typography>
            <Typography sx={{ fontSize: 12, color: '#555', fontFamily: preprocessingFonts.mono }}>
              {progress.rowsSaved} rows saved
            </Typography>
            {progress.failedBatches > 0 && (
              <Typography sx={{ fontSize: 12, color: '#c0392b', fontFamily: preprocessingFonts.mono }}>
                {progress.failedBatches} failed batch(es)
              </Typography>
            )}
            {rate && (
              <Typography sx={{ fontSize: 12, color: '#555', fontFamily: preprocessingFonts.mono }}>
                {rate.rowsPerSec.toFixed(1)} rows/s{rate.etaS != null ? ` — ~${rate.etaS}s left` : ''}
              </Typography>
            )}
          </Box>
        </Box>
      )}

      {banner && (
        <Alert severity={banner.severity} sx={{ mt: 1.5 }} onClose={() => setBanner(null)}>
          {banner.message}
        </Alert>
      )}
    </Box>
  );
}

import { useEffect, useRef, useState } from 'react';
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
import PlayCircleOutline from '@mui/icons-material/PlayCircleOutline';
import ReplayOutlined from '@mui/icons-material/ReplayOutlined';
import StopCircleOutlined from '@mui/icons-material/StopCircleOutlined';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getCleanupJob,
  startCleanupJob,
  stopCleanupJob,
  type CleanupEffort,
  type CleanupJobState,
} from '../../../api/inventory.api';
import { useCancelAICleanup, useCleanupModels } from '../../../hooks/useInventory';
import { AI_CLEANUP_BATCH_SIZE_OPTIONS, AI_CLEANUP_DEFAULT_BATCH_SIZE, AI_CLEANUP_DEFAULT_CONCURRENCY } from '../../../utils/aiCleanupPool';
import { finishedBanner, type CleanupBanner } from './cleanupJobBanner';
import { preprocessingFonts } from './preprocessingTokens';

interface WebAiCleanupPanelProps {
  orderId: number;
}

const CONCURRENCY_CHOICES = [1, 2, 4, 8];
const EFFORT_CHOICES: CleanupEffort[] = ['off', 'low', 'medium', 'high', 'max'];
const EFFORT_WORDS: Record<CleanupEffort, string> = { off: 'Off', low: 'Low', medium: 'Medium', high: 'High', max: 'Max' };
const POLL_MS = 2000;

const isActive = (job: CleanupJobState | null | undefined) => job?.status === 'running' || job?.status === 'stopping';

function apiDetail(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return detail || fallback;
}

/**
 * Step 2 primary path: AI cleanup as a **background job on the server**. Run starts the job and
 * returns at once; this panel polls its progress. No web request waits for a model, so slow models
 * work, and the page can be closed and reopened while it runs. Every saved row is kept: Stop and
 * Resume (or a server restart) lose nothing.
 */
export function WebAiCleanupPanel({ orderId }: WebAiCleanupPanelProps) {
  const queryClient = useQueryClient();
  const modelsQuery = useCleanupModels(orderId);
  const cancelCleanup = useCancelAICleanup();

  const [concurrency, setConcurrency] = useState(AI_CLEANUP_DEFAULT_CONCURRENCY);
  const [batchSize, setBatchSize] = useState<number>(AI_CLEANUP_DEFAULT_BATCH_SIZE);
  const [selectedModel, setSelectedModel] = useState('');
  const [effort, setEffort] = useState<CleanupEffort | ''>('');
  const [banner, setBanner] = useState<CleanupBanner | null>(null);
  const [busy, setBusy] = useState(false);
  const wasActive = useRef(false);

  const jobQuery = useQuery({
    queryKey: ['aiCleanupJob', orderId],
    queryFn: async () => (await getCleanupJob(orderId)).data,
    refetchInterval: (query) => (isActive(query.state.data) ? POLL_MS : false),
  });
  const job = jobQuery.data ?? null;
  const running = isActive(job);

  const cleanupModels = modelsQuery.data?.models ?? [];
  const defaultModel = modelsQuery.data?.default ?? '';
  const defaultEffort = modelsQuery.data?.default_effort ?? 'off';
  const efforts = modelsQuery.data?.efforts ?? EFFORT_CHOICES;

  useEffect(() => {
    if (!defaultModel) return;
    setSelectedModel((prev) => (prev && cleanupModels.some((m) => m.id === prev) ? prev : defaultModel));
  }, [defaultModel, cleanupModels]);

  useEffect(() => {
    setEffort((prev) => prev || defaultEffort);
  }, [defaultEffort]);

  // While a job runs, the controls show what that job is using (it may have been started elsewhere).
  useEffect(() => {
    if (!running || !job) return;
    if (job.model) setSelectedModel(job.model);
    if (job.effort) setEffort(job.effort);
    if (job.batch_size) setBatchSize(job.batch_size);
    if (job.concurrency) setConcurrency(job.concurrency);
  }, [running, job?.model, job?.effort, job?.batch_size, job?.concurrency]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshOrder = () => {
    void queryClient.invalidateQueries({ queryKey: ['aiCleanupStatus', orderId] });
    void queryClient.invalidateQueries({ queryKey: ['preprocessingStatus', orderId] });
    void queryClient.invalidateQueries({ queryKey: ['preprocessingReview', orderId] });
  };

  // The job just ended: say how it went and refresh what the rest of the page shows.
  useEffect(() => {
    if (running) {
      wasActive.current = true;
      return;
    }
    if (wasActive.current && job) {
      wasActive.current = false;
      setBanner(finishedBanner(job));
      refreshOrder();
    }
  }, [running, job]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalRows = job?.total_rows ?? 0;
  const cleanedRows = job?.cleaned_rows ?? 0;
  const remainingRows = job?.remaining_rows ?? 0;

  const handleRun = async () => {
    setBanner(null);
    setBusy(true);
    try {
      const { data } = await startCleanupJob(orderId, {
        model: selectedModel,
        effort: (effort || defaultEffort) as CleanupEffort,
        batch_size: batchSize,
        concurrency,
      });
      wasActive.current = true;
      queryClient.setQueryData(['aiCleanupJob', orderId], data);
      void jobQuery.refetch();
    } catch (err) {
      setBanner({ severity: 'error', message: apiDetail(err, 'Could not start AI cleanup.') });
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    try {
      const { data } = await stopCleanupJob(orderId);
      queryClient.setQueryData(['aiCleanupJob', orderId], data);
    } catch (err) {
      setBanner({ severity: 'error', message: apiDetail(err, 'Could not stop the cleanup.') });
    } finally {
      setBusy(false);
    }
  };

  // Full undo: clears ai_* + final_* + match decisions, resets order flags, bumps the
  // generation (server cancel-ai-cleanup mirrors the timeline "Before AI cleanup").
  const handleUndoCleanup = () => {
    if (!window.confirm('Undo AI cleanup? This clears all AI titles, prices, and product match decisions for this order.')) return;
    cancelCleanup.mutate(orderId, {
      onSuccess: (data) => {
        setBanner({ severity: 'info', message: `Cleanup undone - ${data.rows_cleared} row(s) reset to standardized.` });
        refreshOrder();
        void jobQuery.refetch();
      },
      onError: () => setBanner({ severity: 'error', message: 'Failed to undo cleanup.' }),
    });
  };

  const atStart = job?.rows_at_start ?? 0;
  const doneThisJob = Math.max(0, atStart - remainingRows);
  const pct = atStart > 0 ? Math.min(100, Math.round((doneThisJob / atStart) * 100)) : 0;
  const elapsed = job?.elapsed_seconds ?? 0;
  const rowsPerSec = running && elapsed > 0 && (job?.rows_saved ?? 0) > 0 ? (job?.rows_saved ?? 0) / elapsed : 0;
  const etaS = rowsPerSec > 0 ? Math.round(remainingRows / rowsPerSec) : null;
  const allDone = !running && remainingRows === 0 && totalRows > 0;
  const partlyDone = remainingRows > 0 && remainingRows < totalRows;
  const mono = { fontSize: 12, color: '#555', fontFamily: preprocessingFonts.mono };

  return (
    <Box sx={{ border: '1px solid #B8D4C8', borderRadius: '8px', p: 3, mb: 2, bgcolor: '#FBFDFC' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5, mb: 1 }}>
        <Box>
          <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#1B4332', fontFamily: preprocessingFonts.sans }}>
            Run AI Cleanup
          </Typography>
          <Typography sx={{ fontSize: 13, color: '#666', fontFamily: preprocessingFonts.sans }}>
            Runs on the server in the background. Progress saves as it goes; you can leave this page, and stop and resume any time.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Chip
            size="small"
            label={`${cleanedRows}/${totalRows} cleaned`}
            sx={{ bgcolor: remainingRows === 0 && totalRows > 0 ? '#D4EDDA' : '#F0F7F4', color: '#1B4332', fontWeight: 600 }}
          />
          <TextField
            select
            size="small"
            label="Model"
            value={cleanupModels.some((m) => m.id === selectedModel) ? selectedModel : ''}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={running || modelsQuery.isLoading || cleanupModels.length === 0}
            sx={{ minWidth: 200 }}
          >
            {cleanupModels.map((m) => (
              <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Effort"
            value={effort || defaultEffort}
            onChange={(e) => setEffort(e.target.value as CleanupEffort)}
            disabled={running}
            sx={{ width: 112 }}
          >
            {efforts.map((e) => (
              <MenuItem key={e} value={e}>{EFFORT_WORDS[e] ?? e}</MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Rows/batch"
            value={batchSize}
            onChange={(e) => setBatchSize(Number(e.target.value))}
            disabled={running}
            sx={{ width: 108 }}
          >
            {AI_CLEANUP_BATCH_SIZE_OPTIONS.map((n) => (
              <MenuItem key={n} value={n}>{n}</MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Workers"
            value={concurrency}
            onChange={(e) => setConcurrency(Number(e.target.value))}
            disabled={running}
            sx={{ width: 96 }}
          >
            {CONCURRENCY_CHOICES.map((n) => (
              <MenuItem key={n} value={n}>{n}</MenuItem>
            ))}
          </TextField>
          {running ? (
            <Button
              variant="outlined"
              color="warning"
              startIcon={<StopCircleOutlined />}
              onClick={() => void handleStop()}
              disabled={busy || job?.status === 'stopping'}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              {job?.status === 'stopping' ? 'Stopping…' : 'Stop'}
            </Button>
          ) : allDone ? (
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
          ) : (
            <Button
              variant="contained"
              startIcon={partlyDone ? <PlayCircleOutline /> : <AutoFixHighOutlined />}
              onClick={() => void handleRun()}
              disabled={busy || jobQuery.isLoading || modelsQuery.isLoading || !selectedModel || totalRows === 0}
              sx={{ bgcolor: '#2D6A4F', textTransform: 'none', fontWeight: 600 }}
            >
              {partlyDone ? `Resume (${remainingRows} left)` : 'Run AI Cleanup'}
            </Button>
          )}
        </Box>
      </Box>

      {running && job && (
        <Box sx={{ mt: 1.5 }} data-testid="cleanup-job-progress">
          <LinearProgress variant={atStart > 0 ? 'determinate' : 'indeterminate'} value={pct} sx={{ height: 8, borderRadius: 4 }} />
          <Box sx={{ display: 'flex', gap: 2, mt: 0.75, flexWrap: 'wrap' }}>
            <Typography sx={mono}>
              {doneThisJob}/{atStart} rows
            </Typography>
            <Typography sx={mono}>batch {job.batches_done ?? 0}</Typography>
            {(job.failed_batches ?? 0) > 0 && (
              <Typography sx={{ ...mono, color: '#c0392b' }}>{job.failed_batches} failed batch(es), will retry</Typography>
            )}
            {rowsPerSec > 0 && (
              <Typography sx={mono}>
                {rowsPerSec.toFixed(1)} rows/s{etaS != null ? ` - ~${etaS}s left` : ''}
              </Typography>
            )}
            <Typography sx={mono}>
              {job.model} · effort {job.effort ?? 'off'}
              {job.started_by ? ` · started by ${job.started_by}` : ''}
            </Typography>
            {(job.restarts ?? 0) > 0 && <Typography sx={mono}>picked up again {job.restarts}x after a server restart</Typography>}
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

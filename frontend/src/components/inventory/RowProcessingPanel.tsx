import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AutoAwesome from '@mui/icons-material/AutoAwesome';
import PauseCircle from '@mui/icons-material/PauseCircle';
import CancelOutlined from '@mui/icons-material/CancelOutlined';
import PlayArrow from '@mui/icons-material/PlayArrow';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import ExpandMore from '@mui/icons-material/ExpandMore';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ModelSelector from '../common/ModelSelector';
import { useQueryClient } from '@tanstack/react-query';
import { useAICleanupRows, useAICleanupStatus, useCancelAICleanup } from '../../hooks/useInventory';
import type { ManifestRow } from '../../types/inventory.types';
import type { AICleanupTiming } from '../../api/inventory.api';

const BATCH_SIZE_OPTIONS = [5, 10, 25, 50];
const CONCURRENCY_OPTIONS = [1, 4, 8, 16];

const LS_KEY_PREFIX = 'ecothrift_cleanup_';

interface LogEntry {
  id: number;
  timestamp: Date;
  message: string;
  level: 'info' | 'success' | 'error' | 'warning';
  timing?: AICleanupTiming;
}

function formatMs(ms: number | undefined): string {
  if (ms == null || Number.isNaN(ms)) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

interface RowProcessingPanelProps {
  orderId: number;
  rows: ManifestRow[];
  completedStep: number;
  onClearCleanup: () => void;
  isClearingCleanup: boolean;
}

type CleanupState = 'idle' | 'running' | 'paused' | 'done';

function DetailField({ label, value, changed }: { label: string; value: string; changed?: boolean }) {
  const display = value || '—';
  return (
    <Box sx={{ mb: 0.75 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          fontWeight: changed ? 700 : 400,
          color: changed ? 'warning.dark' : 'text.primary',
        }}
      >
        {display}
      </Typography>
    </Box>
  );
}

export function RowProcessingPanel({
  orderId,
  rows,
  completedStep,
  onClearCleanup,
  isClearingCleanup,
}: RowProcessingPanelProps) {
  const queryClient = useQueryClient();
  const aiCleanupMutation = useAICleanupRows();
  const { data: cleanupStatus, refetch: refetchStatus } = useAICleanupStatus(orderId);
  const cancelCleanupMutation = useCancelAICleanup();

  const [modelId, setModelId] = useState('');
  const [batchSize, setBatchSize] = useState(10);
  const [concurrency, setConcurrency] = useState(1);
  const [cleanupState, setCleanupState] = useState<CleanupState>('idle');
  const [currentOffset, setCurrentOffset] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [cleanupError, setCleanupError] = useState('');
  const [activeWorkers, setActiveWorkers] = useState(0);

  const [activityLog, setActivityLog] = useState<LogEntry[]>([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [avgBatchMs, setAvgBatchMs] = useState(0);
  const [localProcessed, setLocalProcessed] = useState(0);
  const logIdRef = useRef(0);
  const startTimeRef = useRef<number | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const localProcessedRef = useRef(0);
  const knownTotalRef = useRef(0);

  const pauseRef = useRef(false);
  const cancelledRef = useRef(false);
  const nextOffsetRef = useRef(0);

  const [expandedCleanupRows, setExpandedCleanupRows] = useState<Set<number>>(new Set());
  const [tableSearch, setTableSearch] = useState('');

  const serverCleaned = cleanupStatus?.cleaned_rows ?? rows.filter((r) => r.ai_reasoning).length;
  const totalCount = cleanupStatus?.total_rows ?? rows.length;
  const liveProcessed = cleanupState === 'idle'
    ? serverCleaned
    : Math.max(localProcessed, serverCleaned);
  const cleanupDone = totalCount > 0 && liveProcessed >= totalCount;

  useEffect(() => {
    const saved = localStorage.getItem(`${LS_KEY_PREFIX}${orderId}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.offset > 0 && parsed.offset < (cleanupStatus?.total_rows ?? Infinity)) {
          setCurrentOffset(parsed.offset);
          setCleanupState('paused');
        }
      } catch { /* ignore bad data */ }
    }
  }, [orderId, cleanupStatus?.total_rows]);

  useEffect(() => {
    if (cleanupDone && cleanupState === 'idle') {
      setCleanupState('done');
    }
  }, [cleanupDone, cleanupState]);

  const addLogEntry = useCallback((message: string, level: LogEntry['level'] = 'info', timing?: AICleanupTiming) => {
    logIdRef.current += 1;
    const entry: LogEntry = { id: logIdRef.current, timestamp: new Date(), message, level, timing };
    setActivityLog((prev) => [...prev.slice(-200), entry]);
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, []);

  const startElapsedTimer = useCallback(() => {
    startTimeRef.current = performance.now();
    setElapsedMs(0);
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = setInterval(() => {
      if (startTimeRef.current != null) {
        setElapsedMs(performance.now() - startTimeRef.current);
      }
    }, 500);
  }, []);

  const stopElapsedTimer = useCallback(() => {
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => { if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current); };
  }, []);

  const runBatchLoop = useCallback(async (startOffset: number) => {
    pauseRef.current = false;
    cancelledRef.current = false;
    nextOffsetRef.current = startOffset;
    localProcessedRef.current = 0;
    knownTotalRef.current = 0;
    setLocalProcessed(0);
    setCleanupState('running');
    setCleanupError('');
    startElapsedTimer();

    const workerCount = concurrency;
    let firstError: string | null = null;
    let allDone = false;
    let batchNum = 0;
    const batchTimings: number[] = [];

    addLogEntry(`Starting cleanup with ${workerCount} worker(s), batch size ${batchSize}`, 'info');

    const worker = async () => {
      while (!pauseRef.current && !cancelledRef.current && !firstError && !allDone) {
        const myOffset = nextOffsetRef.current;

        if (knownTotalRef.current > 0 && myOffset >= knownTotalRef.current) {
          return;
        }

        nextOffsetRef.current += batchSize;
        setCurrentOffset(nextOffsetRef.current);
        const thisBatch = ++batchNum;
        const rowStart = myOffset + 1;
        const rowEnd = Math.min(myOffset + batchSize, knownTotalRef.current || myOffset + batchSize);

        addLogEntry(`Batch ${thisBatch} (rows ${rowStart}-${rowEnd}): Sending to AI...`, 'info');

        try {
          const result = await aiCleanupMutation.mutateAsync({
            orderId,
            data: { model: modelId || undefined, batch_size: batchSize, offset: myOffset },
          });

          setTotalRows(result.total_rows);
          knownTotalRef.current = result.total_rows;

          const saved = result.rows_saved ?? result.rows_processed;
          if (saved > 0) {
            localProcessedRef.current += saved;
            setLocalProcessed(localProcessedRef.current);
          }

          const t = result.timing;
          if (t && saved > 0 && t.total_ms != null) {
            batchTimings.push(t.total_ms);
            const avg = batchTimings.reduce((a, b) => a + b, 0) / batchTimings.length;
            setAvgBatchMs(avg);
            addLogEntry(
              `Batch ${thisBatch} done: ${saved}/${result.rows_processed} rows saved in ${formatMs(t.total_ms)} ` +
              `(API: ${formatMs(t.api_call_ms)}, DB save: ${formatMs(t.db_save_ms)}` +
              `${result.stop_reason === 'max_tokens' ? ', TRUNCATED' : ''}` +
              `${(t.retries ?? 0) > 0 ? `, ${t.retries} retry` : ''})`,
              result.stop_reason === 'max_tokens' ? 'warning' : 'success',
              t,
            );
          } else if (saved > 0) {
            addLogEntry(`Batch ${thisBatch} done: ${saved} rows saved`, 'success');
          } else if (result.rows_processed > 0 && saved === 0) {
            addLogEntry(
              `Batch ${thisBatch}: ${result.rows_processed} rows sent but 0 saved` +
              `${result.stop_reason === 'max_tokens' ? ' (response truncated)' : ' (parse failed)'}`,
              'warning',
            );
          }

          if (!result.has_more) {
            allDone = true;
          }
        } catch (err) {
          firstError = err instanceof Error ? err.message : 'Unknown error';
          addLogEntry(`Batch ${thisBatch} FAILED: ${firstError}`, 'error');
          return;
        }
      }
    };

    setActiveWorkers(workerCount);
    const workers = Array.from({ length: workerCount }, () => worker());
    await Promise.allSettled(workers);
    setActiveWorkers(0);
    stopElapsedTimer();

    const [statusResult] = await Promise.all([
      refetchStatus(),
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders', orderId] }),
    ]);

    if (cancelledRef.current) {
      addLogEntry('Cleanup cancelled by user', 'warning');
      return;
    }

    if (firstError) {
      setCleanupError(firstError);
      const pausedOffset = nextOffsetRef.current;
      localStorage.setItem(`${LS_KEY_PREFIX}${orderId}`, JSON.stringify({ offset: pausedOffset }));
      setCurrentOffset(pausedOffset);
      setCleanupState('paused');
      addLogEntry(`Paused at offset ${pausedOffset} due to error — resume to continue`, 'warning');
      return;
    }

    if (pauseRef.current) {
      const pausedOffset = nextOffsetRef.current;
      localStorage.setItem(`${LS_KEY_PREFIX}${orderId}`, JSON.stringify({ offset: pausedOffset }));
      setCurrentOffset(pausedOffset);
      setCleanupState('paused');
      addLogEntry(`Paused at offset ${pausedOffset}`, 'info');
      return;
    }

    localStorage.removeItem(`${LS_KEY_PREFIX}${orderId}`);
    setCleanupState('done');
    addLogEntry(`All rows processed successfully`, 'success');
  }, [orderId, modelId, batchSize, concurrency, aiCleanupMutation, queryClient, refetchStatus, addLogEntry, startElapsedTimer, stopElapsedTimer]);

  const handleStart = () => {
    const startOffset = cleanupState === 'paused' ? currentOffset : 0;
    if (startOffset === 0) {
      localStorage.removeItem(`${LS_KEY_PREFIX}${orderId}`);
    }
    void runBatchLoop(startOffset);
  };

  const handlePause = () => {
    pauseRef.current = true;
  };

  const handleCancel = async () => {
    cancelledRef.current = true;
    pauseRef.current = true;
    stopElapsedTimer();
    try {
      await cancelCleanupMutation.mutateAsync(orderId);
      localStorage.removeItem(`${LS_KEY_PREFIX}${orderId}`);
      setCurrentOffset(0);
      setTotalRows(0);
      setLocalProcessed(0);
      localProcessedRef.current = 0;
      setCleanupState('idle');
      setCleanupError('');
      await refetchStatus();
    } catch { /* silently handle */ }
  };

  const toggleCleanupRow = (id: number) => {
    setExpandedCleanupRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const progressPct = totalCount > 0
    ? Math.min(100, Math.round((liveProcessed / totalCount) * 100))
    : 0;

  const filteredRows = tableSearch.trim()
    ? rows.filter((r) => {
        const q = tableSearch.toLowerCase();
        return (
          r.description?.toLowerCase().includes(q) ||
          r.ai_suggested_title?.toLowerCase().includes(q) ||
          r.ai_suggested_brand?.toLowerCase().includes(q) ||
          r.ai_suggested_model?.toLowerCase().includes(q) ||
          r.brand?.toLowerCase().includes(q)
        );
      })
    : rows;

  return (
    <Box>
      {/* ── Top Control Bar: action buttons + settings ── */}
      <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* State-conditional action buttons — left */}
        {cleanupState === 'idle' && (
          <Button variant="contained" size="small" startIcon={<AutoAwesome />} onClick={handleStart}>
            Run Cleanup
          </Button>
        )}
        {cleanupState === 'paused' && (
          <Button variant="contained" size="small" color="primary" startIcon={<PlayArrow />} onClick={handleStart}>
            Restart Cleanup ({liveProcessed}/{totalCount})
          </Button>
        )}
        {cleanupState === 'running' && (
          <Button variant="outlined" size="small" color="warning" startIcon={<PauseCircle />} onClick={handlePause}>
            Pause Cleanup
          </Button>
        )}
        {(cleanupState === 'running' || cleanupState === 'paused') && (
          <Button
            variant="outlined" size="small" color="error" startIcon={<CancelOutlined />}
            onClick={() => void handleCancel()} disabled={cancelCleanupMutation.isPending}
          >
            {cancelCleanupMutation.isPending ? 'Cancelling...' : 'Cancel Cleanup'}
          </Button>
        )}
        {cleanupState === 'done' && (
          <Button
            variant="outlined" size="small" color="warning" startIcon={<DeleteOutline />}
            onClick={onClearCleanup} disabled={isClearingCleanup}
          >
            {isClearingCleanup ? 'Clearing...' : 'Clear Cleanup'}
          </Button>
        )}

        {/* Live stats */}
        {cleanupState === 'running' && (
          <>
            <CircularProgress size={16} />
            <Typography variant="caption" color="text.secondary">
              {activeWorkers}w active
            </Typography>
          </>
        )}
        {totalCount > 0 && cleanupState !== 'idle' && (
          <Typography variant="caption" color="text.secondary">
            {liveProcessed}/{totalCount} cleaned
          </Typography>
        )}
        {cleanupState === 'running' && elapsedMs > 0 && (
          <Typography variant="caption" color="text.secondary">
            {formatElapsed(elapsedMs / 1000)}
            {liveProcessed > 0 && totalCount > 0 && liveProcessed < totalCount && (
              <> · ETA {formatElapsed((elapsedMs / 1000) * (totalCount / liveProcessed - 1))}</>
            )}
          </Typography>
        )}

      </Box>

      <Divider sx={{ my: 1.5 }} />

      {/* Settings row */}
      <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
        <ModelSelector value={modelId} onChange={setModelId} />
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Batch Size</InputLabel>
          <Select value={batchSize} label="Batch Size" onChange={(e) => setBatchSize(Number(e.target.value))} disabled={cleanupState === 'running'}>
            {BATCH_SIZE_OPTIONS.map((n) => (<MenuItem key={n} value={n}>{n} rows</MenuItem>))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Threads</InputLabel>
          <Select value={concurrency} label="Threads" onChange={(e) => setConcurrency(Number(e.target.value))} disabled={cleanupState === 'running'}>
            {CONCURRENCY_OPTIONS.map((n) => (<MenuItem key={n} value={n}>{n} concurrent</MenuItem>))}
          </Select>
        </FormControl>
      </Box>

      {(cleanupState === 'running' || cleanupState === 'paused' || cleanupState === 'done') && totalCount > 0 && (
        <LinearProgress
          variant="determinate"
          value={progressPct}
          sx={{ mb: 2, height: 8, borderRadius: 1 }}
        />
      )}

      {cleanupError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setCleanupError('')}>
          {cleanupError}
        </Alert>
      )}

      {activityLog.length > 0 && (
        <Paper
          variant="outlined"
          sx={{
            mb: 2,
            maxHeight: 200,
            overflow: 'auto',
            bgcolor: 'grey.50',
            p: 1.5,
            fontFamily: 'monospace',
            fontSize: '0.75rem',
          }}
        >
          <Typography variant="caption" fontWeight={600} sx={{ display: 'block', mb: 0.5 }}>
            Activity Log
          </Typography>
          {activityLog.map((entry) => (
            <Box key={entry.id} sx={{ py: 0.25, display: 'flex', gap: 1 }}>
              <Typography
                component="span"
                sx={{ fontFamily: 'monospace', fontSize: '0.7rem', color: 'text.disabled', whiteSpace: 'nowrap' }}
              >
                {entry.timestamp.toLocaleTimeString()}
              </Typography>
              <Typography
                component="span"
                sx={{
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  color: entry.level === 'error' ? 'error.main'
                    : entry.level === 'success' ? 'success.main'
                    : entry.level === 'warning' ? 'warning.dark'
                    : 'text.secondary',
                }}
              >
                {entry.message}
              </Typography>
            </Box>
          ))}
          <div ref={logEndRef} />
        </Paper>
      )}

      <Divider sx={{ my: 1.5 }} />

      {/* ── Table search ── */}
      <Box sx={{ mb: 1 }}>
        <TextField
          size="small"
          sx={{ minWidth: 280 }}
          label="Search rows"
          placeholder="Filter by description, title, brand..."
          value={tableSearch}
          onChange={(e) => setTableSearch(e.target.value)}
        />
        {tableSearch && (
          <Button size="small" variant="text" sx={{ ml: 1 }} onClick={() => setTableSearch('')}>
            Clear
          </Button>
        )}
        {tableSearch && (
          <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
            {filteredRows.length} of {rows.length} rows
          </Typography>
        )}
      </Box>

      {/* ── Rows Table ── */}
      <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1, maxHeight: 480 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 40 }} />
              <TableCell sx={{ width: 50 }}>#</TableCell>
              <TableCell sx={{ minWidth: 200 }}>Description</TableCell>
              <TableCell sx={{ minWidth: 150 }}>AI Title</TableCell>
              <TableCell sx={{ minWidth: 100 }}>AI Brand</TableCell>
              <TableCell sx={{ minWidth: 100 }}>AI Model</TableCell>
              <TableCell sx={{ width: 100 }}>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredRows.map((row) => {
              const isCleaned = Boolean(row.ai_reasoning);
              const isOpen = expandedCleanupRows.has(row.id);
              const specs = row.specifications ?? {};
              const hasSpecEntries = Object.keys(specs).length > 0;

              return (
                <Fragment key={row.id}>
                  <TableRow
                    hover
                    sx={{ cursor: 'pointer', '& > *': { borderBottom: isOpen ? 'unset' : undefined } }}
                    onClick={() => toggleCleanupRow(row.id)}
                  >
                    <TableCell>
                      <IconButton size="small" onClick={(e) => { e.stopPropagation(); toggleCleanupRow(row.id); }}>
                        {isOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                      </IconButton>
                    </TableCell>
                    <TableCell>{row.row_number}</TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap sx={{ maxWidth: 250 }}>
                        {row.description}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                        {isCleaned ? (row.ai_suggested_title || '—') : '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap>
                        {isCleaned ? (row.ai_suggested_brand || '—') : '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap>
                        {isCleaned ? (row.ai_suggested_model || '—') : '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={isCleaned ? 'Cleaned' : 'Pending'}
                        color={isCleaned ? 'success' : 'default'}
                        size="small"
                        variant={isCleaned ? 'filled' : 'outlined'}
                      />
                    </TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell sx={{ py: 0, px: 0 }} colSpan={7}>
                      <Collapse in={isOpen} timeout="auto" unmountOnExit>
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, p: 2 }}>
                          <Paper variant="outlined" sx={{ p: 2 }}>
                            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                              Original Manifest Data
                            </Typography>
                            <DetailField label="Description" value={row.description} />
                            <DetailField label="Brand" value={row.brand} changed={isCleaned && !!row.ai_suggested_brand && row.brand !== row.ai_suggested_brand} />
                            <DetailField label="Model" value={row.model} changed={isCleaned && !!row.ai_suggested_model && row.model !== row.ai_suggested_model} />
                            <DetailField label="Category" value={row.category} />
                            <DetailField label="Condition" value={row.condition} />
                            <DetailField label="Retail Value" value={row.retail_value ?? ''} />
                            <DetailField label="UPC" value={row.upc} />
                            <DetailField label="Vendor Item #" value={row.vendor_item_number} />
                            <DetailField label="Quantity" value={String(row.quantity)} />
                          </Paper>

                          <Paper variant="outlined" sx={{ p: 2 }}>
                            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                              {isCleaned ? 'AI Suggestions' : 'Not Yet Processed'}
                            </Typography>
                            {isCleaned ? (
                              <>
                                <DetailField label="AI Title" value={row.ai_suggested_title} changed={!!row.ai_suggested_title && row.description !== row.ai_suggested_title} />
                                <DetailField label="AI Brand" value={row.ai_suggested_brand} changed={!!row.ai_suggested_brand && row.brand !== row.ai_suggested_brand} />
                                <DetailField label="AI Model" value={row.ai_suggested_model} changed={!!row.ai_suggested_model && row.model !== row.ai_suggested_model} />
                                <DetailField label="Search Tags" value={row.search_tags} />
                                {hasSpecEntries && (
                                  <Box sx={{ mb: 1 }}>
                                    <Typography variant="caption" color="text.secondary">Specifications</Typography>
                                    <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 12px', m: 0, mt: 0.5, '& dt': { fontWeight: 600, fontSize: '0.75rem', color: 'text.secondary' }, '& dd': { m: 0, fontSize: '0.75rem' } }}>
                                      {Object.entries(specs).map(([k, v]) => (
                                        <Fragment key={k}>
                                          <dt>{k}</dt>
                                          <dd>{String(v)}</dd>
                                        </Fragment>
                                      ))}
                                    </Box>
                                  </Box>
                                )}
                                {row.ai_reasoning && (
                                  <Box sx={{ mt: 1, p: 1.5, borderLeft: 3, borderColor: 'info.main', bgcolor: 'action.hover', borderRadius: '0 4px 4px 0' }}>
                                    <Typography variant="caption" color="text.secondary" display="block" gutterBottom>AI Reasoning</Typography>
                                    <Typography variant="body2">{row.ai_reasoning}</Typography>
                                  </Box>
                                )}
                              </>
                            ) : (
                              <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic', mt: 1 }}>
                                This row has not been processed by AI yet.
                              </Typography>
                            )}
                          </Paper>
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

    </Box>
  );
}

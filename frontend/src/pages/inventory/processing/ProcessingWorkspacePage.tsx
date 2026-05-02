import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Stack,
  TablePagination,
  TextField,
  Typography,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { LoadingScreen } from '../../../components/feedback/LoadingScreen';
import { useMarkOrderComplete, usePurchaseOrders } from '../../../hooks/useInventory';
import { getProcessingWorkspace } from '../../../api/inventory.api';
import {
  useProcessingBulkDisposition,
  useProcessingDispute,
  useProcessingMergeRows,
  useProcessingPatchItem,
  useProcessingPrintAndCheckIn,
  useProcessingPrintMultiple,
  useClearProcessingData,
  useBuildProcessingData,
  useProcessingRowDetail,
  useProcessingWorkspace,
  PROCESSING_WORKSPACE_PAGE_SIZE,
  type ProcessingWorkspaceListParams,
  printedPreviewToLabelInputs,
  useProcessingDataBuildStatus,
} from '../../../hooks/useProcessingWorkspace';
import type { ProcessingWorkspaceItemDTO, ProcessingWorkspaceRowDTO } from '../../../types/inventory.types';
import {
  isSingleScanToken,
  rowsMatchingExactUpc,
  type ProcessingStatusSegment,
} from './processingWorkspaceFilters';
import { ProcessingWorkspaceHeader, type ProcessingWorkspaceOrderPickRow } from './ProcessingWorkspaceHeader';
import { ProcessingFilterRow } from './ProcessingFilterRow';
import { ProcessingQueueTable } from './ProcessingQueueTable';
import { ProcessingActiveCard } from './ProcessingActiveCard';
import { ProcessingBulkActionBar } from './ProcessingBulkActionBar';
import { ProcessingWorkspaceFooter } from './ProcessingWorkspaceFooter';
import { PrintMultipleModal } from './modals/PrintMultipleModal';
import { DisputeModal } from './modals/DisputeModal';
import { MergeModal } from './modals/MergeModal';
import { BulkDispositionModal } from './modals/BulkDispositionModal';
import { printProcessingLabel, printProcessingLabelsStaggered } from './printProcessingLabel';

/** Must match exactly (trimmed); makes keyboard confirm intentional (Tab onto the secondary button first). */
const RESET_PROCESSING_DATA_PHRASE = 'RESET';

export default function ProcessingWorkspacePage() {
  const { id: idParam } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const orderId = idParam && /^\d+$/.test(idParam) ? Number.parseInt(idParam, 10) : null;

  useEffect(() => {
    if (orderId == null) navigate('/inventory/processing', { replace: true });
  }, [orderId, navigate]);

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [segment, setSegment] = useState<ProcessingStatusSegment>('all');
  const [hideDispositioned, setHideDispositioned] = useState(true);
  const [detailProcessingRowId, setDetailProcessingRowId] = useState<number | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<number>>(() => new Set());
  const [productFilterProductId, setProductFilterProductId] = useState<number | null>(null);
  const [productFilterTitle, setProductFilterTitle] = useState<string | undefined>(undefined);
  const [sessionCheckInCount, setSessionCheckInCount] = useState(0);
  const [searchFocusSignal, setSearchFocusSignal] = useState(0);

  const bumpSearchFocus = useCallback(() => setSearchFocusSignal((s) => s + 1), []);

  const [printMultiOpen, setPrintMultiOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  /** ``processing_row_id`` values for bulk dispute (selection is row-first). */
  const [bulkDisputeProcessingRowIds, setBulkDisputeProcessingRowIds] = useState<number[] | null>(null);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [bulkDispOpen, setBulkDispOpen] = useState(false);
  const [resetProcessingDataOpen, setResetProcessingDataOpen] = useState(false);
  const [resetProcessingDataTyped, setResetProcessingDataTyped] = useState('');

  useEffect(() => {
    setResetProcessingDataOpen(false);
    setResetProcessingDataTyped('');
  }, [orderId]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 275);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(0);
  }, [segment, hideDispositioned, productFilterProductId, debouncedSearch, orderId]);

  useEffect(() => {
    setBulkSelectedIds(new Set());
  }, [page, segment, hideDispositioned, productFilterProductId, debouncedSearch, orderId]);

  const listParams = useMemo((): ProcessingWorkspaceListParams | null => {
    if (orderId == null) return null;
    const q = debouncedSearch.trim();
    return {
      limit: PROCESSING_WORKSPACE_PAGE_SIZE,
      offset: page * PROCESSING_WORKSPACE_PAGE_SIZE,
      segment,
      product_id: productFilterProductId ?? undefined,
      search: debouncedSearch,
      hide_checked_in: q.length > 0 ? false : hideDispositioned,
    };
  }, [orderId, page, segment, productFilterProductId, debouncedSearch, hideDispositioned]);

  const { data: workspace, isLoading, isError, error, refetch } = useProcessingWorkspace(orderId, listParams);

  const processingOrdersParams = useMemo(
    () => ({ status__in: 'delivered,processing,complete', ordering: '-ordered_date', page_size: 100 }),
    [],
  );
  const { data: processingOrdersPage } = usePurchaseOrders(processingOrdersParams, orderId != null);

  const pickerOrders: ProcessingWorkspaceOrderPickRow[] = useMemo(() => {
    const rows = processingOrdersPage?.results ?? [];
    const mapped = rows.map((r) => ({
      id: r.id,
      order_number: r.order_number,
      vendor_name: r.vendor_name,
      item_count: r.item_count,
    }));
    if (!workspace?.order?.id) return mapped;
    if (mapped.some((o) => o.id === workspace.order.id)) return mapped;
    return [
      ...mapped,
      {
        id: workspace.order.id,
        order_number: workspace.order.number,
        vendor_name: workspace.order.vendor,
        item_count: workspace.progress.total_units,
      },
    ];
  }, [processingOrdersPage?.results, workspace?.order?.id, workspace?.order.number, workspace?.order.vendor, workspace?.progress.total_units]);

  useEffect(() => {
    if (workspace?.order?.id) localStorage.setItem('lastProcessingOrderId', String(workspace.order.id));
  }, [workspace?.order?.id]);

  const manifestTotalQty = workspace?.order?.total_manifest_qty ?? 0;
  const manifestDispositioned = workspace?.manifest_qty_dispositioned_total ?? 0;

  const filteredTotal = workspace?.row_count_filtered ?? workspace?.rows.length ?? 0;
  const poLineCount = workspace?.row_count_total_po ?? workspace?.rows.length ?? 0;
  const paginationFrom = workspace?.rows.length ? (workspace.workspace_offset ?? 0) + 1 : 0;
  const paginationTo = workspace?.rows.length ? (workspace.workspace_offset ?? 0) + workspace.rows.length : 0;

  useEffect(() => {
    if (workspace?.row_count_filtered == null) return;
    const last = Math.max(
      0,
      Math.ceil(workspace.row_count_filtered / PROCESSING_WORKSPACE_PAGE_SIZE) - 1,
    );
    if (page > last) setPage(last);
  }, [workspace?.row_count_filtered, page]);

  const detailQueryEnabled =
    orderId != null &&
    workspace != null &&
    !workspace.processingBookmarkOnly &&
    detailProcessingRowId != null;

  const {
    data: fetchedDetailRow,
    isFetching: detailRowFetching,
    isError: detailRowIsError,
  } = useProcessingRowDetail(orderId ?? null, detailQueryEnabled ? detailProcessingRowId : null);

  const selectedListRow = useMemo((): ProcessingWorkspaceRowDTO | null => {
    if (!workspace || detailProcessingRowId == null) return null;
    return workspace.rows.find((r) => r.processing_row_id === detailProcessingRowId) ?? null;
  }, [workspace, detailProcessingRowId]);

  const selectedRow = useMemo((): ProcessingWorkspaceRowDTO | null => {
    if (detailProcessingRowId == null) return null;
    if (workspace?.processingBookmarkOnly) {
      return selectedListRow;
    }
    if (fetchedDetailRow) {
      return selectedListRow ? { ...selectedListRow, ...fetchedDetailRow } : fetchedDetailRow;
    }
    return selectedListRow;
  }, [detailProcessingRowId, workspace?.processingBookmarkOnly, selectedListRow, fetchedDetailRow]);

  useEffect(() => {
    if (!selectedRow) {
      setSelectedItemId(null);
      return;
    }
    const items = selectedRow.items ?? [];
    const valid = selectedItemId != null && items.some((i) => i.id === selectedItemId);
    if (valid) return;
    const pend = items.find((i) => i.status === 'intake' || i.status === 'processing');
    setSelectedItemId((pend ?? items[0])?.id ?? null);
  }, [selectedRow, selectedItemId]);

  const activeItem: ProcessingWorkspaceItemDTO | null = useMemo(() => {
    if (!selectedRow || selectedItemId == null) return null;
    const items = selectedRow.items ?? [];
    return items.find((i) => i.id === selectedItemId) ?? null;
  }, [selectedRow, selectedItemId]);

  const bulkRowsSelected = useMemo(() => {
    if (!workspace) return [];
    return workspace.rows.filter((r) => bulkSelectedIds.has(r.processing_row_id)).sort((a, b) => a.rowNum - b.rowNum);
  }, [workspace, bulkSelectedIds]);

  const sameProductBulk = useMemo(() => {
    if (bulkRowsSelected.length < 2) return false;
    const pid = bulkRowsSelected[0].productId;
    if (pid == null) return false;
    return bulkRowsSelected.every((r) => r.productId === pid);
  }, [bulkRowsSelected]);

  const bulkProcessingRowIdsForModals = useMemo(
    () => bulkRowsSelected.map((r) => r.processing_row_id),
    [bulkRowsSelected],
  );

  const bulkSelectionMissingManifestLink = useMemo(
    () => bulkRowsSelected.some((r) => r.manifest_row_id == null),
    [bulkRowsSelected],
  );

  const showDetailSpinner =
    !workspace?.processingBookmarkOnly &&
    detailProcessingRowId != null &&
    detailRowFetching &&
    fetchedDetailRow == null;

  /** Avoid MergeModal mount with stale open state after selection/refetch drops below 2. */
  useEffect(() => {
    if (mergeOpen && bulkRowsSelected.length < 2) {
      setMergeOpen(false);
      bumpSearchFocus();
    }
  }, [mergeOpen, bulkRowsSelected.length, bumpSearchFocus]);

  const safeOrderId = orderId ?? 0;
  const printCheckIn = useProcessingPrintAndCheckIn(safeOrderId);
  const printMultiple = useProcessingPrintMultiple(safeOrderId);
  const disputeMu = useProcessingDispute(safeOrderId);
  const mergeMu = useProcessingMergeRows(safeOrderId);
  const bulkDispMu = useProcessingBulkDisposition(safeOrderId);
  const buildProcessingDataMu = useBuildProcessingData(orderId ?? 0);
  const clearProcessingDataMu = useClearProcessingData(orderId ?? 0);
  const resetProcessingBusy =
    buildProcessingDataMu.isPending || clearProcessingDataMu.isPending;
  const procBuildPoll = useProcessingDataBuildStatus(orderId, Boolean(workspace?.processingBookmarkOnly));
  const autoDrainBusyRef = useRef(false);

  useEffect(() => {
    autoDrainBusyRef.current = false;
  }, [orderId]);

  useEffect(() => {
    if (orderId == null || !workspace?.processingBookmarkOnly) return;
    if (
      !procBuildPoll.isSuccess ||
      !procBuildPoll.data ||
      buildProcessingDataMu.isPending ||
      clearProcessingDataMu.isPending
    ) {
      return;
    }
    if (autoDrainBusyRef.current) return;
    const st = procBuildPoll.data;
    if (st.status === 'none' || st.done || st.blocked) return;
    autoDrainBusyRef.current = true;
    void buildProcessingDataMu
      .mutateAsync({})
      .catch(() => undefined)
      .finally(() => {
        autoDrainBusyRef.current = false;
      });
  }, [
    orderId,
    workspace?.processingBookmarkOnly,
    procBuildPoll.isSuccess,
    procBuildPoll.data,
    buildProcessingDataMu,
    clearProcessingDataMu,
  ]);
  const patchItem = useProcessingPatchItem(safeOrderId);
  const markComplete = useMarkOrderComplete();

  const clearBulk = useCallback(() => setBulkSelectedIds(new Set()), []);

  const openDetail = useCallback((processingRowId: number) => {
    setDetailProcessingRowId(processingRowId);
  }, []);

  const backToQueue = useCallback(() => {
    setDetailProcessingRowId(null);
    setSelectedItemId(null);
    bumpSearchFocus();
  }, [bumpSearchFocus]);

  const openBulkDispute = useCallback(() => {
    setBulkDisputeProcessingRowIds(Array.from(bulkSelectedIds));
    setDisputeOpen(true);
  }, [bulkSelectedIds]);

  const closeModalAndRefocus = useCallback((setter: (v: boolean) => void) => {
    setter(false);
    bumpSearchFocus();
  }, [bumpSearchFocus]);

  const closeResetProcessingDataModal = useCallback(() => {
    if (resetProcessingBusy) return;
    setResetProcessingDataOpen(false);
    setResetProcessingDataTyped('');
    bumpSearchFocus();
  }, [resetProcessingBusy, bumpSearchFocus]);

  const handleSearchEnter = useCallback(async () => {
    const q = search.trim();
    if (!orderId || !q) return;
    if (!isSingleScanToken(q)) return;
    const onPage = rowsMatchingExactUpc(workspace?.rows ?? [], q);
    if (onPage.length === 1) {
      setBulkSelectedIds(new Set());
      setDetailProcessingRowId(onPage[0].processing_row_id);
      setSearch('');
      return;
    }
    try {
      const { data } = await getProcessingWorkspace(orderId, {
        limit: 2,
        offset: 0,
        segment,
        product_id: productFilterProductId ?? undefined,
        search: q,
        hide_checked_in: false,
      });
      if (data.row_count_filtered === 1 && data.rows[0]) {
        const sole = data.rows[0];
        if (rowsMatchingExactUpc([sole], q).length === 1) {
          setBulkSelectedIds(new Set());
          setDetailProcessingRowId(sole.processing_row_id);
          setSearch('');
          setDebouncedSearch('');
          setPage(0);
        }
      }
    } catch {
      /* ignore scan helper failures */
    }
  }, [search, orderId, workspace?.rows, segment, productFilterProductId]);

  const handleCheckIn = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!activeItem || orderId == null) return;
      try {
        const data = await printCheckIn.mutateAsync({ itemId: activeItem.id, payload });
        const ok = await printProcessingLabel(data.item);
        setSessionCheckInCount((c) => c + 1);
        if (!ok) {
          enqueueSnackbar('Checked in on server, but the local label printer failed.', { variant: 'warning' });
        } else {
          enqueueSnackbar('Checked in and sent label to printer.', { variant: 'success' });
        }
        bumpSearchFocus();
      } catch (e: unknown) {
        const detail =
          e && typeof e === 'object' && 'response' in e
            ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
            : undefined;
        enqueueSnackbar(detail || 'Check-in failed', { variant: 'error' });
      }
    },
    [activeItem, orderId, printCheckIn, enqueueSnackbar, bumpSearchFocus],
  );

  const handlePrintMultipleSubmit = useCallback(
    async (payload: Record<string, unknown>) => {
      if (orderId == null) return;
      try {
        const data = await printMultiple.mutateAsync(payload);
        const ids = data.checked_in_item_ids;
        setSessionCheckInCount((c) => c + ids.length);
        const labelItems =
          data.printed_items_preview?.length ?
            printedPreviewToLabelInputs(data.printed_items_preview)
          : ids.map(() => ({ sku: '', title: '', price: '0' }));
        const { succeeded, failed } = await printProcessingLabelsStaggered(labelItems);
        if (failed > 0) {
          enqueueSnackbar(`Printed ${succeeded}/${labelItems.length}; ${failed} failed locally.`, { variant: 'warning' });
        } else {
          enqueueSnackbar(`Checked in ${succeeded} unit(s) and sent labels.`, { variant: 'success' });
        }
        setPrintMultiOpen(false);
        bumpSearchFocus();
      } catch (e: unknown) {
        const detail =
          e && typeof e === 'object' && 'response' in e
            ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
            : undefined;
        enqueueSnackbar(detail || 'Print multiple failed', { variant: 'error' });
      }
    },
    [orderId, printMultiple, enqueueSnackbar, bumpSearchFocus],
  );

  const handleDisputeSubmit = useCallback(
    async (payload: Record<string, unknown>) => {
      if (orderId == null) return;
      try {
        await disputeMu.mutateAsync(payload);
        enqueueSnackbar('Dispute recorded.', { variant: 'success' });
        setDisputeOpen(false);
        setBulkDisputeProcessingRowIds(null);
        setBulkSelectedIds(new Set());
        bumpSearchFocus();
      } catch (e: unknown) {
        const detail =
          e && typeof e === 'object' && 'response' in e
            ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
            : undefined;
        enqueueSnackbar(detail || 'Dispute failed', { variant: 'error' });
      }
    },
    [orderId, disputeMu, enqueueSnackbar, bumpSearchFocus],
  );

  const handlePatchCheckedIn = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!activeItem) return;
      try {
        await patchItem.mutateAsync({ itemId: activeItem.id, payload });
        enqueueSnackbar('Item updated.', { variant: 'success' });
        bumpSearchFocus();
      } catch (e: unknown) {
        const detail =
          e && typeof e === 'object' && 'response' in e
            ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
            : undefined;
        enqueueSnackbar(detail || 'Update failed', { variant: 'error' });
      }
    },
    [activeItem, patchItem, enqueueSnackbar, bumpSearchFocus],
  );

  const toggleBulkOne = useCallback((processingRowId: number, selected: boolean) => {
    setBulkSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(processingRowId);
      else next.delete(processingRowId);
      return next;
    });
  }, []);

  const toggleBulkAll = useCallback(
    (selected: boolean) => {
      if (!selected) {
        setBulkSelectedIds(new Set());
        return;
      }
      if (!workspace) return;
      setBulkSelectedIds(new Set(workspace.rows.map((r) => r.processing_row_id)));
    },
    [workspace],
  );

  if (orderId == null) return <LoadingScreen message="Redirecting…" />;

  if (isLoading && !workspace) {
    return <LoadingScreen message="Loading workspace…" />;
  }

  if (isError || !workspace) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" action={<Button onClick={() => refetch()}>Retry</Button>}>
          {error instanceof Error ? error.message : 'Could not load processing workspace.'}
        </Alert>
      </Box>
    );
  }

  const progress = workspace.progress;
  const resetPhraseMatches = resetProcessingDataTyped.trim() === RESET_PROCESSING_DATA_PHRASE;

  return (
    <Box
      sx={{
        p: { xs: 1, md: 1.5 },
        maxWidth: '100%',
        mx: 'auto',
        width: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        height: { md: 'calc(100dvh - 112px)', xs: 'auto' },
        maxHeight: { md: 'calc(100dvh - 112px)', xs: 'none' },
        minHeight: { md: 0, xs: undefined },
      }}
    >
      <Box sx={{ flexShrink: 0 }}>
        <ProcessingWorkspaceHeader
          order={workspace.order}
          pickerOrders={pickerOrders}
          onSelectOrderId={(id) => navigate(`/inventory/processing/${id}`)}
          search={search}
          onSearchChange={setSearch}
          onSearchEnter={handleSearchEnter}
          searchFocusSignal={searchFocusSignal}
          manifestDispositioned={manifestDispositioned}
          manifestTotalQty={manifestTotalQty}
          itemDispositioned={progress.dispositioned_units}
          itemTotal={progress.total_units}
          hasManifestRows={poLineCount > 0}
          sessionCheckInCount={sessionCheckInCount}
        />
      </Box>

      {poLineCount > 0 && workspace.processingBookmarkOnly ?
        <Box sx={{ flexShrink: 0, mt: 1 }}>
          <Alert severity="warning">
            <Typography variant="body2" gutterBottom>
              Manifest and items have not been fully prepared yet — review the bookmark rows below, then start the build.
              Large orders are prepared in bounded chunks automatically.
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              Create Processing Data before checking in, printing, merging, or disputing items.
            </Typography>
            {procBuildPoll.data?.blocked && procBuildPoll.data.last_error ?
              <Typography variant="body2" color="error" sx={{ mb: 1 }}>
                {procBuildPoll.data.last_error}
              </Typography>
            : null}
            {(buildProcessingDataMu.isPending ||
              (procBuildPoll.data && procBuildPoll.data.status !== 'none' && !procBuildPoll.data.done)) ?
              <>
                <LinearProgress
                  variant="determinate"
                  value={
                    typeof procBuildPoll.data?.percent === 'number' ? Math.min(100, procBuildPoll.data.percent) : 0
                  }
                  sx={{ mt: 0.75 }}
                />
                <Typography variant="caption" component="div" sx={{ mt: 0.75 }}>
                  Preparing processing data:{' '}
                  {typeof procBuildPoll.data?.processed_rows === 'number' ?
                    procBuildPoll.data.processed_rows
                  : buildProcessingDataMu.isPending ?
                    '…'
                  : 0}{' '}
                  /{' '}
                  {typeof procBuildPoll.data?.total_rows === 'number' ?
                    procBuildPoll.data.total_rows
                  : buildProcessingDataMu.isPending ?
                    '…'
                  : workspace.row_count_total_po}{' '}
                  rows
                </Typography>
                <Typography variant="caption" component="div" color="text.secondary">
                  You can keep this page open. If interrupted, preparation can resume.
                </Typography>
              </>
            : null}
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1, alignItems: 'center' }}>
              <Button
                size="small"
                variant="contained"
                disabled={buildProcessingDataMu.isPending || orderId == null}
                sx={{ verticalAlign: 'middle' }}
                onClick={async () => {
                  try {
                    const d = await buildProcessingDataMu.mutateAsync({});
                    if (d.blocked) {
                      enqueueSnackbar(d.last_error?.trim() || 'Processing-data build blocked.', {
                        variant: 'error',
                      });
                      await refetch();
                      bumpSearchFocus();
                      return;
                    }
                    enqueueSnackbar(
                      `Prepared ${String(d.total_rows ?? d.processing_row_bookmarks ?? d.manifest_rows ?? 0)} rows and ${String(d.items_created ?? 0)} item(s).`,
                      { variant: 'success' },
                    );
                    const wLen = Array.isArray(d.warnings) ? d.warnings.length : 0;
                    if (wLen) {
                      enqueueSnackbar(
                        `Prepared with ${String(wLen)} row warning(s). Review placeholder rows during processing.`,
                        { variant: 'warning' },
                      );
                    }
                    void refetch();
                    bumpSearchFocus();
                  } catch (e: unknown) {
                    const detail =
                      e && typeof e === 'object' && 'response' in e ?
                        (
                          (
                            e as {
                              response?: { data?: { detail?: unknown } };
                            }
                          ).response?.data?.detail
                        )
                      : undefined;
                    enqueueSnackbar(
                      typeof detail === 'string' ? detail : detail ? JSON.stringify(detail) : 'Build failed',
                      { variant: 'error' },
                    );
                  }
                }}
              >
                {procBuildPoll.data?.blocked ?
                  'Retry / resume preparing'
                : procBuildPoll.data && procBuildPoll.data.status !== 'none' && !procBuildPoll.data.done ?
                  'Continue preparing'
                : `Create Processing Data`}
              </Button>
            </Stack>
          </Alert>
        </Box>
      : null}

      <Box sx={{ flexShrink: 0, mt: poLineCount > 0 && workspace.processingBookmarkOnly ? 1 : 0.75 }}>
        <ProcessingFilterRow
          segment={segment}
          onSegmentChange={setSegment}
          hideDispositioned={hideDispositioned}
          onHideDispositionedChange={setHideDispositioned}
          filteredCount={workspace.rows.length}
          totalCount={filteredTotal}
          rangeCaption={`Lines ${paginationFrom}–${paginationTo} · ${filteredTotal} match (${poLineCount} on order)`}
          productFilterProductId={productFilterProductId}
          productFilterTitle={productFilterTitle}
          onClearProductFilter={() => {
            setProductFilterProductId(null);
            setProductFilterTitle(undefined);
          }}
        />
      </Box>

      <Stack direction="column" spacing={1} sx={{ mt: 1, alignItems: 'stretch', flex: 1, minHeight: 0 }}>
        <Box sx={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {!workspace.processingBookmarkOnly &&
          detailProcessingRowId != null &&
          detailRowIsError ?
            <Box sx={{ p: 2 }}>
              <Alert
                severity="error"
                action={
                  <Button color="inherit" size="small" onClick={backToQueue}>
                    Back to queue
                  </Button>
                }
              >
                Could not load row detail from the server.
              </Alert>
            </Box>
          : showDetailSpinner ?
            <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          : !workspace.processingBookmarkOnly &&
            detailProcessingRowId != null &&
            selectedRow &&
            activeItem ?
            <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              <ProcessingActiveCard
              orderId={workspace.order.id}
              row={selectedRow}
              activeItem={activeItem}
              onSelectItemId={setSelectedItemId}
              onBackToQueue={backToQueue}
              onCheckIn={handleCheckIn}
              checkInLoading={printCheckIn.isPending}
              onOpenDispute={() => {
                setBulkDisputeProcessingRowIds(null);
                setDisputeOpen(true);
              }}
              onPatchCheckedIn={handlePatchCheckedIn}
              patchLoading={patchItem.isPending}
              onPrintMultiple={() => setPrintMultiOpen(true)}
              printMultipleDisabled={
                selectedRow.manifest_row_id == null ||
                !(selectedRow.items ?? []).some((i) => i.status === 'intake' || i.status === 'processing')
              }
              productFilterActive={productFilterProductId != null && productFilterProductId === selectedRow.productId}
              onShowAllThisProduct={
                selectedRow.productId != null ?
                  () => {
                    if (productFilterProductId === selectedRow.productId) {
                      setProductFilterProductId(null);
                      setProductFilterTitle(undefined);
                    } else {
                      setProductFilterProductId(selectedRow.productId);
                      setProductFilterTitle(selectedRow.product?.title);
                      backToQueue();
                    }
                  }
                : undefined
              }
              onWorkspaceInvalidated={() => {
                void refetch();
              }}
              onPrepareMergeFromCard={() => {
                if (selectedRow) {
                  setBulkSelectedIds(new Set([selectedRow.processing_row_id]));
                  backToQueue();
                  enqueueSnackbar('Select another row for the same product, then tap Merge.', { variant: 'info' });
                }
              }}
            />
            </Box>
          : (
            <>
              <ProcessingQueueTable
                rows={workspace.rows}
                preprocessingFinalizedAt={workspace.preprocessing_finalized_at}
                preprocessingBookmarkOnly={workspace.processingBookmarkOnly}
                totalWorkspaceRowCount={poLineCount}
                orderId={workspace.order.id}
                orderStatus={workspace.order.status}
                detailProcessingRowId={detailProcessingRowId}
                onOpenDetail={(id) => {
                  clearBulk();
                  openDetail(id);
                }}
                bulkSelectedIds={bulkSelectedIds}
                onToggleBulkOne={toggleBulkOne}
                onToggleBulkAll={toggleBulkAll}
              />
              <TablePagination
                component="div"
                rowsPerPageOptions={[PROCESSING_WORKSPACE_PAGE_SIZE]}
                count={filteredTotal}
                rowsPerPage={PROCESSING_WORKSPACE_PAGE_SIZE}
                page={filteredTotal === 0 ? 0 : page}
                onPageChange={(_, p) => setPage(p)}
                sx={{
                  alignSelf: 'stretch',
                  borderTop: 1,
                  borderColor: 'divider',
                  flexShrink: 0,
                  '& .MuiTablePagination-toolbar': { px: { xs: 1, md: 0 }, minHeight: 48 },
                }}
              />
            </>
            )
          }
          {!workspace.processingBookmarkOnly && detailProcessingRowId == null ?
            <ProcessingBulkActionBar
              selectedCount={bulkSelectedIds.size}
              onClear={clearBulk}
              sameProduct={sameProductBulk}
              onMerge={() => setMergeOpen(true)}
              onBulkDisposition={() => setBulkDispOpen(true)}
              onMarkBroken={openBulkDispute}
              onMarkUndelivered={openBulkDispute}
              itemActionsBlocked={bulkSelectionMissingManifestLink}
              itemActionsBlockedHint={
                bulkSelectionMissingManifestLink ?
                  'Some selected rows are still preprocessing bookmarks with no manifest line yet. Create Processing Data first, or deselect those lines.'
                : undefined
              }
            />
          : null}
        </Box>
      </Stack>

      <Box sx={{ flexShrink: 0 }}>
        <ProcessingWorkspaceFooter
          pendingUnits={progress.pending_units}
          dispositionedUnits={progress.dispositioned_units}
          totalUnits={progress.total_units}
          orderComplete={workspace.order.status === 'complete'}
          closeLoading={markComplete.isPending}
          onCloseClick={() => setCompleteOpen(true)}
          resetProcessingVisible={poLineCount > 0 && Boolean(workspace.preprocessing_finalized_at)}
          resetProcessingDisabled={resetProcessingBusy || orderId == null}
          onResetProcessingClick={() => {
            setResetProcessingDataTyped('');
            setResetProcessingDataOpen(true);
          }}
        />
      </Box>

      <PrintMultipleModal
        open={printMultiOpen}
        onClose={() => {
          closeModalAndRefocus(setPrintMultiOpen);
        }}
        row={selectedRow}
        loading={printMultiple.isPending}
        onSubmit={handlePrintMultipleSubmit}
      />

      <DisputeModal
        open={disputeOpen}
        onClose={() => {
          setDisputeOpen(false);
          setBulkDisputeProcessingRowIds(null);
          bumpSearchFocus();
        }}
        item={activeItem}
        bulkProcessingRowIds={bulkDisputeProcessingRowIds ?? undefined}
        loading={disputeMu.isPending}
        onSubmit={handleDisputeSubmit}
      />

      <MergeModal
        open={mergeOpen}
        onClose={() => closeModalAndRefocus(setMergeOpen)}
        processingRowIds={bulkProcessingRowIdsForModals}
        rows={bulkRowsSelected}
        loading={mergeMu.isPending}
        onSubmit={async (payload) => {
          try {
            await mergeMu.mutateAsync(payload);
            enqueueSnackbar('Rows merged.', { variant: 'success' });
            setMergeOpen(false);
            clearBulk();
            bumpSearchFocus();
          } catch (e: unknown) {
            const detail =
              e && typeof e === 'object' && 'response' in e
                ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
                : undefined;
            enqueueSnackbar(detail || 'Merge failed', { variant: 'error' });
          }
        }}
      />

      <BulkDispositionModal
        open={bulkDispOpen}
        onClose={() => closeModalAndRefocus(setBulkDispOpen)}
        processingRowIds={bulkProcessingRowIdsForModals}
        rows={bulkRowsSelected}
        loading={bulkDispMu.isPending}
        onSubmit={async (payload) => {
          try {
            await bulkDispMu.mutateAsync(payload);
            enqueueSnackbar('Bulk disposition saved.', { variant: 'success' });
            setBulkDispOpen(false);
            clearBulk();
            bumpSearchFocus();
          } catch (e: unknown) {
            const detail =
              e && typeof e === 'object' && 'response' in e
                ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
                : undefined;
            enqueueSnackbar(detail || 'Bulk disposition failed', { variant: 'error' });
          }
        }}
      />

      <Dialog
        open={resetProcessingDataOpen}
        onClose={() => {
          if (resetProcessingBusy) return;
          closeResetProcessingDataModal();
        }}
        maxWidth="sm"
        fullWidth
        disableEscapeKeyDown={resetProcessingBusy}
        PaperProps={{
          sx: (theme) => ({
            border: `4px solid ${theme.palette.error.main}`,
            boxShadow: theme.shadows[12],
          }),
          onKeyDownCapture: (e: KeyboardEvent<HTMLDivElement>) => {
            if (resetProcessingBusy || e.key !== 'Enter') return;
            const t = e.target as HTMLElement | null;
            if (t?.closest('[data-reset-proceed-button]')) return;
            e.preventDefault();
            e.stopPropagation();
            closeResetProcessingDataModal();
          },
        }}
      >
        <DialogTitle sx={{ pt: 3, px: 3, pb: 1 }}>
          <Typography variant="h5" component="span" fontWeight={800} color="error">
            Reset to preprocessing bookmarks?
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ px: 3, pt: 0 }}>
          <Alert severity="error" variant="outlined" sx={{ mt: 1, mb: 2, py: 2, px: 2, borderWidth: 2 }}>
            <AlertTitle sx={{ typography: 'h6', fontWeight: 800 }}>This is destructive</AlertTitle>
            <Typography variant="body1" component="div" sx={{ mt: 1.5, fontWeight: 600 }}>
              This removes canonical manifest rows, intake/processing/on-shelf items tied to those lines,
              inventory batch groups, and any in-progress chunked-build job — then unlinks bookmarks from
              manifest data. Finalized preprocessing and your bookmark rows (titles, prices, etc.) stay
              as they are now; nothing here re-runs the heavy “Create Processing Data” build automatically.
            </Typography>
          </Alert>
          <Typography variant="body2" color="text.secondary" paragraph sx={{ mb: 1 }}>
            If anything looks wrong here, cancel and fix preprocessing first — this still requires deliberate confirmation.
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.25, typography: 'body2', '& li': { mb: 0.75 } }}>
            <li>
              Terminal items (e.g. sold) stay in the catalog; deleting manifest rows clears their canonical line linkage.
              Use this only when you deliberately want bookmarks-only staging again before recreating manifest lines.
            </li>
            <li>You will tap <strong>Create Processing Data</strong> afterward when you actually want manifests and items recreated.</li>
          </Box>
          <TextField
            fullWidth
            margin="normal"
            label={`Type ${RESET_PROCESSING_DATA_PHRASE} to unlock the destructive action`}
            value={resetProcessingDataTyped}
            onChange={(ev) => setResetProcessingDataTyped(ev.target.value)}
            autoComplete="off"
            disabled={resetProcessingBusy}
            helperText="Escape closes the dialog. Enter cancels unless keyboard focus is on the small confirm link (after Tab)."
            sx={{ mt: 2 }}
            inputProps={{ 'aria-label': 'Type RESET to confirm processing data reset' }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2.5, gap: 2, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            size="large"
            color="primary"
            autoFocus
            disabled={resetProcessingBusy}
            onClick={closeResetProcessingDataModal}
            sx={{ flex: '1 1 auto', minHeight: 48, px: 3, typography: 'subtitle1', fontWeight: 700 }}
          >
            Cancel — keep existing data (Esc · Enter)
          </Button>
          <Button
            data-reset-proceed-button
            size="small"
            variant="text"
            color="error"
            disabled={!resetPhraseMatches || resetProcessingBusy || orderId == null}
            onClick={() => {
              void (async () => {
                if (!resetPhraseMatches || orderId == null || resetProcessingBusy) return;
                try {
                  const d = await clearProcessingDataMu.mutateAsync();
                  closeResetProcessingDataModal();
                  enqueueSnackbar(
                    typeof d.detail === 'string' ?
                      d.detail
                    : `Cleared processing data (${String(d.processing_row_bookmarks ?? 0)} bookmark rows kept).`,
                    { variant: 'success' },
                  );
                  await refetch();
                  bumpSearchFocus();
                } catch (e: unknown) {
                  const detail =
                    e && typeof e === 'object' && 'response' in e ?
                      (e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
                    : undefined;
                    enqueueSnackbar(
                      typeof detail === 'string' ? detail : detail ? JSON.stringify(detail) : 'Clear failed',
                      { variant: 'error' },
                    );
                }
              })();
            }}
            sx={{
              opacity: resetPhraseMatches ? 1 : 0.55,
              minWidth: 0,
              maxWidth: 'min(100%, 240px)',
              textTransform: 'none',
              typography: 'caption',
              alignSelf: 'flex-end',
            }}
          >
            {resetProcessingBusy ? 'Clearing…' : 'I understand — clear processing data'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={completeOpen} onClose={() => !markComplete.isPending && closeModalAndRefocus(setCompleteOpen)}>
        <DialogTitle>Close this purchase order?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Orders cannot be closed until every unit is dispositioned (checked in, broken, or undelivered). The server will reject the
            request if anything is still in intake or processing.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => !markComplete.isPending && setCompleteOpen(false)} disabled={markComplete.isPending}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="success"
            disabled={markComplete.isPending || progress.pending_units > 0 || workspace.order.status === 'complete'}
            startIcon={markComplete.isPending ? <CircularProgress size={18} color="inherit" /> : undefined}
            onClick={() => {
              markComplete.mutate(orderId, {
                onSuccess: () => {
                  setCompleteOpen(false);
                  enqueueSnackbar('Purchase order marked complete.', { variant: 'success' });
                  refetch();
                  bumpSearchFocus();
                },
                onError: (e: unknown) => {
                  const detail =
                    e && typeof e === 'object' && 'response' in e
                      ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
                      : undefined;
                  enqueueSnackbar(detail || 'Could not close PO', { variant: 'error' });
                },
              });
            }}
          >
            Confirm close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

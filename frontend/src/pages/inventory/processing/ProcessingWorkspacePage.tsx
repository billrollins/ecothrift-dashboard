import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
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
  Stack,
  TablePagination,
  TextField,
  Typography,
} from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
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
  useBuildProcessingData,
  useProcessingRowDetail,
  useProcessingWorkspace,
  PROCESSING_WORKSPACE_PAGE_SIZE,
  type ProcessingWorkspaceListParams,
  prefetchProcessingRowDetail,
  printedPreviewToLabelInputs,
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
  const queryClient = useQueryClient();

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
  const [bulkDisputeManifestIds, setBulkDisputeManifestIds] = useState<number[] | null>(null);
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

  const prefetchRowDetailHover = useCallback(
    (processingRowId: number) => {
      if (orderId == null || workspace?.processingBookmarkOnly) return;
      void prefetchProcessingRowDetail(queryClient, orderId, processingRowId);
    },
    [orderId, queryClient, workspace?.processingBookmarkOnly],
  );

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

  const bulkManifestRowIdsForModals = useMemo(
    () => bulkRowsSelected.map((r) => r.manifest_row_id).filter((x): x is number => x != null),
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
    setBulkDisputeManifestIds(Array.from(bulkSelectedIds));
    setDisputeOpen(true);
  }, [bulkSelectedIds]);

  const closeModalAndRefocus = useCallback((setter: (v: boolean) => void) => {
    setter(false);
    bumpSearchFocus();
  }, [bumpSearchFocus]);

  const closeResetProcessingDataModal = useCallback(() => {
    if (buildProcessingDataMu.isPending) return;
    setResetProcessingDataOpen(false);
    setResetProcessingDataTyped('');
    bumpSearchFocus();
  }, [buildProcessingDataMu.isPending, bumpSearchFocus]);

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
        setBulkDisputeManifestIds(null);
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
          Manifest and items have not been created yet — review the bookmark rows, then{' '}
          <Button size="small" variant="contained" sx={{ ml: 1, verticalAlign: 'middle' }}
            disabled={buildProcessingDataMu.isPending || orderId == null}
            onClick={async () => {
              try {
                const d = await buildProcessingDataMu.mutateAsync();
                enqueueSnackbar(
                  `Created ${String(d.manifest_rows ?? 0)} manifest row(s) and ${String(d.items_created ?? 0)} item(s).`,
                  { variant: 'success' },
                );
                void refetch();
                bumpSearchFocus();
              } catch (e: unknown) {
                const detail =
                  e && typeof e === 'object' && 'response' in e ?
                    (
                      (
                        (
                          e as {
                            response?: { data?: { detail?: unknown } };
                          }
                        ).response?.data?.detail
                      )
                    )
                  : undefined;
                enqueueSnackbar(
                  typeof detail === 'string' ? detail : detail ? JSON.stringify(detail) : 'Build failed',
                  { variant: 'error' },
                );
              }
            }}
          >
            Create Processing Data
          </Button>
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
                setBulkDisputeManifestIds(null);
                setDisputeOpen(true);
              }}
              onPatchCheckedIn={handlePatchCheckedIn}
              patchLoading={patchItem.isPending}
              onPrintMultiple={() => setPrintMultiOpen(true)}
              printMultipleDisabled={
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
                onPrefetchDetail={prefetchRowDetailHover}
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
          resetProcessingVisible={poLineCount > 0 && !workspace.processingBookmarkOnly}
          resetProcessingDisabled={buildProcessingDataMu.isPending || orderId == null}
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
          setBulkDisputeManifestIds(null);
          bumpSearchFocus();
        }}
        item={activeItem}
        bulkManifestRowIds={bulkDisputeManifestIds ?? undefined}
        loading={disputeMu.isPending}
        onSubmit={handleDisputeSubmit}
      />

      <MergeModal
        open={mergeOpen}
        onClose={() => closeModalAndRefocus(setMergeOpen)}
        manifestRowIds={bulkManifestRowIdsForModals}
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
        manifestRowIds={bulkManifestRowIdsForModals}
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
          if (buildProcessingDataMu.isPending) return;
          closeResetProcessingDataModal();
        }}
        maxWidth="sm"
        fullWidth
        disableEscapeKeyDown={buildProcessingDataMu.isPending}
        PaperProps={{
          sx: (theme) => ({
            border: `4px solid ${theme.palette.error.main}`,
            boxShadow: theme.shadows[12],
          }),
          onKeyDownCapture: (e: KeyboardEvent<HTMLDivElement>) => {
            if (buildProcessingDataMu.isPending || e.key !== 'Enter') return;
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
            Reset processing data?
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ px: 3, pt: 0 }}>
          <Alert severity="error" variant="outlined" sx={{ mt: 1, mb: 2, py: 2, px: 2, borderWidth: 2 }}>
            <AlertTitle sx={{ typography: 'h6', fontWeight: 800 }}>This is destructive</AlertTitle>
            <Typography variant="body1" component="div" sx={{ mt: 1.5, fontWeight: 600 }}>
              You are about to delete all manifest rows and non-terminal inventory items for this order, then recreate them from
              your finalized preprocessing bookmarks. Check-in progress, batch links, and in-flight processing work tied to those
              lines can be wiped or rebuilt.
            </Typography>
          </Alert>
          <Typography variant="body2" color="text.secondary" paragraph sx={{ mb: 1 }}>
            If anything looks wrong here, cancel and fix preprocessing first — this is intentionally hard to confirm.
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.25, typography: 'body2', '& li': { mb: 0.75 } }}>
            <li>Terminal items (e.g. sold) are preserved by the server; everything else tied to manifest lines may change.</li>
            <li>Only continue if you deliberately need a full rebuild from bookmarks.</li>
          </Box>
          <TextField
            fullWidth
            margin="normal"
            label={`Type ${RESET_PROCESSING_DATA_PHRASE} to unlock the destructive action`}
            value={resetProcessingDataTyped}
            onChange={(ev) => setResetProcessingDataTyped(ev.target.value)}
            autoComplete="off"
            disabled={buildProcessingDataMu.isPending}
            helperText="Escape closes the dialog. Enter cancels unless keyboard focus is on the small “reset & rebuild” link (after Tab)."
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
            disabled={buildProcessingDataMu.isPending}
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
            disabled={!resetPhraseMatches || buildProcessingDataMu.isPending || orderId == null}
            onClick={() => {
              void (async () => {
                if (!resetPhraseMatches || orderId == null || buildProcessingDataMu.isPending) return;
                try {
                  const d = await buildProcessingDataMu.mutateAsync();
                  closeResetProcessingDataModal();
                  enqueueSnackbar(
                    `Reset complete: ${String(d.manifest_rows ?? 0)} manifest row(s), ${String(d.items_created ?? 0)} item(s).`,
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
                    typeof detail === 'string' ? detail : detail ? JSON.stringify(detail) : 'Reset failed',
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
            {buildProcessingDataMu.isPending ? 'Resetting…' : 'I understand — reset & rebuild'}
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

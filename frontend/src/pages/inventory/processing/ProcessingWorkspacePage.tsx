import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { LoadingScreen } from '../../../components/feedback/LoadingScreen';
import { useMarkOrderComplete, usePurchaseOrders } from '../../../hooks/useInventory';
import { getProcessingWorkspace } from '../../../api/inventory.api';
import {
  useProcessingPatchItem,
  useProcessingPrintMultiple,
  useProcessingRowCheckIn,
  useProcessingRowPatch,
  useProcessingAddItem,
  useBuildProcessingData,
  useProcessingRowDetail,
  useProcessingWorkspace,
  PROCESSING_WORKSPACE_ALL_ROWS_LIMIT,
  type ProcessingWorkspaceListParams,
  printedPreviewToLabelInputs,
  useProcessingDataBuildStatus,
} from '../../../hooks/useProcessingWorkspace';
import type { ProcessingWorkspaceItemDTO, ProcessingWorkspaceRowDTO } from '../../../types/inventory.types';
import {
  isSingleScanToken,
  rowsMatchingExactScan,
  type ProcessingStatusSegment,
} from './processingWorkspaceFilters';
import { AddProcessingItemDialog } from './modals/AddProcessingItemDialog';
import { ProcessingWorkspaceHeader, type ProcessingWorkspaceOrderPickRow } from './ProcessingWorkspaceHeader';
import { ProcessingFilterRow } from './ProcessingFilterRow';
import { ProcessingQueueTable } from './ProcessingQueueTable';
// import { ProcessingQueuePagination } from './ProcessingQueuePagination';
import { ProcessingActiveCard } from './ProcessingActiveCard';
import { PrintMultipleModal } from './modals/PrintMultipleModal';
import { printProcessingLabelsStaggered } from './printProcessingLabel';

export default function ProcessingWorkspacePage() {
  const { id: idParam } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const orderId = idParam && /^\d+$/.test(idParam) ? Number.parseInt(idParam, 10) : null;

  useEffect(() => {
    if (orderId == null) navigate('/inventory/processing', { replace: true });
  }, [orderId, navigate]);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [segment, setSegment] = useState<ProcessingStatusSegment>('all');
  const [hideDispositioned, setHideDispositioned] = useState(true);
  const [detailProcessingRowId, setDetailProcessingRowId] = useState<number | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [productFilterProductId, setProductFilterProductId] = useState<number | null>(null);
  const [productFilterTitle, setProductFilterTitle] = useState<string | undefined>(undefined);
  const [sessionCheckInCount, setSessionCheckInCount] = useState(0);
  const [searchFocusSignal, setSearchFocusSignal] = useState(0);

  const bumpSearchFocus = useCallback(() => setSearchFocusSignal((s) => s + 1), []);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (!value.trim()) setDebouncedSearch('');
  }, []);

  const [printMultiOpen, setPrintMultiOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [addUnmanifestedOpen, setAddUnmanifestedOpen] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 450);
    return () => window.clearTimeout(t);
  }, [search]);

  const listParams = useMemo((): ProcessingWorkspaceListParams | null => {
    if (orderId == null) return null;
    const q = debouncedSearch.trim();
    return {
      limit: PROCESSING_WORKSPACE_ALL_ROWS_LIMIT,
      offset: 0,
      segment,
      product_id: productFilterProductId ?? undefined,
      search: debouncedSearch,
      hide_checked_in: q.length > 0 ? false : hideDispositioned,
    };
  }, [orderId, segment, productFilterProductId, debouncedSearch, hideDispositioned]);

  const { data: workspace, isLoading, isFetching, isError, error, refetch } = useProcessingWorkspace(orderId, listParams);

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
      ordered_date: r.ordered_date,
      delivered_date: r.delivered_date,
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
        ordered_date: workspace.order.ordered_date,
        delivered_date: workspace.order.delivered_date,
      },
    ];
  }, [
    processingOrdersPage?.results,
    workspace?.order?.id,
    workspace?.order.number,
    workspace?.order.vendor,
    workspace?.order.ordered_date,
    workspace?.order.delivered_date,
    workspace?.progress.total_units,
  ]);

  useEffect(() => {
    if (workspace?.order?.id) localStorage.setItem('lastProcessingOrderId', String(workspace.order.id));
  }, [workspace?.order?.id]);

  const manifestTotalQty = workspace?.order?.total_manifest_qty ?? 0;
  const manifestDispositioned = workspace?.manifest_qty_dispositioned_total ?? 0;

  const poLineCount = workspace?.row_count_total_po ?? workspace?.rows.length ?? 0;
  const filteredRowCount = workspace?.row_count_filtered ?? workspace?.rows.length ?? 0;

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
    setSelectedItemId(pend?.id ?? null);
  }, [selectedRow, selectedItemId]);

  const activeItem: ProcessingWorkspaceItemDTO | null = useMemo(() => {
    if (!selectedRow || selectedItemId == null) return null;
    const items = selectedRow.items ?? [];
    return items.find((i) => i.id === selectedItemId) ?? null;
  }, [selectedRow, selectedItemId]);

  const showDetailSpinner =
    !workspace?.processingBookmarkOnly &&
    detailProcessingRowId != null &&
    detailRowFetching &&
    fetchedDetailRow == null;

  const safeOrderId = orderId ?? 0;
  const rowCheckIn = useProcessingRowCheckIn(safeOrderId);
  const rowPatch = useProcessingRowPatch(safeOrderId);
  const addItem = useProcessingAddItem(safeOrderId);
  const printMultiple = useProcessingPrintMultiple(safeOrderId);
  const buildProcessingDataMu = useBuildProcessingData(orderId ?? 0);
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
      buildProcessingDataMu.isPending
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
  ]);
  const patchItem = useProcessingPatchItem(safeOrderId);
  const markComplete = useMarkOrderComplete();

  const openDetail = useCallback((processingRowId: number) => {
    setDetailProcessingRowId(processingRowId);
  }, []);

  const backToQueue = useCallback(() => {
    setDetailProcessingRowId(null);
    setSelectedItemId(null);
    bumpSearchFocus();
  }, [bumpSearchFocus]);

  const closeModalAndRefocus = useCallback((setter: (v: boolean) => void) => {
    setter(false);
    bumpSearchFocus();
  }, [bumpSearchFocus]);

  const openScanMatch = useCallback((processingRowId: number) => {
    setDetailProcessingRowId(processingRowId);
    setSearch('');
    setDebouncedSearch('');
  }, []);

  const handleSearchEnter = useCallback(async () => {
    const q = search.trim();
    if (!orderId || !q) return;
    if (!isSingleScanToken(q)) return;
    const onPage = rowsMatchingExactScan(workspace?.rows ?? [], q);
    if (onPage.length === 1) {
      openScanMatch(onPage[0].processing_row_id);
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
        if (rowsMatchingExactScan([sole], q).length === 1) {
          openScanMatch(sole.processing_row_id);
        }
      }
    } catch {
      /* ignore scan helper failures */
    }
  }, [search, orderId, workspace?.rows, segment, productFilterProductId, openScanMatch]);

  const handleCheckIn = useCallback(
    async (payload: Record<string, unknown>, options?: { printLabels?: boolean }) => {
      if (!selectedRow || orderId == null) return false;
      const shouldPrint = options?.printLabels !== false;
      try {
        const data = await rowCheckIn.mutateAsync({
          ...payload,
          processing_row_id: selectedRow.processing_row_id,
        });
        const labelItems = printedPreviewToLabelInputs(data.printed_items_preview ?? []);
        setSessionCheckInCount((c) => c + data.created_count);
        if (shouldPrint) {
          const { succeeded, failed } = await printProcessingLabelsStaggered(labelItems);
          if (failed > 0) {
            enqueueSnackbar(`Checked in ${data.created_count}; printed ${succeeded}/${labelItems.length}.`, { variant: 'warning' });
          } else {
            enqueueSnackbar(`Checked in ${data.created_count} unit(s) and sent labels.`, { variant: 'success' });
          }
        } else {
          enqueueSnackbar(`Checked in ${data.created_count} unit(s) without printing.`, { variant: 'success' });
        }
        bumpSearchFocus();
        return true;
      } catch (e: unknown) {
        const detail =
          e && typeof e === 'object' && 'response' in e
            ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
            : undefined;
        enqueueSnackbar(detail || 'Check-in failed', { variant: 'error' });
        return false;
      }
    },
    [selectedRow, orderId, rowCheckIn, enqueueSnackbar, bumpSearchFocus],
  );

  const handleReprintProcessingItems = useCallback(
    async (items: ProcessingWorkspaceItemDTO[]) => {
      if (!items.length) return;
      const labelItems = items.map((item) => ({
        sku: item.sku,
        title: item.product_title || selectedRow?.title || item.sku,
        price: item.price,
        brand: item.product_brand || selectedRow?.brand || undefined,
        product_number: item.product_number ?? undefined,
      }));
      const { succeeded, failed } = await printProcessingLabelsStaggered(labelItems);
      if (failed > 0) {
        enqueueSnackbar(`Reprinted ${succeeded}/${labelItems.length}; ${failed} failed locally.`, { variant: 'warning' });
      } else {
        enqueueSnackbar(`Reprinted ${succeeded} label(s).`, { variant: 'success' });
      }
    },
    [enqueueSnackbar, selectedRow?.brand, selectedRow?.title],
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

  if (orderId == null) return <LoadingScreen message="Redirecting…" />;

  if (isError && !workspace) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" action={<Button onClick={() => refetch()}>Retry</Button>}>
          {error instanceof Error ? error.message : 'Could not load processing workspace.'}
        </Alert>
      </Box>
    );
  }

  const progress = workspace?.progress;

  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        minWidth: 0,
        alignSelf: 'stretch',
        m: -3,
        p: 0,
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          flexShrink: 0,
          minHeight: 106,
          bgcolor: 'background.paper',
        }}
      >
        {workspace && progress ?
          <ProcessingWorkspaceHeader
            order={workspace.order}
            pickerOrders={pickerOrders}
            onSelectOrderId={(id) => navigate(`/inventory/processing/${id}`)}
            manifestDispositioned={manifestDispositioned}
            manifestTotalQty={manifestTotalQty}
            itemDispositioned={progress.dispositioned_units}
            itemTotal={progress.total_units}
            hasManifestRows={poLineCount > 0}
            sessionCheckInCount={sessionCheckInCount}
            rollups={workspace.rollups}
            addItemVisible={!workspace.processingBookmarkOnly}
            onAddItem={() => setAddUnmanifestedOpen(true)}
            pendingUnits={progress.pending_units}
            orderComplete={workspace.order.status === 'complete'}
            closeLoading={markComplete.isPending}
            onCloseClick={() => setCompleteOpen(true)}
          />
        : <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 106 }}>
            <CircularProgress size={22} />
          </Box>
        }
      </Box>

      {workspace &&
      !workspace.processingBookmarkOnly &&
      (workspace.intake_migration?.unlinked_row_count ?? 0) > 0 ?
        <Box sx={{ flexShrink: 0 }}>
          <Alert severity="info" variant="outlined">
            {workspace.intake_migration!.unlinked_row_count} processing row
            {workspace.intake_migration!.unlinked_row_count === 1 ? ' is' : 's are'} still bookmark-only (no manifest
            link). New-flow rows with manifest links can check in normally; legacy build applies only to unlinked rows.
          </Alert>
        </Box>
      : null}

      {workspace && poLineCount > 0 && workspace.processingBookmarkOnly ?
        <Box sx={{ flexShrink: 0 }}>
          <Alert severity="warning">
            <Typography variant="body2" gutterBottom>
              This order has preprocessing bookmarks but no manifest-linked processing rows yet. Use Create Processing
              Data only for these legacy bookmark-only orders.
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              The legacy build creates placeholder manifest/item data in bounded chunks.
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

      {detailProcessingRowId == null ? (
        <Box sx={{ flexShrink: 0 }}>
          <ProcessingFilterRow
            segment={segment}
            onSegmentChange={setSegment}
            hideDispositioned={hideDispositioned}
            onHideDispositionedChange={setHideDispositioned}
            productFilterProductId={productFilterProductId}
            productFilterTitle={productFilterTitle}
            onClearProductFilter={() => {
              setProductFilterProductId(null);
              setProductFilterTitle(undefined);
            }}
            search={search}
            onSearchChange={handleSearchChange}
            onSearchEnter={handleSearchEnter}
            searchFocusSignal={searchFocusSignal}
            totalRowCount={workspace ? poLineCount : undefined}
            filteredRowCount={workspace ? filteredRowCount : undefined}
            isFetching={isFetching && !isLoading}
          />
        </Box>
      ) : null}

      <Stack
        direction="column"
        spacing={0}
        sx={{ alignItems: 'stretch', flex: 1, minHeight: 0, overflow: 'hidden' }}
      >
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
            overflow: 'hidden',
          }}
        >
          {!workspace?.processingBookmarkOnly &&
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
          : !workspace?.processingBookmarkOnly &&
            detailProcessingRowId != null &&
            selectedRow &&
            workspace ?
            <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <ProcessingActiveCard
              orderId={workspace.order.id}
              row={selectedRow}
              activeItem={activeItem}
              onSelectItemId={setSelectedItemId}
              onBackToQueue={backToQueue}
              onCheckIn={handleCheckIn}
              checkInLoading={rowCheckIn.isPending}
              onPatchCheckedIn={handlePatchCheckedIn}
              patchLoading={patchItem.isPending}
              onReprintItems={handleReprintProcessingItems}
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
              onPatchRowDefaults={async (payload) => {
                try {
                  await rowPatch.mutateAsync(payload);
                  enqueueSnackbar('Row defaults saved.', { variant: 'success' });
                } catch (e: unknown) {
                  const detail =
                    e && typeof e === 'object' && 'response' in e
                      ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
                      : undefined;
                  enqueueSnackbar(detail || 'Could not save row defaults', { variant: 'error' });
                }
              }}
            />
            </Box>
          : (
            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                bgcolor: 'background.paper',
              }}
            >
              {workspace ?
                <ProcessingQueueTable
                  rows={workspace.rows}
                  preprocessingFinalizedAt={workspace.preprocessing_finalized_at}
                  preprocessingBookmarkOnly={workspace.processingBookmarkOnly}
                  totalWorkspaceRowCount={poLineCount}
                  orderId={workspace.order.id}
                  orderStatus={workspace.order.status}
                  detailProcessingRowId={detailProcessingRowId}
                  onOpenDetail={(id) => {
                    openDetail(id);
                  }}
                />
              : <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CircularProgress size={28} />
                </Box>
              }
              {/* Pagination disabled — full list scrolls inside the table.
              <ProcessingQueuePagination
                page={page}
                totalCount={filteredTotal}
                pageSize={queuePageSize}
                onPageChange={setPage}
                rangeCaption={`Lines ${paginationFrom}–${paginationTo} · ${filteredTotal} match (${poLineCount} on order)`}
              />
              */}
            </Box>
            )
          }
        </Box>
      </Stack>

      <PrintMultipleModal
        open={printMultiOpen}
        onClose={() => {
          closeModalAndRefocus(setPrintMultiOpen);
        }}
        row={selectedRow}
        loading={printMultiple.isPending}
        onSubmit={handlePrintMultipleSubmit}
      />

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
            disabled={markComplete.isPending || (progress?.pending_units ?? 0) > 0 || workspace?.order.status === 'complete'}
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

      <AddProcessingItemDialog
        open={addUnmanifestedOpen}
        orderId={orderId ?? 0}
        loading={addItem.isPending}
        onClose={() => setAddUnmanifestedOpen(false)}
        onSubmit={async (payload) => {
          try {
            const data = await addItem.mutateAsync(payload);
            const labelItems = printedPreviewToLabelInputs(data.printed_items_preview ?? []);
            const { succeeded, failed } = await printProcessingLabelsStaggered(labelItems);
            setAddUnmanifestedOpen(false);
            setDetailProcessingRowId(data.row.processing_row_id);
            bumpSearchFocus();
            if (failed > 0) {
              enqueueSnackbar(`Added item; printed ${succeeded}/${labelItems.length}.`, { variant: 'warning' });
            } else {
              enqueueSnackbar('Added item and created queue row.', { variant: 'success' });
            }
          } catch (e: unknown) {
            const detail =
              e && typeof e === 'object' && 'response' in e
                ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
                : undefined;
            enqueueSnackbar(detail || 'Could not add item', { variant: 'error' });
          }
        }}
      />
    </Box>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { ManualReviewPanel } from '../../../components/inventory/ManualReviewPanel';
import { LoadingScreen } from '../../../components/feedback/LoadingScreen';
import { useManualReview, useMarkOrderComplete, usePurchaseOrders } from '../../../hooks/useInventory';
import {
  useProcessingBulkDisposition,
  useProcessingDispute,
  useProcessingMergeRows,
  useProcessingPatchItem,
  useProcessingPrintAndCheckIn,
  useProcessingPrintMultiple,
  useProcessingSwap,
  useProcessingWorkspace,
} from '../../../hooks/useProcessingWorkspace';
import type { ManualReviewRowUpdate } from '../../../api/inventory.api';
import type { ProcessingWorkspaceItemDTO, ProcessingWorkspaceRowDTO } from '../../../types/inventory.types';
import {
  buildProcessingSearchBlob,
  isSingleScanToken,
  matchesProcessingSearch,
  rowMatchesStatusSegment,
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
import { SwapModal } from './modals/SwapModal';
import { printProcessingLabel, printProcessingLabelsStaggered } from './printProcessingLabel';

export default function ProcessingWorkspacePage() {
  const { id: idParam } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const orderId = idParam && /^\d+$/.test(idParam) ? Number.parseInt(idParam, 10) : null;

  useEffect(() => {
    if (orderId == null) navigate('/inventory/processing', { replace: true });
  }, [orderId, navigate]);

  const { data: workspace, isLoading, isError, error, refetch } = useProcessingWorkspace(orderId);

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

  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState<ProcessingStatusSegment>('all');
  const [hideDispositioned, setHideDispositioned] = useState(true);
  const [detailManifestRowId, setDetailManifestRowId] = useState<number | null>(null);
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
  const [swapOpen, setSwapOpen] = useState(false);

  const manifestTotalQty = useMemo(() => workspace?.rows.reduce((a, r) => a + r.qty, 0) ?? 0, [workspace?.rows]);
  const manifestDispositioned = useMemo(() => workspace?.rows.reduce((a, r) => a + r.qtyDispositioned, 0) ?? 0, [workspace?.rows]);

  /** Segment + product filter only (V-14: search / UPC evaluates before hide-dispositioned). */
  const scopeRows = useMemo(() => {
    if (!workspace) return [];
    let rows = workspace.rows;
    if (segment !== 'all') {
      rows = rows.filter((r) =>
        rowMatchesStatusSegment({ items: r.items.map((i) => ({ status: i.status })) }, segment),
      );
    }
    if (productFilterProductId != null) {
      rows = rows.filter((r) => r.productId === productFilterProductId);
    }
    return rows;
  }, [workspace, segment, productFilterProductId]);

  const filteredRows = useMemo(() => {
    if (!workspace) return [];
    let rows = scopeRows;
    const q = search.trim();
    if (q) {
      rows = rows.filter((r) => {
        const blob = buildProcessingSearchBlob({
          rowNum: r.rowNum,
          title: r.title,
          brand: r.brand,
          model: r.model,
          sku: r.sku ?? undefined,
          identifiers: r.identifiers as { upc?: string },
        });
        return matchesProcessingSearch(blob, q);
      });
    } else if (hideDispositioned) {
      rows = rows.filter((r) => r.status !== 'checked_in');
    }
    return rows;
  }, [workspace, scopeRows, hideDispositioned, search]);

  useEffect(() => {
    if (detailManifestRowId == null) return;
    if (!workspace?.rows.some((r) => r.manifest_row_id === detailManifestRowId)) {
      setDetailManifestRowId(null);
      setSelectedItemId(null);
    }
  }, [workspace?.rows, detailManifestRowId]);

  const selectedRow = useMemo((): ProcessingWorkspaceRowDTO | null => {
    if (!workspace || detailManifestRowId == null) return null;
    return workspace.rows.find((r) => r.manifest_row_id === detailManifestRowId) ?? null;
  }, [workspace, detailManifestRowId]);

  useEffect(() => {
    if (!selectedRow) {
      setSelectedItemId(null);
      return;
    }
    const valid = selectedItemId != null && selectedRow.items.some((i) => i.id === selectedItemId);
    if (valid) return;
    const pend = selectedRow.items.find((i) => i.status === 'intake' || i.status === 'processing');
    setSelectedItemId((pend ?? selectedRow.items[0])?.id ?? null);
  }, [selectedRow, selectedItemId]);

  const activeItem: ProcessingWorkspaceItemDTO | null = useMemo(() => {
    if (!selectedRow || selectedItemId == null) return null;
    return selectedRow.items.find((i) => i.id === selectedItemId) ?? null;
  }, [selectedRow, selectedItemId]);

  const bulkRowsSelected = useMemo(() => {
    if (!workspace) return [];
    return workspace.rows.filter((r) => bulkSelectedIds.has(r.manifest_row_id)).sort((a, b) => a.rowNum - b.rowNum);
  }, [workspace, bulkSelectedIds]);

  const sameProductBulk = useMemo(() => {
    if (bulkRowsSelected.length < 2) return false;
    const pid = bulkRowsSelected[0].productId;
    if (pid == null) return false;
    return bulkRowsSelected.every((r) => r.productId === pid);
  }, [bulkRowsSelected]);

  const swapRowNums = useMemo(() => {
    if (bulkRowsSelected.length !== 2) return { a: null as number | null, b: null as number | null };
    return { a: bulkRowsSelected[0].rowNum, b: bulkRowsSelected[1].rowNum };
  }, [bulkRowsSelected]);

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
  const swapMu = useProcessingSwap(safeOrderId);
  const patchItem = useProcessingPatchItem(safeOrderId);
  const markComplete = useMarkOrderComplete();

  const [pricingAuditExpanded, setPricingAuditExpanded] = useState(false);
  const [mrPage, setMrPage] = useState(1);
  const [mrPageSize, setMrPageSize] = useState(50);
  const [mrSearch, setMrSearch] = useState('');
  const [mrMissingOnly, setMrMissingOnly] = useState(false);

  const manualReviewParams = useMemo(
    () => ({
      page: mrPage,
      page_size: mrPageSize,
      search: mrSearch.trim() || undefined,
      missing_price: mrMissingOnly ? true : undefined,
    }),
    [mrPage, mrPageSize, mrSearch, mrMissingOnly],
  );

  const { data: manualReviewData, isLoading: manualReviewLoading } = useManualReview(
    orderId,
    manualReviewParams,
    pricingAuditExpanded && orderId != null,
  );

  useEffect(() => {
    setMrPage(1);
    setMrSearch('');
    setMrMissingOnly(false);
    setPricingAuditExpanded(false);
  }, [orderId]);

  const noopSaveManualReview = useCallback(async (_rows: ManualReviewRowUpdate[]) => Promise.resolve(), []);
  const noopNavigateManualReview = useCallback(async () => Promise.resolve(), []);

  const clearBulk = useCallback(() => setBulkSelectedIds(new Set()), []);

  const openDetail = useCallback((manifestRowId: number) => {
    setDetailManifestRowId(manifestRowId);
  }, []);

  const backToQueue = useCallback(() => {
    setDetailManifestRowId(null);
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

  const handleSearchEnter = useCallback(() => {
    const q = search.trim();
    if (!workspace || !q) return;
    if (isSingleScanToken(q)) {
      const hits = rowsMatchingExactUpc(scopeRows, q);
      if (hits.length === 1) {
        setBulkSelectedIds(new Set());
        setDetailManifestRowId(hits[0].manifest_row_id);
        setSearch('');
      }
    }
  }, [search, workspace, scopeRows]);

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
        const labelItems = ids.map((id) => {
          for (const r of data.workspace.rows) {
            const it = r.items.find((i) => i.id === id);
            if (it) {
              return {
                sku: it.sku,
                title: r.title || r.product?.title || it.sku,
                price: it.price,
                brand: r.product?.brand,
                product_number: r.product?.product_number,
              };
            }
          }
          return { sku: '', title: '', price: '0' };
        });
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

  const toggleBulkOne = useCallback((manifestRowId: number, selected: boolean) => {
    setBulkSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(manifestRowId);
      else next.delete(manifestRowId);
      return next;
    });
  }, []);

  const toggleBulkAll = useCallback(
    (selected: boolean) => {
      if (!selected) {
        setBulkSelectedIds(new Set());
        return;
      }
      setBulkSelectedIds(new Set(filteredRows.map((r) => r.manifest_row_id)));
    },
    [filteredRows],
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

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1600, mx: 'auto', display: 'flex', flexDirection: 'column', minHeight: '70vh' }}>
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
        hasManifestRows={workspace.rows.length > 0}
        sessionCheckInCount={sessionCheckInCount}
      />

      <Accordion
        expanded={pricingAuditExpanded}
        onChange={(_e, expanded) => setPricingAuditExpanded(expanded)}
        variant="outlined"
        sx={{ mt: 1.5, '&:before': { display: 'none' } }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2">Manifest pricing audit (read-only)</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
            Compare line MSRP, allocated base, 2× ideal target, and finalized manifest prices while processing.
          </Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0 }}>
          <ManualReviewPanel
            readOnly
            rows={manualReviewData?.rows ?? []}
            summary={manualReviewData?.summary ?? null}
            orderStatus={workspace.order.status}
            onSaveRows={noopSaveManualReview}
            onNavigateToProcessing={noopNavigateManualReview}
            isSaving={false}
            allowNavigateToProcessing={false}
            count={manualReviewData?.count ?? 0}
            page={manualReviewData?.page ?? mrPage}
            pageSize={manualReviewData?.page_size ?? mrPageSize}
            isLoading={manualReviewLoading}
            onPageChange={(p) => setMrPage(p)}
            onPageSizeChange={(ps) => {
              setMrPageSize(ps);
              setMrPage(1);
            }}
            onSearchChange={(s) => {
              setMrSearch(s);
              setMrPage(1);
            }}
            onMissingPriceChange={(v) => {
              setMrMissingOnly(v);
              setMrPage(1);
            }}
          />
        </AccordionDetails>
      </Accordion>

      <ProcessingFilterRow
        segment={segment}
        onSegmentChange={setSegment}
        hideDispositioned={hideDispositioned}
        onHideDispositionedChange={setHideDispositioned}
        filteredCount={filteredRows.length}
        totalCount={workspace.rows.length}
        productFilterProductId={productFilterProductId}
        productFilterTitle={productFilterTitle}
        onClearProductFilter={() => {
          setProductFilterProductId(null);
          setProductFilterTitle(undefined);
        }}
      />

      <Stack direction="column" spacing={2} sx={{ mt: 0, alignItems: 'stretch', flex: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {detailManifestRowId != null && selectedRow && activeItem ?
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
                !selectedRow.items.some((i) => i.status === 'intake' || i.status === 'processing')
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
              onOpenSwapPrefill={() => setSwapOpen(true)}
              onPrepareMergeFromCard={() => {
                if (selectedRow) {
                  setBulkSelectedIds(new Set([selectedRow.manifest_row_id]));
                  backToQueue();
                  enqueueSnackbar('Select another row for the same product, then tap Merge.', { variant: 'info' });
                }
              }}
            />
          : <ProcessingQueueTable
              rows={filteredRows}
              totalWorkspaceRowCount={workspace.rows.length}
              orderId={workspace.order.id}
              orderStatus={workspace.order.status}
              detailManifestRowId={detailManifestRowId}
              onOpenDetail={(id) => {
                clearBulk();
                openDetail(id);
              }}
              bulkSelectedIds={bulkSelectedIds}
              onToggleBulkOne={toggleBulkOne}
              onToggleBulkAll={toggleBulkAll}
            />
          }
          {detailManifestRowId == null ?
            <ProcessingBulkActionBar
              selectedCount={bulkSelectedIds.size}
              onClear={clearBulk}
              sameProduct={sameProductBulk}
              onMerge={() => setMergeOpen(true)}
              onBulkDisposition={() => setBulkDispOpen(true)}
              onMarkBroken={openBulkDispute}
              onMarkUndelivered={openBulkDispute}
              onSwap={() => setSwapOpen(true)}
            />
          : null}
        </Box>
      </Stack>

      <ProcessingWorkspaceFooter
        pendingUnits={progress.pending_units}
        dispositionedUnits={progress.dispositioned_units}
        totalUnits={progress.total_units}
        orderComplete={workspace.order.status === 'complete'}
        closeLoading={markComplete.isPending}
        onCloseClick={() => setCompleteOpen(true)}
      />

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
        manifestRowIds={bulkRowsSelected.map((r) => r.manifest_row_id)}
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
        manifestRowIds={bulkRowsSelected.map((r) => r.manifest_row_id)}
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

      <SwapModal
        open={swapOpen}
        onClose={() => closeModalAndRefocus(setSwapOpen)}
        workspaceRows={workspace.rows}
        initialRowA={swapRowNums.a}
        initialRowB={swapRowNums.b}
        loading={swapMu.isPending}
        onSubmit={async (payload) => {
          try {
            await swapMu.mutateAsync(payload);
            enqueueSnackbar('Swap completed.', { variant: 'success' });
            setSwapOpen(false);
            clearBulk();
            bumpSearchFocus();
          } catch (e: unknown) {
            const detail =
              e && typeof e === 'object' && 'response' in e
                ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
                : undefined;
            enqueueSnackbar(detail || 'Swap failed', { variant: 'error' });
          }
        }}
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

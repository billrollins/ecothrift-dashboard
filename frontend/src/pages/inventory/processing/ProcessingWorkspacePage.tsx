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
import { useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { LoadingScreen } from '../../../components/feedback/LoadingScreen';
import { useMarkOrderComplete, usePurchaseOrders } from '../../../hooks/useInventory';
import { getProcessingWorkspace } from '../../../api/inventory.api';
import {
  useProcessingPatchItem,
  useProcessingRowCheckIn,
  useProcessingCheckInTogether,
  useProcessingCollapseRows,
  useProcessingUncollapseRows,
  useProcessingRowPatch,
  useProcessingAddItem,
  useProcessingDeleteAddedRow,
  useBuildProcessingData,
  useProcessingRowDetail,
  useProcessingWorkspace,
  PROCESSING_WORKSPACE_ALL_ROWS_LIMIT,
  refreshProcessingDetailData,
  type ProcessingWorkspaceListParams,
  printedPreviewToLabelInputs,
  useProcessingDataBuildStatus,
} from '../../../hooks/useProcessingWorkspace';
import type { ProcessingWorkspaceItemDTO, ProcessingWorkspaceRowDTO } from '../../../types/inventory.types';
import {
  DEFAULT_QUEUE_FILTER_STATE,
  isSingleScanToken,
  queueFiltersToSegmentsParam,
  rowsMatchingExactScan,
  type ProcessingQueueFilterState,
} from './processingWorkspaceFilters';
import { AddProcessingItemDialog } from './modals/AddProcessingItemDialog';
import { ProcessingWorkspaceHeader, type ProcessingWorkspaceOrderPickRow } from './ProcessingWorkspaceHeader';
import { ProcessingFilterRow } from './ProcessingFilterRow';
import { ProcessingScanBar } from './ProcessingScanBar';
import { ProcessingRecentRowsBar } from './ProcessingRecentRowsBar';
import { ProcessingQueueTable } from './ProcessingQueueTable';
import { ProcessingBulkActionBar } from './ProcessingBulkActionBar';
import { CheckInTogetherDialog } from './CheckInTogetherDialog';
import { CollapseRowsDialog } from './CollapseRowsDialog';
// import { ProcessingQueuePagination } from './ProcessingQueuePagination';
import { ProcessingActiveCard } from './ProcessingActiveCard';
import { printProcessingLabelsAndMarkPrinted } from './printProcessingLabel';
import { queueTitleText } from './processingQueueCellText';
import {
  readProcessingWorkspaceSession,
  writeProcessingWorkspaceSession,
} from './processingWorkspaceSession';
import {
  type ProcessingRecentRowEntry,
  processingSearchHistoryKey,
  pushProcessingRecentRow,
  readProcessingRecentRows,
} from './processingRecentRows';
import { useWorkbenchConfirmDialog } from '../workbench/useWorkbenchConfirmDialog';
import { apiErrorDetail } from '../../../hooks/useProductSearch';

export default function ProcessingWorkspacePage() {
  const { id: idParam } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialogHost } = useWorkbenchConfirmDialog();
  const orderId = idParam && /^\d+$/.test(idParam) ? Number.parseInt(idParam, 10) : null;

  useEffect(() => {
    if (orderId == null) navigate('/inventory/processing', { replace: true });
  }, [orderId, navigate]);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [queueFilters, setQueueFilters] = useState<ProcessingQueueFilterState>(DEFAULT_QUEUE_FILTER_STATE);
  const [detailProcessingRowId, setDetailProcessingRowId] = useState<number | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [productFilterProductId, setProductFilterProductId] = useState<number | null>(null);
  const [productFilterTitle, setProductFilterTitle] = useState<string | undefined>(undefined);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<number>>(() => new Set());
  const [detailRefreshPending, setDetailRefreshPending] = useState(false);
  const [togetherRows, setTogetherRows] = useState<ProcessingWorkspaceRowDTO[] | null>(null);
  const [collapseDialogOpen, setCollapseDialogOpen] = useState(false);
  const [sessionCheckInCount, setSessionCheckInCount] = useState(0);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [searchFocusSignal, setSearchFocusSignal] = useState(0);
  const [sessionHydratedForOrderId, setSessionHydratedForOrderId] = useState<number | null>(null);
  const [recentRows, setRecentRows] = useState<ProcessingRecentRowEntry[]>([]);

  /** Session rate counts mutation results; the timer starts at the first check-in. */
  const recordSessionCheckIns = useCallback((count: number) => {
    if (count <= 0) return;
    setSessionStartedAt((prev) => prev ?? Date.now());
    setSessionCheckInCount((c) => c + count);
  }, []);

  const bumpSearchFocus = useCallback(() => setSearchFocusSignal((s) => s + 1), []);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (!value.trim()) setDebouncedSearch('');
  }, []);

  const [detailScrollToHistory, setDetailScrollToHistory] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [addUnmanifestedOpen, setAddUnmanifestedOpen] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 450);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (orderId == null) {
      setSessionHydratedForOrderId(null);
      return;
    }
    const saved = readProcessingWorkspaceSession(orderId);
    const restoredSearch = saved?.search ?? '';
    setSearch(restoredSearch);
    setDebouncedSearch(restoredSearch.trim());
    setDetailProcessingRowId(saved?.detailProcessingRowId ?? null);
    setSelectedItemId(null);
    setDetailScrollToHistory(false);
    setSessionHydratedForOrderId(orderId);
    setRecentRows(readProcessingRecentRows(orderId));
  }, [orderId]);

  useEffect(() => {
    if (orderId == null || sessionHydratedForOrderId !== orderId) return;
    writeProcessingWorkspaceSession(orderId, { search, detailProcessingRowId });
  }, [orderId, sessionHydratedForOrderId, search, detailProcessingRowId]);

  const listParams = useMemo((): ProcessingWorkspaceListParams | null => {
    if (orderId == null) return null;
    return {
      limit: PROCESSING_WORKSPACE_ALL_ROWS_LIMIT,
      offset: 0,
      segment: 'all',
      segments: queueFiltersToSegmentsParam(queueFilters),
      product_id: productFilterProductId ?? undefined,
      search: debouncedSearch,
      hide_checked_in: false,
    };
  }, [orderId, queueFilters, productFilterProductId, debouncedSearch]);

  const { data: workspace, isLoading, isFetching, isError, error, refetch } = useProcessingWorkspace(orderId, listParams);
  /** Stable handle for callbacks that need current rows without re-creating per fetch. */
  const workspaceRef = useRef(workspace);
  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

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
  const checkInTogether = useProcessingCheckInTogether(safeOrderId);
  const collapseRows = useProcessingCollapseRows(safeOrderId);
  const uncollapseRows = useProcessingUncollapseRows(safeOrderId);
  const rowPatch = useProcessingRowPatch(safeOrderId);
  const addItem = useProcessingAddItem(safeOrderId);
  const deleteAddedRow = useProcessingDeleteAddedRow(safeOrderId);
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

  const rememberRecentRow = useCallback(
    (row: Pick<ProcessingWorkspaceRowDTO, 'processing_row_id' | 'rowNum' | 'title' | 'brand'>) => {
      if (orderId == null) return;
      setRecentRows(
        pushProcessingRecentRow(orderId, {
          processingRowId: row.processing_row_id,
          rowNum: row.rowNum,
          title: queueTitleText(row),
        }),
      );
    },
    [orderId],
  );

  const openDetail = useCallback((processingRowId: number, options?: { scrollToHistory?: boolean }) => {
    // P7 collapse: a member is a dead end (check-in rejected) — open its master instead,
    // which covers the whole group. Hits scan-to-open and any filtered view.
    const target = workspaceRef.current?.rows.find((r) => r.processing_row_id === processingRowId);
    const resolvedId = target?.collapseMasterId ?? processingRowId;
    const resolved =
      workspaceRef.current?.rows.find((r) => r.processing_row_id === resolvedId) ?? target;
    if (resolved) rememberRecentRow(resolved);
    setSelectedRowIds(new Set());
    setDetailProcessingRowId(resolvedId);
    setDetailScrollToHistory(Boolean(options?.scrollToHistory));
  }, [rememberRecentRow]);

  const handleDeleteAddedRow = useCallback(
    async (row: ProcessingWorkspaceRowDTO) => {
      if (row.rowKind !== 'added') return;
      if ((row.qtyDispositioned ?? 0) > 0) {
        enqueueSnackbar('Remove all check-ins from this line before deleting it.', { variant: 'warning' });
        return;
      }
      const title = queueTitleText(row);
      const ok = await confirm({
        title: 'Delete unmanifested line?',
        message: `Remove row ${row.rowNum}${title ? ` (${title})` : ''} from the queue? This cannot be undone.`,
        confirmLabel: 'Delete',
        severity: 'error',
        confirmColor: 'error',
      });
      if (!ok) return;
      try {
        await deleteAddedRow.mutateAsync(row.processing_row_id);
        setSelectedRowIds((prev) => {
          if (!prev.has(row.processing_row_id)) return prev;
          const next = new Set(prev);
          next.delete(row.processing_row_id);
          return next;
        });
        if (detailProcessingRowId === row.processing_row_id) {
          setDetailProcessingRowId(null);
        }
        enqueueSnackbar('Unmanifested line removed.', { variant: 'success' });
      } catch (err) {
        enqueueSnackbar(apiErrorDetail(err, 'Could not delete line'), { variant: 'error' });
      }
    },
    [confirm, deleteAddedRow, detailProcessingRowId, enqueueSnackbar],
  );

  const handleRefreshDetail = useCallback(async () => {
    if (orderId == null || detailProcessingRowId == null || detailRefreshPending) return;
    setDetailRefreshPending(true);
    try {
      await refreshProcessingDetailData(queryClient, orderId, detailProcessingRowId);
    } catch {
      enqueueSnackbar('Could not refresh row.', { variant: 'error' });
    } finally {
      setDetailRefreshPending(false);
    }
  }, [orderId, detailProcessingRowId, detailRefreshPending, queryClient, enqueueSnackbar]);

  const clearRowSelection = useCallback(() => {
    setSelectedRowIds(new Set());
  }, []);

  const toggleRowSelection = useCallback((processingRowId: number) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(processingRowId)) next.delete(processingRowId);
      else next.add(processingRowId);
      return next;
    });
  }, []);

  const selectAllVisibleRows = useCallback((processingRowIds: number[]) => {
    setSelectedRowIds((prev) => {
      const allSelected = processingRowIds.length > 0 && processingRowIds.every((id) => prev.has(id));
      if (allSelected) return new Set();
      return new Set(processingRowIds);
    });
  }, []);

  // Preserve selection across filter changes: prune to rows still visible
  // instead of wiping selection on every segment/search/filter change.
  useEffect(() => {
    if (!workspace) return;
    setSelectedRowIds((prev) => {
      if (!prev.size) return prev;
      const visible = new Set(workspace.rows.map((r) => r.processing_row_id));
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [workspace]);

  const backToQueue = useCallback(() => {
    setDetailProcessingRowId(null);
    setSelectedItemId(null);
    setDetailScrollToHistory(false);
    bumpSearchFocus();
  }, [bumpSearchFocus]);

  const closeModalAndRefocus = useCallback((setter: (v: boolean) => void) => {
    setter(false);
    bumpSearchFocus();
  }, [bumpSearchFocus]);

  // Esc anywhere in detail mode (outside inputs/dialogs) returns to the queue.
  useEffect(() => {
    if (detailProcessingRowId == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) return;
        if (t.closest('[role="dialog"], .MuiModal-root, .MuiPopover-root')) return;
      }
      e.preventDefault();
      backToQueue();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailProcessingRowId, backToQueue]);

  const openScanMatch = useCallback((processingRowId: number) => {
    const row = workspaceRef.current?.rows.find((r) => r.processing_row_id === processingRowId);
    if (row) rememberRecentRow(row);
    setSelectedRowIds(new Set());
    setDetailProcessingRowId(processingRowId);
    setDetailScrollToHistory(false);
    setSearch('');
    setDebouncedSearch('');
    bumpSearchFocus();
  }, [bumpSearchFocus, rememberRecentRow]);

  const handleSearchEnter = useCallback(async () => {
    const q = search.trim();
    if (!orderId || !q) return;
    const inDetail = detailProcessingRowId != null;
    if (isSingleScanToken(q)) {
      const onPage = rowsMatchingExactScan(workspace?.rows ?? [], q);
      if (onPage.length === 1) {
        openScanMatch(onPage[0].processing_row_id);
        return;
      }
      try {
        const { data } = await getProcessingWorkspace(orderId, {
          limit: 2,
          offset: 0,
          segment: 'all',
          segments: queueFiltersToSegmentsParam(queueFilters),
          product_id: productFilterProductId ?? undefined,
          search: q,
          hide_checked_in: false,
        });
        if (data.row_count_filtered === 1 && data.rows[0]) {
          const sole = data.rows[0];
          if (rowsMatchingExactScan([sole], q).length === 1) {
            openScanMatch(sole.processing_row_id);
            return;
          }
        }
      } catch {
        /* ignore scan helper failures */
      }
    }
    // No exact scan match — treat as a text search. From detail mode this
    // returns to the queue with results shown (search persists).
    if (inDetail) {
      setDetailProcessingRowId(null);
      setSelectedItemId(null);
      setDebouncedSearch(q);
    }
  }, [search, orderId, detailProcessingRowId, workspace?.rows, queueFilters, productFilterProductId, openScanMatch]);

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
        recordSessionCheckIns(data.created_count);
        rememberRecentRow(selectedRow);
        if (shouldPrint) {
          const result = await printProcessingLabelsAndMarkPrinted(labelItems);
          if (result.failed > 0) {
            enqueueSnackbar(`Checked in ${data.created_count}; printed ${result.succeeded}/${labelItems.length}.`, { variant: 'warning' });
          } else {
            enqueueSnackbar(`Checked in ${data.created_count} unit(s) and sent labels.`, { variant: 'success' });
          }
          if (result.markFailed) {
            enqueueSnackbar('Labels printed but printed status could not be saved.', { variant: 'warning' });
          } else if (result.succeededItemIds.length && orderId != null && selectedRow) {
            void queryClient.invalidateQueries({
              queryKey: ['processing-row-detail', orderId, selectedRow.processing_row_id],
            });
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
    [selectedRow, orderId, rowCheckIn, enqueueSnackbar, bumpSearchFocus, recordSessionCheckIns, rememberRecentRow, queryClient],
  );

  const selectedQueueRows = useMemo(
    () => workspace?.rows.filter((row) => selectedRowIds.has(row.processing_row_id)) ?? [],
    [workspace?.rows, selectedRowIds],
  );

  const bulkSelectionEligible = useMemo(
    () =>
      selectedQueueRows.length >= 2 &&
      selectedQueueRows.every(
        (row) =>
          row.manifest_row_id != null &&
          row.rowKind !== 'added' &&
          row.collapseMasterId == null &&
          !row.collapsedGroup,
      ),
    [selectedQueueRows],
  );

  // P7 collapse eligibility: ≥2 eligible rows, none already in a collapse group.
  const canCollapseRows = useMemo(
    () =>
      bulkSelectionEligible &&
      selectedQueueRows.every((row) => !row.collapseMasterId && !row.collapsedGroup),
    [bulkSelectionEligible, selectedQueueRows],
  );
  const selectedCollapseMaster = useMemo(
    () => (selectedQueueRows.length === 1 && selectedQueueRows[0].collapsedGroup ? selectedQueueRows[0] : null),
    [selectedQueueRows],
  );

  const handleCollapseSelected = useCallback(() => {
    if (selectedQueueRows.length < 2) return;
    setCollapseDialogOpen(true);
  }, [selectedQueueRows.length]);

  const handleCollapseConfirm = useCallback(async (): Promise<boolean> => {
    try {
      const data = await collapseRows.mutateAsync({
        processing_row_ids: selectedQueueRows.map((row) => row.processing_row_id),
      });
      const masterNum = [...selectedQueueRows].sort((a, b) => a.rowNum - b.rowNum)[0]?.rowNum;
      enqueueSnackbar(
        `Collapsed ${1 + data.member_processing_row_ids.length} rows`
          + (masterNum != null ? ` — row #${masterNum} is the group master.` : '.'),
        { variant: 'success' },
      );
      clearRowSelection();
      return true;
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      enqueueSnackbar(detail || 'Failed to collapse rows', { variant: 'error' });
      return false;
    }
  }, [selectedQueueRows, collapseRows, enqueueSnackbar, clearRowSelection]);

  const handleUncollapse = useCallback(async (masterId: number) => {
    try {
      await uncollapseRows.mutateAsync({ master_processing_row_id: masterId });
      enqueueSnackbar('Group uncollapsed — rows are individual again.', { variant: 'success' });
      clearRowSelection();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      enqueueSnackbar(detail || 'Failed to uncollapse', { variant: 'error' });
    }
  }, [uncollapseRows, enqueueSnackbar, clearRowSelection]);

  /** Same-product peers for the open detail row (P5 surfaced from the peer banner). */
  const peerTogetherRows = useMemo((): ProcessingWorkspaceRowDTO[] => {
    if (!workspace || !selectedRow || selectedRow.productId == null) return [];
    const peerNums = new Set(selectedRow.sameProductRowNumbers ?? []);
    if (!peerNums.size) return [];
    const pool =
      workspace.rows.some((r) => r.processing_row_id === selectedRow.processing_row_id) ?
        workspace.rows
      : [selectedRow, ...workspace.rows];
    const eligible = pool.filter(
      (r) =>
        (r.processing_row_id === selectedRow.processing_row_id || peerNums.has(r.rowNum)) &&
        r.productId === selectedRow.productId &&
        r.manifest_row_id != null &&
        r.rowKind !== 'added' &&
        (r.distinctProductCount ?? 0) < 2 &&
        r.qty - r.qtyDispositioned > 0,
    );
    return eligible.length >= 2 ? eligible : [];
  }, [workspace, selectedRow]);

  const handleCheckInTogether = useCallback(
    async (payload: Record<string, unknown>, options?: { printLabels?: boolean }) => {
      if (orderId == null) return false;
      const shouldPrint = options?.printLabels !== false;
      try {
        const data = await checkInTogether.mutateAsync(payload);
        const labelItems = printedPreviewToLabelInputs(data.printed_items_preview ?? []);
        recordSessionCheckIns(data.created_count);
        clearRowSelection();
        if (shouldPrint) {
          const result = await printProcessingLabelsAndMarkPrinted(labelItems);
          if (result.failed > 0) {
            enqueueSnackbar(`Checked in ${data.created_count}; printed ${result.succeeded}/${labelItems.length}.`, {
              variant: 'warning',
            });
          } else {
            enqueueSnackbar(`Checked in ${data.created_count} unit(s) and sent labels.`, { variant: 'success' });
          }
          if (result.markFailed) {
            enqueueSnackbar('Labels printed but printed status could not be saved.', { variant: 'warning' });
          } else if (result.succeededItemIds.length && orderId != null && detailProcessingRowId != null) {
            void queryClient.invalidateQueries({
              queryKey: ['processing-row-detail', orderId, detailProcessingRowId],
            });
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
        enqueueSnackbar(detail || 'Check in together failed', { variant: 'error' });
        return false;
      }
    },
    [orderId, checkInTogether, enqueueSnackbar, bumpSearchFocus, clearRowSelection, recordSessionCheckIns, queryClient, detailProcessingRowId],
  );

  const handleReprintProcessingItems = useCallback(
    async (items: ProcessingWorkspaceItemDTO[]) => {
      if (!items.length) return;
      const labelItems = items.map((item) => ({
        id: item.id,
        sku: item.sku,
        price: item.price,
        product_title: item.product_title || selectedRow?.title || item.sku,
        product_brand: item.product_brand || selectedRow?.brand || undefined,
        product_number: item.product_number ?? undefined,
      }));
      const result = await printProcessingLabelsAndMarkPrinted(labelItems);
      if (result.failed > 0) {
        enqueueSnackbar(`Reprinted ${result.succeeded}/${labelItems.length}; ${result.failed} failed locally.`, { variant: 'warning' });
      } else {
        enqueueSnackbar(`Reprinted ${result.succeeded} label(s).`, { variant: 'success' });
      }
      if (result.markFailed) {
        enqueueSnackbar('Labels printed but printed status could not be saved.', { variant: 'warning' });
      } else if (result.succeededItemIds.length && orderId != null && detailProcessingRowId != null) {
        void queryClient.invalidateQueries({
          queryKey: ['processing-row-detail', orderId, detailProcessingRowId],
        });
      }
    },
    [enqueueSnackbar, selectedRow?.brand, selectedRow?.title, orderId, detailProcessingRowId, queryClient],
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
            sessionStartedAt={sessionStartedAt}
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
          <ProcessingScanBar
            search={search}
            onSearchChange={handleSearchChange}
            onSearchEnter={() => void handleSearchEnter()}
            onHistorySelect={(q) => {
              setSearch(q);
              setDebouncedSearch(q.trim());
            }}
            historyStorageKey={orderId != null ? processingSearchHistoryKey(orderId) : undefined}
            historyMax={10}
            searchFocusSignal={searchFocusSignal}
            isFetching={isFetching && !isLoading}
            mode="queue"
          />
          <ProcessingRecentRowsBar
            rows={recentRows}
            onOpenRow={(processingRowId) => openDetail(processingRowId)}
          />
        </Box>
      ) : null}

      {detailProcessingRowId == null ? (
        <Box sx={{ flexShrink: 0 }}>
          <ProcessingFilterRow
            filters={queueFilters}
            onFiltersChange={setQueueFilters}
            productFilterProductId={productFilterProductId}
            productFilterTitle={productFilterTitle}
            onClearProductFilter={() => {
              setProductFilterProductId(null);
              setProductFilterTitle(undefined);
            }}
            totalRowCount={workspace ? poLineCount : undefined}
            filteredRowCount={workspace ? filteredRowCount : undefined}
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
              onRefreshDetail={() => void handleRefreshDetail()}
              detailRefreshing={detailRefreshPending}
              onCheckIn={handleCheckIn}
              checkInLoading={rowCheckIn.isPending}
              onPatchCheckedIn={handlePatchCheckedIn}
              patchLoading={patchItem.isPending}
              onReprintItems={handleReprintProcessingItems}
              onOpenCheckInTogether={
                peerTogetherRows.length >= 2 ? () => setTogetherRows(peerTogetherRows) : undefined
              }
              onAddItem={() => setAddUnmanifestedOpen(true)}
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
              scrollToHistory={detailScrollToHistory}
              onScrollToHistoryDone={() => setDetailScrollToHistory(false)}
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
                <>
                  <ProcessingQueueTable
                    rows={workspace.rows}
                    preprocessingFinalizedAt={workspace.preprocessing_finalized_at}
                    preprocessingBookmarkOnly={workspace.processingBookmarkOnly}
                    totalWorkspaceRowCount={poLineCount}
                    orderId={workspace.order.id}
                    orderStatus={workspace.order.status}
                    detailProcessingRowId={detailProcessingRowId}
                    selectedRowIds={selectedRowIds}
                    onToggleRow={toggleRowSelection}
                    onSelectAllVisible={selectAllVisibleRows}
                    onOpenDetail={(id, options) => {
                      openDetail(id, options);
                    }}
                    onFilterProduct={(row) => {
                      if (row.productId == null) return;
                      setProductFilterProductId(row.productId);
                      setProductFilterTitle(row.product?.title);
                    }}
                    onDeleteAddedRow={(row) => void handleDeleteAddedRow(row)}
                    deleteAddedRowLoadingId={
                      deleteAddedRow.isPending ? (deleteAddedRow.variables ?? null) : null
                    }
                  />
                  <ProcessingBulkActionBar
                    selectedCount={selectedRowIds.size}
                    onClear={clearRowSelection}
                    canCollapseRows={canCollapseRows}
                    collapseMasterRowId={selectedCollapseMaster?.processing_row_id ?? null}
                    collapseLoading={collapseRows.isPending || uncollapseRows.isPending}
                    onCollapseRows={() => void handleCollapseSelected()}
                    onUncollapseRows={(masterId) => void handleUncollapse(masterId)}
                    itemActionsBlocked={workspace.processingBookmarkOnly}
                    itemActionsBlockedHint={
                      workspace.processingBookmarkOnly ?
                        'Collapse requires manifest-linked processing rows.'
                      : undefined
                    }
                  />
                </>
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

      <CheckInTogetherDialog
        open={togetherRows != null}
        rows={togetherRows ?? []}
        loading={checkInTogether.isPending}
        onClose={() => {
          setTogetherRows(null);
          bumpSearchFocus();
        }}
        onSubmit={handleCheckInTogether}
      />

      <CollapseRowsDialog
        open={collapseDialogOpen}
        rows={selectedQueueRows}
        loading={collapseRows.isPending}
        onClose={() => closeModalAndRefocus(setCollapseDialogOpen)}
        onConfirm={handleCollapseConfirm}
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
        loading={addItem.isPending}
        onClose={() => setAddUnmanifestedOpen(false)}
        onSubmit={async (payload) => {
          try {
            const data = await addItem.mutateAsync(payload);
            setAddUnmanifestedOpen(false);
            setDetailProcessingRowId(data.row.processing_row_id);
            bumpSearchFocus();
            enqueueSnackbar('Unmanifested line added to queue.', { variant: 'success' });
          } catch (e: unknown) {
            const detail =
              e && typeof e === 'object' && 'response' in e
                ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
                : undefined;
            enqueueSnackbar(detail || 'Could not add item', { variant: 'error' });
            throw e; // keep the form filled so staff can correct and retry
          }
        }}
      />
      {ConfirmDialogHost}
    </Box>
  );
}

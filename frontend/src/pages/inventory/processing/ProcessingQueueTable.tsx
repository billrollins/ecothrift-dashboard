import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Link,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography,
  useTheme,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import type { PurchaseOrderStatus } from '../../../types/inventory.types';
import type { ProcessingWorkspaceRowDTO } from '../../../types/inventory.types';
import {
  effectiveRowQty,
  formatQueueMoney,
  queueAttachedProductHint,
  queueBrandText,
  queueCategoryText,
  queueDispatchLabel,
  queueExtRetailText,
  queueExtRetailValue,
  queueProductsChipLabel,
  queueQtyText,
  queueSameProductPeerLabel,
  queueStatusMeta,
  queueTitleText,
} from './processingQueueCellText';
import {
  computeProcessingQueueColumnWidths,
  createProcessingQueueMeasureFonts,
  PROCESSING_QUEUE_COLUMN_ORDER,
} from './processingQueueColumnLayout';
import {
  PROCESSING_QUEUE_TABLE_HEAD_HEIGHT,
  PROCESSING_QUEUE_TABLE_ROW_HEIGHT,
  PROCESSING_QUEUE_CHECKBOX_COL_PX,
  readProcessingQueueTableClientWidth,
} from './processingQueueLayout';
import { processingHeaderGradient, processingTokens } from './processingTokens';

export type QueueSortField =
  | 'rowNum'
  | 'brand'
  | 'title'
  | 'category'
  | 'qty'
  | 'retail'
  | 'extRetail'
  | 'price'
  | 'condition'
  | 'dispatch'
  | 'status';

const DATA_COLUMN_COUNT = 10;
const TABLE_COLUMN_COUNT = DATA_COLUMN_COUNT + 1;

export interface ProcessingQueueTableProps {
  rows: ProcessingWorkspaceRowDTO[];
  /** When the queue is empty, distinguishes “not finalized prep” vs edge cases after finalize */
  preprocessingFinalizedAt?: string | null;
  preprocessingBookmarkOnly?: boolean;
  totalWorkspaceRowCount: number;
  orderId: number;
  orderStatus: PurchaseOrderStatus;
  detailProcessingRowId: number | null;
  onOpenDetail: (processingRowId: number, options?: { scrollToHistory?: boolean }) => void;
  /** Peer chip click — filter the queue to this row's matched product. */
  onFilterProduct?: (row: ProcessingWorkspaceRowDTO) => void;
  selectedRowIds?: Set<number>;
  onToggleRow?: (processingRowId: number) => void;
  onSelectAllVisible?: (processingRowIds: number[]) => void;
}

type SortCycleState = { field: QueueSortField; dir: 'asc' | 'desc' } | null;

interface ProcessingQueueRowProps {
  row: ProcessingWorkspaceRowDTO;
  detailSelected: boolean;
  multiSelected: boolean;
  striped: boolean;
  onOpenDetail: (processingRowId: number, options?: { scrollToHistory?: boolean }) => void;
  onFilterProduct?: (row: ProcessingWorkspaceRowDTO) => void;
  onToggleRow?: (processingRowId: number) => void;
  selectionEnabled: boolean;
}

const ProcessingQueueRow = memo(function ProcessingQueueRow({
  row: r,
  detailSelected,
  multiSelected,
  striped,
  onOpenDetail,
  onFilterProduct,
  onToggleRow,
  selectionEnabled,
}: ProcessingQueueRowProps) {
  const meta = queueStatusMeta(r.status);
  const productsChip = queueProductsChipLabel(r.distinctProductCount);
  const peerLabel = queueSameProductPeerLabel(r.sameProductRowNumbers);
  const title = queueTitleText(r);
  const brandShown = queueBrandText(r);
  const categoryShown = queueCategoryText(r);
  const titleTooltip = [
    `Row ${r.rowNum}`,
    queueAttachedProductHint(r, 'title'),
    r.sku ? `SKU ${r.sku}` : '',
  ].filter(Boolean).join(' · ');
  const brandTooltip = queueAttachedProductHint(r, 'brand');
  const dupTitle =
    r.likelyDuplicateOf?.length ?
      `Likely same product as row ${r.likelyDuplicateOf.join(', ')}`
    : undefined;
  const peerTitle =
    r.sameProductRowNumbers?.length ?
      `Same matched product as row ${r.sameProductRowNumbers.join(', ')}`
    : undefined;
  const open = () => onOpenDetail(r.processing_row_id);
  const openHistory = () => onOpenDetail(r.processing_row_id, { scrollToHistory: true });

  return (
    <TableRow
      hover
      selected={detailSelected || multiSelected}
      sx={{
        cursor: 'pointer',
        height: PROCESSING_QUEUE_TABLE_ROW_HEIGHT,
        bgcolor: (theme) => {
          if (detailSelected || multiSelected) {
            return theme.palette.mode === 'dark' ? processingTokens.rowSelectedDark : processingTokens.rowSelected;
          }
          if (striped) {
            return theme.palette.mode === 'dark' ? processingTokens.rowStripeDark : processingTokens.rowStripe;
          }
          return 'transparent';
        },
        boxShadow: detailSelected ? `inset 3px 0 0 ${processingTokens.rowSelectedAccent}` : 'none',
        '&:hover': {
          bgcolor: (theme) =>
            theme.palette.mode === 'dark' ? processingTokens.rowHoverDark : processingTokens.rowHover,
        },
      }}
    >
      <TableCell
        padding="checkbox"
        onClick={(e) => e.stopPropagation()}
      >
        {selectionEnabled ?
          <Checkbox
            size="small"
            checked={multiSelected}
            onChange={() => onToggleRow?.(r.processing_row_id)}
            inputProps={{ 'aria-label': `Select row ${r.rowNum}` }}
          />
        : null}
      </TableCell>
      <TableCell
        align="center"
        onClick={open}
        sx={{
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          fontSize: '0.72rem',
          textOverflow: 'clip',
        }}
      >
        <Typography component="span" sx={{ fontWeight: 700, fontSize: 'inherit' }}>
          {effectiveRowQty(r).dispositioned.toLocaleString()}
        </Typography>
        <Typography component="span" sx={{ fontSize: 'inherit' }} color="text.secondary">
          {' '}/ {effectiveRowQty(r).qty.toLocaleString()}
        </Typography>
      </TableCell>
      <TableCell align="left" onClick={open}>
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 600 }} noWrap title={brandTooltip || undefined}>
          {brandShown}
        </Typography>
      </TableCell>
      <TableCell align="left" onClick={open} sx={{ minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
          {r.rowKind === 'added' ?
            <Chip
              size="small"
              label="Added"
              sx={{
                height: 16,
                fontSize: 9,
                flexShrink: 0,
                bgcolor: processingTokens.neutralSoft,
                color: processingTokens.textStrong,
                border: `1px solid ${processingTokens.borderStrong}`,
              }}
              onClick={(e) => e.stopPropagation()}
            />
          : null}
          <Typography
            component="span"
            noWrap
            title={titleTooltip}
            sx={{ fontSize: '0.72rem', fontWeight: 700, lineHeight: 1.1, minWidth: 0 }}
          >
            {title}
          </Typography>
          {dupTitle ?
            <Chip
              size="small"
              label="dup?"
              variant="outlined"
              title={dupTitle}
              sx={{
                height: 16,
                fontSize: 8.5,
                flexShrink: 0,
                borderColor: processingTokens.borderStrong,
                color: processingTokens.textSoft,
                bgcolor: processingTokens.neutralSoft,
              }}
              onClick={(e) => e.stopPropagation()}
            />
          : null}
          {peerLabel ?
            <Chip
              size="small"
              label={peerLabel}
              variant="outlined"
              title={
                onFilterProduct && r.productId != null ?
                  `${peerTitle} — click to filter the queue to this product`
                : peerTitle
              }
              sx={{
                height: 16,
                fontSize: 8.5,
                flexShrink: 0,
                borderColor: processingTokens.borderStrong,
                color: processingTokens.textSoft,
                bgcolor: processingTokens.neutralSoft,
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (r.productId != null) onFilterProduct?.(r);
              }}
            />
          : null}
        </Box>
      </TableCell>
      <TableCell align="left" onClick={open}>
        <Typography sx={{ fontSize: '0.72rem' }} noWrap title={categoryShown !== '—' ? categoryShown : undefined}>
          {categoryShown}
        </Typography>
      </TableCell>
      <TableCell
        align="center"
        onClick={open}
        sx={{
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          fontSize: '0.72rem',
          color: 'text.secondary',
          textOverflow: 'clip',
        }}
      >
        {formatQueueMoney(r.unitRetail)}
      </TableCell>
      <TableCell
        align="center"
        onClick={open}
        sx={{
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          fontWeight: 700,
          fontSize: '0.72rem',
          textOverflow: 'clip',
        }}
      >
        {queueExtRetailText(r)}
      </TableCell>
      <TableCell
        align="center"
        onClick={open}
        sx={{
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          fontWeight: 700,
          fontSize: '0.72rem',
          textOverflow: 'clip',
        }}
      >
        {formatQueueMoney(r.price)}
      </TableCell>
      <TableCell align="center" onClick={open}>
        <Typography sx={{ fontSize: '0.72rem' }} noWrap>
          {r.condition}
        </Typography>
      </TableCell>
      <TableCell align="center" onClick={open}>
        <Chip
          label={queueDispatchLabel(r.dispatch)}
          size="small"
          variant="outlined"
          sx={{
            borderColor: processingTokens.borderStrong,
            bgcolor: 'transparent',
            color: processingTokens.textSoft,
            height: 15,
            fontSize: 9,
            maxWidth: '100%',
          }}
        />
      </TableCell>
      <TableCell align="center" onClick={open}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.35, flexWrap: 'wrap' }}>
          <Chip
            label={meta.label}
            size="small"
            sx={{
              height: 15,
              fontSize: 9,
              bgcolor: meta.bg,
              color: meta.color,
              border: meta.border ? `1px solid ${meta.border}` : 'none',
            }}
          />
          {productsChip ?
            <Chip
              size="small"
              label={productsChip}
              title="Multiple products checked in on this row — click to review check-in history"
              sx={{
                height: 15,
                fontSize: 8.5,
                flexShrink: 0,
                borderColor: processingTokens.borderStrong,
                color: processingTokens.accentBlue,
                bgcolor: processingTokens.blueSoft,
              }}
              variant="outlined"
              onClick={(e) => {
                e.stopPropagation();
                openHistory();
              }}
            />
          : null}
        </Box>
      </TableCell>
    </TableRow>
  );
});

const tableSx = (mode: 'light' | 'dark') =>
  ({
    tableLayout: 'fixed',
    width: '100%',
    maxWidth: '100%',
    '& .MuiTableCell-root': {
      py: '1px',
      pl: '10px',
      pr: '6px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      boxSizing: 'border-box',
      verticalAlign: 'middle',
      fontSize: (theme: { typography: { pxToRem: (n: number) => string } }) => theme.typography.pxToRem(11),
      lineHeight: 1.12,
      height: PROCESSING_QUEUE_TABLE_ROW_HEIGHT,
    },
    '& .MuiTableCell-paddingCheckbox': {
      width: PROCESSING_QUEUE_CHECKBOX_COL_PX,
      minWidth: PROCESSING_QUEUE_CHECKBOX_COL_PX,
      maxWidth: PROCESSING_QUEUE_CHECKBOX_COL_PX,
      pl: '4px',
      pr: '4px',
      py: '1px',
      overflow: 'visible',
      textOverflow: 'clip',
      textAlign: 'center',
    },
    '& .MuiTableCell-root + .MuiTableCell-root': {
      pl: '12px',
    },
    '& .MuiTableHead-root .MuiTableCell-root': {
      py: '4px',
      background: processingHeaderGradient(mode),
      borderBottom: 2,
      borderColor: processingTokens.borderStrong,
      fontWeight: 700,
      height: PROCESSING_QUEUE_TABLE_HEAD_HEIGHT,
      fontSize: (theme: { typography: { pxToRem: (n: number) => string } }) => theme.typography.pxToRem(9.5),
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      color: processingTokens.textSoft,
      overflow: 'hidden',
    },
    '& .MuiTableHead-root .MuiTableSortLabel-root': {
      color: 'inherit',
      fontSize: 'inherit',
      lineHeight: 1.25,
      letterSpacing: 'inherit',
      textTransform: 'inherit',
      maxWidth: '100%',
      '&:hover': { color: processingTokens.textStrong },
      '&.Mui-active': { color: processingTokens.textStrong, fontWeight: 800 },
      '&:not(.Mui-active) .MuiTableSortLabel-icon': {
        display: 'none',
      },
    },
  }) as const;

const centeredSortLabelSx = { width: '100%', justifyContent: 'center' } as const;

export function ProcessingQueueTable({
  rows,
  preprocessingFinalizedAt,
  preprocessingBookmarkOnly,
  totalWorkspaceRowCount,
  orderId,
  orderStatus,
  detailProcessingRowId,
  onOpenDetail,
  onFilterProduct,
  selectedRowIds,
  onToggleRow,
  onSelectAllVisible,
}: ProcessingQueueTableProps) {
  const theme = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [sortState, setSortState] = useState<SortCycleState>(null);
  const selectionEnabled = Boolean(onToggleRow && selectedRowIds);

  const measureFonts = useMemo(
    () => createProcessingQueueMeasureFonts(String(theme.typography.fontFamily ?? 'sans-serif')),
    [theme.typography.fontFamily],
  );

  const dataColumnWidth = Math.max(0, containerWidth - PROCESSING_QUEUE_CHECKBOX_COL_PX);

  // Collapsed member rows stay hidden — the master row represents the group.
  const visibleRows = useMemo(() => rows.filter((r) => !r.collapseMasterId), [rows]);

  const columnLayout = useMemo(
    () => computeProcessingQueueColumnWidths(visibleRows, dataColumnWidth, measureFonts),
    [visibleRows, dataColumnWidth, measureFonts],
  );

  const sortedRows = useMemo(() => {
    const copy = [...visibleRows];
    if (sortState === null) {
      copy.sort((a, b) => a.rowNum - b.rowNum);
      return copy;
    }
    const { field, dir } = sortState;
    const mult = dir === 'asc' ? 1 : -1;
    copy.sort((a, b) => {
      let cmp = 0;
      switch (field) {
        case 'rowNum':
          cmp = a.rowNum - b.rowNum;
          break;
        case 'title':
          cmp = queueTitleText(a).localeCompare(queueTitleText(b));
          break;
        case 'brand':
          cmp = queueBrandText(a).localeCompare(queueBrandText(b));
          break;
        case 'category':
          cmp = queueCategoryText(a).localeCompare(queueCategoryText(b));
          break;
        case 'qty': {
          // Masters sort by their COMBINED group progress (collapsed rows act as one).
          const aq = effectiveRowQty(a);
          const bq = effectiveRowQty(b);
          cmp = aq.dispositioned / Math.max(aq.qty, 1) - bq.dispositioned / Math.max(bq.qty, 1);
          if (cmp === 0) cmp = aq.qty - bq.qty;
          break;
        }
        case 'retail': {
          const ar = parseFloat(a.unitRetail ?? '') || 0;
          const br = parseFloat(b.unitRetail ?? '') || 0;
          cmp = ar - br;
          break;
        }
        case 'extRetail': {
          const ae = queueExtRetailValue(a) ?? -1;
          const be = queueExtRetailValue(b) ?? -1;
          cmp = ae - be;
          break;
        }
        case 'price': {
          const ap = parseFloat(a.price ?? '') || 0;
          const bp = parseFloat(b.price ?? '') || 0;
          cmp = ap - bp;
          break;
        }
        case 'condition':
          cmp = (a.condition || '').localeCompare(b.condition || '');
          break;
        case 'dispatch':
          cmp = queueDispatchLabel(a.dispatch).localeCompare(queueDispatchLabel(b.dispatch));
          break;
        case 'status':
          cmp = a.status.localeCompare(b.status);
          break;
        default:
          cmp = 0;
      }
      return cmp * mult;
    });
    return copy;
  }, [visibleRows, sortState]);

  const visibleRowIds = useMemo(
    () => sortedRows.map((row) => row.processing_row_id),
    [sortedRows],
  );

  const allVisibleSelected =
    selectionEnabled &&
    visibleRowIds.length > 0 &&
    visibleRowIds.every((id) => selectedRowIds!.has(id));
  const someVisibleSelected =
    selectionEnabled && visibleRowIds.some((id) => selectedRowIds!.has(id)) && !allVisibleSelected;

  const rowVirtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => PROCESSING_QUEUE_TABLE_ROW_HEIGHT,
    overscan: 12,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const virtualBodyHeight = rowVirtualizer.getTotalSize();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0 ? virtualBodyHeight - virtualItems[virtualItems.length - 1].end : 0;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const apply = () => {
      const w = readProcessingQueueTableClientWidth(el);
      setContainerWidth((prev) => (prev === w ? prev : w));
    };
    apply();
    const rafId = requestAnimationFrame(apply);
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [rows.length, virtualBodyHeight]);

  const handleSort = (field: QueueSortField) => {
    setSortState((prev) => {
      if (prev === null || prev.field !== field) return { field, dir: 'asc' };
      if (prev.dir === 'asc') return { field, dir: 'desc' };
      return null;
    });
  };

  const filteredZeroButWorkspaceHasRows = rows.length === 0 && totalWorkspaceRowCount > 0;
  const noManifestLines = totalWorkspaceRowCount === 0;

  const emptyState = rows.length === 0 ? (
    <Box sx={{ p: 3, textAlign: 'center' }}>
      {noManifestLines ? (
        <>
          {preprocessingFinalizedAt ?
            <>
              <Alert severity="warning" sx={{ mb: 2, textAlign: 'left' }}>
                <Typography variant="subtitle2" component="div" fontWeight={700} gutterBottom>
                  Preprocessing is finalized but this workspace has no rows
                </Typography>
                <Typography variant="body2">
                  Try refreshing this page. If it stays empty, return to preprocessing to confirm bookmark rows exist, then use
                  <strong>Create Processing Data</strong> at the top of this page once rows appear here.
                </Typography>
              </Alert>
              <Typography variant="body2" color="text.secondary" gutterBottom sx={{ px: 1 }}>
                Unexpected state because finalize normally creates bookmarks before you navigate here — contact support if this persists.
              </Typography>
            </>
          : ['processing', 'delivered'].includes(orderStatus) ?
            <Alert severity="warning" sx={{ mb: 2, textAlign: 'left' }}>
              <Typography variant="subtitle2" component="div" fontWeight={700} gutterBottom>
                No processing lines yet
              </Typography>
              <Typography variant="body2">
                Status is <strong>{orderStatus}</strong>. After the manifest uploads, finish preprocessing review and finalize — that
                creates bookmark rows instantly. Then return here and click <strong>Create Processing Data</strong> to generate
                manifest rows and inventory items.
              </Typography>
            </Alert>

          : <Typography color="text.secondary" gutterBottom>
              No processing rows yet. When the manifest is ready, finalize preprocessing from the preprocessing page (
              bookmarks appear here immediately), then use <strong>Create Processing Data</strong> above to build items.
            </Typography>}
          <Box sx={{ mt: 2 }}>
            <Button component={RouterLink} to={`/inventory/preprocessing/${orderId}`} variant="outlined" size="small">
              Open preprocessing
            </Button>
            <Box sx={{ mt: 1 }}>
              <Link component={RouterLink} to={`/inventory/orders/${orderId}`} underline="hover">
                Order detail
              </Link>
            </Box>
          </Box>
        </>
      ) : filteredZeroButWorkspaceHasRows ? (
        <Typography color="text.secondary">
          No rows match filters. Clear search, set Queue to All, or turn off &quot;Hide dispositioned&quot; to see more rows.
          {preprocessingBookmarkOnly ?
            <>
              {' '}
              Rows are bookmarks only until you click <strong>Create Processing Data</strong>.
            </>
          : null}
        </Typography>
      ) : (
        <Typography color="text.secondary">No rows match filters.</Typography>
      )}
    </Box>
  ) : null;

  const colgroup = (
    <colgroup>
      <col style={{ width: PROCESSING_QUEUE_CHECKBOX_COL_PX }} />
      {PROCESSING_QUEUE_COLUMN_ORDER.map((id) => (
        <col key={id} style={{ width: columnLayout.cols[id] }} />
      ))}
    </colgroup>
  );

  return (
    <Box
      ref={scrollRef}
      sx={{
        flex: 1,
        minHeight: 0,
        overflowX: 'hidden',
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        scrollbarGutter: 'stable',
      }}
    >
      {rows.length === 0 ?
        <Box
          sx={{
            minHeight: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: (theme) =>
              theme.palette.mode === 'dark' ? processingTokens.tableFillerBgDark : processingTokens.tableFillerBg,
          }}
        >
          {emptyState}
        </Box>
      : <Table
          size="small"
          stickyHeader
          sx={{
            ...tableSx(theme.palette.mode),
            width: containerWidth > 0 ? containerWidth : '100%',
          }}
        >
          {colgroup}
          <TableHead>
            <TableRow>
              <TableCell
                padding="checkbox"
              >
                {selectionEnabled ?
                  <Checkbox
                    size="small"
                    indeterminate={someVisibleSelected}
                    checked={allVisibleSelected}
                    onChange={() => onSelectAllVisible?.(visibleRowIds)}
                    inputProps={{ 'aria-label': 'Select all visible rows' }}
                  />
                : null}
              </TableCell>
              <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                <TableSortLabel
                  active={sortState?.field === 'qty'}
                  direction={sortState && sortState.field === 'qty' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('qty')}
                  hideSortIcon={sortState?.field !== 'qty'}
                  sx={centeredSortLabelSx}
                >
                  Qty
                </TableSortLabel>
              </TableCell>
              <TableCell align="left" sx={{ overflow: 'hidden' }}>
                <TableSortLabel
                  active={sortState?.field === 'brand'}
                  direction={sortState && sortState.field === 'brand' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('brand')}
                  hideSortIcon={sortState?.field !== 'brand'}
                  sx={{ maxWidth: '100%' }}
                >
                  Brand
                </TableSortLabel>
              </TableCell>
              <TableCell align="left">
                <TableSortLabel
                  active={sortState?.field === 'title'}
                  direction={sortState && sortState.field === 'title' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('title')}
                  hideSortIcon={sortState?.field !== 'title'}
                >
                  Title
                </TableSortLabel>
              </TableCell>
              <TableCell align="left">
                <TableSortLabel
                  active={sortState?.field === 'category'}
                  direction={sortState && sortState.field === 'category' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('category')}
                >
                  Category
                </TableSortLabel>
              </TableCell>
              <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                <TableSortLabel
                  active={sortState?.field === 'retail'}
                  direction={sortState && sortState.field === 'retail' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('retail')}
                  sx={centeredSortLabelSx}
                >
                  Retail
                </TableSortLabel>
              </TableCell>
              <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                <TableSortLabel
                  active={sortState?.field === 'extRetail'}
                  direction={sortState && sortState.field === 'extRetail' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('extRetail')}
                  sx={centeredSortLabelSx}
                >
                  Ext. Retail
                </TableSortLabel>
              </TableCell>
              <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                <TableSortLabel
                  active={sortState?.field === 'price'}
                  direction={sortState && sortState.field === 'price' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('price')}
                  sx={centeredSortLabelSx}
                >
                  Price
                </TableSortLabel>
              </TableCell>
              <TableCell align="center">
                <TableSortLabel
                  active={sortState?.field === 'condition'}
                  direction={sortState && sortState.field === 'condition' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('condition')}
                  sx={centeredSortLabelSx}
                >
                  Condition
                </TableSortLabel>
              </TableCell>
              <TableCell align="center">
                <TableSortLabel
                  active={sortState?.field === 'dispatch'}
                  direction={sortState && sortState.field === 'dispatch' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('dispatch')}
                  sx={centeredSortLabelSx}
                >
                  Dispatch
                </TableSortLabel>
              </TableCell>
              <TableCell align="center">
                <TableSortLabel
                  active={sortState?.field === 'status'}
                  direction={sortState && sortState.field === 'status' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('status')}
                  sx={centeredSortLabelSx}
                >
                  Status
                </TableSortLabel>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paddingTop > 0 ?
              <TableRow aria-hidden sx={{ height: paddingTop, pointerEvents: 'none', visibility: 'hidden' }}>
                <TableCell colSpan={TABLE_COLUMN_COUNT} sx={{ p: 0, border: 0, height: paddingTop }} />
              </TableRow>
            : null}
            {virtualItems.map((virtualRow) => {
              const r = sortedRows[virtualRow.index];
              return (
                <ProcessingQueueRow
                  key={r.processing_row_id}
                  row={r}
                  detailSelected={r.processing_row_id === detailProcessingRowId}
                  multiSelected={selectedRowIds?.has(r.processing_row_id) ?? false}
                  striped={virtualRow.index % 2 === 1}
                  onOpenDetail={onOpenDetail}
                  onFilterProduct={onFilterProduct}
                  onToggleRow={onToggleRow}
                  selectionEnabled={selectionEnabled}
                />
              );
            })}
            {paddingBottom > 0 ?
              <TableRow aria-hidden sx={{ height: paddingBottom, pointerEvents: 'none', visibility: 'hidden' }}>
                <TableCell colSpan={TABLE_COLUMN_COUNT} sx={{ p: 0, border: 0, height: paddingBottom }} />
              </TableRow>
            : null}
          </TableBody>
        </Table>
      }
    </Box>
  );
}

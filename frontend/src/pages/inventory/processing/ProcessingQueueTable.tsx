import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Alert,
  Box,
  Button,
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
  formatQueueMoney,
  queueBrandText,
  queueCategoryText,
  queueDispatchLabel,
  queueQtyText,
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
  | 'price'
  | 'condition'
  | 'dispatch'
  | 'status';

const COLUMN_COUNT = 10;

export interface ProcessingQueueTableProps {
  rows: ProcessingWorkspaceRowDTO[];
  /** When the queue is empty, distinguishes “not finalized prep” vs edge cases after finalize */
  preprocessingFinalizedAt?: string | null;
  preprocessingBookmarkOnly?: boolean;
  totalWorkspaceRowCount: number;
  orderId: number;
  orderStatus: PurchaseOrderStatus;
  detailProcessingRowId: number | null;
  onOpenDetail: (processingRowId: number) => void;
}

type SortCycleState = { field: QueueSortField; dir: 'asc' | 'desc' } | null;

interface ProcessingQueueRowProps {
  row: ProcessingWorkspaceRowDTO;
  selected: boolean;
  striped: boolean;
  onOpenDetail: (processingRowId: number) => void;
}

const ProcessingQueueRow = memo(function ProcessingQueueRow({
  row: r,
  selected,
  striped,
  onOpenDetail,
}: ProcessingQueueRowProps) {
  const meta = queueStatusMeta(r.status);
  const title = queueTitleText(r);
  const titleTooltip = [title, r.sku ? `SKU ${r.sku}` : ''].filter(Boolean).join(' · ');
  const dupTitle =
    r.likelyDuplicateOf?.length ?
      `Likely same product as row ${r.likelyDuplicateOf.join(', ')}`
    : undefined;
  const open = () => onOpenDetail(r.processing_row_id);

  return (
    <TableRow
      hover
      selected={selected}
      sx={{
        cursor: 'pointer',
        height: PROCESSING_QUEUE_TABLE_ROW_HEIGHT,
        bgcolor: (theme) => {
          if (selected) {
            return theme.palette.mode === 'dark' ? processingTokens.rowSelectedDark : processingTokens.rowSelected;
          }
          if (striped) {
            return theme.palette.mode === 'dark' ? processingTokens.rowStripeDark : processingTokens.rowStripe;
          }
          return 'transparent';
        },
        boxShadow: selected ? `inset 3px 0 0 ${processingTokens.rowSelectedAccent}` : 'none',
        '&:hover': {
          bgcolor: (theme) =>
            theme.palette.mode === 'dark' ? processingTokens.rowHoverDark : processingTokens.rowHover,
        },
      }}
    >
      <TableCell
        align="left"
        onClick={open}
        sx={{
          whiteSpace: 'nowrap',
          fontVariantNumeric: 'tabular-nums',
          color: 'text.secondary',
        }}
      >
        {r.rowKind === 'added' ?
          <Chip
            size="small"
            label="Added"
            sx={{
              height: 16,
              fontSize: 9,
              bgcolor: processingTokens.neutralSoft,
              color: processingTokens.textStrong,
              border: `1px solid ${processingTokens.borderStrong}`,
            }}
          />
        : r.rowNum}
      </TableCell>
      <TableCell onClick={open}>
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 600 }} noWrap title={r.brand || undefined}>
          {queueBrandText(r)}
        </Typography>
      </TableCell>
      <TableCell onClick={open} sx={{ minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
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
        </Box>
      </TableCell>
      <TableCell onClick={open}>
        <Typography sx={{ fontSize: '0.72rem' }} noWrap title={r.category || undefined}>
          {queueCategoryText(r)}
        </Typography>
      </TableCell>
      <TableCell
        align="right"
        onClick={open}
        sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', fontSize: '0.72rem' }}
      >
        <Typography component="span" sx={{ fontWeight: 700, fontSize: 'inherit' }}>
          {r.qtyDispositioned}
        </Typography>
        <Typography component="span" sx={{ fontSize: 'inherit' }} color="text.secondary">
          {' '}/ {r.qty}
        </Typography>
      </TableCell>
      <TableCell
        align="right"
        onClick={open}
        sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', fontSize: '0.72rem', color: 'text.secondary' }}
      >
        {formatQueueMoney(r.unitRetail)}
      </TableCell>
      <TableCell
        align="right"
        onClick={open}
        sx={{
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          fontWeight: 700,
          fontSize: '0.72rem',
        }}
      >
        {formatQueueMoney(r.price)}
      </TableCell>
      <TableCell onClick={open}>
        <Typography sx={{ fontSize: '0.72rem' }} noWrap>
          {r.condition}
        </Typography>
      </TableCell>
      <TableCell onClick={open}>
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
      <TableCell onClick={open}>
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
      fontSize: (theme: { typography: { pxToRem: (n: number) => string } }) => theme.typography.pxToRem(11),
      lineHeight: 1.12,
      height: PROCESSING_QUEUE_TABLE_ROW_HEIGHT,
    },
    '& .MuiTableCell-root + .MuiTableCell-root': {
      pl: '12px',
    },
    '& .MuiTableCell-root:first-of-type': {
      pl: '10px',
      pr: '14px',
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

export function ProcessingQueueTable({
  rows,
  preprocessingFinalizedAt,
  preprocessingBookmarkOnly,
  totalWorkspaceRowCount,
  orderId,
  orderStatus,
  detailProcessingRowId,
  onOpenDetail,
}: ProcessingQueueTableProps) {
  const theme = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [sortState, setSortState] = useState<SortCycleState>(null);

  const measureFonts = useMemo(
    () => createProcessingQueueMeasureFonts(String(theme.typography.fontFamily ?? 'sans-serif')),
    [theme.typography.fontFamily],
  );

  const columnLayout = useMemo(
    () => computeProcessingQueueColumnWidths(rows, containerWidth, measureFonts),
    [rows, containerWidth, measureFonts],
  );

  const sortedRows = useMemo(() => {
    const copy = [...rows];
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
        case 'qty':
          cmp = a.qtyDispositioned / Math.max(a.qty, 1) - b.qtyDispositioned / Math.max(b.qty, 1);
          if (cmp === 0) cmp = a.qty - b.qty;
          break;
        case 'retail': {
          const ar = parseFloat(a.unitRetail ?? '') || 0;
          const br = parseFloat(b.unitRetail ?? '') || 0;
          cmp = ar - br;
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
  }, [rows, sortState]);

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
              <TableCell align="left" sx={{ whiteSpace: 'nowrap', overflow: 'hidden' }}>
                <TableSortLabel
                  active={sortState?.field === 'rowNum'}
                  direction={sortState?.field === 'rowNum' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('rowNum')}
                  hideSortIcon={sortState?.field !== 'rowNum'}
                  aria-label="Row number"
                  sx={{
                    justifyContent: 'flex-start',
                    maxWidth: '100%',
                    '& .MuiTableSortLabel-icon': { flexShrink: 0 },
                  }}
                >
                  #
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ overflow: 'hidden' }}>
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
              <TableCell>
                <TableSortLabel
                  active={sortState?.field === 'title'}
                  direction={sortState && sortState.field === 'title' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('title')}
                  hideSortIcon={sortState?.field !== 'title'}
                >
                  Title
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortState?.field === 'category'}
                  direction={sortState && sortState.field === 'category' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('category')}
                >
                  Category
                </TableSortLabel>
              </TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                <TableSortLabel
                  active={sortState?.field === 'qty'}
                  direction={sortState && sortState.field === 'qty' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('qty')}
                >
                  Qty
                </TableSortLabel>
              </TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                <TableSortLabel
                  active={sortState?.field === 'retail'}
                  direction={sortState && sortState.field === 'retail' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('retail')}
                >
                  Retail
                </TableSortLabel>
              </TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                <TableSortLabel
                  active={sortState?.field === 'price'}
                  direction={sortState && sortState.field === 'price' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('price')}
                >
                  Price
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortState?.field === 'condition'}
                  direction={sortState && sortState.field === 'condition' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('condition')}
                >
                  Condition
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortState?.field === 'dispatch'}
                  direction={sortState && sortState.field === 'dispatch' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('dispatch')}
                >
                  Dispatch
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortState?.field === 'status'}
                  direction={sortState && sortState.field === 'status' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('status')}
                >
                  Status
                </TableSortLabel>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paddingTop > 0 ?
              <TableRow aria-hidden sx={{ height: paddingTop, pointerEvents: 'none', visibility: 'hidden' }}>
                <TableCell colSpan={COLUMN_COUNT} sx={{ p: 0, border: 0, height: paddingTop }} />
              </TableRow>
            : null}
            {virtualItems.map((virtualRow) => {
              const r = sortedRows[virtualRow.index];
              return (
                <ProcessingQueueRow
                  key={r.processing_row_id}
                  row={r}
                  selected={r.processing_row_id === detailProcessingRowId}
                  striped={virtualRow.index % 2 === 1}
                  onOpenDetail={onOpenDetail}
                />
              );
            })}
            {paddingBottom > 0 ?
              <TableRow aria-hidden sx={{ height: paddingBottom, pointerEvents: 'none', visibility: 'hidden' }}>
                <TableCell colSpan={COLUMN_COUNT} sx={{ p: 0, border: 0, height: paddingBottom }} />
              </TableRow>
            : null}
          </TableBody>
        </Table>
      }
    </Box>
  );
}

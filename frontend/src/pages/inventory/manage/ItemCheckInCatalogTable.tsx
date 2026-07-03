import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography,
  useTheme,
} from '@mui/material';
import type { ItemCheckInCatalog } from '../../../types/inventory.types';
import {
  PROCESSING_QUEUE_TABLE_HEAD_HEIGHT,
  PROCESSING_QUEUE_TABLE_ROW_HEIGHT,
  readProcessingQueueTableClientWidth,
} from '../processing/processingQueueLayout';
import { processingHeaderGradient, processingTokens } from '../processing/processingTokens';
import { CatalogTableColumnResizeHandle } from './catalogTableColumnControls';
import {
  clearStoredColumnWidths,
  readStoredColumnWidths as readStoredWidths,
  resizeColumnPair,
  scaleColumnWidthsToTotal,
  storeColumnWidths as persistColumnWidths,
} from './catalogTableColumns';

export type CheckInSortField = 'created' | 'product' | 'po' | 'qty';

type SortCycleState = { field: CheckInSortField; dir: 'asc' | 'desc' } | null;
type CheckInColumnWidths = Record<CheckInSortField, number>;

const CHECKIN_CATALOG_COL = {
  created: 132,
  product: 360,
  po: 120,
  qty: 52,
} as const;
const CHECKIN_CATALOG_COLUMN_ORDER = ['created', 'product', 'po', 'qty'] as const;
const CHECKIN_CATALOG_WIDTHS_KEY = 'inventory.workbench.checkInCatalog.columns.v1';

function formatCheckInDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function productLabel(row: ItemCheckInCatalog): string {
  return row.product_title?.trim() || '—';
}

function poLabel(row: ItemCheckInCatalog): string {
  return row.purchase_order_number?.trim() || (row.purchase_order ? `PO ${row.purchase_order}` : '—');
}

function readStoredColumnWidths(): CheckInColumnWidths | null {
  return readStoredWidths(CHECKIN_CATALOG_WIDTHS_KEY, CHECKIN_CATALOG_COLUMN_ORDER);
}

function defaultColumnWidths(totalWidth: number): CheckInColumnWidths {
  const total = Math.max(1, Math.round(totalWidth));
  return scaleColumnWidthsToTotal(
    {
      created: CHECKIN_CATALOG_COL.created,
      product: Math.round(total * 0.46),
      po: Math.round(total * 0.28),
      qty: CHECKIN_CATALOG_COL.qty,
    },
    CHECKIN_CATALOG_COLUMN_ORDER,
    total,
  );
}

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
      whiteSpace: 'nowrap',
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
      overflow: 'visible',
    },
    '& .MuiTableHead-root .MuiTableCell-root:not(:last-of-type)': {
      borderRight: `1px solid ${processingTokens.borderStrong}`,
    },
    '& .MuiTableBody-root .MuiTableCell-root:not(:last-of-type)': {
      borderRight: `1px solid ${processingTokens.border}`,
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

interface CheckInRowProps {
  row: ItemCheckInCatalog;
  striped: boolean;
  selected: boolean;
  onOpen?: (row: ItemCheckInCatalog) => void;
}

const CheckInRow = memo(function CheckInRow({ row, striped, selected, onOpen }: CheckInRowProps) {
  const title = productLabel(row);
  const po = poLabel(row);

  return (
    <TableRow
      hover
      selected={selected}
      onClick={() => onOpen?.(row)}
      sx={{
        cursor: onOpen ? 'pointer' : 'default',
        height: PROCESSING_QUEUE_TABLE_ROW_HEIGHT,
        bgcolor: (theme) => {
          if (selected) return theme.palette.mode === 'dark' ? 'rgba(46, 125, 50, 0.18)' : 'rgba(46, 125, 50, 0.10)';
          if (striped) return theme.palette.mode === 'dark' ? processingTokens.rowStripeDark : processingTokens.rowStripe;
          return 'transparent';
        },
        '&:hover': {
          bgcolor: (theme) =>
            theme.palette.mode === 'dark' ? processingTokens.rowHoverDark : processingTokens.rowHover,
        },
      }}
    >
      <TableCell align="left" sx={{ fontSize: '0.72rem', fontVariantNumeric: 'tabular-nums' }} title={formatCheckInDate(row.created_at)}>
        {formatCheckInDate(row.created_at)}
      </TableCell>
      <TableCell align="left" sx={{ minWidth: 0 }}>
        <Typography noWrap title={title !== '—' ? title : undefined} sx={{ fontSize: '0.72rem', fontWeight: 700, lineHeight: 1.1 }}>
          {title}
        </Typography>
      </TableCell>
      <TableCell align="left" sx={{ fontSize: '0.72rem' }} title={po !== '—' ? po : undefined}>
        {po}
      </TableCell>
      <TableCell align="center" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
        {row.quantity}
      </TableCell>
    </TableRow>
  );
});

export interface ItemCheckInCatalogTableProps {
  rows: ItemCheckInCatalog[];
  search?: string;
  selectedCheckInId?: number | null;
  onOpenCheckIn?: (row: ItemCheckInCatalog) => void;
  onRegisterColumnReset?: (reset: (() => void) | null) => void;
}

export function ItemCheckInCatalogTable({
  rows,
  search = '',
  selectedCheckInId = null,
  onOpenCheckIn,
  onRegisterColumnReset,
}: ItemCheckInCatalogTableProps) {
  const theme = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [sortState, setSortState] = useState<SortCycleState>({ field: 'created', dir: 'desc' });
  const [columnWidths, setColumnWidths] = useState<CheckInColumnWidths | null>(() => readStoredColumnWidths());

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    const active = sortState ?? { field: 'created' as const, dir: 'desc' as const };
    const { field, dir } = active;
    const mult = dir === 'asc' ? 1 : -1;
    copy.sort((a, b) => {
      let cmp = 0;
      switch (field) {
        case 'created':
          cmp = (a.created_at || '').localeCompare(b.created_at || '');
          break;
        case 'product':
          cmp = productLabel(a).localeCompare(productLabel(b));
          break;
        case 'po':
          cmp = poLabel(a).localeCompare(poLabel(b));
          break;
        case 'qty':
          cmp = a.quantity - b.quantity;
          break;
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
  }, [sortedRows.length, virtualBodyHeight]);

  const handleSort = (field: CheckInSortField) => {
    setSortState((prev) => {
      if (prev === null || prev.field !== field) return { field, dir: field === 'created' ? 'desc' : 'asc' };
      if (prev.dir === 'asc') return { field, dir: 'desc' };
      return { field: 'created', dir: 'desc' };
    });
  };

  const tableWidth = containerWidth || 740;

  const effectiveColumnWidths = useMemo(
    () => scaleColumnWidthsToTotal(columnWidths ?? defaultColumnWidths(tableWidth), CHECKIN_CATALOG_COLUMN_ORDER, tableWidth),
    [columnWidths, tableWidth],
  );

  const resetColumnWidths = useCallback(() => {
    clearStoredColumnWidths(CHECKIN_CATALOG_WIDTHS_KEY);
    setColumnWidths(null);
  }, []);

  useEffect(() => {
    onRegisterColumnReset?.(resetColumnWidths);
    return () => onRegisterColumnReset?.(null);
  }, [onRegisterColumnReset, resetColumnWidths]);

  /** Tears down the in-flight drag listeners; also run on unmount mid-drag. */
  const activeResizeCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => activeResizeCleanupRef.current?.(), []);

  const startColumnResize = (
    leftKey: CheckInSortField,
    rightKey: CheckInSortField,
    event: ReactMouseEvent<HTMLElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    let latestWidths: CheckInColumnWidths | null = null;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const next = resizeColumnPair(
        effectiveColumnWidths,
        leftKey,
        rightKey,
        moveEvent.clientX - startX,
        tableWidth,
        CHECKIN_CATALOG_COLUMN_ORDER,
      );
      latestWidths = next;
      setColumnWidths(next);
    };

    const stopResize = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      activeResizeCleanupRef.current = null;
    };

    const onMouseUp = () => {
      if (latestWidths) persistColumnWidths(CHECKIN_CATALOG_WIDTHS_KEY, latestWidths);
      stopResize();
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    activeResizeCleanupRef.current = stopResize;
  };

  const colgroup = (
    <colgroup>
      <col style={{ width: effectiveColumnWidths.created }} />
      <col style={{ width: effectiveColumnWidths.product }} />
      <col style={{ width: effectiveColumnWidths.po }} />
      <col style={{ width: effectiveColumnWidths.qty }} />
    </colgroup>
  );

  const emptyState = (
    <Box sx={{ p: 3, textAlign: 'center' }}>
      <Typography color="text.secondary">
        {search.trim() ? 'No check-ins match your search.' : 'No check-ins yet.'}
      </Typography>
    </Box>
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
        border: 1,
        borderColor: processingTokens.border,
        borderTop: 0,
        bgcolor: 'background.paper',
      }}
    >
      {sortedRows.length === 0 ?
        <Box
          sx={{
            minHeight: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: (t) =>
              t.palette.mode === 'dark' ? processingTokens.tableFillerBgDark : processingTokens.tableFillerBg,
          }}
        >
          {emptyState}
        </Box>
      : <Table
          size="small"
          sx={{
            ...tableSx(theme.palette.mode),
            width: containerWidth > 0 ? containerWidth : '100%',
          }}
        >
          {colgroup}
          <TableHead>
            <TableRow>
              <TableCell align="left" sx={{ position: 'relative', pr: '14px !important' }}>
                <TableSortLabel
                  active={sortState?.field === 'created'}
                  direction={sortState?.field === 'created' ? sortState.dir : 'desc'}
                  onClick={() => handleSort('created')}
                  hideSortIcon={sortState?.field !== 'created'}
                >
                  Date
                </TableSortLabel>
                <CatalogTableColumnResizeHandle
                  leftKey="created"
                  rightKey="product"
                  onResizePair={(left, right, event) => startColumnResize(left as CheckInSortField, right as CheckInSortField, event)}
                />
              </TableCell>
              <TableCell align="left" sx={{ position: 'relative', pr: '14px !important' }}>
                <TableSortLabel
                  active={sortState?.field === 'product'}
                  direction={sortState?.field === 'product' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('product')}
                  hideSortIcon={sortState?.field !== 'product'}
                >
                  Product
                </TableSortLabel>
                <CatalogTableColumnResizeHandle
                  leftKey="product"
                  rightKey="po"
                  onResizePair={(left, right, event) => startColumnResize(left as CheckInSortField, right as CheckInSortField, event)}
                />
              </TableCell>
              <TableCell align="left" sx={{ position: 'relative', pr: '14px !important' }}>
                <TableSortLabel
                  active={sortState?.field === 'po'}
                  direction={sortState?.field === 'po' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('po')}
                  hideSortIcon={sortState?.field !== 'po'}
                >
                  PO
                </TableSortLabel>
                <CatalogTableColumnResizeHandle
                  leftKey="po"
                  rightKey="qty"
                  onResizePair={(left, right, event) => startColumnResize(left as CheckInSortField, right as CheckInSortField, event)}
                />
              </TableCell>
              <TableCell align="center">
                <TableSortLabel
                  active={sortState?.field === 'qty'}
                  direction={sortState?.field === 'qty' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('qty')}
                  hideSortIcon={sortState?.field !== 'qty'}
                >
                  Qty
                </TableSortLabel>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paddingTop > 0 ?
              <TableRow sx={{ height: paddingTop, visibility: 'collapse', pointerEvents: 'none' }}>
                <TableCell colSpan={4} sx={{ p: 0, border: 0, height: paddingTop }} />
              </TableRow>
            : null}
            {virtualItems.map((vRow) => {
              const row = sortedRows[vRow.index];
              if (!row) return null;
              return (
                <CheckInRow
                  key={row.id}
                  row={row}
                  striped={vRow.index % 2 === 1}
                  selected={selectedCheckInId === row.id}
                  onOpen={onOpenCheckIn}
                />
              );
            })}
            {paddingBottom > 0 ?
              <TableRow sx={{ height: paddingBottom, visibility: 'collapse', pointerEvents: 'none' }}>
                <TableCell colSpan={4} sx={{ p: 0, border: 0, height: paddingBottom }} />
              </TableRow>
            : null}
          </TableBody>
        </Table>
      }
    </Box>
  );
}

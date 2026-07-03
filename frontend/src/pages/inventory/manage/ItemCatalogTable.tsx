import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Box,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography,
  useTheme,
} from '@mui/material';
import type { Item } from '../../../types/inventory.types';
import { itemLocationLabel } from '../processing/checkedInHistoryDisplay';
import { itemStatusMeta } from '../processing/processingQueueCellText';
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

export type ItemSortField = 'itemNumber' | 'product' | 'location' | 'status' | 'printed';

type SortCycleState = { field: ItemSortField; dir: 'asc' | 'desc' } | null;
type ItemColumnWidths = Record<ItemSortField, number>;

const ITEM_CATALOG_COL = {
  itemNumber: 72,
  product: 360,
  location: 120,
  status: 72,
  printed: 52,
} as const;
const ITEM_CATALOG_COLUMN_ORDER = ['itemNumber', 'product', 'location', 'status', 'printed'] as const;
const ITEM_CATALOG_WIDTHS_KEY = 'inventory.workbench.itemCatalog.columns.v2';

function formatCheckedInDateTime(iso: string | null | undefined): string {
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

function printedLabel(item: Item): string {
  return item.label_printed ? '✓' : '—';
}

function itemNumberLabel(item: Item): string {
  return item.sku?.trim() || String(item.id);
}

function productLabel(item: Item): string {
  return item.product_title?.trim() || '—';
}

function locationLabel(item: Item): string {
  return itemLocationLabel(item.location);
}

function itemStatusChipMeta(item: Item) {
  return itemStatusMeta({
    status: item.status,
    dispute_type: item.dispute_type || null,
    dispute_pct_loss: item.dispute_pct_loss ?? null,
  });
}

function readStoredColumnWidths(): ItemColumnWidths | null {
  return readStoredWidths(ITEM_CATALOG_WIDTHS_KEY, ITEM_CATALOG_COLUMN_ORDER);
}

function defaultColumnWidths(totalWidth: number): ItemColumnWidths {
  const total = Math.max(1, Math.round(totalWidth));
  return scaleColumnWidthsToTotal(
    {
      itemNumber: ITEM_CATALOG_COL.itemNumber,
      product: Math.round(total * 0.38),
      location: Math.round(total * 0.18),
      status: ITEM_CATALOG_COL.status,
      printed: ITEM_CATALOG_COL.printed,
    },
    ITEM_CATALOG_COLUMN_ORDER,
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

const centeredSortLabelSx = { width: '100%', justifyContent: 'center' } as const;

interface ItemCatalogRowProps {
  item: Item;
  striped: boolean;
  selected?: boolean;
  onOpen?: (item: Item) => void;
}

const ItemCatalogRow = memo(function ItemCatalogRow({
  item,
  striped,
  selected = false,
  onOpen,
}: ItemCatalogRowProps) {
  const title = productLabel(item);
  const location = locationLabel(item);
  const statusMeta = itemStatusChipMeta(item);
  const printed = printedLabel(item);

  return (
    <TableRow
      hover
      selected={selected}
      onClick={() => onOpen?.(item)}
      sx={{
        cursor: onOpen ? 'pointer' : 'default',
        height: PROCESSING_QUEUE_TABLE_ROW_HEIGHT,
        bgcolor: (theme) => {
          if (selected) return theme.palette.mode === 'dark' ? 'rgba(46, 125, 50, 0.18)' : 'rgba(46, 125, 50, 0.10)';
          if (striped) {
            return theme.palette.mode === 'dark' ? processingTokens.rowStripeDark : processingTokens.rowStripe;
          }
          return 'transparent';
        },
        '&:hover': {
          bgcolor: (theme) =>
            theme.palette.mode === 'dark' ? processingTokens.rowHoverDark : processingTokens.rowHover,
        },
      }}
    >
      <TableCell
        align="center"
        sx={{
          fontVariantNumeric: 'tabular-nums',
          color: 'text.secondary',
          fontFamily: processingTokens.monoFontFamily,
          fontSize: '0.72rem',
        }}
        title={itemNumberLabel(item)}
      >
        {itemNumberLabel(item)}
      </TableCell>
      <TableCell align="left" sx={{ minWidth: 0 }}>
        <Typography noWrap title={title !== '—' ? title : undefined} sx={{ fontSize: '0.72rem', fontWeight: 700, lineHeight: 1.1 }}>
          {title}
        </Typography>
      </TableCell>
      <TableCell align="left" sx={{ fontSize: '0.72rem' }} title={location !== '—' ? location : undefined}>
        {location}
      </TableCell>
      <TableCell align="center">
        <Chip
          size="small"
          label={statusMeta.label}
          sx={{
            height: 16,
            fontSize: 8.5,
            bgcolor: statusMeta.bg,
            color: statusMeta.color,
            border: statusMeta.border ? `1px solid ${statusMeta.border}` : undefined,
          }}
        />
      </TableCell>
      <TableCell
        align="center"
        sx={{
          fontSize: '0.72rem',
          fontFamily: processingTokens.monoFontFamily,
          color: item.label_printed ? 'success.main' : 'text.disabled',
        }}
        title={item.label_printed_at ? `Printed ${formatCheckedInDateTime(item.label_printed_at)}` : 'Not printed'}
      >
        {printed}
      </TableCell>
    </TableRow>
  );
});

export interface ItemCatalogTableProps {
  items: Item[];
  search: string;
  selectedItemId?: number | null;
  onOpenItem?: (item: Item) => void;
  onRegisterColumnReset?: (reset: (() => void) | null) => void;
}

export function ItemCatalogTable({
  items,
  search,
  selectedItemId = null,
  onOpenItem,
  onRegisterColumnReset,
}: ItemCatalogTableProps) {
  const theme = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [sortState, setSortState] = useState<SortCycleState>({ field: 'itemNumber', dir: 'desc' });
  const [columnWidths, setColumnWidths] = useState<ItemColumnWidths | null>(() => readStoredColumnWidths());

  const sortedItems = useMemo(() => {
    const copy = [...items];
    const active = sortState ?? { field: 'itemNumber' as const, dir: 'desc' as const };
    const { field, dir } = active;
    const mult = dir === 'asc' ? 1 : -1;
    copy.sort((a, b) => {
      let cmp = 0;
      switch (field) {
        case 'itemNumber':
          cmp = itemNumberLabel(a).localeCompare(itemNumberLabel(b), undefined, { numeric: true });
          break;
        case 'product':
          cmp = productLabel(a).localeCompare(productLabel(b));
          break;
        case 'location':
          cmp = locationLabel(a).localeCompare(locationLabel(b));
          break;
        case 'status':
          cmp = itemStatusChipMeta(a).label.localeCompare(itemStatusChipMeta(b).label);
          break;
        case 'printed':
          cmp = Number(Boolean(a.label_printed)) - Number(Boolean(b.label_printed));
          break;
      }
      return cmp * mult;
    });
    return copy;
  }, [items, sortState]);

  const rowVirtualizer = useVirtualizer({
    count: sortedItems.length,
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
  }, [sortedItems.length, virtualBodyHeight]);

  const handleSort = (field: ItemSortField) => {
    setSortState((prev) => {
      if (prev === null || prev.field !== field) return { field, dir: field === 'itemNumber' ? 'desc' : 'asc' };
      if (prev.dir === 'asc') return { field, dir: 'desc' };
      return { field: 'itemNumber', dir: 'desc' };
    });
  };

  const tableWidth = containerWidth || 740;

  const effectiveColumnWidths = useMemo(
    () => scaleColumnWidthsToTotal(columnWidths ?? defaultColumnWidths(tableWidth), ITEM_CATALOG_COLUMN_ORDER, tableWidth),
    [columnWidths, tableWidth],
  );

  const resetColumnWidths = useCallback(() => {
    clearStoredColumnWidths(ITEM_CATALOG_WIDTHS_KEY);
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
    leftKey: ItemSortField,
    rightKey: ItemSortField,
    event: ReactMouseEvent<HTMLElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    let latestWidths: ItemColumnWidths | null = null;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const next = resizeColumnPair(
        effectiveColumnWidths,
        leftKey,
        rightKey,
        moveEvent.clientX - startX,
        tableWidth,
        ITEM_CATALOG_COLUMN_ORDER,
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
      if (latestWidths) persistColumnWidths(ITEM_CATALOG_WIDTHS_KEY, latestWidths);
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
      <col style={{ width: effectiveColumnWidths.itemNumber }} />
      <col style={{ width: effectiveColumnWidths.product }} />
      <col style={{ width: effectiveColumnWidths.location }} />
      <col style={{ width: effectiveColumnWidths.status }} />
      <col style={{ width: effectiveColumnWidths.printed }} />
    </colgroup>
  );

  const emptyState = (
    <Box sx={{ p: 3, textAlign: 'center' }}>
      <Typography color="text.secondary">
        {search.trim() ? 'No items match your search.' : 'No items yet.'}
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
      {sortedItems.length === 0 ?
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
              <TableCell align="center" sx={{ position: 'relative', pr: '14px !important' }}>
                <TableSortLabel
                  active={sortState?.field === 'itemNumber'}
                  direction={sortState?.field === 'itemNumber' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('itemNumber')}
                  hideSortIcon={sortState?.field !== 'itemNumber'}
                  sx={centeredSortLabelSx}
                >
                  Item #
                </TableSortLabel>
                <CatalogTableColumnResizeHandle
                  leftKey="itemNumber"
                  rightKey="product"
                  onResizePair={(left, right, event) => startColumnResize(left as ItemSortField, right as ItemSortField, event)}
                />
              </TableCell>
              <TableCell align="left" sx={{ position: 'relative', pr: '14px !important' }}>
                <TableSortLabel
                  active={sortState?.field === 'product'}
                  direction={sortState?.field === 'product' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('product')}
                  hideSortIcon={sortState?.field !== 'product'}
                >
                  Title
                </TableSortLabel>
                <CatalogTableColumnResizeHandle
                  leftKey="product"
                  rightKey="location"
                  onResizePair={(left, right, event) => startColumnResize(left as ItemSortField, right as ItemSortField, event)}
                />
              </TableCell>
              <TableCell align="left" sx={{ position: 'relative', pr: '14px !important' }}>
                <TableSortLabel
                  active={sortState?.field === 'location'}
                  direction={sortState?.field === 'location' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('location')}
                  hideSortIcon={sortState?.field !== 'location'}
                >
                  Location
                </TableSortLabel>
                <CatalogTableColumnResizeHandle
                  leftKey="location"
                  rightKey="status"
                  onResizePair={(left, right, event) => startColumnResize(left as ItemSortField, right as ItemSortField, event)}
                />
              </TableCell>
              <TableCell align="center" sx={{ position: 'relative', pr: '14px !important' }}>
                <TableSortLabel
                  active={sortState?.field === 'status'}
                  direction={sortState?.field === 'status' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('status')}
                  hideSortIcon={sortState?.field !== 'status'}
                  sx={centeredSortLabelSx}
                >
                  Status
                </TableSortLabel>
                <CatalogTableColumnResizeHandle
                  leftKey="status"
                  rightKey="printed"
                  onResizePair={(left, right, event) => startColumnResize(left as ItemSortField, right as ItemSortField, event)}
                />
              </TableCell>
              <TableCell align="center">
                <TableSortLabel
                  active={sortState?.field === 'printed'}
                  direction={sortState?.field === 'printed' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('printed')}
                  hideSortIcon={sortState?.field !== 'printed'}
                  sx={centeredSortLabelSx}
                >
                  Printed
                </TableSortLabel>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paddingTop > 0 ?
              <TableRow sx={{ height: paddingTop, visibility: 'collapse', pointerEvents: 'none' }}>
                <TableCell colSpan={5} sx={{ p: 0, border: 0, height: paddingTop }} />
              </TableRow>
            : null}
            {virtualItems.map((virtualRow) => {
              const item = sortedItems[virtualRow.index];
              return (
                <ItemCatalogRow
                  key={item.id}
                  item={item}
                  striped={virtualRow.index % 2 === 1}
                  selected={selectedItemId === item.id}
                  onOpen={onOpenItem}
                />
              );
            })}
            {paddingBottom > 0 ?
              <TableRow sx={{ height: paddingBottom, visibility: 'collapse', pointerEvents: 'none' }}>
                <TableCell colSpan={5} sx={{ p: 0, border: 0, height: paddingBottom }} />
              </TableRow>
            : null}
          </TableBody>
        </Table>
      }
    </Box>
  );
}

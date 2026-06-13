import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { formatCurrency } from '../../../utils/format';
import { itemStatusMeta } from '../processing/processingQueueCellText';
import {
  PROCESSING_QUEUE_TABLE_HEAD_HEIGHT,
  PROCESSING_QUEUE_TABLE_ROW_HEIGHT,
  readProcessingQueueTableClientWidth,
} from '../processing/processingQueueLayout';
import { processingHeaderGradient, processingTokens } from '../processing/processingTokens';

export type ItemSortField =
  | 'sku'
  | 'brand'
  | 'title'
  | 'model'
  | 'category'
  | 'upc'
  | 'price'
  | 'status';

type SortCycleState = { field: ItemSortField; dir: 'asc' | 'desc' } | null;

const ITEM_CATALOG_COL = {
  sku: 52,
  brand: 96,
  title: 280,
  model: 120,
  category: 148,
  upc: 112,
  price: 88,
  status: 64,
} as const;

function itemSkuLabel(item: Item): string {
  return item.sku?.trim() || String(item.id);
}

function itemTitleLabel(item: Item): string {
  return item.product_title?.trim() || '—';
}

function itemBrandLabel(item: Item): string {
  return item.product_brand?.trim() || '—';
}

function itemModelLabel(item: Item): string {
  return item.product_model?.trim() || '—';
}

function itemCategoryLabel(item: Item): string {
  return item.category?.trim() || '—';
}

function itemUpcLabel(item: Item): string {
  return item.product_upc?.trim() || '—';
}

function itemStatusChipMeta(item: Item) {
  return itemStatusMeta({
    status: item.status,
    dispute_type: item.dispute_type || null,
    dispute_pct_loss: item.dispute_pct_loss ?? null,
  });
}

function itemPriceLabel(item: Item): string {
  return item.price != null && item.price !== '' ? formatCurrency(item.price) : '—';
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

interface ItemCatalogRowProps {
  item: Item;
  striped: boolean;
  onOpen?: (item: Item) => void;
}

const ItemCatalogRow = memo(function ItemCatalogRow({ item, striped, onOpen }: ItemCatalogRowProps) {
  const open = () => onOpen?.(item);
  const title = itemTitleLabel(item);
  const brand = itemBrandLabel(item);
  const model = itemModelLabel(item);
  const upc = itemUpcLabel(item);
  const statusMeta = itemStatusChipMeta(item);

  return (
    <TableRow
      hover
      onClick={open}
      sx={{
        cursor: onOpen ? 'pointer' : 'default',
        height: PROCESSING_QUEUE_TABLE_ROW_HEIGHT,
        bgcolor: (theme) => {
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
          whiteSpace: 'nowrap',
          fontVariantNumeric: 'tabular-nums',
          color: 'text.secondary',
          fontFamily: processingTokens.monoFontFamily,
          fontSize: '0.72rem',
        }}
      >
        {itemSkuLabel(item)}
      </TableCell>
      <TableCell align="left">
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 600 }} noWrap title={brand !== '—' ? brand : undefined}>
          {brand}
        </Typography>
      </TableCell>
      <TableCell align="left" sx={{ minWidth: 0 }}>
        <Typography
          noWrap
          title={title !== '—' ? title : undefined}
          sx={{ fontSize: '0.72rem', fontWeight: 700, lineHeight: 1.1 }}
        >
          {title}
        </Typography>
      </TableCell>
      <TableCell align="left">
        <Typography sx={{ fontSize: '0.72rem' }} noWrap title={model !== '—' ? model : undefined}>
          {model}
        </Typography>
      </TableCell>
      <TableCell align="left">
        <Typography sx={{ fontSize: '0.72rem' }} noWrap title={itemCategoryLabel(item)}>
          {itemCategoryLabel(item)}
        </Typography>
      </TableCell>
      <TableCell align="left">
        <Typography
          sx={{ fontSize: '0.72rem', fontFamily: processingTokens.monoFontFamily }}
          noWrap
          title={upc !== '—' ? upc : undefined}
        >
          {upc}
        </Typography>
      </TableCell>
      <TableCell
        align="right"
        sx={{
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          fontSize: '0.72rem',
        }}
      >
        {itemPriceLabel(item)}
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
    </TableRow>
  );
});

export interface ItemCatalogTableProps {
  items: Item[];
  search: string;
  onOpenItem?: (item: Item) => void;
}

export function ItemCatalogTable({ items, search, onOpenItem }: ItemCatalogTableProps) {
  const theme = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [sortState, setSortState] = useState<SortCycleState>(null);

  const sortedItems = useMemo(() => {
    const copy = [...items];
    if (sortState === null) {
      copy.sort((a, b) => b.id - a.id);
      return copy;
    }
    const { field, dir } = sortState;
    const mult = dir === 'asc' ? 1 : -1;
    copy.sort((a, b) => {
      let cmp = 0;
      switch (field) {
        case 'sku':
          cmp = itemSkuLabel(a).localeCompare(itemSkuLabel(b), undefined, { numeric: true });
          break;
        case 'brand':
          cmp = itemBrandLabel(a).localeCompare(itemBrandLabel(b));
          break;
        case 'title':
          cmp = itemTitleLabel(a).localeCompare(itemTitleLabel(b));
          break;
        case 'model':
          cmp = itemModelLabel(a).localeCompare(itemModelLabel(b));
          break;
        case 'category':
          cmp = itemCategoryLabel(a).localeCompare(itemCategoryLabel(b));
          break;
        case 'upc':
          cmp = itemUpcLabel(a).localeCompare(itemUpcLabel(b));
          break;
        case 'price': {
          const ap = parseFloat(a.price ?? '') || 0;
          const bp = parseFloat(b.price ?? '') || 0;
          cmp = ap - bp;
          break;
        }
        case 'status':
          cmp = itemStatusChipMeta(a).label.localeCompare(itemStatusChipMeta(b).label);
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
      if (prev === null || prev.field !== field) return { field, dir: 'asc' };
      if (prev.dir === 'asc') return { field, dir: 'desc' };
      return null;
    });
  };

  const colgroup = (
    <colgroup>
      <col style={{ width: ITEM_CATALOG_COL.sku }} />
      <col style={{ width: ITEM_CATALOG_COL.brand }} />
      <col style={{ width: ITEM_CATALOG_COL.title }} />
      <col style={{ width: ITEM_CATALOG_COL.model }} />
      <col style={{ width: ITEM_CATALOG_COL.category }} />
      <col style={{ width: ITEM_CATALOG_COL.upc }} />
      <col style={{ width: ITEM_CATALOG_COL.price }} />
      <col style={{ width: ITEM_CATALOG_COL.status }} />
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
          stickyHeader
          sx={{
            ...tableSx(theme.palette.mode),
            width: containerWidth > 0 ? containerWidth : '100%',
          }}
        >
          {colgroup}
          <TableHead>
            <TableRow>
              <TableCell align="center" onClick={() => handleSort('sku')} sx={{ cursor: 'pointer', userSelect: 'none' }}>
                #
              </TableCell>
              <TableCell align="left">
                <TableSortLabel
                  active={sortState?.field === 'brand'}
                  direction={sortState && sortState.field === 'brand' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('brand')}
                  hideSortIcon={sortState?.field !== 'brand'}
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
                  active={sortState?.field === 'model'}
                  direction={sortState && sortState.field === 'model' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('model')}
                  hideSortIcon={sortState?.field !== 'model'}
                >
                  Model
                </TableSortLabel>
              </TableCell>
              <TableCell align="left">
                <TableSortLabel
                  active={sortState?.field === 'category'}
                  direction={sortState && sortState.field === 'category' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('category')}
                  hideSortIcon={sortState?.field !== 'category'}
                >
                  Category
                </TableSortLabel>
              </TableCell>
              <TableCell align="left">
                <TableSortLabel
                  active={sortState?.field === 'upc'}
                  direction={sortState && sortState.field === 'upc' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('upc')}
                  hideSortIcon={sortState?.field !== 'upc'}
                >
                  UPC
                </TableSortLabel>
              </TableCell>
              <TableCell align="right">
                <TableSortLabel
                  active={sortState?.field === 'price'}
                  direction={sortState && sortState.field === 'price' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('price')}
                  hideSortIcon={sortState?.field !== 'price'}
                  sx={centeredSortLabelSx}
                >
                  Price
                </TableSortLabel>
              </TableCell>
              <TableCell align="center">
                <TableSortLabel
                  active={sortState?.field === 'status'}
                  direction={sortState && sortState.field === 'status' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('status')}
                  hideSortIcon={sortState?.field !== 'status'}
                  sx={centeredSortLabelSx}
                >
                  Status
                </TableSortLabel>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paddingTop > 0 ?
              <TableRow sx={{ height: paddingTop, visibility: 'collapse', pointerEvents: 'none' }}>
                <TableCell colSpan={8} sx={{ p: 0, border: 0, height: paddingTop }} />
              </TableRow>
            : null}
            {virtualItems.map((virtualRow) => {
              const item = sortedItems[virtualRow.index];
              return (
                <ItemCatalogRow
                  key={item.id}
                  item={item}
                  striped={virtualRow.index % 2 === 1}
                  onOpen={onOpenItem}
                />
              );
            })}
            {paddingBottom > 0 ?
              <TableRow sx={{ height: paddingBottom, visibility: 'collapse', pointerEvents: 'none' }}>
                <TableCell colSpan={8} sx={{ p: 0, border: 0, height: paddingBottom }} />
              </TableRow>
            : null}
          </TableBody>
        </Table>
      }
    </Box>
  );
}

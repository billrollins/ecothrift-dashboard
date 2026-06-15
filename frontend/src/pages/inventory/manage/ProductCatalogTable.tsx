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
import type { Product } from '../../../types/inventory.types';
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

export type ProductSortField =
  | 'productNumber'
  | 'brand'
  | 'title'
  | 'model';

type SortCycleState = { field: ProductSortField; dir: 'asc' | 'desc' } | null;
type ProductColumnWidths = Record<ProductSortField, number>;

const PRODUCT_CATALOG_COL = {
  productNumber: 88,
  brand: 136,
  title: 360,
  model: 156,
} as const;
const PRODUCT_CATALOG_COLUMN_ORDER = ['productNumber', 'brand', 'title', 'model'] as const;
const PRODUCT_CATALOG_WIDTHS_KEY = 'inventory.workbench.productCatalog.columns.v1';

function productNumberLabel(p: Product): string {
  return p.product_number?.trim() || String(p.id);
}

function readStoredColumnWidths(): ProductColumnWidths | null {
  return readStoredWidths(PRODUCT_CATALOG_WIDTHS_KEY, PRODUCT_CATALOG_COLUMN_ORDER);
}

function defaultColumnWidths(totalWidth: number): ProductColumnWidths {
  const total = Math.max(1, Math.round(totalWidth));
  return scaleColumnWidthsToTotal(
    {
      productNumber: PRODUCT_CATALOG_COL.productNumber,
      brand: Math.round(total * 0.23),
      title: Math.round(total * 0.40),
      model: Math.round(total * 0.22),
    },
    PRODUCT_CATALOG_COLUMN_ORDER,
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

interface ProductCatalogRowProps {
  product: Product;
  striped: boolean;
  selected?: boolean;
  onOpen?: (product: Product) => void;
}

const ProductCatalogRow = memo(function ProductCatalogRow({
  product: p,
  striped,
  selected = false,
  onOpen,
}: ProductCatalogRowProps) {
  const open = () => onOpen?.(p);
  const title = p.title?.trim() || '—';
  const brand = p.brand?.trim() || '—';
  const model = p.model?.trim() || '—';

  return (
    <TableRow
      hover
      selected={selected}
      onClick={open}
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
        align="left"
        sx={{
          whiteSpace: 'nowrap',
          fontVariantNumeric: 'tabular-nums',
          color: 'text.secondary',
          fontFamily: processingTokens.monoFontFamily,
          fontSize: '0.72rem',
        }}
      >
        {productNumberLabel(p)}
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
    </TableRow>
  );
});

export interface ProductCatalogTableProps {
  products: Product[];
  search: string;
  selectedProductId?: number | null;
  onOpenProduct?: (product: Product) => void;
  onRegisterColumnReset?: (reset: (() => void) | null) => void;
}

export function ProductCatalogTable({
  products,
  search,
  selectedProductId = null,
  onOpenProduct,
  onRegisterColumnReset,
}: ProductCatalogTableProps) {
  const theme = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [sortState, setSortState] = useState<SortCycleState>(null);
  const [columnWidths, setColumnWidths] = useState<ProductColumnWidths | null>(() => readStoredColumnWidths());

  const sortedProducts = useMemo(() => {
    const copy = [...products];
    if (sortState === null) {
      copy.sort((a, b) => a.id - b.id);
      return copy;
    }
    const { field, dir } = sortState;
    const mult = dir === 'asc' ? 1 : -1;
    copy.sort((a, b) => {
      let cmp = 0;
      switch (field) {
        case 'productNumber':
          cmp = productNumberLabel(a).localeCompare(productNumberLabel(b), undefined, { numeric: true });
          break;
        case 'brand':
          cmp = (a.brand || '').localeCompare(b.brand || '');
          break;
        case 'title':
          cmp = (a.title || '').localeCompare(b.title || '');
          break;
        case 'model':
          cmp = (a.model || '').localeCompare(b.model || '');
          break;
      }
      return cmp * mult;
    });
    return copy;
  }, [products, sortState]);

  const rowVirtualizer = useVirtualizer({
    count: sortedProducts.length,
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
  }, [sortedProducts.length, virtualBodyHeight]);

  const handleSort = (field: ProductSortField) => {
    setSortState((prev) => {
      if (prev === null || prev.field !== field) return { field, dir: 'asc' };
      if (prev.dir === 'asc') return { field, dir: 'desc' };
      return null;
    });
  };

  const tableWidth = containerWidth || 740;

  const effectiveColumnWidths = useMemo(
    () => scaleColumnWidthsToTotal(columnWidths ?? defaultColumnWidths(tableWidth), PRODUCT_CATALOG_COLUMN_ORDER, tableWidth),
    [columnWidths, tableWidth],
  );

  const resetColumnWidths = useCallback(() => {
    clearStoredColumnWidths(PRODUCT_CATALOG_WIDTHS_KEY);
    setColumnWidths(null);
  }, []);

  useEffect(() => {
    onRegisterColumnReset?.(resetColumnWidths);
    return () => onRegisterColumnReset?.(null);
  }, [onRegisterColumnReset, resetColumnWidths]);

  const startColumnResize = (
    leftKey: ProductSortField,
    rightKey: ProductSortField,
    event: ReactMouseEvent<HTMLElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const next = resizeColumnPair(
        effectiveColumnWidths,
        leftKey,
        rightKey,
        moveEvent.clientX - startX,
        tableWidth,
        PRODUCT_CATALOG_COLUMN_ORDER,
      );
      setColumnWidths(next);
      persistColumnWidths(PRODUCT_CATALOG_WIDTHS_KEY, next);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const colgroup = (
    <colgroup>
      <col style={{ width: effectiveColumnWidths.productNumber }} />
      <col style={{ width: effectiveColumnWidths.brand }} />
      <col style={{ width: effectiveColumnWidths.title }} />
      <col style={{ width: effectiveColumnWidths.model }} />
    </colgroup>
  );

  const emptyState = (
    <Box sx={{ p: 3, textAlign: 'center' }}>
      <Typography color="text.secondary">
        {search.trim() ? 'No products match your search.' : 'No products yet.'}
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
      {sortedProducts.length === 0 ?
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
              <TableCell
                align="left"
                onClick={() => handleSort('productNumber')}
                sx={{ cursor: 'pointer', userSelect: 'none', position: 'relative', pr: '14px !important' }}
              >
                Prod #
                <CatalogTableColumnResizeHandle
                  leftKey="productNumber"
                  rightKey="brand"
                  onResizePair={(left, right, event) => startColumnResize(left as ProductSortField, right as ProductSortField, event)}
                />
              </TableCell>
              <TableCell align="left" sx={{ position: 'relative', pr: '14px !important' }}>
                <TableSortLabel
                  active={sortState?.field === 'brand'}
                  direction={sortState && sortState.field === 'brand' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('brand')}
                  hideSortIcon={sortState?.field !== 'brand'}
                >
                  Brand
                </TableSortLabel>
                <CatalogTableColumnResizeHandle
                  leftKey="brand"
                  rightKey="title"
                  onResizePair={(left, right, event) => startColumnResize(left as ProductSortField, right as ProductSortField, event)}
                />
              </TableCell>
              <TableCell align="left" sx={{ position: 'relative', pr: '14px !important' }}>
                <TableSortLabel
                  active={sortState?.field === 'title'}
                  direction={sortState && sortState.field === 'title' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('title')}
                  hideSortIcon={sortState?.field !== 'title'}
                >
                  Title
                </TableSortLabel>
                <CatalogTableColumnResizeHandle
                  leftKey="title"
                  rightKey="model"
                  onResizePair={(left, right, event) => startColumnResize(left as ProductSortField, right as ProductSortField, event)}
                />
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
            </TableRow>
          </TableHead>
          <TableBody>
            {paddingTop > 0 ?
              <TableRow sx={{ height: paddingTop, visibility: 'collapse', pointerEvents: 'none' }}>
                <TableCell colSpan={4} sx={{ p: 0, border: 0, height: paddingTop }} />
              </TableRow>
            : null}
            {virtualItems.map((virtualRow) => {
              const p = sortedProducts[virtualRow.index];
              return (
                <ProductCatalogRow
                  key={p.id}
                  product={p}
                  striped={virtualRow.index % 2 === 1}
                  selected={selectedProductId === p.id}
                  onOpen={onOpenProduct}
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

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
import type { Product } from '../../../types/inventory.types';
import {
  PROCESSING_QUEUE_TABLE_HEAD_HEIGHT,
  PROCESSING_QUEUE_TABLE_ROW_HEIGHT,
  readProcessingQueueTableClientWidth,
} from '../processing/processingQueueLayout';
import { processingHeaderGradient, processingTokens } from '../processing/processingTokens';

export type ProductSortField =
  | 'productNumber'
  | 'brand'
  | 'title'
  | 'model'
  | 'category'
  | 'upc'
  | 'active';

type SortCycleState = { field: ProductSortField; dir: 'asc' | 'desc' } | null;

const PRODUCT_CATALOG_COL = {
  productNumber: 52,
  brand: 96,
  title: 280,
  model: 120,
  category: 148,
  upc: 112,
  active: 64,
} as const;

function productNumberLabel(p: Product): string {
  return p.product_number?.trim() || String(p.id);
}

function productCategoryLabel(p: Product): string {
  return p.category_name?.trim() || '—';
}

function productUpcLabel(p: Product): string {
  return p.identifiers?.upc?.trim() || p.upc?.trim() || '—';
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

interface ProductCatalogRowProps {
  product: Product;
  striped: boolean;
  onOpen?: (product: Product) => void;
}

const ProductCatalogRow = memo(function ProductCatalogRow({
  product: p,
  striped,
  onOpen,
}: ProductCatalogRowProps) {
  const open = () => onOpen?.(p);
  const title = p.title?.trim() || '—';
  const brand = p.brand?.trim() || '—';
  const model = p.model?.trim() || '—';
  const upc = productUpcLabel(p);

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
      <TableCell align="left">
        <Typography sx={{ fontSize: '0.72rem' }} noWrap title={productCategoryLabel(p)}>
          {productCategoryLabel(p)}
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
      <TableCell align="center">
        {p.is_active ?
          <Chip
            size="small"
            label="Active"
            sx={{
              height: 16,
              fontSize: 8.5,
              bgcolor: processingTokens.greenSoft,
              color: processingTokens.accentGreen,
              border: `1px solid rgba(46, 125, 50, 0.25)`,
            }}
          />
        : <Chip
            size="small"
            label="Inactive"
            variant="outlined"
            sx={{
              height: 16,
              fontSize: 8.5,
              borderColor: processingTokens.borderStrong,
              color: processingTokens.textSoft,
            }}
          />
        }
      </TableCell>
    </TableRow>
  );
});

export interface ProductCatalogTableProps {
  products: Product[];
  search: string;
  onOpenProduct?: (product: Product) => void;
}

export function ProductCatalogTable({ products, search, onOpenProduct }: ProductCatalogTableProps) {
  const theme = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [sortState, setSortState] = useState<SortCycleState>(null);

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
        case 'category':
          cmp = productCategoryLabel(a).localeCompare(productCategoryLabel(b));
          break;
        case 'upc':
          cmp = productUpcLabel(a).localeCompare(productUpcLabel(b));
          break;
        case 'active':
          cmp = Number(b.is_active) - Number(a.is_active);
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

  const colgroup = (
    <colgroup>
      <col style={{ width: PRODUCT_CATALOG_COL.productNumber }} />
      <col style={{ width: PRODUCT_CATALOG_COL.brand }} />
      <col style={{ width: PRODUCT_CATALOG_COL.title }} />
      <col style={{ width: PRODUCT_CATALOG_COL.model }} />
      <col style={{ width: PRODUCT_CATALOG_COL.category }} />
      <col style={{ width: PRODUCT_CATALOG_COL.upc }} />
      <col style={{ width: PRODUCT_CATALOG_COL.active }} />
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
                align="center"
                onClick={() => handleSort('productNumber')}
                sx={{ cursor: 'pointer', userSelect: 'none' }}
              >
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
              <TableCell align="center">
                <TableSortLabel
                  active={sortState?.field === 'active'}
                  direction={sortState && sortState.field === 'active' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('active')}
                  hideSortIcon={sortState?.field !== 'active'}
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
              const p = sortedProducts[virtualRow.index];
              return (
                <ProductCatalogRow
                  key={p.id}
                  product={p}
                  striped={virtualRow.index % 2 === 1}
                  onOpen={onOpenProduct}
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

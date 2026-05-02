import { useMemo, useState } from 'react';
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
  Tooltip,
  Typography,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import type { PurchaseOrderStatus } from '../../../types/inventory.types';
import type { ProcessingWorkspaceRowDTO } from '../../../types/inventory.types';
import { formatCurrency } from '../../../utils/format';
import { processingTokens } from './processingTokens';

export type QueueSortField =
  | 'rowNum'
  | 'title'
  | 'brand'
  | 'qty'
  | 'retail'
  | 'price'
  | 'condition'
  | 'dispatch'
  | 'status';

function rowStatusMeta(status: string) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    pending: { label: 'Pending', color: '#6b7280', bg: '#f3f4f6' },
    partial: { label: 'Partial', color: '#b45309', bg: '#fef3c7' },
    checked_in: { label: 'Checked In', color: '#15803d', bg: '#dcfce7' },
    disputed: { label: 'Disputed', color: '#b91c1c', bg: '#fee2e2' },
  };
  return map[status] ?? { label: status, color: '#6b7280', bg: '#f3f4f6' };
}

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
  bulkSelectedIds: Set<number>;
  onToggleBulkOne: (processingRowId: number, selected: boolean) => void;
  onToggleBulkAll: (selected: boolean) => void;
}

type SortCycleState = { field: QueueSortField; dir: 'asc' | 'desc' } | null;

export function ProcessingQueueTable({
  rows,
  preprocessingFinalizedAt,
  preprocessingBookmarkOnly,
  totalWorkspaceRowCount,
  orderId,
  orderStatus,
  detailProcessingRowId,
  onOpenDetail,
  bulkSelectedIds,
  onToggleBulkOne,
  onToggleBulkAll,
}: ProcessingQueueTableProps) {
  const [sortState, setSortState] = useState<SortCycleState>(null);

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
          cmp = (a.title || '').localeCompare(b.title || '');
          break;
        case 'brand':
          cmp = (a.brand || '').localeCompare(b.brand || '');
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
          cmp = (a.dispatch || '').localeCompare(b.dispatch || '');
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

  const allSelectableIds = sortedRows.map((r) => r.processing_row_id);
  const allSelected =
    allSelectableIds.length > 0 && allSelectableIds.every((id) => bulkSelectedIds.has(id));
  const someSelected = allSelectableIds.some((id) => bulkSelectedIds.has(id)) && !allSelected;

  const handleSort = (field: QueueSortField) => {
    setSortState((prev) => {
      if (prev === null || prev.field !== field) return { field, dir: 'asc' };
      if (prev.dir === 'asc') return { field, dir: 'desc' };
      return null;
    });
  };

  const filteredZeroButWorkspaceHasRows = rows.length === 0 && totalWorkspaceRowCount > 0;
  const noManifestLines = totalWorkspaceRowCount === 0;

  const money = (v: string | null | undefined) => {
    if (v == null || v === '') return '—';
    const n = Number.parseFloat(v);
    if (Number.isNaN(n)) return v;
    return formatCurrency(n);
  };

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
      }}
    >
      <Table
        size="small"
        stickyHeader
        sx={{
          tableLayout: 'fixed',
          width: '100%',
          '& .MuiTableCell-root': {
            py: '4px',
            px: '8px',
            fontSize: (theme) => theme.typography.pxToRem(12),
            lineHeight: 1.25,
          },
          '& .MuiTableHead-root .MuiTableCell-root': {
            py: '6px',
            bgcolor: 'background.paper',
            fontWeight: 700,
          },
          '& .MuiTableSortLabel-root': { fontSize: 'inherit', lineHeight: 1.25 },
        }}
      >
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox" sx={{ width: 34, px: '4px !important' }}>
              <Checkbox
                size="small"
                checked={allSelected}
                indeterminate={someSelected}
                onChange={(_, c) => onToggleBulkAll(c)}
                inputProps={{ 'aria-label': 'Select all rows' }}
              />
            </TableCell>
            <TableCell align="right" sx={{ width: 48, whiteSpace: 'nowrap' }}>
              <TableSortLabel
                active={sortState?.field === 'rowNum'}
                direction={sortState?.field === 'rowNum' ? sortState.dir : 'asc'}
                onClick={() => handleSort('rowNum')}
              >
                Row #
              </TableSortLabel>
            </TableCell>
            <TableCell>
              <TableSortLabel
                active={sortState?.field === 'title'}
                direction={sortState && sortState.field === 'title' ? sortState.dir : 'asc'}
                onClick={() => handleSort('title')}
              >
                Title / SKU
              </TableSortLabel>
            </TableCell>
            <TableCell>
              <TableSortLabel
                active={sortState?.field === 'brand'}
                direction={sortState && sortState.field === 'brand' ? sortState.dir : 'asc'}
                onClick={() => handleSort('brand')}
              >
                Brand
              </TableSortLabel>
            </TableCell>
            <TableCell align="right" sx={{ width: 72, whiteSpace: 'nowrap' }}>
              <TableSortLabel
                active={sortState?.field === 'qty'}
                direction={sortState && sortState.field === 'qty' ? sortState.dir : 'asc'}
                onClick={() => handleSort('qty')}
              >
                Qty
              </TableSortLabel>
            </TableCell>
            <TableCell align="right" sx={{ width: 88, whiteSpace: 'nowrap' }}>
              <TableSortLabel
                active={sortState?.field === 'retail'}
                direction={sortState && sortState.field === 'retail' ? sortState.dir : 'asc'}
                onClick={() => handleSort('retail')}
              >
                Retail
              </TableSortLabel>
            </TableCell>
            <TableCell align="right" sx={{ width: 88, whiteSpace: 'nowrap' }}>
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
          {sortedRows.map((r) => {
            const selected = r.processing_row_id === detailProcessingRowId;
            const meta = rowStatusMeta(r.status);
            const title = r.title || r.product?.title || '—';
            const dupTooltip =
              r.likelyDuplicateOf?.length ?
                `Likely same product as row ${r.likelyDuplicateOf.join(', ')}`
              : '';

            return (
              <TableRow
                key={r.processing_row_id}
                hover
                selected={selected}
                sx={{
                  cursor: 'pointer',
                  ...(selected ? { bgcolor: 'action.selected' } : {}),
                  '& .MuiTableCell-root': { py: '4px' },
                }}
              >
                <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    size="small"
                    checked={bulkSelectedIds.has(r.processing_row_id)}
                    onChange={(_, c) => onToggleBulkOne(r.processing_row_id, c)}
                    inputProps={{ 'aria-label': `Select row ${r.rowNum}` }}
                  />
                </TableCell>
                <TableCell
                  align="right"
                  onClick={() => onOpenDetail(r.processing_row_id)}
                  sx={{ fontVariantNumeric: 'tabular-nums', color: 'text.secondary' }}
                >
                  {r.rowNum}
                </TableCell>
                <TableCell onClick={() => onOpenDetail(r.processing_row_id)} sx={{ maxWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                    <Typography
                      component="span"
                      sx={{ fontSize: '0.8125rem', fontWeight: 700, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                      {title}
                    </Typography>
                    {dupTooltip ? (
                      <Tooltip title={dupTooltip}>
                        <Chip
                          size="small"
                          label="dup?"
                          variant="outlined"
                          sx={{ height: 18, fontSize: 9, flexShrink: 0 }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </Tooltip>
                    ) : null}
                  </Box>
                  <Typography
                    variant="caption"
                    sx={{
                      fontFamily: 'ui-monospace, monospace',
                      color: 'text.secondary',
                      display: 'block',
                      fontSize: '0.68rem',
                      lineHeight: 1.2,
                      mt: 0.125,
                    }}
                  >
                    {r.sku ||
                      `${
                        r.pendingItemCount != null ? r.pendingItemCount : (r.items?.length ?? 0)
                      } unit(s)`}
                  </Typography>
                </TableCell>
                <TableCell onClick={() => onOpenDetail(r.processing_row_id)} sx={{ whiteSpace: 'nowrap' }}>
                  <Typography sx={{ fontSize: '0.8125rem' }}>{r.brand || '—'}</Typography>
                </TableCell>
                <TableCell
                  align="right"
                  onClick={() => onOpenDetail(r.processing_row_id)}
                  sx={{ fontVariantNumeric: 'tabular-nums', width: 72, whiteSpace: 'nowrap', fontSize: '0.8125rem' }}
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
                  onClick={() => onOpenDetail(r.processing_row_id)}
                  sx={{ fontVariantNumeric: 'tabular-nums', width: 88, whiteSpace: 'nowrap', fontSize: '0.8125rem', color: 'text.secondary' }}
                >
                  {money(r.unitRetail)}
                </TableCell>
                <TableCell
                  align="right"
                  onClick={() => onOpenDetail(r.processing_row_id)}
                  sx={{
                    fontVariantNumeric: 'tabular-nums',
                    width: 88,
                    whiteSpace: 'nowrap',
                    fontWeight: 700,
                    fontSize: '0.8125rem',
                  }}
                >
                  {money(r.price)}
                </TableCell>
                <TableCell onClick={() => onOpenDetail(r.processing_row_id)}>
                  <Typography sx={{ fontSize: '0.8125rem' }}>{r.condition}</Typography>
                </TableCell>
                <TableCell onClick={() => onOpenDetail(r.processing_row_id)}>
                  <Chip
                    label={(r.dispatch || 'on_shelf').replace('_', ' ')}
                    size="small"
                    variant="outlined"
                    sx={{ borderColor: processingTokens.border, height: 18, fontSize: 10 }}
                  />
                </TableCell>
                <TableCell onClick={() => onOpenDetail(r.processing_row_id)}>
                  <Chip
                    label={meta.label}
                    size="small"
                    sx={{
                      height: 18,
                      fontSize: 10,
                      bgcolor: meta.bg,
                      color: meta.color,
                      border: 'none',
                    }}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {rows.length === 0 ? (
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
      ) : null}
    </Box>
  );
}

import LocalPrintshop from '@mui/icons-material/LocalPrintshop';
import OpenInNew from '@mui/icons-material/OpenInNew';
import { memo, useMemo, useState, Fragment, type ReactNode } from 'react';
import {
  Box,
  Button,
  Chip,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography,
  useTheme,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import type { ProcessingWorkspaceItemDTO, ProcessingWorkspaceProductDTO } from '../../../types/inventory.types';
import type { CheckedInHistoryRow, ProductGroupedHistory } from './checkedInHistory';
import {
  checkedInBrandText,
  checkedInCategoryText,
  checkedInModelText,
  checkedInProductIdText,
  checkedInTitleText,
  historyRowIncludesItem,
  itemLocationLabel,
} from './checkedInHistoryDisplay';
import {
  checkedInSortDirection,
  cycleCheckedInSort,
  isCheckedInSortActive,
  sortCheckedInHistoryRows,
  type CheckedInSortField,
  type CheckedInSortState,
} from './checkedInHistorySort';
import { formatQueueMoney, itemStatusMeta, queueDispatchLabel } from './processingQueueCellText';
import {
  PROCESSING_QUEUE_TABLE_HEAD_HEIGHT,
  PROCESSING_QUEUE_TABLE_ROW_HEIGHT,
} from './processingQueueLayout';
import { processingHeaderGradient, processingTokens } from './processingTokens';

const CHECKED_IN_COL_COUNT = 2;
const PRODUCT_COL_COUNT = 6;
const ITEM_COL_COUNT = 5;

const GROUP_DIVIDER_SX = {
  borderLeft: 2,
  borderColor: processingTokens.borderStrong,
  pl: '14px !important',
} as const;

function formatShortDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const tableSx = (mode: 'light' | 'dark') =>
  ({
    tableLayout: 'fixed',
    width: '100%',
    maxWidth: '100%',
    '& .MuiTableCell-root': {
      py: '1px',
      pl: '10px',
      pr: '8px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      fontSize: (theme: { typography: { pxToRem: (n: number) => string } }) => theme.typography.pxToRem(11),
      lineHeight: 1.12,
      height: PROCESSING_QUEUE_TABLE_ROW_HEIGHT,
      verticalAlign: 'middle',
    },
    '& .MuiTableCell-root + .MuiTableCell-root': {
      pl: '12px',
    },
    '& .MuiTableCell-root:first-of-type': {
      pl: '10px',
      pr: '10px',
    },
    '& .MuiTableHead-root .MuiTableCell-root': {
      py: '3px',
      background: processingHeaderGradient(mode),
      borderBottom: 1,
      borderColor: processingTokens.borderStrong,
      fontWeight: 700,
      fontSize: (theme: { typography: { pxToRem: (n: number) => string } }) => theme.typography.pxToRem(9.5),
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      color: processingTokens.textSoft,
    },
    '& .MuiTableHead-root .MuiTableRow:first-of-type .MuiTableCell-root': {
      height: 22,
      minHeight: 22,
      py: '2px',
      fontSize: (theme: { typography: { pxToRem: (n: number) => string } }) => theme.typography.pxToRem(8.5),
      letterSpacing: '0.08em',
      color: processingTokens.textMute,
      borderBottom: 1,
      borderColor: processingTokens.border,
    },
    '& .MuiTableHead-root .MuiTableRow:last-of-type .MuiTableCell-root': {
      height: PROCESSING_QUEUE_TABLE_HEAD_HEIGHT,
      minHeight: PROCESSING_QUEUE_TABLE_HEAD_HEIGHT,
      borderBottom: 2,
    },
    '& .MuiTableHead-root .MuiTableSortLabel-root': {
      color: 'inherit',
      fontSize: 'inherit',
      lineHeight: 1.25,
      letterSpacing: 'inherit',
      textTransform: 'inherit',
      '&:hover': { color: processingTokens.textStrong },
      '&.Mui-active': { color: processingTokens.textStrong, fontWeight: 800 },
    },
  }) as const;

function CellText({
  children,
  title,
  fontWeight = 600,
}: {
  children: ReactNode;
  title?: string;
  fontWeight?: number;
}) {
  return (
    <Typography
      component="span"
      sx={{ display: 'block', fontSize: '0.72rem', fontWeight, lineHeight: 1.12 }}
      noWrap
      title={title}
    >
      {children}
    </Typography>
  );
}

interface CheckedInHistoryTableRowProps {
  row: CheckedInHistoryRow;
  fallbackProduct: ProcessingWorkspaceProductDTO | null;
  selected: boolean;
  striped: boolean;
  onSelectItemId: (itemId: number) => void;
  onReprintItems?: (items: ProcessingWorkspaceItemDTO[]) => Promise<void>;
  onRemapBatch?: (row: CheckedInHistoryRow) => void;
  showRemapAction?: boolean;
}

const CheckedInHistoryTableRow = memo(function CheckedInHistoryTableRow({
  row,
  fallbackProduct,
  selected,
  striped,
  onSelectItemId,
  onReprintItems,
  onRemapBatch,
  showRemapAction = false,
}: CheckedInHistoryTableRowProps) {
  const navigate = useNavigate();
  const { item, qty, batchId } = row;
  const statusMeta = itemStatusMeta(item);
  const productId = checkedInProductIdText(row, fallbackProduct);
  const brand = checkedInBrandText(row, fallbackProduct);
  const title = checkedInTitleText(row, fallbackProduct);
  const model = checkedInModelText(row, fallbackProduct);
  const category = checkedInCategoryText(row, fallbackProduct);
  const location = itemLocationLabel(item.location);
  const open = () => onSelectItemId(item.id);
  const dateTitle =
    batchId != null ? `${row.checkedInAt} · Batch #${batchId}` : row.checkedInAt;

  return (
    <TableRow
      hover
      selected={selected}
      onClick={open}
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
      <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }} title={dateTitle}>
        {formatShortDateTime(row.checkedInAt)}
      </TableCell>
      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, whiteSpace: 'nowrap' }}>
        {qty}
      </TableCell>
      <TableCell sx={{ minWidth: 0, ...GROUP_DIVIDER_SX }}>
        <CellText title={productId} fontWeight={700}>
          {productId}
        </CellText>
      </TableCell>
      <TableCell sx={{ minWidth: 0 }}>
        <CellText title={brand}>{brand}</CellText>
      </TableCell>
      <TableCell sx={{ minWidth: 0 }}>
        <CellText title={title} fontWeight={700}>
          {title}
        </CellText>
      </TableCell>
      <TableCell sx={{ minWidth: 0 }}>
        <CellText title={model}>{model}</CellText>
      </TableCell>
      <TableCell sx={{ minWidth: 0 }}>
        <CellText title={category}>{category}</CellText>
      </TableCell>
      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        <CellText fontWeight={600}>{formatQueueMoney(item.retail)}</CellText>
      </TableCell>
      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', ...GROUP_DIVIDER_SX }}>
        <CellText fontWeight={700}>{formatQueueMoney(item.price)}</CellText>
      </TableCell>
      <TableCell sx={{ minWidth: 0 }}>
        <CellText title={item.condition_label || item.condition}>{item.condition_label || item.condition}</CellText>
      </TableCell>
      <TableCell sx={{ minWidth: 0 }}>
        <CellText title={queueDispatchLabel(item.dispatch)}>{queueDispatchLabel(item.dispatch)}</CellText>
      </TableCell>
      <TableCell sx={{ minWidth: 0 }}>
        <CellText title={location}>{location}</CellText>
      </TableCell>
      <TableCell sx={{ minWidth: 0 }}>
        <Chip
          label={statusMeta.label}
          size="small"
          sx={{
            height: 15,
            fontSize: 9,
            bgcolor: statusMeta.bg,
            color: statusMeta.color,
            border: statusMeta.border ? `1px solid ${statusMeta.border}` : 'none',
            maxWidth: '100%',
          }}
        />
      </TableCell>
      <TableCell align="right" sx={{ px: '4px !important', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
        <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
          {showRemapAction && batchId != null && onRemapBatch ?
            <Button
              size="small"
              variant="text"
              onClick={() => onRemapBatch(row)}
              sx={{ minWidth: 0, px: 0.5, fontSize: '0.625rem', mr: 0.25 }}
            >
              Change product
            </Button>
          : null}
          <IconButton
            size="small"
            aria-label={`Reprint ${item.sku}`}
            onClick={() => void onReprintItems?.(row.items)}
            sx={{ p: 0.35 }}
          >
            <LocalPrintshop sx={{ fontSize: 15 }} />
          </IconButton>
          <IconButton
            size="small"
            aria-label={`Open ${item.sku}`}
            onClick={() => navigate(`/inventory/items/${item.id}`)}
            sx={{ p: 0.35 }}
          >
            <OpenInNew sx={{ fontSize: 15 }} />
          </IconButton>
        </Box>
      </TableCell>
    </TableRow>
  );
});

function GroupHeadCell({
  label,
  colSpan,
  align = 'left',
  divider = false,
}: {
  label: string;
  colSpan: number;
  align?: 'left' | 'right';
  divider?: boolean;
}) {
  return (
    <TableCell
      colSpan={colSpan}
      align={align}
      sx={{
        whiteSpace: 'nowrap',
        ...(divider ? GROUP_DIVIDER_SX : {}),
      }}
    >
      {label}
    </TableCell>
  );
}

function SortableHead({
  label,
  field,
  sortState,
  onSort,
  align,
  divider = false,
}: {
  label: string;
  field: CheckedInSortField;
  sortState: CheckedInSortState;
  onSort: (field: CheckedInSortField) => void;
  align?: 'left' | 'right';
  divider?: boolean;
}) {
  return (
    <TableCell
      align={align ?? 'left'}
      sx={{
        whiteSpace: 'nowrap',
        ...(divider ? GROUP_DIVIDER_SX : {}),
      }}
    >
      <TableSortLabel
        active={isCheckedInSortActive(sortState, field)}
        direction={checkedInSortDirection(sortState, field)}
        onClick={() => onSort(field)}
        sx={{
          justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
          '& .MuiTableSortLabel-icon': { flexShrink: 0 },
        }}
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );
}

export interface CheckedInItemsTableProps {
  rows: CheckedInHistoryRow[];
  productGroups?: ProductGroupedHistory[];
  fallbackProduct: ProcessingWorkspaceProductDTO | null;
  activeItemId: number | null;
  onSelectItemId: (itemId: number) => void;
  onReprintItems?: (items: ProcessingWorkspaceItemDTO[]) => Promise<void>;
  onRemapBatch?: (row: CheckedInHistoryRow) => void;
  showRemapAction?: boolean;
  scrollable?: boolean;
}

export function CheckedInItemsTable({
  rows,
  productGroups,
  fallbackProduct,
  activeItemId,
  onSelectItemId,
  onReprintItems,
  onRemapBatch,
  showRemapAction = false,
  scrollable = false,
}: CheckedInItemsTableProps) {
  const theme = useTheme();
  const [sortState, setSortState] = useState<CheckedInSortState>(null);

  const grouped = productGroups ?? [{ productId: null, productLabel: '', totalQty: 0, historyRows: rows }];

  const sortedGroups = useMemo(
    () =>
      grouped.map((group) => ({
        ...group,
        historyRows: sortCheckedInHistoryRows(group.historyRows, sortState, fallbackProduct),
      })),
    [grouped, sortState, fallbackProduct],
  );

  function handleSort(field: CheckedInSortField) {
    setSortState((prev) => cycleCheckedInSort(prev, field));
  }

  if (!rows.length) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 2, px: 1.5, fontSize: '0.8125rem' }}>
        No checked-in history yet.
      </Typography>
    );
  }

  const colgroup = (
    <colgroup>
      <col style={{ width: '9%' }} />
      <col style={{ width: '4%' }} />
      <col style={{ width: '7%' }} />
      <col style={{ width: '8%' }} />
      <col style={{ width: '13%' }} />
      <col style={{ width: '8%' }} />
      <col style={{ width: '9%' }} />
      <col style={{ width: '6%' }} />
      <col style={{ width: '6%' }} />
      <col style={{ width: '8%' }} />
      <col style={{ width: '8%' }} />
      <col style={{ width: '7%' }} />
      <col style={{ width: '7%' }} />
      <col style={{ width: 48 }} />
    </colgroup>
  );

  return (
    <TableContainer
      sx={{
        width: '100%',
        maxWidth: '100%',
        overflowX: 'hidden',
        ...(scrollable ?
          {
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overscrollBehavior: 'contain',
          }
        : {}),
      }}
    >
      <Table size="small" stickyHeader sx={tableSx(theme.palette.mode)}>
        {colgroup}
        <TableHead>
          <TableRow>
            <GroupHeadCell label="Checked in" colSpan={CHECKED_IN_COL_COUNT} />
            <GroupHeadCell label="Product" colSpan={PRODUCT_COL_COUNT} divider />
            <GroupHeadCell label="Item" colSpan={ITEM_COL_COUNT} divider />
            <GroupHeadCell label="Actions" colSpan={1} align="right" divider />
          </TableRow>
          <TableRow>
            <SortableHead label="Date" field="checkedIn" sortState={sortState} onSort={handleSort} />
            <SortableHead label="Qty" field="qty" sortState={sortState} onSort={handleSort} align="right" />
            <SortableHead label="ID" field="productId" sortState={sortState} onSort={handleSort} divider />
            <SortableHead label="Brand" field="brand" sortState={sortState} onSort={handleSort} />
            <SortableHead label="Title" field="title" sortState={sortState} onSort={handleSort} />
            <SortableHead label="Model" field="model" sortState={sortState} onSort={handleSort} />
            <SortableHead label="Category" field="category" sortState={sortState} onSort={handleSort} />
            <SortableHead label="Retail" field="retail" sortState={sortState} onSort={handleSort} align="right" />
            <SortableHead label="Price" field="price" sortState={sortState} onSort={handleSort} align="right" divider />
            <SortableHead label="Condition" field="condition" sortState={sortState} onSort={handleSort} />
            <SortableHead label="Dispatched to" field="dispatch" sortState={sortState} onSort={handleSort} />
            <SortableHead label="Location" field="location" sortState={sortState} onSort={handleSort} />
            <SortableHead label="Status" field="status" sortState={sortState} onSort={handleSort} />
            <TableCell align="right" sx={{ whiteSpace: 'nowrap', px: '4px !important' }} aria-hidden />
          </TableRow>
        </TableHead>
        <TableBody>
          {sortedGroups.map((group) => (
            <Fragment key={group.productId ?? group.productLabel}>
              {productGroups && productGroups.length > 1 ?
                <TableRow>
                  <TableCell colSpan={CHECKED_IN_COL_COUNT + PRODUCT_COL_COUNT + ITEM_COL_COUNT + 1} sx={{ py: 0.75, bgcolor: processingTokens.neutralSoft }}>
                    <Typography variant="caption" fontWeight={800} sx={{ fontSize: '0.6875rem' }}>
                      {group.productLabel} · {group.totalQty} unit{group.totalQty === 1 ? '' : 's'}
                    </Typography>
                  </TableCell>
                </TableRow>
              : null}
              {group.historyRows.map((row, index) => (
                <CheckedInHistoryTableRow
                  key={row.batchId != null ? `batch-${row.batchId}` : `item-${row.item.id}`}
                  row={row}
                  fallbackProduct={fallbackProduct}
                  selected={historyRowIncludesItem(row, activeItemId)}
                  striped={index % 2 === 1}
                  onSelectItemId={onSelectItemId}
                  onReprintItems={onReprintItems}
                  onRemapBatch={onRemapBatch}
                  showRemapAction={showRemapAction}
                />
              ))}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

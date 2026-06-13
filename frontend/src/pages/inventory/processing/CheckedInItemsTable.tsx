import ArrowDropDown from '@mui/icons-material/ArrowDropDown';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import LocalPrintshop from '@mui/icons-material/LocalPrintshop';
import { memo, useMemo, useState, Fragment, type ReactNode } from 'react';
import {
  Box,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
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
  PROCESSING_ITEM_CONDITION_OPTIONS,
  PROCESSING_ITEM_DISPATCH_OPTIONS,
} from './processingItemFormOptions';
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

/** Action icons must read as LIVE: tinted at rest, strong color + fill on hover. */
const actionIconSx = (hoverColor: string) =>
  ({
    p: 0.4,
    color: 'text.secondary',
    border: '1px solid transparent',
    borderRadius: 1,
    transition: (theme: { transitions: { create: (p: string[]) => string } }) =>
      theme.transitions.create(['color', 'background-color', 'border-color']),
    '&:hover': {
      color: hoverColor,
      bgcolor: 'action.hover',
      borderColor: 'currentColor',
    },
  }) as const;

/** Inline click-to-edit enum cell (condition / dispatched-to): text + caret, menu on click. */
function EditableEnumCell({
  display,
  value,
  options,
  ariaLabel,
  onSave,
}: {
  display: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  ariaLabel: string;
  onSave: (value: string) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <TableCell
      sx={{ minWidth: 0, cursor: 'pointer' }}
      onClick={(e) => {
        e.stopPropagation();
        setAnchor(e.currentTarget as HTMLElement);
      }}
    >
      <Box
        role="button"
        aria-label={ariaLabel}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.25,
          minWidth: 0,
          px: 0.25,
          borderRadius: 0.5,
          border: '1px dashed',
          borderColor: 'transparent',
          '&:hover': { bgcolor: 'action.hover', borderColor: processingTokens.borderStrong },
        }}
      >
        <CellText title={`${display} — click to change`}>{display}</CellText>
        <ArrowDropDown sx={{ fontSize: 14, color: 'text.disabled', flexShrink: 0 }} />
      </Box>
      <Menu
        anchorEl={anchor}
        open={anchor != null}
        onClose={() => setAnchor(null)}
        onClick={(e) => e.stopPropagation()}
      >
        {options.map((opt) => (
          <MenuItem
            key={opt.value}
            dense
            selected={opt.value === value}
            onClick={() => {
              setAnchor(null);
              if (opt.value !== value) onSave(opt.value);
            }}
          >
            {opt.label}
          </MenuItem>
        ))}
      </Menu>
    </TableCell>
  );
}

interface CheckedInHistoryTableRowProps {
  row: CheckedInHistoryRow;
  fallbackProduct: ProcessingWorkspaceProductDTO | null;
  selected: boolean;
  striped: boolean;
  onSelectItemId: (itemId: number) => void;
  onReprintItems?: (items: ProcessingWorkspaceItemDTO[]) => Promise<void>;
  onDeleteBatch?: (row: CheckedInHistoryRow) => void;
  onSetBatchCondition?: (row: CheckedInHistoryRow, value: string) => void;
  onSetBatchDispatch?: (row: CheckedInHistoryRow, value: string) => void;
  showDeleteBatchAction?: boolean;
}

const CheckedInHistoryTableRow = memo(function CheckedInHistoryTableRow({
  row,
  fallbackProduct,
  selected,
  striped,
  onSelectItemId,
  onReprintItems,
  onDeleteBatch,
  onSetBatchCondition,
  onSetBatchDispatch,
  showDeleteBatchAction = false,
}: CheckedInHistoryTableRowProps) {
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
      {onSetBatchCondition ?
        <EditableEnumCell
          display={item.condition_label || item.condition}
          value={item.condition}
          options={PROCESSING_ITEM_CONDITION_OPTIONS}
          ariaLabel={`Change condition for this check-in (currently ${item.condition_label || item.condition})`}
          onSave={(value) => onSetBatchCondition(row, value)}
        />
      : <TableCell sx={{ minWidth: 0 }}>
          <CellText title={item.condition_label || item.condition}>{item.condition_label || item.condition}</CellText>
        </TableCell>}
      {onSetBatchDispatch ?
        <EditableEnumCell
          display={queueDispatchLabel(item.dispatch)}
          value={item.dispatch}
          options={PROCESSING_ITEM_DISPATCH_OPTIONS}
          ariaLabel={`Change dispatch for this check-in (currently ${queueDispatchLabel(item.dispatch)})`}
          onSave={(value) => onSetBatchDispatch(row, value)}
        />
      : <TableCell sx={{ minWidth: 0 }}>
          <CellText title={queueDispatchLabel(item.dispatch)}>{queueDispatchLabel(item.dispatch)}</CellText>
        </TableCell>}
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
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>
          {onReprintItems ?
            <Tooltip title={`Print ${qty} label${qty === 1 ? '' : 's'}`} enterDelay={300} disableInteractive>
              <IconButton
                size="small"
                aria-label={`Print ${qty} label${qty === 1 ? '' : 's'} for this check-in`}
                onClick={() => {
                  if (window.confirm(`Print ${qty} label${qty === 1 ? '' : 's'} for this check-in?`)) {
                    void onReprintItems(row.items);
                  }
                }}
                sx={actionIconSx('primary.main')}
              >
                <LocalPrintshop sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          : null}
          {showDeleteBatchAction && batchId != null && onDeleteBatch ?
            <Tooltip title="Delete this check-in" enterDelay={300} disableInteractive>
              <IconButton
                size="small"
                aria-label={`Delete this check-in (${qty} item${qty === 1 ? '' : 's'})`}
                onClick={() => onDeleteBatch(row)}
                sx={actionIconSx('error.main')}
              >
                <DeleteOutline sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          : null}
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
  onDeleteBatch?: (row: CheckedInHistoryRow) => void;
  onSetBatchCondition?: (row: CheckedInHistoryRow, value: string) => void;
  onSetBatchDispatch?: (row: CheckedInHistoryRow, value: string) => void;
  showDeleteBatchAction?: boolean;
  scrollable?: boolean;
}

export function CheckedInItemsTable({
  rows,
  productGroups,
  fallbackProduct,
  activeItemId,
  onSelectItemId,
  onReprintItems,
  onDeleteBatch,
  onSetBatchCondition,
  onSetBatchDispatch,
  showDeleteBatchAction = false,
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

  // All-percentage columns summing to 100 — a fixed-px trailing col on top of 100%
  // overflowed the container (overflowX: hidden) and clipped the Actions column.
  const colgroup = (
    <colgroup>
      <col style={{ width: '8%' }} />
      <col style={{ width: '4%' }} />
      <col style={{ width: '7%' }} />
      <col style={{ width: '7%' }} />
      <col style={{ width: '12%' }} />
      <col style={{ width: '7%' }} />
      <col style={{ width: '8%' }} />
      <col style={{ width: '6%' }} />
      <col style={{ width: '6%' }} />
      <col style={{ width: '7%' }} />
      <col style={{ width: '8%' }} />
      <col style={{ width: '7%' }} />
      <col style={{ width: '6%' }} />
      <col style={{ width: '7%' }} />
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
                  onDeleteBatch={onDeleteBatch}
                  onSetBatchCondition={onSetBatchCondition}
                  onSetBatchDispatch={onSetBatchDispatch}
                  showDeleteBatchAction={showDeleteBatchAction}
                />
              ))}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

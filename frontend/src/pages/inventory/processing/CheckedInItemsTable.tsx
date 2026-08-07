import ArrowDropDown from '@mui/icons-material/ArrowDropDown';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import LocalPrintshop from '@mui/icons-material/LocalPrintshop';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Box,
  Divider,
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
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import { isValidCheckInPrice } from '../workbench/CheckInDetailsLayout';
import { preventWheelChangeNumber, sanitizeDecimalPaste } from '../../../utils/formInputs';
import type { ProcessingWorkspaceItemDTO, ProcessingWorkspaceProductDTO } from '../../../types/inventory.types';
import type { CheckedInHistoryRow } from './checkedInHistory';
import {
  checkedInBrandText,
  checkedInCategoryText,
  checkedInModelText,
  checkedInProductIdText,
  checkedInTitleText,
  formatCheckedInShortDateTime,
  historyRowIncludesItem,
} from './checkedInHistoryDisplay';
import {
  CHECKED_IN_HISTORY_COLUMN_ORDER,
  computeCheckedInHistoryColumnWidths,
  createCheckedInHistoryMeasureFonts,
} from './checkedInHistoryColumnLayout';
import {
  checkedInSortDirection,
  cycleCheckedInSort,
  isCheckedInSortActive,
  sortCheckedInHistoryRows,
  type CheckedInSortField,
  type CheckedInSortState,
} from './checkedInHistorySort';
import { formatQueueMoney, queueDispatchLabel } from './processingQueueCellText';
import { checkInPrintActionLabel, checkInPrintedDisplay } from './checkedInPrintedAggregate';
import {
  PROCESSING_ITEM_CONDITION_OPTIONS,
  PROCESSING_ITEM_DISPATCH_OPTIONS,
} from './processingItemFormOptions';
import {
  PROCESSING_QUEUE_TABLE_HEAD_HEIGHT,
  PROCESSING_QUEUE_TABLE_ROW_HEIGHT,
  readProcessingQueueTableClientWidth,
} from './processingQueueLayout';
import { processingHeaderGradient, processingTokens } from './processingTokens';

const CHECKED_IN_AUTOSIZE_COL_SX = {
  whiteSpace: 'nowrap',
} as const;

const CHECKED_IN_PRODUCT_COL_SX = {
  minWidth: 0,
} as const;

const CHECKED_IN_ITEM_ENUM_COL_SX = {
  minWidth: 0,
  textAlign: 'center',
  pl: '4px !important',
  pr: '4px !important',
} as const;

const ITEM_ENUM_GROUP_DIVIDER_SX = {
  borderLeft: 2,
  borderColor: processingTokens.borderStrong,
  pl: '6px !important',
} as const;

const CHECKED_IN_MONEY_COL_SX = {
  minWidth: 0,
  whiteSpace: 'nowrap',
  textAlign: 'center',
} as const;

const CHECKED_IN_DATE_COL_SX = {
  ...CHECKED_IN_AUTOSIZE_COL_SX,
  pl: '8px !important',
  pr: '4px !important',
} as const;

const CHECKED_IN_QTY_COL_SX = {
  ...CHECKED_IN_AUTOSIZE_COL_SX,
  overflow: 'visible',
  textOverflow: 'clip',
  pl: '6px !important',
  pr: '8px !important',
  fontVariantNumeric: 'tabular-nums',
  textAlign: 'center',
} as const;

const CHECKED_IN_PRINTED_COL_SX = {
  ...CHECKED_IN_AUTOSIZE_COL_SX,
  overflow: 'visible',
  textOverflow: 'clip',
  pl: '4px !important',
  pr: '6px !important',
  fontVariantNumeric: 'tabular-nums',
  fontFamily: processingTokens.monoFontFamily,
  textAlign: 'center',
} as const;

const GROUP_DIVIDER_SX = {
  borderLeft: 2,
  borderColor: processingTokens.borderStrong,
  pl: '14px !important',
} as const;

const PRODUCT_ID_COL_SX = {
  ...CHECKED_IN_AUTOSIZE_COL_SX,
  ...GROUP_DIVIDER_SX,
} as const;

const CHECKED_IN_ACTIONS_COL_SX = {
  whiteSpace: 'nowrap',
  px: '4px !important',
  textAlign: 'center',
} as const;

const PRODUCT_TITLE_COL_SX = {
  minWidth: 0,
} as const;

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
      textOverflow: 'clip',
    },
    '& .MuiTableHead-root .MuiTableRow .MuiTableCell-root': {
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
      maxWidth: '100%',
      '&:hover': { color: processingTokens.textStrong },
      '&.Mui-active': {
        color: processingTokens.textStrong,
        fontWeight: 800,
        flexDirection: 'row',
      },
      '&:not(.Mui-active) .MuiTableSortLabel-icon': {
        display: 'none',
      },
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

export interface CheckInAttachedProductOption {
  productId: number;
  label: string;
  hint?: string;
}

/** Read-only product field - click opens the product editor when a product is linked. */
function ProductSectionFieldCell({
  children,
  title,
  fontWeight,
  cellSx,
  productId,
  onEditProduct,
  align = 'left',
}: {
  children: ReactNode;
  title?: string;
  fontWeight?: number;
  cellSx?: object;
  productId: number | null;
  onEditProduct?: (productId: number) => void;
  align?: 'left' | 'center';
}) {
  const editable = productId != null && onEditProduct != null;
  const displayTitle = title ?? (typeof children === 'string' ? children : undefined);
  return (
    <TableCell
      align={align}
      sx={{
        minWidth: 0,
        ...(editable ?
          {
            cursor: 'pointer',
            '&:hover': { bgcolor: 'action.hover' },
          }
        : {}),
        ...cellSx,
      }}
      onClick={
        editable ?
          (e) => {
            e.stopPropagation();
            onEditProduct(productId);
          }
        : undefined
      }
      title={editable && displayTitle ? `${displayTitle} - click to edit product` : displayTitle}
    >
      <CellText title={displayTitle} fontWeight={fontWeight}>
        {children}
      </CellText>
    </TableCell>
  );
}

/** Inline click-to-edit enum cell (condition / dispatched-to / product id): text + caret, menu on click. */
function EditableEnumCell({
  display,
  value,
  options,
  ariaLabel,
  onSave,
  cellSx,
  menuVariant = 'default',
  onOpenProductEditor,
  align = 'left',
}: {
  display: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string; hint?: string }>;
  ariaLabel: string;
  onSave: (value: string) => void;
  cellSx?: object;
  menuVariant?: 'default' | 'product';
  onOpenProductEditor?: () => void;
  align?: 'left' | 'center';
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const productMenu = menuVariant === 'product';
  return (
    <TableCell
      align={align}
      sx={{ minWidth: 0, cursor: 'pointer', ...cellSx }}
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
          justifyContent: align === 'center' ? 'center' : 'flex-start',
          gap: 0.25,
          minWidth: 0,
          mx: align === 'center' ? 'auto' : undefined,
          px: 0.25,
          borderRadius: 0.5,
          border: '1px dashed',
          borderColor: 'transparent',
          '&:hover': { bgcolor: 'action.hover', borderColor: processingTokens.borderStrong },
        }}
      >
        <CellText title={`${display} - click to change`}>{display}</CellText>
        <ArrowDropDown sx={{ fontSize: 14, color: 'text.disabled', flexShrink: 0 }} />
      </Box>
      <Menu
        anchorEl={anchor}
        open={anchor != null}
        onClose={() => setAnchor(null)}
        onClick={(e) => e.stopPropagation()}
        slotProps={{
          paper: productMenu ?
            {
              sx: {
                minWidth: Math.max(anchor?.offsetWidth ?? 0, 400),
                maxWidth: 'min(560px, calc(100vw - 24px))',
              },
            }
          : undefined,
        }}
      >
        {options.map((opt) => (
          <MenuItem
            key={opt.value}
            dense={!productMenu}
            selected={opt.value === value}
            sx={
              productMenu ?
                { alignItems: 'flex-start', py: 1, whiteSpace: 'normal' }
              : undefined
            }
            onClick={() => {
              setAnchor(null);
              if (opt.value !== value) onSave(opt.value);
            }}
          >
            <Box sx={{ minWidth: 0, width: '100%' }}>
              <Typography
                variant="body2"
                sx={{
                  fontSize: productMenu ? '0.8125rem' : '0.8125rem',
                  lineHeight: 1.35,
                  fontWeight: productMenu ? 600 : 400,
                  whiteSpace: productMenu ? 'normal' : 'nowrap',
                  wordBreak: productMenu ? 'break-word' : undefined,
                }}
              >
                {opt.label}
              </Typography>
              {opt.hint ?
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    display: 'block',
                    mt: 0.25,
                    lineHeight: 1.25,
                    whiteSpace: productMenu ? 'normal' : 'nowrap',
                    wordBreak: productMenu ? 'break-word' : undefined,
                    ...(productMenu ? {} : { maxWidth: 220 }),
                  }}
                >
                  {opt.hint}
                </Typography>
              : null}
            </Box>
          </MenuItem>
        ))}
        {onOpenProductEditor ?
          <>
            <Divider sx={{ my: 0.5 }} />
            <MenuItem
              dense={!productMenu}
              onClick={() => {
                setAnchor(null);
                onOpenProductEditor();
              }}
            >
              Edit product details
            </MenuItem>
          </>
        : null}
      </Menu>
    </TableCell>
  );
}

function priceDraftFromItem(price: string | null | undefined): string {
  if (price == null || price === '') return '';
  return String(price).replace(/^\$/, '').trim();
}

/** Inline click-to-edit money cell (shelf price). */
function EditablePriceCell({
  display,
  value,
  ariaLabel,
  onSave,
  cellSx,
  align = 'right',
}: {
  display: string;
  value: string;
  ariaLabel: string;
  onSave: (value: string) => void;
  cellSx?: object;
  align?: 'left' | 'center' | 'right';
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    setDraft(value);
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, [editing, value]);

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  function commit() {
    const normalized = sanitizeDecimalPaste(draft.trim());
    if (!isValidCheckInPrice(normalized)) {
      cancel();
      return;
    }
    if (normalized === value) {
      setEditing(false);
      return;
    }
    onSave(normalized);
    setEditing(false);
  }

  if (!editing) {
    return (
      <TableCell
        align={align}
        sx={{ minWidth: 0, cursor: 'pointer', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', ...cellSx }}
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
      >
        <Box
          role="button"
          aria-label={ariaLabel}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
            gap: 0.25,
            minWidth: 0,
            px: 0.25,
            borderRadius: 0.5,
            border: '1px dashed',
            borderColor: 'transparent',
            '&:hover': { bgcolor: 'action.hover', borderColor: processingTokens.borderStrong },
          }}
        >
          <CellText title={`${display} - click to change`} fontWeight={700}>
            {display}
          </CellText>
        </Box>
      </TableCell>
    );
  }

  return (
    <TableCell
      align={align}
      sx={{ minWidth: 0, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', ...cellSx }}
      onClick={(e) => e.stopPropagation()}
    >
      <TextField
        inputRef={inputRef}
        size="small"
        value={draft}
        onChange={(e) => setDraft(sanitizeDecimalPaste(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
        onBlur={commit}
        onWheel={preventWheelChangeNumber}
        onPaste={(e) => {
          e.preventDefault();
          setDraft(sanitizeDecimalPaste(e.clipboardData.getData('text')));
        }}
        slotProps={{
          input: {
            sx: { fontSize: '0.72rem', py: 0.25, textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
            'aria-label': ariaLabel,
          },
        }}
        sx={{ width: 72 }}
      />
    </TableCell>
  );
}

interface CheckedInHistoryTableRowProps {
  row: CheckedInHistoryRow;
  fallbackProduct: ProcessingWorkspaceProductDTO | null;
  attachedProductOptions: CheckInAttachedProductOption[];
  selected: boolean;
  striped: boolean;
  onSelectItemId: (itemId: number) => void;
  onReprintCheckIn?: (row: CheckedInHistoryRow) => void;
  onDeleteItemCheckIn?: (row: CheckedInHistoryRow) => void;
  onSetCheckInProduct?: (row: CheckedInHistoryRow, productId: number) => void;
  onSetCheckInPrice?: (row: CheckedInHistoryRow, value: string) => void;
  onSetCheckInCondition?: (row: CheckedInHistoryRow, value: string) => void;
  onSetCheckInDispatch?: (row: CheckedInHistoryRow, value: string) => void;
  onEditCheckInProduct?: (productId: number) => void;
  showDeleteCheckInAction?: boolean;
}

const CheckedInHistoryTableRow = memo(function CheckedInHistoryTableRow({
  row,
  fallbackProduct,
  attachedProductOptions,
  selected,
  striped,
  onSelectItemId,
  onReprintCheckIn,
  onDeleteItemCheckIn,
  onSetCheckInProduct,
  onSetCheckInPrice,
  onSetCheckInCondition,
  onSetCheckInDispatch,
  onEditCheckInProduct,
  showDeleteCheckInAction = false,
}: CheckedInHistoryTableRowProps) {
  const { item, qty, itemCheckInId } = row;
  const printedMeta = checkInPrintedDisplay(row.items, qty);
  const printAction = checkInPrintActionLabel(row.items, qty);
  const printedTooltip =
    printedMeta.unprintedSkus.length > 0 ?
      `Unprinted: ${printedMeta.unprintedSkus.join(', ')}`
    : printedMeta.allPrinted ?
      'All labels printed'
    : 'No labels printed yet';
  const productIdDisplay = checkedInProductIdText(row, fallbackProduct);
  const currentProductId = row.checkInProduct?.id ?? item.product ?? null;
  const priceDisplay = formatQueueMoney(item.price);
  const priceDraft = priceDraftFromItem(item.price);
  const productEnumOptions = useMemo(
    () =>
      attachedProductOptions.map((opt) => ({
        value: String(opt.productId),
        label: opt.label,
        hint: opt.hint,
      })),
    [attachedProductOptions],
  );
  const canEditProduct =
    onSetCheckInProduct != null
    && itemCheckInId != null
    && currentProductId != null
    && productEnumOptions.length > 0;
  const openProductEditor =
    onEditCheckInProduct && currentProductId != null ?
      () => onEditCheckInProduct(currentProductId)
    : undefined;
  const brand = checkedInBrandText(row, fallbackProduct);
  const title = checkedInTitleText(row, fallbackProduct);
  const model = checkedInModelText(row, fallbackProduct);
  const category = checkedInCategoryText(row, fallbackProduct);
  const open = () => onSelectItemId(item.id);
  const dateTitle =
    itemCheckInId != null ? `${row.checkedInAt} · Check-in #${itemCheckInId}` : row.checkedInAt;

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
      <TableCell sx={{ ...CHECKED_IN_DATE_COL_SX, color: 'text.secondary' }} title={dateTitle}>
        {formatCheckedInShortDateTime(row.checkedInAt)}
      </TableCell>
      <TableCell align="center" sx={{ ...CHECKED_IN_QTY_COL_SX, fontWeight: 700 }}>
        {qty}
      </TableCell>
      <TableCell
        align="center"
        sx={{
          ...CHECKED_IN_PRINTED_COL_SX,
          fontWeight: 700,
          color: printedMeta.allPrinted ? 'success.main' : 'text.secondary',
        }}
        title={printedTooltip}
      >
        {printedMeta.text}
      </TableCell>
      {canEditProduct ?
        <EditableEnumCell
          display={productIdDisplay}
          value={String(currentProductId)}
          options={productEnumOptions}
          menuVariant="product"
          ariaLabel={`Change product for this check-in (currently ${productIdDisplay})`}
          cellSx={PRODUCT_ID_COL_SX}
          onOpenProductEditor={openProductEditor}
          onSave={(value) => {
            const nextId = Number(value);
            if (Number.isFinite(nextId)) onSetCheckInProduct(row, nextId);
          }}
        />
      : <ProductSectionFieldCell
          productId={currentProductId}
          onEditProduct={onEditCheckInProduct}
          title={productIdDisplay}
          fontWeight={700}
          cellSx={PRODUCT_ID_COL_SX}
        >
          {productIdDisplay}
        </ProductSectionFieldCell>}
      <ProductSectionFieldCell
        productId={currentProductId}
        onEditProduct={onEditCheckInProduct}
        title={brand}
        cellSx={CHECKED_IN_PRODUCT_COL_SX}
      >
        {brand}
      </ProductSectionFieldCell>
      <ProductSectionFieldCell
        productId={currentProductId}
        onEditProduct={onEditCheckInProduct}
        title={title}
        fontWeight={700}
        cellSx={PRODUCT_TITLE_COL_SX}
      >
        {title}
      </ProductSectionFieldCell>
      <ProductSectionFieldCell
        productId={currentProductId}
        onEditProduct={onEditCheckInProduct}
        title={model}
        cellSx={CHECKED_IN_PRODUCT_COL_SX}
      >
        {model}
      </ProductSectionFieldCell>
      <ProductSectionFieldCell
        productId={currentProductId}
        onEditProduct={onEditCheckInProduct}
        title={category}
        cellSx={CHECKED_IN_PRODUCT_COL_SX}
      >
        {category}
      </ProductSectionFieldCell>
      {onSetCheckInCondition ?
        <EditableEnumCell
          display={item.condition_label || item.condition}
          value={item.condition}
          options={PROCESSING_ITEM_CONDITION_OPTIONS}
          ariaLabel={`Change condition for this check-in (currently ${item.condition_label || item.condition})`}
          cellSx={{ ...ITEM_ENUM_GROUP_DIVIDER_SX, ...CHECKED_IN_ITEM_ENUM_COL_SX }}
          align="center"
          onSave={(value) => onSetCheckInCondition(row, value)}
        />
      : <TableCell align="center" sx={{ ...ITEM_ENUM_GROUP_DIVIDER_SX, ...CHECKED_IN_ITEM_ENUM_COL_SX }}>
          <CellText title={item.condition_label || item.condition}>{item.condition_label || item.condition}</CellText>
        </TableCell>}
      {onSetCheckInDispatch ?
        <EditableEnumCell
          display={queueDispatchLabel(item.dispatch)}
          value={item.dispatch}
          options={PROCESSING_ITEM_DISPATCH_OPTIONS}
          ariaLabel={`Change dispatch for this check-in (currently ${queueDispatchLabel(item.dispatch)})`}
          cellSx={CHECKED_IN_ITEM_ENUM_COL_SX}
          align="center"
          onSave={(value) => onSetCheckInDispatch(row, value)}
        />
      : <TableCell align="center" sx={CHECKED_IN_ITEM_ENUM_COL_SX}>
          <CellText title={queueDispatchLabel(item.dispatch)}>{queueDispatchLabel(item.dispatch)}</CellText>
        </TableCell>}
      <TableCell align="center" sx={{ ...CHECKED_IN_MONEY_COL_SX, fontVariantNumeric: 'tabular-nums' }}>
        <CellText fontWeight={600}>{formatQueueMoney(item.retail)}</CellText>
      </TableCell>
      {onSetCheckInPrice ?
        <EditablePriceCell
          display={priceDisplay}
          value={priceDraft}
          ariaLabel={`Change shelf price for this check-in (currently ${priceDisplay})`}
          cellSx={CHECKED_IN_MONEY_COL_SX}
          align="center"
          onSave={(value) => onSetCheckInPrice(row, value)}
        />
      : <TableCell align="center" sx={{ ...CHECKED_IN_MONEY_COL_SX, fontVariantNumeric: 'tabular-nums' }}>
          <CellText fontWeight={700}>{priceDisplay}</CellText>
        </TableCell>}
      <TableCell align="center" sx={CHECKED_IN_ACTIONS_COL_SX} onClick={(e) => e.stopPropagation()}>
        <Box sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 0.25 }}>
          {onReprintCheckIn ?
            <Tooltip title={`${printAction} ${qty} label${qty === 1 ? '' : 's'}`} enterDelay={300} disableInteractive>
              <IconButton
                size="small"
                aria-label={`${printAction} ${qty} label${qty === 1 ? '' : 's'} for this check-in`}
                onClick={() => onReprintCheckIn(row)}
                sx={actionIconSx('primary.main')}
              >
                <LocalPrintshop sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          : null}
          {showDeleteCheckInAction && itemCheckInId != null && onDeleteItemCheckIn ?
            <Tooltip title="Delete this check-in" enterDelay={300} disableInteractive>
              <IconButton
                size="small"
                aria-label={`Delete this check-in (${qty} item${qty === 1 ? '' : 's'})`}
                onClick={() => onDeleteItemCheckIn(row)}
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

const CHECKED_IN_SORT_LABEL_SX = {
  width: '100%',
  maxWidth: '100%',
  justifyContent: 'space-between',
  gap: 0.5,
  '& .MuiTableSortLabel-icon': {
    flexShrink: 0,
    marginLeft: 'auto',
    marginRight: 0,
  },
} as const;

const CHECKED_IN_CENTERED_SORT_LABEL_SX = {
  width: '100%',
  maxWidth: '100%',
  justifyContent: 'center',
  '& .MuiTableSortLabel-icon': {
    flexShrink: 0,
  },
} as const;

function SortableHead({
  label,
  field,
  sortState,
  onSort,
  divider = false,
  cellSx,
  centered = false,
}: {
  label: string;
  field: CheckedInSortField;
  sortState: CheckedInSortState;
  onSort: (field: CheckedInSortField) => void;
  divider?: boolean;
  cellSx?: object;
  centered?: boolean;
}) {
  const active = isCheckedInSortActive(sortState, field);
  return (
    <TableCell
      align={centered ? 'center' : 'left'}
      sx={{
        whiteSpace: 'nowrap',
        ...(divider ? GROUP_DIVIDER_SX : {}),
        ...cellSx,
      }}
    >
      <TableSortLabel
        active={active}
        direction={checkedInSortDirection(sortState, field)}
        onClick={() => onSort(field)}
        hideSortIcon={!active}
        sx={centered ? CHECKED_IN_CENTERED_SORT_LABEL_SX : CHECKED_IN_SORT_LABEL_SX}
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );
}

export interface CheckedInItemsTableProps {
  rows: CheckedInHistoryRow[];
  fallbackProduct: ProcessingWorkspaceProductDTO | null;
  attachedProductOptions?: CheckInAttachedProductOption[];
  activeItemId: number | null;
  onSelectItemId: (itemId: number) => void;
  onReprintCheckIn?: (row: CheckedInHistoryRow) => void;
  onDeleteItemCheckIn?: (row: CheckedInHistoryRow) => void;
  onSetCheckInProduct?: (row: CheckedInHistoryRow, productId: number) => void;
  onSetCheckInPrice?: (row: CheckedInHistoryRow, value: string) => void;
  onSetCheckInCondition?: (row: CheckedInHistoryRow, value: string) => void;
  onSetCheckInDispatch?: (row: CheckedInHistoryRow, value: string) => void;
  onEditCheckInProduct?: (productId: number) => void;
  showDeleteCheckInAction?: boolean;
  scrollable?: boolean;
}

export function CheckedInItemsTable({
  rows,
  fallbackProduct,
  attachedProductOptions = [],
  activeItemId,
  onSelectItemId,
  onReprintCheckIn,
  onDeleteItemCheckIn,
  onSetCheckInProduct,
  onSetCheckInPrice,
  onSetCheckInCondition,
  onSetCheckInDispatch,
  onEditCheckInProduct,
  showDeleteCheckInAction = false,
  scrollable = false,
}: CheckedInItemsTableProps) {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [sortState, setSortState] = useState<CheckedInSortState>(null);

  const measureFonts = useMemo(
    () => createCheckedInHistoryMeasureFonts(String(theme.typography.fontFamily ?? 'sans-serif')),
    [theme.typography.fontFamily],
  );

  const productDropdown = attachedProductOptions.length > 0 && onSetCheckInProduct != null;

  const columnLayout = useMemo(
    () =>
      computeCheckedInHistoryColumnWidths(rows, containerWidth, fallbackProduct, measureFonts, {
        productDropdown,
        showReprint: onReprintCheckIn != null,
        showDelete: showDeleteCheckInAction,
      }),
    [
      rows,
      containerWidth,
      fallbackProduct,
      measureFonts,
      productDropdown,
      onReprintCheckIn,
      showDeleteCheckInAction,
    ],
  );

  const sortedRows = useMemo(
    () => sortCheckedInHistoryRows(rows, sortState, fallbackProduct),
    [rows, sortState, fallbackProduct],
  );

  function handleSort(field: CheckedInSortField) {
    setSortState((prev) => cycleCheckedInSort(prev, field));
  }

  useLayoutEffect(() => {
    const el = containerRef.current;
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
  }, [rows.length]);

  if (!rows.length) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 2, px: 1.5, fontSize: '0.8125rem' }}>
        No checked-in history yet.
      </Typography>
    );
  }

  const colgroup = (
    <colgroup>
      {CHECKED_IN_HISTORY_COLUMN_ORDER.map((id) => (
        <col key={id} style={{ width: columnLayout.cols[id] }} />
      ))}
      <col style={{ width: columnLayout.actionsColPx }} />
    </colgroup>
  );

  return (
    <TableContainer
      ref={containerRef}
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
      <Table
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
            <SortableHead label="Date" field="checkedIn" sortState={sortState} onSort={handleSort} cellSx={CHECKED_IN_DATE_COL_SX} />
            <SortableHead label="Qty" field="qty" sortState={sortState} onSort={handleSort} centered cellSx={CHECKED_IN_QTY_COL_SX} />
            <TableCell align="center" sx={CHECKED_IN_PRINTED_COL_SX}>
              Printed
            </TableCell>
            <SortableHead label="ID" field="productId" sortState={sortState} onSort={handleSort} divider cellSx={PRODUCT_ID_COL_SX} />
            <SortableHead label="Brand" field="brand" sortState={sortState} onSort={handleSort} cellSx={CHECKED_IN_PRODUCT_COL_SX} />
            <SortableHead label="Title" field="title" sortState={sortState} onSort={handleSort} cellSx={PRODUCT_TITLE_COL_SX} />
            <SortableHead label="Model" field="model" sortState={sortState} onSort={handleSort} cellSx={CHECKED_IN_PRODUCT_COL_SX} />
            <SortableHead label="Category" field="category" sortState={sortState} onSort={handleSort} cellSx={CHECKED_IN_PRODUCT_COL_SX} />
            <SortableHead label="Condition" field="condition" sortState={sortState} onSort={handleSort} centered cellSx={{ ...ITEM_ENUM_GROUP_DIVIDER_SX, ...CHECKED_IN_ITEM_ENUM_COL_SX }} />
            <SortableHead label="Dispatch" field="dispatch" sortState={sortState} onSort={handleSort} centered cellSx={CHECKED_IN_ITEM_ENUM_COL_SX} />
            <SortableHead label="Retail" field="retail" sortState={sortState} onSort={handleSort} centered cellSx={CHECKED_IN_MONEY_COL_SX} />
            <SortableHead label="Price" field="price" sortState={sortState} onSort={handleSort} centered cellSx={CHECKED_IN_MONEY_COL_SX} />
            <TableCell align="center" sx={CHECKED_IN_ACTIONS_COL_SX}>
              Actions
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sortedRows.map((row, index) => (
            <CheckedInHistoryTableRow
              key={row.itemCheckInId != null ? `checkin-${row.itemCheckInId}` : `item-${row.item.id}`}
              row={row}
              fallbackProduct={fallbackProduct}
              attachedProductOptions={attachedProductOptions}
              selected={historyRowIncludesItem(row, activeItemId)}
              striped={index % 2 === 1}
              onSelectItemId={onSelectItemId}
              onReprintCheckIn={onReprintCheckIn}
              onDeleteItemCheckIn={onDeleteItemCheckIn}
              onSetCheckInProduct={onSetCheckInProduct}
              onSetCheckInPrice={onSetCheckInPrice}
              onSetCheckInCondition={onSetCheckInCondition}
              onSetCheckInDispatch={onSetCheckInDispatch}
              onEditCheckInProduct={onEditCheckInProduct}
              showDeleteCheckInAction={showDeleteCheckInAction}
            />
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

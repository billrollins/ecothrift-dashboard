import Add from '@mui/icons-material/Add';
import ArrowBack from '@mui/icons-material/ArrowBack';
import Check from '@mui/icons-material/Check';
import Close from '@mui/icons-material/Close';
import FilterAlt from '@mui/icons-material/FilterAlt';
import JoinFull from '@mui/icons-material/JoinFull';
import LocalPrintshop from '@mui/icons-material/LocalPrintshop';
import Search from '@mui/icons-material/Search';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useSnackbar } from 'notistack';
import { useAuth } from '../../../contexts/AuthContext';
import {
  useProcessingBreakApartRow,
  useProcessingMakeSetRow,
  useProcessingRestartRow,
  useRemapCheckInBatchProduct,
} from '../../../hooks/useProcessingWorkspace';
import { apiErrorDetail } from '../../../hooks/useProductSearch';
import type { ProcessingRestartSummary } from '../../../api/inventory.api';
import type {
  ProcessingWorkspaceItemDTO,
  ProcessingWorkspaceRowDTO,
} from '../../../types/inventory.types';
import { formatCurrency } from '../../../utils/format';
import { preventWheelChangeNumber, sanitizeDecimalPaste } from '../../../utils/formInputs';
import { isTaxonomyV1CategoryName, TAXONOMY_V1_CATEGORY_NAMES } from '../../../constants/taxonomyV1';
import {
  buildProcessingGoogleQuery,
  googleSearchUrl,
  parseSearchTagsCsv,
} from './processingGoogleQuery';
import { ProcessingCheckInDialog, type ProcessingCheckInSeed } from './ProcessingCheckInDialog';
import { ProcessingRowSection } from './ProcessingRowSection';
import { processingTokens } from './processingTokens';
import { normalizeProcessingCondition } from './processingItemFormOptions';

function resolveQuickCheckInProduct(row: ProcessingWorkspaceRowDTO) {
  const recentProductId =
    row.checkInBatches?.[0]?.product?.id
    ?? row.productId
    ?? row.product?.id
    ?? null;
  if (recentProductId != null) {
    return { product_mode: 'existing' as const, product_id: recentProductId };
  }
  return { product_mode: 'new' as const };
}
import { ManifestFieldNavContext, ManifestFieldNavProvider, type ManifestFieldId } from './manifestFieldNav';
import { ManifestIdentifiersField } from './ManifestIdentifiersField';
import { ManifestTagsField } from './manifestTagsField';
import { CheckedInItemsTable } from './CheckedInItemsTable';
import {
  buildCheckedInHistoryRows,
  buildProductGroupedHistory,
  distinctProductCount,
  disputedItemCount,
  isCheckedInItem,
  type CheckedInHistoryRow,
} from './checkedInHistory';
import { ProcessingQuickCheckInFooter } from './ProcessingQuickCheckInFooter';
import { QuickCheckInProductPrompt } from './QuickCheckInProductPrompt';
import { LargeCheckInConfirmDialog } from './LargeCheckInConfirmDialog';
import { isLargeCheckIn } from './largeCheckIn';
import { effectiveRowQty, queueProductsChipLabel } from './processingQueueCellText';
import { RemapBatchProductDialog } from './RemapBatchProductDialog';
import {
  ProcessingRestartRowDialog,
  ProcessingTransformDialog,
  type ProcessingTransformMode,
} from './ProcessingTransformDialogs';
import { processingRowManifestBodySx, processingRowManifestToolbarRowSx } from './processingRowToolbarLayout';
import { ManifestModalField } from './ManifestModalField';
import { ManifestModalNavBridge } from './ManifestModalNavBridge';
import { ManifestNotesField } from './ManifestNotesField';
import { ManifestToolbarPill } from './ManifestToolbarPill';
import type { ManifestModalEditorHandle } from './manifestModalEditor';
import { identifiersSummary, notesSummary, tagsSummary } from './processingManifestSummary';
import {
  PROCESSING_ROW_EDIT_ICON_SIZE,
  PROCESSING_ROW_EDIT_SEGMENT_WIDTH,
  PROCESSING_ROW_FIELD_HEIGHT,
  PROCESSING_ROW_PILL_EDIT_MIN_WIDTH,
  PROCESSING_ROW_VALUE_FONT,
  PROCESSING_ROW_VALUE_FONT_COMPACT,
  PROCESSING_ROW_VALUE_FONT_EMPHASIZED,
  PROCESSING_ROW_VALUE_FONT_WEIGHT,
  processingRowLabelSx,
} from './processingRowFieldTokens';

const CONDITION_OPTIONS = ['New', 'Like New', 'Very Good', 'Used Good', 'Used Fair', 'Salvage'];

const manifestToolbarFieldSx = { flex: '1 1 102px', minWidth: 98, maxWidth: 260 };
const manifestToolbarEditablePillSlotSx = {
  flex: '0 0 auto',
  minWidth: PROCESSING_ROW_PILL_EDIT_MIN_WIDTH,
  maxWidth: 'none',
};
const manifestToolbarCompactFieldSx = manifestToolbarEditablePillSlotSx;
const manifestToolbarTitleSx = {
  flex: '1.2 1 140px',
  minWidth: PROCESSING_ROW_PILL_EDIT_MIN_WIDTH,
  maxWidth: 320,
};
const manifestToolbarMoneyFieldSx = manifestToolbarEditablePillSlotSx;
const manifestToolbarRowSx = { flex: '0 0 50px', minWidth: 46, maxWidth: 58 };
const manifestToolbarEmphasisFieldSx = {
  valueFontSize: PROCESSING_ROW_VALUE_FONT_EMPHASIZED,
  valueFontWeight: PROCESSING_ROW_VALUE_FONT_WEIGHT,
} as const;

function ManifestToolbarSlot({ children, sx }: { children: ReactNode; sx?: object }) {
  return <Box sx={{ ...manifestToolbarFieldSx, ...sx }}>{children}</Box>;
}

function ProcessingRowHeader({
  qtyCheckedIn,
  qtyExpected,
  qtyRemaining,
  qtyOverage,
  checkedInItemCount,
  distinctProducts,
  batchCount,
  disputedCount,
  productsChipLabel,
  groupChipLabel,
  onBackToQueue,
  googleHref,
  onShowAllThisProduct,
  productFilterActive,
}: {
  qtyCheckedIn: number;
  qtyExpected: number;
  qtyRemaining: number;
  qtyOverage: number;
  checkedInItemCount: number;
  distinctProducts: number;
  batchCount: number;
  disputedCount: number;
  productsChipLabel?: string | null;
  /** P7 collapse: "⊟ Rows 1, 2, 3 as one" — tiles show COMBINED group numbers. */
  groupChipLabel?: string | null;
  onBackToQueue: () => void;
  googleHref: string | null;
  onShowAllThisProduct?: () => void;
  productFilterActive?: boolean;
}) {
  return (
    <Box
      sx={{
        flexShrink: 0,
        px: { xs: 1.5, md: 2 },
        py: { xs: 1, md: 1.15 },
        borderBottom: 1,
        borderColor: processingTokens.rowStatusHeaderBorder,
        bgcolor: processingTokens.rowStatusHeaderBg,
        color: processingTokens.rowStatusHeaderText,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Button
          size="small"
          startIcon={<ArrowBack sx={{ fontSize: 17 }} />}
          onClick={onBackToQueue}
          sx={{ minHeight: 30, py: 0, px: 0.75, color: processingTokens.rowStatusHeaderText, flexShrink: 0 }}
        >
          Back to Queue
        </Button>
        {googleHref ?
          <Button
            size="small"
            component="a"
            href={googleHref}
            target="_blank"
            rel="noopener noreferrer"
            startIcon={<Search sx={{ fontSize: 17 }} />}
            aria-label="Search on Google"
            sx={{ minHeight: 30, py: 0, px: 0.75, color: processingTokens.rowStatusHeaderText, flexShrink: 0 }}
          >
            Google
          </Button>
        : null}
        <Box sx={{ flex: 1, minWidth: 8 }} />
        <Stack direction="row" spacing={0.65} flexWrap="wrap" useFlexGap alignItems="center" justifyContent="flex-end">
          {groupChipLabel ?
            <Chip
              size="small"
              label={groupChipLabel}
              sx={{
                height: 22,
                fontSize: '0.6875rem',
                fontWeight: 800,
                bgcolor: 'rgba(255,255,255,0.16)',
                color: 'inherit',
              }}
            />
          : null}
          <ManifestStatTile label="Expected" value={qtyExpected} size="header" />
          <ManifestStatTile label="Checked in" value={qtyCheckedIn} tone="primary" size="header" />
          <ManifestStatTile label="Left" value={qtyRemaining} tone={qtyRemaining > 0 ? 'warning' : 'default'} size="header" />
          {qtyOverage > 0 ? <ManifestStatTile label="Over" value={`+${qtyOverage}`} tone="error" size="header" /> : null}
          {disputedCount > 0 ? <ManifestStatTile label="Disputed" value={disputedCount} tone="warning" size="header" /> : null}
          <ManifestStatTile label="Items" value={checkedInItemCount} size="header" />
          <ManifestStatTile label="Products" value={distinctProducts} size="header" />
          {batchCount > 0 ? <ManifestStatTile label="Batches" value={batchCount} size="header" /> : null}
          {distinctProducts >= 2 && productsChipLabel ?
            <Chip
              size="small"
              label={productsChipLabel}
              sx={{ height: 22, fontSize: '0.6875rem', fontWeight: 700 }}
            />
          : null}
        </Stack>
        {onShowAllThisProduct ?
          <Button
            size="small"
            variant="outlined"
            startIcon={<FilterAlt sx={{ fontSize: 15 }} />}
            onClick={onShowAllThisProduct}
            sx={{ minHeight: 30, flexShrink: 0 }}
          >
            {productFilterActive ? 'Clear filter' : 'This product'}
          </Button>
        : null}
      </Box>
    </Box>
  );
}

type ManifestFieldVariant = 'hero' | 'block' | 'stat' | 'pill';

function resolveSelectOptions(
  options: readonly string[],
  currentRaw: string,
  isKnown: (v: string) => boolean = (v) => options.includes(v),
): string[] {
  const current = currentRaw.trim();
  if (current && !isKnown(current)) return [...options, current];
  return [...options];
}

function manifestFieldLayout(
  variant: ManifestFieldVariant,
  multiline: boolean,
  emphasis: 'compact' | 'normal' | 'emphasized' = 'normal',
) {
  if (multiline) {
    return { shellMinHeight: 52, valueFontSize: '0.8125rem', valueFontWeight: 600, showLabel: true };
  }
  if (variant === 'hero') {
    return { shellMinHeight: 32, valueFontSize: '1rem', valueFontWeight: 700, showLabel: false };
  }
  if (variant === 'pill') {
    const valueFontSize =
      emphasis === 'compact' ? PROCESSING_ROW_VALUE_FONT_COMPACT
      : emphasis === 'emphasized' ? PROCESSING_ROW_VALUE_FONT_EMPHASIZED
      : PROCESSING_ROW_VALUE_FONT;
    return {
      shellMinHeight: PROCESSING_ROW_FIELD_HEIGHT,
      valueFontSize,
      valueFontWeight: PROCESSING_ROW_VALUE_FONT_WEIGHT,
      showLabel: true,
    };
  }
  return { shellMinHeight: 28, valueFontSize: '0.8125rem', valueFontWeight: 600, showLabel: true };
}

function FieldEditSegment({
  kind,
  onClick,
  onPointerDown,
  disabled,
  ariaLabel,
}: {
  kind: 'save' | 'cancel';
  onClick: () => void;
  onPointerDown?: () => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <Box
      component="button"
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onMouseDown={(e) => {
        e.preventDefault();
        onPointerDown?.();
      }}
      onClick={onClick}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 0.35,
        width: PROCESSING_ROW_EDIT_SEGMENT_WIDTH,
        minWidth: PROCESSING_ROW_EDIT_SEGMENT_WIDTH,
        m: 0,
        border: 0,
        borderLeft: '1px solid',
        borderColor: processingTokens.border,
        bgcolor: processingTokens.clearSegmentBg,
        cursor: disabled ? 'default' : 'pointer',
        font: 'inherit',
        color: kind === 'save' ? processingTokens.accentGreen : processingTokens.textSoft,
        flexShrink: 0,
        alignSelf: 'stretch',
        opacity: disabled ? 0.45 : 1,
        transition: (theme) => theme.transitions.create(['background-color', 'color']),
        '&:hover':
          disabled ? {}
          : {
              bgcolor: processingTokens.primarySoftStrong,
              color: processingTokens.textStrong,
            },
      }}
    >
      {kind === 'save' ?
        <Check sx={{ fontSize: PROCESSING_ROW_EDIT_ICON_SIZE }} />
      : <Close sx={{ fontSize: PROCESSING_ROW_EDIT_ICON_SIZE }} />}
    </Box>
  );
}

const manifestInputSx = {
  flex: 1,
  minWidth: 0,
  width: '100%',
  border: 0,
  outline: 0,
  bgcolor: 'transparent',
  font: 'inherit',
  color: 'text.primary',
  px: 0.75,
  py: 0,
  m: 0,
  fontSize: PROCESSING_ROW_VALUE_FONT,
  fontWeight: PROCESSING_ROW_VALUE_FONT_WEIGHT,
  '&::placeholder': { color: processingTokens.textMute, opacity: 1 },
} as const;

function ManifestField({
  fieldId,
  label,
  value,
  displayValue,
  currency = false,
  multiline = false,
  variant = 'block',
  selectOptions,
  emphasis = 'normal',
  onSave,
}: {
  fieldId?: ManifestFieldId;
  label: string;
  value: string;
  displayValue?: string;
  currency?: boolean;
  multiline?: boolean;
  variant?: ManifestFieldVariant;
  selectOptions?: readonly string[];
  emphasis?: 'compact' | 'normal' | 'emphasized';
  onSave: (value: string) => void | Promise<void>;
}) {
  const nav = useContext(ManifestFieldNavContext);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [optimisticValue, setOptimisticValue] = useState<string | null>(null);
  const [selectMenuOpen, setSelectMenuOpen] = useState(false);
  const editContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);
  const suppressBlurRef = useRef(false);
  const layout = manifestFieldLayout(variant, multiline, emphasis);
  const rawValue = optimisticValue ?? value;
  const effectiveRaw = currency ? rawValue : (optimisticValue ?? displayValue ?? value);
  const trimmed = effectiveRaw?.trim() ?? '';
  const isEmpty = !trimmed;
  const shown = currency ? (isEmpty ? '—' : formatCurrency(rawValue)) : (trimmed || '—');
  const pillPlaceholder = `Add ${label.toLowerCase()}`;
  const resolvedSelectOptions = useMemo(
    () => (selectOptions ? resolveSelectOptions(selectOptions, draft || rawValue, isTaxonomyV1CategoryName) : []),
    [selectOptions, draft, rawValue],
  );

  useEffect(() => {
    setDraft(value);
    if (optimisticValue != null && value === optimisticValue) {
      setOptimisticValue(null);
    }
  }, [value, optimisticValue]);

  const beginEdit = useCallback(() => {
    const nextDraft = selectOptions ? (optimisticValue ?? value) : (currency ? rawValue : effectiveRaw);
    setDraft(nextDraft);
    setEditing(true);
    if (selectOptions) setSelectMenuOpen(true);
  }, [selectOptions, optimisticValue, value, currency, rawValue, effectiveRaw]);

  useEffect(() => {
    if (!fieldId || !nav) return;
    return nav.registerOpener(fieldId, beginEdit);
  }, [fieldId, nav, beginEdit]);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    if (inputRef.current instanceof HTMLInputElement || inputRef.current instanceof HTMLTextAreaElement) {
      inputRef.current.select();
    }
  }, [editing, selectMenuOpen]);

  function armSuppressBlur() {
    suppressBlurRef.current = true;
  }

  function releaseSuppressBlur() {
    window.setTimeout(() => {
      suppressBlurRef.current = false;
    }, 0);
  }

  function cancelEdit() {
    armSuppressBlur();
    setDraft(selectOptions ? (optimisticValue ?? value) : (currency ? rawValue : effectiveRaw));
    setSelectMenuOpen(false);
    setEditing(false);
    releaseSuppressBlur();
  }

  function confirmEdit(nextValue: string = draft, tabDirection?: 1 | -1) {
    const normalized = currency ? sanitizeDecimalPaste(nextValue.trim()) : nextValue;
    armSuppressBlur();
    setOptimisticValue(normalized);
    setDraft(normalized);
    setSelectMenuOpen(false);
    setEditing(false);
    window.setTimeout(() => {
      releaseSuppressBlur();
      void Promise.resolve(onSave(normalized)).catch(() => {
        setOptimisticValue(null);
      });
      if (fieldId && nav && tabDirection) {
        nav.focusAdjacent(fieldId, tabDirection);
      }
    }, 0);
  }

  function handleBlur(e: FocusEvent) {
    if (selectOptions) return;
    if (suppressBlurRef.current) return;
    const related = e.relatedTarget as Node | null;
    if (editContainerRef.current?.contains(related)) return;
    cancelEdit();
  }

  function handleCancelClick() {
    cancelEdit();
  }

  function handleSaveClick() {
    confirmEdit(draft);
  }

  function handleEditorKeyDown(e: KeyboardEvent, allowTabNavigate: boolean) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
      return;
    }
    if (e.key === 'Tab' && allowTabNavigate) {
      e.preventDefault();
      confirmEdit(draft, e.shiftKey ? -1 : 1);
      return;
    }
    if (e.key === 'Enter' && !multiline) {
      e.preventDefault();
      confirmEdit(draft);
      return;
    }
    if (e.key === 'Enter' && multiline && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      confirmEdit(draft);
    }
  }

  const shellBorderColor =
    editing || variant === 'pill' ?
      editing ? processingTokens.borderStrong
      : processingTokens.border
    : 'transparent';

  const hoverTooltip = !editing && !isEmpty ? shown : '';

  const fieldShell = (
      <Box
        ref={editContainerRef}
        onClick={!editing ? beginEdit : undefined}
        sx={{
          display: 'flex',
          alignItems: 'stretch',
          width: variant === 'pill' ? '100%' : undefined,
          minHeight: layout.shellMinHeight,
          ...(editing && variant === 'pill' ?
            { minWidth: PROCESSING_ROW_PILL_EDIT_MIN_WIDTH, flexShrink: 0 }
          : {}),
          borderRadius: 1,
          border: '1px solid',
          borderColor: shellBorderColor,
          bgcolor: editing ? processingTokens.surfaceTint : variant === 'pill' ? (t) => alpha(t.palette.background.default, 0.4) : 'transparent',
          overflow: 'hidden',
          cursor: editing ? 'default' : 'pointer',
          transition: (theme) =>
            theme.transitions.create(['background-color', 'border-color', 'box-shadow', 'opacity'], { duration: 120 }),
          boxShadow: editing && variant !== 'pill' ? processingTokens.focusRing : 'none',
          ...(!editing ?
            {
              '&:hover': {
                bgcolor: 'action.hover',
                borderColor: variant === 'pill' ? processingTokens.borderStrong : processingTokens.border,
              },
            }
          : {}),
        }}
      >
        {editing ?
          <>
            {selectOptions ?
              <TextField
                select
                variant="standard"
                size="small"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => handleEditorKeyDown(e as KeyboardEvent, true)}
                slotProps={{
                  select: {
                    open: selectMenuOpen,
                    onOpen: () => setSelectMenuOpen(true),
                    onClose: () => setSelectMenuOpen(false),
                    inputRef,
                  },
                  input: {
                    sx: {
                      fontSize: layout.valueFontSize,
                      fontWeight: layout.valueFontWeight,
                      px: 1,
                      py: 0.25,
                      '&:before, &:after': { display: 'none' },
                    },
                  },
                }}
                sx={{
                  flex: 1,
                  minWidth: 0,
                  m: 0,
                  ...(variant === 'pill' ? { height: PROCESSING_ROW_FIELD_HEIGHT } : {}),
                  '& .MuiInput-root': { alignItems: 'center', ...(variant === 'pill' ? { height: '100%' } : {}) },
                  '& .MuiSelect-select': {
                    display: 'flex',
                    alignItems: 'center',
                    minHeight: 'unset',
                    py: 0.25,
                  },
                }}
              >
                <MenuItem value="">
                  <em>—</em>
                </MenuItem>
                {resolvedSelectOptions.map((opt) => (
                  <MenuItem key={opt} value={opt} dense>
                    {opt}
                    {!isTaxonomyV1CategoryName(opt) ? ' (legacy)' : ''}
                  </MenuItem>
                ))}
              </TextField>
            : multiline ?
              <Box
                component="textarea"
                ref={inputRef}
                value={draft}
                rows={2}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={(e) => handleEditorKeyDown(e, true)}
                sx={{
                  ...manifestInputSx,
                  fontSize: layout.valueFontSize,
                  fontWeight: layout.valueFontWeight,
                  resize: 'none',
                  lineHeight: 1.25,
                  py: 0.5,
                  alignSelf: 'stretch',
                }}
              />
            : currency
              ? <Box
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.25,
                    pl: 1,
                  }}
                >
                  <Typography
                    component="span"
                    sx={{
                      color: 'text.secondary',
                      fontWeight: 600,
                      fontSize: layout.valueFontSize,
                      lineHeight: 1,
                      flexShrink: 0,
                    }}
                  >
                    $
                  </Typography>
                  <Box
                    component="input"
                    ref={inputRef}
                    value={draft}
                    inputMode="decimal"
                    onChange={(e) => setDraft(sanitizeDecimalPaste(e.target.value))}
                    onBlur={handleBlur}
                    onKeyDown={(e) => handleEditorKeyDown(e, true)}
                    onWheel={preventWheelChangeNumber}
                    onPaste={(e) => {
                      e.preventDefault();
                      setDraft(sanitizeDecimalPaste(e.clipboardData.getData('text')));
                    }}
                    sx={{
                      ...manifestInputSx,
                      flex: 1,
                      minWidth: 0,
                      px: 0,
                      fontSize: layout.valueFontSize,
                      fontWeight: layout.valueFontWeight,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  />
                </Box>
              : <Box
                  component="input"
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={handleBlur}
                  onKeyDown={(e) => handleEditorKeyDown(e, true)}
                  sx={{
                    ...manifestInputSx,
                    fontSize: layout.valueFontSize,
                    fontWeight: layout.valueFontWeight,
                  }}
                />
            }
            <FieldEditSegment
              kind="cancel"
              ariaLabel={`Cancel ${label}`}
              onPointerDown={armSuppressBlur}
              onClick={handleCancelClick}
            />
            <FieldEditSegment
              kind="save"
              ariaLabel={`Save ${label}`}
              onPointerDown={armSuppressBlur}
              onClick={handleSaveClick}
            />
          </>
        : <Box
            sx={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              alignItems: multiline ? 'flex-start' : 'center',
              px: 0.75,
              py: multiline ? 0.5 : 0,
              gap: 0.5,
            }}
          >
            <Typography
              sx={{
                flex: 1,
                minWidth: 0,
                fontSize: layout.valueFontSize,
                fontWeight: layout.valueFontWeight,
                lineHeight: 1.25,
                wordBreak: 'break-word',
                color: isEmpty ? 'text.disabled' : 'text.primary',
                fontStyle: isEmpty && variant === 'pill' ? 'italic' : 'normal',
                ...(multiline ?
                  {
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }
                : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: multiline ? 'normal' : 'nowrap' }),
              }}
            >
              {variant === 'pill' && isEmpty ? pillPlaceholder : shown}
            </Typography>
          </Box>
        }
      </Box>
  );

  return (
    <Box
      sx={{
        minWidth: editing && variant === 'pill' ? PROCESSING_ROW_PILL_EDIT_MIN_WIDTH : 0,
        width: variant === 'pill' ? '100%' : undefined,
        py: variant === 'hero' ? 0.25 : 0.35,
        px: variant === 'pill' ? 0 : 0.75,
      }}
    >
      {layout.showLabel ?
        <Typography
          variant="caption"
          color="text.secondary"
          fontWeight={editing ? 600 : 400}
          sx={processingRowLabelSx}
        >
          {label}
        </Typography>
      : null}

      {hoverTooltip ?
        <Tooltip title={hoverTooltip} enterDelay={350} disableInteractive>
          <Box component="span" sx={{ display: 'block', minWidth: 0 }}>
            {fieldShell}
          </Box>
        </Tooltip>
      : fieldShell}
    </Box>
  );
}

function ManifestStatTile({
  label,
  value,
  tone = 'default',
  size = 'compact',
}: {
  label: string;
  value: string | number;
  tone?: 'default' | 'primary' | 'warning' | 'error';
  size?: 'compact' | 'header';
}) {
  const theme = useTheme();
  const toneColor =
    tone === 'primary' ? theme.palette.primary.main
    : tone === 'warning' ? theme.palette.warning.main
    : tone === 'error' ? theme.palette.error.main
    : theme.palette.text.primary;
  const isHeader = size === 'header';

  return (
    <Box
      sx={{
        px: isHeader ? 1.25 : 0.85,
        py: isHeader ? 0.65 : 0.4,
        borderRadius: 1,
        bgcolor: alpha(toneColor, tone === 'default' ? 0.04 : 0.08),
        border: 1,
        borderColor: alpha(toneColor, 0.12),
        minWidth: isHeader ? 72 : 56,
        textAlign: 'center',
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', fontSize: isHeader ? '0.72rem' : '0.62rem', lineHeight: 1.1, fontWeight: isHeader ? 700 : 400 }}
      >
        {label}
      </Typography>
      <Typography variant={isHeader ? 'h6' : 'body2'} fontWeight={800} sx={{ color: toneColor, lineHeight: 1.15 }}>
        {value}
      </Typography>
    </Box>
  );
}

export interface ProcessingActiveCardProps {
  orderId: number;
  row: ProcessingWorkspaceRowDTO;
  activeItem: ProcessingWorkspaceItemDTO | null;
  onSelectItemId: (itemId: number) => void;
  onBackToQueue: () => void;
  onCheckIn: (payload: Record<string, unknown>, options?: { printLabels?: boolean }) => Promise<boolean>;
  checkInLoading: boolean;
  onPatchCheckedIn: (payload: Record<string, unknown>) => void;
  patchLoading: boolean;
  onReprintItems?: (items: ProcessingWorkspaceItemDTO[]) => Promise<void>;
  onShowAllThisProduct?: () => void;
  productFilterActive?: boolean;
  onPatchRowDefaults?: (payload: Record<string, unknown>) => void | Promise<void>;
  /** Opens Check in together pre-seeded with this row's same-product peers (P5). */
  onOpenCheckInTogether?: () => void;
  /** Opens the Add item dialog (added-row CTA). */
  onAddItem?: () => void;
  /** Scroll detail to prior check-ins (N-products chip from queue). */
  scrollToHistory?: boolean;
  onScrollToHistoryDone?: () => void;
}

export function ProcessingActiveCard({
  orderId,
  row,
  activeItem,
  onSelectItemId,
  onBackToQueue,
  onCheckIn,
  checkInLoading,
  onReprintItems,
  onShowAllThisProduct,
  productFilterActive,
  onPatchRowDefaults,
  onOpenCheckInTogether,
  onAddItem,
  scrollToHistory,
  onScrollToHistoryDone,
}: ProcessingActiveCardProps) {
  const { enqueueSnackbar } = useSnackbar();
  const priorCheckInsRef = useRef<HTMLDivElement | null>(null);
  const { hasRole } = useAuth();
  const isManager = hasRole('Manager') || hasRole('Admin');
  const remapBatch = useRemapCheckInBatchProduct(orderId);
  const breakApartRow = useProcessingBreakApartRow(orderId);
  const makeSetRow = useProcessingMakeSetRow(orderId);
  const restartRow = useProcessingRestartRow(orderId);
  const [transformMode, setTransformMode] = useState<ProcessingTransformMode | null>(null);
  const [restartSummary, setRestartSummary] = useState<ProcessingRestartSummary | null>(null);
  const [remapTarget, setRemapTarget] = useState<CheckedInHistoryRow | null>(null);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkInSeed, setCheckInSeed] = useState<ProcessingCheckInSeed | null>(null);
  const [identifiersModalOpen, setIdentifiersModalOpen] = useState(false);
  const [tagsModalOpen, setTagsModalOpen] = useState(false);
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const identifiersEditorRef = useRef<ManifestModalEditorHandle>(null);
  const tagsEditorRef = useRef<ManifestModalEditorHandle>(null);
  const notesEditorRef = useRef<ManifestModalEditorHandle>(null);

  const closeIdentifiersModal = useCallback(() => {
    identifiersEditorRef.current?.cancel();
    setIdentifiersModalOpen(false);
  }, []);

  const confirmIdentifiersModal = useCallback(() => {
    if (identifiersEditorRef.current?.save()) {
      setIdentifiersModalOpen(false);
    }
  }, []);

  const closeTagsModal = useCallback(() => {
    tagsEditorRef.current?.cancel();
    setTagsModalOpen(false);
  }, []);

  const confirmTagsModal = useCallback(() => {
    if (tagsEditorRef.current?.save()) {
      setTagsModalOpen(false);
    }
  }, []);

  const closeNotesModal = useCallback(() => {
    notesEditorRef.current?.cancel();
    setNotesModalOpen(false);
  }, []);

  const confirmNotesModal = useCallback(() => {
    if (notesEditorRef.current?.save()) {
      setNotesModalOpen(false);
    }
  }, []);
  const [conditionUi, setConditionUi] = useState(CONDITION_OPTIONS[3]);
  const [dispatch, setDispatch] = useState('on_shelf');
  const [retail, setRetail] = useState('');
  const [price, setPrice] = useState('');

  const product = row.product;
  const isAddedRow = row.rowKind === 'added';
  const displayTitle = row.title || (isAddedRow ? 'Added item' : 'Manifest line');
  const priorCheckIns = useMemo(() => (row.items ?? []).filter(isCheckedInItem), [row.items]);
  const checkInBatches = row.checkInBatches ?? [];
  const historyRows = useMemo(
    () => buildCheckedInHistoryRows(row.items, checkInBatches),
    [row.items, checkInBatches],
  );
  const productGroups = useMemo(
    () => buildProductGroupedHistory(row.items, checkInBatches),
    [row.items, checkInBatches],
  );
  const checkedInItemCount = priorCheckIns.length;
  const distinctProducts = row.distinctProductCount ?? distinctProductCount(priorCheckIns);
  const productsChipLabel = queueProductsChipLabel(distinctProducts);
  const isMixedProductRow = distinctProducts >= 2;
  const [mixedProductId, setMixedProductId] = useState<number | null>(null);
  /** Pending quick check-in waiting on the new-vs-existing product decision (P8c). */
  const [productPrompt, setProductPrompt] = useState<{ printLabels: boolean; quantity: number } | null>(null);
  /** Pending large quick check-in awaiting volume confirmation ("type PRINT <qty>"). */
  const [volumeConfirm, setVolumeConfirm] = useState<{ printLabels: boolean; quantity: number } | null>(null);
  useEffect(() => {
    setMixedProductId(null);
    setProductPrompt(null);
    setVolumeConfirm(null);
    setTransformMode(null);
    setRestartSummary(null);
  }, [row.processing_row_id]);
  useEffect(() => {
    if (!scrollToHistory || !priorCheckInsRef.current) return;
    const el = priorCheckInsRef.current;
    const t = window.setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      onScrollToHistoryDone?.();
    }, 50);
    return () => window.clearTimeout(t);
  }, [scrollToHistory, row.processing_row_id, onScrollToHistoryDone]);
  const mixedProductOptions = useMemo(
    () =>
      productGroups
        .filter((g): g is typeof g & { productId: number } => g.productId != null)
        .map((g) => ({ id: g.productId, label: g.productLabel, qty: g.totalQty })),
    [productGroups],
  );
  const mixedQuickCheckInReason = 'Multiple products on this row — pick one above or use Detailed check-in.';
  const batchCount = checkInBatches.length;
  const disputedCount = useMemo(() => disputedItemCount(priorCheckIns), [priorCheckIns]);

  // P7 collapse: a master's tiles/caps cover the WHOLE group (5/3/7 ⇒ Expected 15).
  const effQty = effectiveRowQty(row);
  const qtyExpected = effQty.qty;
  const qtyCheckedIn = effQty.dispositioned;
  const qtyRemaining = effQty.remaining;
  const qtyOverage = effQty.overage;
  const collapseGroupLabel =
    row.collapsedGroup ?
      `⊟ Rows ${[row.rowNum, ...row.collapsedGroup.memberRowNumbers].join(', ')} as one`
    : null;
  const googleQuery = useMemo(
    () =>
      buildProcessingGoogleQuery({
        brand: row.brand || product?.brand,
        title: displayTitle,
        model: row.model || product?.model,
        searchTags: parseSearchTagsCsv(row.tags || product?.tags),
      }),
    [row.brand, row.model, row.tags, displayTitle, product?.brand, product?.model, product?.tags],
  );
  const googleHref = googleSearchUrl(googleQuery);
  const activeStatus = activeItem?.status ?? 'intake';
  const terminalDisputed = activeStatus === 'scrapped' || activeStatus === 'lost';
  const salvageLocked = conditionUi === 'Salvage' || activeItem?.condition === 'salvage';

  useEffect(() => {
    setConditionUi(activeItem?.condition_label || CONDITION_OPTIONS[3]);
    setDispatch(activeItem?.dispatch || row.dispatch || 'on_shelf');
    setRetail(activeItem?.retail ?? row.unitRetail ?? '');
    setPrice(activeItem?.price ?? row.price ?? '');
  }, [activeItem?.id, activeItem?.condition_label, activeItem?.dispatch, activeItem?.retail, activeItem?.price, row.dispatch, row.unitRetail, row.price]);

  useEffect(() => {
    if (conditionUi === 'Salvage') setDispatch('salvage');
  }, [conditionUi]);

  async function patchRow(payload: Record<string, unknown>) {
    await Promise.resolve(onPatchRowDefaults?.({ processing_row_id: row.processing_row_id, ...payload }));
  }

  function handleSelectPriorCheckIn(itemId: number) {
    onSelectItemId(itemId);
    const item = priorCheckIns.find((it) => it.id === itemId);
    if (!item) return;
    const batch = checkInBatches.find((b) => b.item_ids.includes(itemId)) ?? null;
    setCheckInSeed({ item, batch });
    setCheckInOpen(true);
  }

  function openDetailedCheckIn() {
    setCheckInSeed(null);
    setCheckInOpen(true);
  }

  function closeDetailedCheckIn() {
    setCheckInOpen(false);
    setCheckInSeed(null);
  }

  async function submitQuickCheckIn(
    productAction: { product_mode: 'new' | 'existing'; product_id?: number },
    printLabels: boolean,
    quantity: number,
  ) {
    await onCheckIn(
      {
        ...productAction,
        quantity,
        condition: normalizeProcessingCondition(conditionUi),
        dispatch,
        retail: retail || row.unitRetail || undefined,
        unit_retail: retail || row.unitRetail || undefined,
        price: price || row.price || undefined,
        title: displayTitle,
        brand: row.brand || product?.brand,
        model: row.model || product?.model,
        category: row.category || product?.category,
        upc: String((row.identifiers as { upc?: string })?.upc || product?.upc || ''),
        specifications: row.specs || product?.specs || undefined,
        search_tags: row.tags || undefined,
        notes: row.manifestNotes || undefined,
      },
      { printLabels },
    );
  }

  async function quickCheckInResolved(printLabels: boolean, quantity: number) {
    const productAction =
      isMixedProductRow && mixedProductId != null ?
        { product_mode: 'existing' as const, product_id: mixedProductId }
      : resolveQuickCheckInProduct(row);
    if (productAction.product_mode === 'new') {
      // P8c: never silently invent a product — ask new-vs-existing explicitly.
      setProductPrompt({ printLabels, quantity });
      return;
    }
    await submitQuickCheckIn(productAction, printLabels, quantity);
  }

  async function quickCheckIn(printLabels: boolean, quantity: number) {
    if (isLargeCheckIn(quantity)) {
      // No cap — big runs confirm intent (and type PRINT <qty> when printing).
      setVolumeConfirm({ printLabels, quantity });
      return;
    }
    await quickCheckInResolved(printLabels, quantity);
  }

  const mixedProductPicker = isMixedProductRow ?
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', mr: 0.25 }}>
        {distinctProducts} products on this row — check in as:
      </Typography>
      {mixedProductOptions.map((opt) => (
        <Chip
          key={opt.id}
          size="small"
          label={`${opt.label} (${opt.qty})`}
          color={mixedProductId === opt.id ? 'primary' : 'default'}
          variant={mixedProductId === opt.id ? 'filled' : 'outlined'}
          onClick={() => setMixedProductId(opt.id)}
          sx={{ height: 24, fontSize: '0.7rem', fontWeight: 600, maxWidth: 240 }}
        />
      ))}
      <Chip
        size="small"
        label="Other…"
        variant="outlined"
        onClick={openDetailedCheckIn}
        sx={{ height: 24, fontSize: '0.7rem', fontWeight: 600 }}
      />
    </Box>
  : null;

  const quickCheckInPanel = !isAddedRow ?
    <ProcessingQuickCheckInFooter
      variant="section"
      sectionTitle="Quick check-in"
      sectionNote="Use Quick check-in when you do not need to change product or item information. Use Detailed check-in when checking in a batch with different product information."
      topContent={mixedProductPicker}
      qtyRemaining={qtyRemaining}
      checkInLoading={checkInLoading}
      conditionUi={conditionUi}
      dispatch={dispatch}
      price={price}
      salvageLocked={salvageLocked}
      quickCheckInDisabled={isMixedProductRow && mixedProductId == null}
      quickCheckInDisabledReason={mixedQuickCheckInReason}
      onConditionChange={setConditionUi}
      onDispatchChange={setDispatch}
      onPriceChange={setPrice}
      onCheckInPrint={(quantity) => void quickCheckIn(true, quantity)}
      onCheckInNoPrint={(quantity) => void quickCheckIn(false, quantity)}
      onDetailedCheckIn={openDetailedCheckIn}
    />
  : null;

  async function handleRemapBatch(payload: Record<string, unknown>) {
    if (!remapTarget?.batchId) return;
    try {
      await remapBatch.mutateAsync({ batchId: remapTarget.batchId, payload });
      enqueueSnackbar('Batch product remapped.', { variant: 'success' });
      setRemapTarget(null);
    } catch (err) {
      enqueueSnackbar(apiErrorDetail(err, 'Batch remap failed'), { variant: 'error' });
    }
  }

  // P9 transforms (Break apart / Make set / Restart) — manager action, original rows only.
  const canTransform =
    isManager
    && !isAddedRow
    && row.manifest_row_id != null
    && row.splitParentId == null
    && row.collapseMasterId == null
    && !row.collapsedGroup;
  const canRestart = isManager && (row.splitFamily?.canRestart ?? false);

  async function handleTransformSubmit(payload: Record<string, unknown>) {
    const mutation = transformMode === 'break_apart' ? breakApartRow : makeSetRow;
    try {
      const data = await mutation.mutateAsync(payload);
      setTransformMode(null);
      enqueueSnackbar(
        data.sub_processing_row_id != null
          ? 'Sub row created — the remainder stays on this row.'
          : 'Row converted.',
        { variant: 'success' },
      );
    } catch (err) {
      enqueueSnackbar(apiErrorDetail(err, 'Transform failed'), { variant: 'error' });
    }
  }

  async function openRestartConfirm() {
    try {
      const data = await restartRow.mutateAsync({ processing_row_id: row.processing_row_id });
      setRestartSummary(data.summary);
    } catch (err) {
      enqueueSnackbar(apiErrorDetail(err, 'Restart unavailable'), { variant: 'error' });
    }
  }

  async function handleRestartConfirm() {
    try {
      const data = await restartRow.mutateAsync({
        processing_row_id: row.processing_row_id,
        confirm: true,
      });
      setRestartSummary(null);
      enqueueSnackbar(
        `Row ${data.summary.root_row_number} restarted — ${data.summary.item_count} item(s) removed.`,
        { variant: 'success' },
      );
      // A restarted SUB row no longer exists; return to the queue rather than a dead detail.
      if (row.splitParentId != null) onBackToQueue();
    } catch (err) {
      enqueueSnackbar(apiErrorDetail(err, 'Restart failed'), { variant: 'error' });
    }
  }

  // P8d: defaults live at the TOP of the detail body (owner: "must see details of what
  // we're dealing with"), expanded by default; collapsible to reclaim space.
  const rowDefaultsSection = !isAddedRow ? (
    <Box sx={{ flexShrink: 0, mb: 1, minWidth: 0, width: '100%' }}>
      <ProcessingRowSection
        title="Row defaults"
        note="Every check-in from this row starts from these values — edit them to change what future check-ins prefill."
        surface="rowDetail"
        collapsible
        sx={{ mb: 0, minWidth: 0 }}
        bodySx={processingRowManifestBodySx}
      >
        <ManifestFieldNavProvider>
          <ManifestModalNavBridge
            onOpenIdentifiers={() => setIdentifiersModalOpen(true)}
            onOpenTags={() => setTagsModalOpen(true)}
            onOpenNotes={() => setNotesModalOpen(true)}
          />
          <Box sx={processingRowManifestToolbarRowSx}>
            <ManifestToolbarSlot sx={manifestToolbarRowSx}>
              <ManifestToolbarPill
                label="Row"
                value={String(row.rowNum)}
                appearance="display"
                emptyItalic={false}
              />
            </ManifestToolbarSlot>
            <ManifestToolbarSlot sx={manifestToolbarTitleSx}>
              <ManifestField fieldId="title" label="Title" value={row.title || ''} variant="pill" emphasis="compact" onSave={(v) => patchRow({ title: v.trim() })} />
            </ManifestToolbarSlot>
            <ManifestToolbarSlot sx={manifestToolbarCompactFieldSx}>
              <ManifestField fieldId="brand" label="Brand" value={row.brand || ''} variant="pill" emphasis="compact" onSave={(v) => patchRow({ brand: v })} />
            </ManifestToolbarSlot>
            <ManifestToolbarSlot sx={manifestToolbarCompactFieldSx}>
              <ManifestField fieldId="model" label="Model" value={row.model || ''} variant="pill" emphasis="compact" onSave={(v) => patchRow({ model: v })} />
            </ManifestToolbarSlot>
            <ManifestToolbarSlot sx={manifestToolbarEditablePillSlotSx}>
              <ManifestField
                fieldId="category"
                label="Category"
                value={row.category || ''}
                variant="pill"
                selectOptions={TAXONOMY_V1_CATEGORY_NAMES}
                onSave={(v) => patchRow({ category: v })}
              />
            </ManifestToolbarSlot>
            <ManifestToolbarSlot sx={manifestToolbarMoneyFieldSx}>
              <ManifestField fieldId="unitRetail" label="Retail" currency value={row.unitRetail ?? ''} variant="pill" onSave={(v) => patchRow({ unit_retail: v || undefined })} />
            </ManifestToolbarSlot>
            <ManifestToolbarSlot sx={manifestToolbarMoneyFieldSx}>
              <ManifestField fieldId="price" label="Price" currency value={row.price ?? ''} variant="pill" onSave={(v) => patchRow({ shelf_price: v || undefined })} />
            </ManifestToolbarSlot>
            <ManifestModalField
              label="Identifiers"
              summary={identifiersSummary(row.identifiers ?? {})}
              open={identifiersModalOpen}
              onOpen={() => setIdentifiersModalOpen(true)}
              onCancel={closeIdentifiersModal}
              onConfirm={confirmIdentifiersModal}
              editorRef={identifiersEditorRef}
              minWidth={132}
              maxWidth={260}
              valueFontSize={manifestToolbarEmphasisFieldSx.valueFontSize}
              valueFontWeight={manifestToolbarEmphasisFieldSx.valueFontWeight}
            >
              <ManifestIdentifiersField
                ref={identifiersEditorRef}
                presentation="modal"
                value={row.identifiers ?? {}}
                onSave={(identifiers) => patchRow({ identifiers })}
              />
            </ManifestModalField>
            <ManifestModalField
              label="Tags"
              summary={tagsSummary(row.tags || '')}
              open={tagsModalOpen}
              onOpen={() => setTagsModalOpen(true)}
              onCancel={closeTagsModal}
              onConfirm={confirmTagsModal}
              editorRef={tagsEditorRef}
              minWidth={116}
              maxWidth={220}
              valueFontSize={manifestToolbarEmphasisFieldSx.valueFontSize}
              valueFontWeight={manifestToolbarEmphasisFieldSx.valueFontWeight}
            >
              <ManifestTagsField
                ref={tagsEditorRef}
                presentation="modal"
                value={row.tags || ''}
                onSave={(tags) => patchRow({ search_tags: tags })}
              />
            </ManifestModalField>
            <ManifestModalField
              label="Notes"
              summary={notesSummary(row.manifestNotes || '')}
              open={notesModalOpen}
              onOpen={() => setNotesModalOpen(true)}
              onCancel={closeNotesModal}
              onConfirm={confirmNotesModal}
              editorRef={notesEditorRef}
              minWidth={116}
              maxWidth={220}
              valueFontSize={manifestToolbarEmphasisFieldSx.valueFontSize}
              valueFontWeight={manifestToolbarEmphasisFieldSx.valueFontWeight}
            >
              <ManifestNotesField
                ref={notesEditorRef}
                value={row.manifestNotes || ''}
                onSave={(v) => patchRow({ notes: v })}
              />
            </ManifestModalField>
          </Box>
        </ManifestFieldNavProvider>
      </ProcessingRowSection>
    </Box>
  ) : null;

  return (
    <Card variant="outlined" sx={{ height: '100%', width: '100%', maxWidth: '100%', minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', borderRadius: 0 }}>
      <ProcessingRowHeader
        qtyCheckedIn={qtyCheckedIn}
        qtyExpected={qtyExpected}
        qtyRemaining={qtyRemaining}
        qtyOverage={qtyOverage}
        checkedInItemCount={checkedInItemCount}
        distinctProducts={distinctProducts}
        batchCount={batchCount}
        disputedCount={disputedCount}
        productsChipLabel={productsChipLabel}
        groupChipLabel={collapseGroupLabel}
        onBackToQueue={onBackToQueue}
        googleHref={googleHref}
        onShowAllThisProduct={onShowAllThisProduct}
        productFilterActive={productFilterActive}
      />

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          px: { xs: 1.25, md: 1.75 },
          py: { xs: 1, md: 1.25 },
          bgcolor: processingTokens.cardDeckBg,
        }}
      >
        <Box sx={{ flexShrink: 0, mb: 0.5, minWidth: 0, width: '100%' }}>
          <Box sx={{ px: 0.25, pb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap', minWidth: 0 }}>
              <Typography
                sx={{
                  fontWeight: 800,
                  fontSize: '1.05rem',
                  lineHeight: 1.25,
                  minWidth: 0,
                  wordBreak: 'break-word',
                }}
              >
                {product?.title?.trim() || displayTitle}
              </Typography>
              {product?.product_number ?
                <Chip
                  size="small"
                  label={product.product_number}
                  sx={{ height: 20, fontSize: '0.66rem', fontWeight: 700 }}
                />
              : null}
              {(product?.brand || row.brand)?.trim() ?
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                  {(product?.brand || row.brand).trim()}
                </Typography>
              : null}
            </Box>
            {row.productId && row.manifestEvidence ?
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mt: 0.25, fontStyle: 'italic' }}
              >
                Vendor said: {row.manifestEvidence.title}
                {row.manifestEvidence.brand ? ` · ${row.manifestEvidence.brand}` : ''}
              </Typography>
            : null}
            {(row.sameProductRowNumbers?.length ?? 0) > 0 ?
              <Alert
                severity="info"
                icon={<JoinFull sx={{ fontSize: 18 }} />}
                sx={{ mt: 0.75, py: 0.25, alignItems: 'center', '& .MuiAlert-message': { py: 0.4 } }}
                action={
                  onOpenCheckInTogether ?
                    <Button size="small" color="inherit" variant="outlined" onClick={onOpenCheckInTogether} sx={{ whiteSpace: 'nowrap' }}>
                      Check in together…
                    </Button>
                  : undefined
                }
              >
                Same product as row{(row.sameProductRowNumbers?.length ?? 0) === 1 ? '' : 's'}{' '}
                {(row.sameProductRowNumbers ?? []).join(', ')}
              </Alert>
            : null}
            {(row.unitsPerItem ?? 1) > 1 ?
              <Chip
                size="small"
                label={`Set of ${(row.unitsPerItem ?? 1).toLocaleString()} — one tag covers ${(row.unitsPerItem ?? 1).toLocaleString()} units`}
                sx={{ mt: 0.75, height: 22, fontSize: '0.7rem', fontWeight: 700 }}
              />
            : null}
            {row.splitParentId != null ?
              <Alert severity="info" sx={{ mt: 0.75, py: 0.25, '& .MuiAlert-message': { py: 0.4 } }}>
                Sub row {row.splitParentRowNumber != null && row.splitSeq != null ? `#${row.splitParentRowNumber}.${row.splitSeq}` : ''} —
                created by Break apart / Make set on row {row.splitParentRowNumber ?? row.splitFamily?.rootRowNumber}.
              </Alert>
            : null}
            {row.splitFamily && row.splitParentId == null ?
              <Alert
                severity="info"
                sx={{ mt: 0.75, py: 0.25, alignItems: 'center', '& .MuiAlert-message': { py: 0.4 } }}
                action={
                  canRestart ?
                    <Button
                      size="small"
                      color="inherit"
                      variant="outlined"
                      disabled={restartRow.isPending}
                      onClick={() => void openRestartConfirm()}
                      sx={{ whiteSpace: 'nowrap' }}
                    >
                      Restart row…
                    </Button>
                  : undefined
                }
              >
                {row.splitFamily.children.length ?
                  `Split into ${row.splitFamily.children
                    .map((c) => `#${row.splitFamily!.rootRowNumber}.${c.splitSeq ?? '?'} (${c.qty.toLocaleString()}${c.unitsPerItem > 1 ? ` × ${c.unitsPerItem.toLocaleString()}` : ''})`)
                    .join(', ')} — remainder stays here.`
                : 'This row was converted by Break apart / Make set.'}
              </Alert>
            : null}
            {canTransform ?
              <Stack direction="row" spacing={0.75} sx={{ mt: 0.75 }}>
                <Button size="small" variant="outlined" onClick={() => setTransformMode('break_apart')}>
                  Break apart…
                </Button>
                <Button size="small" variant="outlined" onClick={() => setTransformMode('make_set')}>
                  Make set…
                </Button>
              </Stack>
            : null}
          </Box>

          {rowDefaultsSection}

          {!isAddedRow ?
            quickCheckInPanel
          : (
            <Paper variant="outlined" sx={{ p: 1.25, mb: 1, borderColor: processingTokens.border, bgcolor: processingTokens.surfaceRaised }}>
              <Typography variant="body2" color="text.secondary">
                Added row — its units were created and checked in when it was added.
              </Typography>
              {onAddItem ?
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<Add sx={{ fontSize: 16 }} />}
                  onClick={onAddItem}
                  sx={{ mt: 0.75 }}
                >
                  Add more unmanifested units
                </Button>
              : null}
            </Paper>
          )}

          {terminalDisputed ?
            <Alert severity="error" variant="outlined" sx={{ py: 0.25, mb: 1 }}>
              Terminal dispute ({activeStatus}).
            </Alert>
          : null}
        </Box>

        <Box ref={priorCheckInsRef}>
        <ProcessingRowSection
          title="Prior check-ins"
          note="Prior check-in batches are listed below. Select a row to review or edit it."
          surface="priorCheckIns"
          fill
          sx={{ mb: 0, minWidth: 0 }}
          bodySx={{ p: 0, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        >
          {batchCount > 0 ?
            <Stack
              direction="row"
              spacing={0.25}
              flexWrap="wrap"
              useFlexGap
              sx={{ mb: 0.5, flexShrink: 0, px: { xs: 1.25, md: 1.5 }, pt: 1 }}
            >
              {checkInBatches.map((batch) => (
                <Button
                  key={batch.id}
                  size="small"
                  variant="text"
                  startIcon={<LocalPrintshop sx={{ fontSize: 14 }} />}
                  disabled={!batch.items.length}
                  onClick={() => void onReprintItems?.(batch.items)}
                  sx={{ minHeight: 24, py: 0, fontSize: '0.68rem' }}
                >
                  Batch #{batch.id}
                </Button>
              ))}
            </Stack>
          : null}

          <Paper
            variant="outlined"
            sx={{
              flex: 1,
              minHeight: 0,
              minWidth: 0,
              p: 0,
              mb: 0,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              borderColor: processingTokens.border,
              bgcolor: processingTokens.surfaceRaised,
            }}
          >
            <CheckedInItemsTable
              rows={historyRows}
              productGroups={productGroups.length > 1 ? productGroups : undefined}
              fallbackProduct={product}
              activeItemId={activeItem?.id ?? null}
              onSelectItemId={handleSelectPriorCheckIn}
              onReprintItems={onReprintItems}
              onRemapBatch={isManager ? setRemapTarget : undefined}
              showRemapAction={isManager}
              scrollable
            />
          </Paper>
        </ProcessingRowSection>
        </Box>

      </Box>

      <ProcessingCheckInDialog
        open={checkInOpen}
        row={row}
        loading={checkInLoading}
        seed={checkInSeed}
        onClose={closeDetailedCheckIn}
        onSubmit={onCheckIn}
      />
      <QuickCheckInProductPrompt
        open={productPrompt != null}
        rowTitle={displayTitle}
        loading={checkInLoading}
        onClose={() => setProductPrompt(null)}
        onNewProduct={() => {
          const pending = productPrompt;
          setProductPrompt(null);
          if (pending) void submitQuickCheckIn({ product_mode: 'new' }, pending.printLabels, pending.quantity);
        }}
        onExistingProduct={(picked) => {
          const pending = productPrompt;
          setProductPrompt(null);
          if (pending) {
            void submitQuickCheckIn(
              { product_mode: 'existing', product_id: picked.id },
              pending.printLabels,
              pending.quantity,
            );
          }
        }}
        onDetailed={() => {
          setProductPrompt(null);
          openDetailedCheckIn();
        }}
      />
      <LargeCheckInConfirmDialog
        open={volumeConfirm != null}
        quantity={volumeConfirm?.quantity ?? 0}
        printLabels={volumeConfirm?.printLabels === true}
        loading={checkInLoading}
        onCancel={() => setVolumeConfirm(null)}
        onConfirm={() => {
          const pending = volumeConfirm;
          setVolumeConfirm(null);
          if (pending) void quickCheckInResolved(pending.printLabels, pending.quantity);
        }}
      />
      <RemapBatchProductDialog
        open={remapTarget != null}
        batchRow={remapTarget}
        fallbackProductTitle={displayTitle}
        loading={remapBatch.isPending}
        onClose={() => setRemapTarget(null)}
        onSubmit={handleRemapBatch}
      />
      {transformMode ?
        <ProcessingTransformDialog
          open
          mode={transformMode}
          row={row}
          loading={breakApartRow.isPending || makeSetRow.isPending}
          onClose={() => setTransformMode(null)}
          onSubmit={handleTransformSubmit}
        />
      : null}
      <ProcessingRestartRowDialog
        open={restartSummary != null}
        summary={restartSummary}
        loading={restartRow.isPending}
        onClose={() => setRestartSummary(null)}
        onConfirm={handleRestartConfirm}
      />
    </Card>
  );
}

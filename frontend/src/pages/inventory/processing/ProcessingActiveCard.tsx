import DeleteOutline from '@mui/icons-material/DeleteOutline';
import LinearScale from '@mui/icons-material/LinearScale';
import Add from '@mui/icons-material/Add';
import ArrowBack from '@mui/icons-material/ArrowBack';
import Refresh from '@mui/icons-material/Refresh';
import Check from '@mui/icons-material/Check';
import Close from '@mui/icons-material/Close';
import JoinFull from '@mui/icons-material/JoinFull';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  IconButton,
  MenuItem,
  Paper,
  Popover,
  Stack,
  TextField,
  Tooltip,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { useAuth } from '../../../contexts/AuthContext';
import {
  useProcessingDeleteItemCheckIn,
  useProcessingUpdateItemCheckIn,
  useProcessingPatchItem,
  useProcessingSetRowProduct,
  useProcessingRestartRow,
  useRemapItemCheckInProduct,
  printedPreviewToLabelInputs,
} from '../../../hooks/useProcessingWorkspace';
import { printProcessingLabelsAndMarkPrinted } from './printProcessingLabel';
import { checkInPrintActionLabel } from './checkedInPrintedAggregate';
import { apiErrorDetail } from '../../../hooks/useProductSearch';
import { ProductSearchAutocomplete } from '../../../components/inventory/ProductSearchAutocomplete';
import {
  getProduct,
  type ProcessingCheckInPayload,
  type ProcessingRestartSummary,
} from '../../../api/inventory.api';
import type {
  Product,
  ProcessingWorkspaceItemDTO,
  ProcessingWorkspaceProductDTO,
  ProcessingWorkspaceRowDTO,
} from '../../../types/inventory.types';
import { ProductManagePanel, rowDetailsToProductEditorDraft } from '../manage/ProductManageDrawer';
import { isValidCheckInPrice } from '../workbench/CheckInDetailsLayout';
import {
  RetailPriceLockToggle,
  RetailPricePctButton,
  useRetailPriceLock,
} from '../workbench/RetailPriceLockControls';
import { formatCurrency } from '../../../utils/format';
import { moneyValuesEqual, preventWheelChangeNumber, sanitizeDecimalPaste } from '../../../utils/formInputs';
import { isTaxonomyV1CategoryName, TAXONOMY_V1_CATEGORY_NAMES } from '../../../constants/taxonomyV1';
import { ProcessingGoogleSearchButton } from './ProcessingGoogleSearchButton';
import { parseSearchTagsCsv } from './processingGoogleQuery';
import { ProcessingCheckInDialog, type ProcessingCheckInSeed } from './ProcessingCheckInDialog';
import { ProcessingRowSection } from './ProcessingRowSection';
import { processingTokens } from './processingTokens';
import { ManifestFieldNavContext, ManifestFieldNavProvider, type ManifestFieldId } from './manifestFieldNav';
import { ManifestIdentifiersField } from './ManifestIdentifiersField';
import { ManifestTagsField } from './manifestTagsField';
import { CheckedInItemsTable, type CheckInAttachedProductOption } from './CheckedInItemsTable';
import {
  buildCheckedInHistoryRows,
  buildProductGroupedHistory,
  distinctProductCount,
  disputedItemCount,
  isCheckedInItem,
  type CheckedInHistoryRow,
} from './checkedInHistory';
import { effectiveRowQty, processingRowBookmark, queueProductsChipLabel } from './processingQueueCellText';
import {
  buildProductLinksPatch,
  buildProductLinksRemove,
  computeManifestProgress,
  formatManifestUnits,
  formatProductLinkSummary,
  formatProductLinkSummaryLong,
  normalizeProductLink,
  processingRowFieldLayerTooltip,
  productLinkUsesManifestAccounting,
  type ProcessingProductLinkConfig,
  type ProcessingProductLinkRole,
} from './processingManifestAccounting';
import { ProcessingRestartRowDialog } from './ProcessingTransformDialogs';
import { processingRowManifestToolbarRowSx } from './processingRowToolbarLayout';
import { ManifestModalField } from './ManifestModalField';
import { ManifestModalNavBridge } from './ManifestModalNavBridge';
import { ManifestNotesField } from './ManifestNotesField';
import { ManifestToolbarPill } from './ManifestToolbarPill';
import type { ManifestModalEditorHandle } from './manifestModalEditor';
import { identifiersFullText, identifiersSummary, notesFullText, notesSummary, tagsFullText, tagsSummary } from './processingManifestSummary';
import { useWorkbenchConfirmDialog } from '../workbench/useWorkbenchConfirmDialog';
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
  itemCount,
  usesManifestAccounting,
  distinctProducts,
  itemCheckInCount,
  disputedCount,
  productsChipLabel,
  groupChipLabel,
  onBackToQueue,
  onRefreshDetail,
  detailRefreshing = false,
}: {
  qtyCheckedIn: number;
  qtyExpected: number;
  qtyRemaining: number;
  qtyOverage: number;
  itemCount: number;
  usesManifestAccounting: boolean;
  distinctProducts: number;
  itemCheckInCount: number;
  disputedCount: number;
  productsChipLabel?: string | null;
  /** P7 collapse: "⊟ Rows 1, 2, 3 as one" - tiles show COMBINED group numbers. */
  groupChipLabel?: string | null;
  onBackToQueue: () => void;
  onRefreshDetail?: () => void;
  detailRefreshing?: boolean;
}) {
  const progressPct = qtyExpected > 0 ? Math.min(100, Math.round((qtyCheckedIn / qtyExpected) * 100)) : 0;
  const progressLabel = usesManifestAccounting ?
      `${formatManifestUnits(qtyCheckedIn)} / ${formatManifestUnits(qtyExpected)} row units`
    : `${qtyCheckedIn.toLocaleString()} / ${qtyExpected.toLocaleString()} checked in`;
  const progressTooltip =
    usesManifestAccounting ?
      `${itemCount.toLocaleString()} item${itemCount === 1 ? '' : 's'} checked in · manifest row units accounted`
    : '';
  const isComplete = qtyRemaining <= 0 && qtyOverage <= 0;
  const remainingHeadline =
    qtyOverage > 0 ? `${formatManifestUnits(qtyOverage)} over`
    : isComplete ? 'Complete'
    : `${formatManifestUnits(qtyRemaining)} left`;
  const remainingColor =
    qtyOverage > 0 ? processingTokens.accentRed
    : isComplete ? processingTokens.primaryDark
    : processingTokens.rowStatusHeaderText;

  return (
    <Box
      sx={{
        flexShrink: 0,
        px: { xs: 1.25, md: 1.5 },
        py: 0.55,
        borderBottom: 1,
        borderColor: processingTokens.rowStatusHeaderBorder,
        bgcolor: processingTokens.rowStatusHeaderBg,
        color: processingTokens.rowStatusHeaderText,
      }}
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'auto 1fr',
            md: 'auto minmax(108px, 168px) minmax(280px, 520px) minmax(88px, 1fr)',
          },
          alignItems: 'center',
          columnGap: { xs: 1, md: 1.5 },
          rowGap: 0.45,
        }}
      >
        <Button
          size="small"
          startIcon={<ArrowBack sx={{ fontSize: 15 }} />}
          onClick={onBackToQueue}
          sx={{
            minHeight: 28,
            py: 0,
            px: 0.65,
            fontSize: '0.72rem',
            color: processingTokens.rowStatusHeaderText,
            justifySelf: { xs: 'start', md: 'start' },
            gridColumn: { xs: '1', md: '1' },
            gridRow: { xs: '1', md: '1' },
          }}
        >
          Queue
        </Button>

        {onRefreshDetail ?
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gridColumn: { xs: '1 / -1', md: '2' },
              gridRow: { xs: '2', md: '1' },
              px: { xs: 0, md: 0.5 },
            }}
          >
            <Button
              size="small"
              disabled={detailRefreshing}
              onClick={onRefreshDetail}
              endIcon={
                detailRefreshing ?
                  <CircularProgress size={14} color="inherit" />
                : <Refresh sx={{ fontSize: 16 }} />
              }
              aria-label="Refresh page"
              sx={{
                minHeight: 28,
                py: 0,
                px: 0.75,
                fontSize: '0.625rem',
                fontWeight: 800,
                letterSpacing: 0.55,
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
                color: processingTokens.rowStatusHeaderText,
                '&:hover': { bgcolor: 'rgba(255,255,255,0.12)' },
                '& .MuiButton-endIcon': { ml: 0.35 },
              }}
            >
              Refresh page
            </Button>
          </Box>
        : null}

        <Box
          sx={{
            minWidth: 0,
            width: '100%',
            justifySelf: 'center',
            gridColumn: { xs: '1 / -1', md: '3' },
            gridRow: { xs: onRefreshDetail ? '3' : '2', md: '1' },
            px: { xs: 0.25, md: 0 },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, md: 1.35 }, minWidth: 0 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              {progressTooltip ?
                <Tooltip title={progressTooltip} enterDelay={350}>
                  <Typography
                    sx={{
                      display: 'block',
                      minWidth: 0,
                      mb: 0.35,
                      textAlign: 'center',
                      fontFamily: processingTokens.monoFontFamily,
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      lineHeight: 1.1,
                      color: processingTokens.rowStatusHeaderText,
                      opacity: 0.9,
                    }}
                    noWrap
                  >
                    {progressLabel}
                  </Typography>
                </Tooltip>
              : (
                <Typography
                  sx={{
                    display: 'block',
                    minWidth: 0,
                    mb: 0.35,
                    textAlign: 'center',
                    fontFamily: processingTokens.monoFontFamily,
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    lineHeight: 1.1,
                    color: processingTokens.rowStatusHeaderText,
                    opacity: 0.9,
                  }}
                  noWrap
                >
                  {progressLabel}
                </Typography>
              )}
              <Box
                sx={{
                  height: 7,
                  borderRadius: 99,
                  bgcolor: 'rgba(27, 94, 32, 0.22)',
                  overflow: 'hidden',
                  boxShadow: 'inset 0 1px 2px rgba(15, 23, 42, 0.08)',
                }}
              >
                <Box
                  sx={{
                    width: `${progressPct}%`,
                    height: '100%',
                    borderRadius: 99,
                    bgcolor: qtyOverage > 0 ? processingTokens.accentRed : isComplete ? processingTokens.primaryDark : processingTokens.primary,
                    transition: 'width 200ms ease',
                  }}
                />
              </Box>
            </Box>
            <Typography
              sx={{
                flexShrink: 0,
                minWidth: { xs: 72, md: 90 },
                textAlign: 'right',
                fontFamily: processingTokens.monoFontFamily,
                fontSize: { xs: '1.05rem', md: '1.22rem' },
                fontWeight: 900,
                lineHeight: 1,
                color: remainingColor,
              }}
            >
              {remainingHeadline}
            </Typography>
          </Box>
        </Box>

        <Stack
          direction="row"
          spacing={0.65}
          flexWrap="wrap"
          useFlexGap
          alignItems="center"
          justifyContent={{ xs: 'flex-start', md: 'flex-end' }}
          sx={{
            justifySelf: { xs: 'start', md: 'end' },
            gridColumn: { xs: '2', md: '4' },
            gridRow: { xs: '1', md: '1' },
            minWidth: 0,
          }}
        >
          {groupChipLabel ?
            <Chip
              size="small"
              label={groupChipLabel}
              sx={{
                height: 20,
                fontSize: '0.625rem',
                fontWeight: 800,
                bgcolor: 'rgba(255,255,255,0.16)',
                color: 'inherit',
              }}
            />
          : null}
          {qtyOverage > 0 ? <Chip size="small" color="error" label={`+${qtyOverage} over`} sx={{ height: 20, fontSize: '0.625rem', fontWeight: 800 }} /> : null}
          {disputedCount > 0 ? <Chip size="small" color="warning" label={`${disputedCount} disputed`} sx={{ height: 20, fontSize: '0.625rem', fontWeight: 800 }} /> : null}
          {distinctProducts >= 2 ? <Chip size="small" label={`${distinctProducts} products`} sx={{ height: 20, fontSize: '0.625rem', fontWeight: 800 }} /> : null}
          {itemCheckInCount > 0 ? <Chip size="small" label={`${itemCheckInCount} check-ins`} sx={{ height: 20, fontSize: '0.625rem', fontWeight: 800 }} /> : null}
          {distinctProducts >= 2 && productsChipLabel ?
            <Chip
              size="small"
              label={productsChipLabel}
              sx={{ height: 20, fontSize: '0.625rem', fontWeight: 700 }}
            />
          : null}
        </Stack>
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
  layerSources,
  currency = false,
  multiline = false,
  variant = 'block',
  selectOptions,
  emphasis = 'normal',
  trailingAdornment,
  onSave,
}: {
  fieldId?: ManifestFieldId;
  label: string;
  value: string;
  displayValue?: string;
  /** Manifest vs AI source values for hover tooltip. Pass `{}` to always show layer lines. */
  layerSources?: { manifest?: string; ai?: string; final?: string };
  currency?: boolean;
  multiline?: boolean;
  variant?: ManifestFieldVariant;
  selectOptions?: readonly string[];
  emphasis?: 'compact' | 'normal' | 'emphasized';
  /** Rendered after the value / currency input (e.g. % of retail badge on Price). */
  trailingAdornment?: ReactNode;
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
  /** Prop value at the moment we set optimistic — used to detect external updates. */
  const optimisticBaselineRef = useRef<string | null>(null);
  const layout = manifestFieldLayout(variant, multiline, emphasis);
  const rawValue = optimisticValue ?? value;
  const effectiveRaw = currency ? rawValue : (optimisticValue ?? displayValue ?? value);
  const trimmed = effectiveRaw?.trim() ?? '';
  const isEmpty = !trimmed;
  const shown = currency ? (isEmpty ? '-' : formatCurrency(rawValue)) : (trimmed || '-');
  const pillPlaceholder = `Add ${label.toLowerCase()}`;
  const resolvedSelectOptions = useMemo(
    () => (selectOptions ? resolveSelectOptions(selectOptions, draft || rawValue, isTaxonomyV1CategoryName) : []),
    [selectOptions, draft, rawValue],
  );

  useEffect(() => {
    setDraft(value);
    if (optimisticValue == null) return;
    // Server echoes money as "30.00" while the pill may have saved "30" — compare numerically.
    const matches = currency ? moneyValuesEqual(value, optimisticValue) : value === optimisticValue;
    if (matches) {
      setOptimisticValue(null);
      optimisticBaselineRef.current = null;
      return;
    }
    // Prop left the baseline we saved over → external update (lock / % badge) wins.
    const baseline = optimisticBaselineRef.current;
    if (
      baseline != null &&
      !(currency ? moneyValuesEqual(value, baseline) : value === baseline)
    ) {
      setOptimisticValue(null);
      optimisticBaselineRef.current = null;
    }
  }, [value, optimisticValue, currency]);

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
    optimisticBaselineRef.current = value;
    setOptimisticValue(normalized);
    setDraft(normalized);
    setSelectMenuOpen(false);
    setEditing(false);
    window.setTimeout(() => {
      releaseSuppressBlur();
      void Promise.resolve(onSave(normalized)).catch(() => {
        setOptimisticValue(null);
        optimisticBaselineRef.current = null;
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

  const hoverTooltip =
    editing || layerSources === undefined ?
      ''
    : processingRowFieldLayerTooltip(
        layerSources,
        fieldId === 'price' ? 'price' : fieldId === 'unitRetail' ? 'unitRetail' : 'identity',
      );

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
                  <em>-</em>
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
                  {trailingAdornment ?
                    <Box
                      sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', pr: 0.35 }}
                      onPointerDown={() => {
                        armSuppressBlur();
                        confirmEdit(draft);
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {trailingAdornment}
                    </Box>
                  : null}
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
            {trailingAdornment ?
              <Box
                sx={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                {trailingAdornment}
              </Box>
            : null}
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

      {layerSources !== undefined && !editing ?
        <Tooltip title={<span style={{ whiteSpace: 'pre-line' }}>{hoverTooltip}</span>} enterDelay={350} disableInteractive>
          <Box component="span" sx={{ display: 'block', minWidth: 0 }}>
            {fieldShell}
          </Box>
        </Tooltip>
      : fieldShell}
    </Box>
  );
}

interface AttachedRowProduct {
  key: string;
  productId: number | null;
  productNumber?: string | null;
  title: string;
  brand?: string;
  model?: string;
  category?: string | null;
  tags?: string[];
  identifiers?: Record<string, unknown>;
  specs?: Record<string, unknown>;
  checkedInQty: number;
  linkConfig: ProcessingProductLinkConfig;
}

function productToProcessingSnapshot(product: Product): ProcessingWorkspaceProductDTO {
  return {
    id: product.id,
    product_number: product.product_number || '',
    title: product.title || '',
    brand: product.brand || '',
    model: product.model || '',
    specs: product.specifications || {},
    identifiers: product.identifiers || {},
    tags: product.tags || [],
    taxonomy: '',
    category: product.category_name || '',
    upc: product.upc || product.identifiers?.upc || '',
  };
}

function updateProductSnapshotInProcessingRow(
  row: ProcessingWorkspaceRowDTO | undefined,
  saved: Product,
): ProcessingWorkspaceRowDTO | undefined {
  if (!row) return row;
  const snapshot = productToProcessingSnapshot(saved);
  const productNumber = saved.product_number || null;
  const updateItem = (item: ProcessingWorkspaceItemDTO): ProcessingWorkspaceItemDTO => (
    item.product === saved.id ?
      {
        ...item,
        product_number: productNumber,
        product_title: saved.title,
        product_brand: saved.brand,
        product_model: saved.model,
      }
    : item
  );

  return {
    ...row,
    product: row.product?.id === saved.id ? snapshot : row.product,
    attachedProducts: row.attachedProducts?.map((p) => (p.id === saved.id ? { ...snapshot, checkedInQty: p.checkedInQty } : p)),
    items: row.items?.map(updateItem),
    itemCheckIns: row.itemCheckIns?.map((checkIn) => ({
      ...checkIn,
      product: checkIn.product?.id === saved.id ? snapshot : checkIn.product,
      items: checkIn.items.map(updateItem),
    })),
  };
}

function ProductLinkAccountingControl({
  config,
  onChange,
}: {
  config: ProcessingProductLinkConfig;
  onChange: (next: ProcessingProductLinkConfig) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [draft, setDraft] = useState(() => normalizeProductLink(config));
  const open = Boolean(anchor);
  const active = productLinkUsesManifestAccounting(config);

  useEffect(() => {
    if (!open) setDraft(normalizeProductLink(config));
  }, [config, open]);

  function close() {
    setAnchor(null);
  }

  function applyDraft() {
    onChange(normalizeProductLink(draft));
    close();
  }

  function setRole(nextRole: ProcessingProductLinkRole) {
    if (nextRole === null) {
      setDraft({ role: null, checkIns: 1, manifestUnits: 1 });
      return;
    }
    if (nextRole === 'set') {
      setDraft({
        role: 'set',
        checkIns: 1,
        manifestUnits: draft.role === 'set' && draft.manifestUnits > 1 ? draft.manifestUnits : 10,
      });
      return;
    }
    setDraft({
      role: 'part',
      checkIns: draft.role === 'part' && draft.checkIns > 1 ? draft.checkIns : 10,
      manifestUnits: 1,
    });
  }

  return (
    <>
      <Tooltip title={formatProductLinkSummaryLong(config)} enterDelay={400} disableInteractive>
        <IconButton
          size="small"
          aria-label="Row unit accounting"
          onClick={(e) => {
            e.stopPropagation();
            setAnchor(e.currentTarget);
          }}
          sx={{
            p: 0.2,
            mt: 0.05,
            color: active ? 'primary.main' : 'text.disabled',
            opacity: active ? 1 : 0.45,
            '&:hover': { opacity: 1, bgcolor: 'action.hover' },
          }}
        >
          {active ?
            <Chip
              label={formatProductLinkSummary(config)}
              size="small"
              color="primary"
              variant="outlined"
              sx={{
                height: 18,
                fontSize: '0.62rem',
                fontWeight: 800,
                '& .MuiChip-label': { px: 0.55 },
              }}
            />
          : <LinearScale sx={{ fontSize: 15 }} />}
        </IconButton>
      </Tooltip>
      <Popover
        open={open}
        anchorEl={anchor}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { p: 1.25, width: 248 } } }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ display: 'block', mb: 0.75 }}>
          Row unit ratio
        </Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={draft.role ?? 'standard'}
          onChange={(_event, value: 'set' | 'part' | 'standard' | null) => {
            if (value == null) return;
            setRole(value === 'standard' ? null : value);
          }}
          fullWidth
          sx={{
            mb: draft.role ? 1 : 0,
            '& .MuiToggleButton-root': {
              flex: 1,
              py: 0.35,
              fontSize: '0.72rem',
              fontWeight: 700,
              textTransform: 'none',
              lineHeight: 1.2,
            },
          }}
        >
          <ToggleButton value="standard">Standard</ToggleButton>
          <ToggleButton value="set">Set</ToggleButton>
          <ToggleButton value="part">Part</ToggleButton>
        </ToggleButtonGroup>
        {draft.role === 'set' ?
          <Stack direction="row" spacing={0.6} alignItems="center" useFlexGap>
            <Typography variant="caption" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
              1 check-in =
            </Typography>
            <TextField
              size="small"
              value={String(draft.manifestUnits)}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  manifestUnits: Math.max(1, parseInt(e.target.value.replace(/\D/g, ''), 10) || 1),
                }))
              }
              inputProps={{ inputMode: 'numeric', 'aria-label': 'Row units per check-in' }}
              sx={{ width: 52, '& .MuiInputBase-input': { py: 0.35, px: 0.6, fontSize: '0.78rem', fontWeight: 800 } }}
            />
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              units
            </Typography>
          </Stack>
        : draft.role === 'part' ?
          <Stack direction="row" spacing={0.6} alignItems="center" useFlexGap>
            <TextField
              size="small"
              value={String(draft.checkIns)}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  checkIns: Math.max(1, parseInt(e.target.value.replace(/\D/g, ''), 10) || 1),
                }))
              }
              inputProps={{ inputMode: 'numeric', 'aria-label': 'Check-ins per row unit' }}
              sx={{ width: 52, '& .MuiInputBase-input': { py: 0.35, px: 0.6, fontSize: '0.78rem', fontWeight: 800 } }}
            />
            <Typography variant="caption" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
              check-ins = 1 unit
            </Typography>
          </Stack>
        : null}
        <Stack direction="row" justifyContent="flex-end" spacing={0.5} sx={{ mt: 1.1 }}>
          <Button size="small" onClick={close}>
            Cancel
          </Button>
          <Button size="small" variant="contained" onClick={applyDraft}>
            Apply
          </Button>
        </Stack>
      </Popover>
    </>
  );
}

function AttachedProductCard({
  product,
  onCheckIn,
  onEditProduct,
  onLinkConfigChange,
  onRemove,
  hideManifestAccounting = false,
}: {
  product: AttachedRowProduct;
  onCheckIn: () => void;
  onEditProduct: () => void;
  onLinkConfigChange: (config: ProcessingProductLinkConfig) => void;
  onRemove?: () => void;
  hideManifestAccounting?: boolean;
}) {
  const line2 = [product.brand, product.category].filter(Boolean).join(' · ');
  const titleLine = [product.productNumber, product.title].filter(Boolean).join(' · ');
  const manifestUnitsNumeric =
    product.checkedInQty > 0 ?
      (product.checkedInQty * product.linkConfig.manifestUnits) / product.linkConfig.checkIns
    : 0;
  const manifestUnitsCheckedIn = product.checkedInQty > 0 ? formatManifestUnits(manifestUnitsNumeric) : null;
  const showManifestUnitsInStatus =
    product.checkedInQty > 0 && productLinkUsesManifestAccounting(product.linkConfig);
  const statusLine =
    product.checkedInQty ?
      `${product.checkedInQty} item${product.checkedInQty === 1 ? '' : 's'}${
        showManifestUnitsInStatus && manifestUnitsCheckedIn != null ?
          ` (${manifestUnitsCheckedIn} row${Math.abs(manifestUnitsNumeric - 1) < 0.05 ? '' : 's'})`
        : ''
      }`
    : 'none yet';
  return (
    <Paper
      variant="outlined"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 0.6,
        py: 0.4,
        borderColor: processingTokens.border,
        bgcolor: processingTokens.surfaceRaised,
        minWidth: 0,
      }}
    >
      <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', mr: 1 }}>
        <Button variant="contained" size="small" onClick={onCheckIn} sx={{ minHeight: 26, py: 0.15, px: 0.75, fontSize: '0.6875rem', whiteSpace: 'nowrap' }}>
          Check in
        </Button>
      </Box>
      <Box
        role="button"
        tabIndex={0}
        onClick={onEditProduct}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onEditProduct();
          }
        }}
        sx={{
          flex: 1,
          minWidth: 0,
          py: 0.1,
          borderRadius: 1,
          cursor: 'pointer',
          '&:hover': { bgcolor: processingTokens.rowHover },
          '&:focus-visible': { outline: 'none', boxShadow: processingTokens.focusRing },
        }}
      >
        <Typography sx={{ minWidth: 0, fontSize: '0.78rem', fontWeight: 800, lineHeight: 1.2 }} noWrap>
          {product.productNumber ?
            <>
              <Box component="span" sx={{ fontFamily: processingTokens.monoFontFamily, color: 'text.secondary', mr: 0.5 }}>
                {product.productNumber}
              </Box>
              {product.title}
            </>
          : titleLine || '-'}
        </Typography>
        {line2 ?
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.05, fontWeight: 600, fontSize: '0.625rem', lineHeight: 1.2 }} noWrap>
            {line2}
          </Typography>
        : null}
      </Box>
      <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        <ProcessingGoogleSearchButton
          brand={product.brand}
          title={product.title}
          model={product.model}
          searchTags={product.tags}
          iconSize={17}
        />
      </Box>
      <Box sx={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', gap: 0.1, pl: 0.25 }}>
        <Typography color="text.secondary" sx={{ fontWeight: 700, whiteSpace: 'nowrap', fontSize: '0.625rem', lineHeight: 1.15 }}>
          {statusLine}
        </Typography>
        {product.productId != null && !hideManifestAccounting ?
          <Box onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <ProductLinkAccountingControl config={product.linkConfig} onChange={onLinkConfigChange} />
          </Box>
        : null}
      </Box>
      {!product.checkedInQty && onRemove ?
        <Tooltip title="Remove from row" enterDelay={300} disableInteractive>
          <IconButton
            size="small"
            aria-label="Remove product from row"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            sx={{
              flexShrink: 0,
              p: 0.35,
              color: 'text.secondary',
              '&:hover': { color: processingTokens.accentRed, bgcolor: processingTokens.redSoft },
            }}
          >
            <DeleteOutline sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      : null}
    </Paper>
  );
}

export interface ProcessingActiveCardProps {
  orderId: number;
  row: ProcessingWorkspaceRowDTO;
  activeItem: ProcessingWorkspaceItemDTO | null;
  onSelectItemId: (itemId: number) => void;
  onBackToQueue: () => void;
  onCheckIn: (payload: ProcessingCheckInPayload, options?: { printLabels?: boolean }) => Promise<boolean>;
  checkInLoading: boolean;
  onPatchCheckedIn: (payload: Record<string, unknown>) => void;
  patchLoading: boolean;
  onReprintItems?: (items: ProcessingWorkspaceItemDTO[]) => Promise<void>;
  onPatchRowDefaults?: (payload: Record<string, unknown>) => void | Promise<void>;
  /** Opens Check in together pre-seeded with this row's same-product peers (P5). */
  onOpenCheckInTogether?: () => void;
  /** Opens the Add item dialog (added-row CTA). */
  onAddItem?: () => void;
  /** Scroll detail to prior check-ins (N-products chip from queue). */
  scrollToHistory?: boolean;
  onScrollToHistoryDone?: () => void;
  /** Refetch workspace + row detail without leaving the page. */
  onRefreshDetail?: () => void;
  detailRefreshing?: boolean;
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
  onPatchRowDefaults,
  onOpenCheckInTogether,
  onAddItem,
  scrollToHistory,
  onScrollToHistoryDone,
  onRefreshDetail,
  detailRefreshing,
}: ProcessingActiveCardProps) {
  const { enqueueSnackbar } = useSnackbar();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialogHost } = useWorkbenchConfirmDialog();
  const retailPriceLock = useRetailPriceLock();
  /**
   * Instant retail/price overlay (check-in parity). Manifest pills commit on save, but lock/%
   * must update the sibling field immediately — not after the PATCH round-trip.
   */
  const [moneyOverlay, setMoneyOverlay] = useState<{ retail?: string; price?: string } | null>(null);
  const priorCheckInsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMoneyOverlay(null);
  }, [row.processing_row_id]);

  useEffect(() => {
    if (!moneyOverlay) return;
    const retailCaughtUp =
      moneyOverlay.retail == null || moneyValuesEqual(row.unitRetail ?? '', moneyOverlay.retail);
    const priceCaughtUp =
      moneyOverlay.price == null || moneyValuesEqual(row.price ?? '', moneyOverlay.price);
    if (retailCaughtUp && priceCaughtUp) setMoneyOverlay(null);
  }, [row.unitRetail, row.price, moneyOverlay]);

  const displayRetail = moneyOverlay?.retail ?? row.unitRetail ?? '';
  const displayPrice = moneyOverlay?.price ?? row.price ?? '';
  const { hasRole } = useAuth();
  const isManager = hasRole('Manager') || hasRole('Admin');
  const setRowProduct = useProcessingSetRowProduct(orderId);
  const deleteItemCheckIn = useProcessingDeleteItemCheckIn(orderId);
  const updateItemCheckIn = useProcessingUpdateItemCheckIn(orderId);
  const remapItemCheckInProduct = useRemapItemCheckInProduct(orderId);
  const restartRow = useProcessingRestartRow(orderId);
  const [restartSummary, setRestartSummary] = useState<ProcessingRestartSummary | null>(null);
  const patchItem = useProcessingPatchItem(orderId);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkInSeed, setCheckInSeed] = useState<ProcessingCheckInSeed | null>(null);
  const [checkInProductId, setCheckInProductId] = useState<number | null>(null);
  const [productEditorOpen, setProductEditorOpen] = useState(false);
  const [productEditorProductId, setProductEditorProductId] = useState<number | null>(null);
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
  const product = row.product;
  const rowBookmark = useMemo(() => processingRowBookmark(row), [row]);
  const newProductEditorSeed = useMemo(
    () =>
      rowDetailsToProductEditorDraft({
        title: rowBookmark.title,
        brand: rowBookmark.brand,
        model: rowBookmark.model,
        category: rowBookmark.category,
        tags: row.tags,
        identifiers: rowBookmark.identifiers,
        specifications: row.specs,
      }),
    [rowBookmark, row.tags, row.specs],
  );
  const productEditorQuery = useQuery({
    queryKey: ['products', 'processing-row-editor', productEditorProductId],
    queryFn: async () => (await getProduct(productEditorProductId!)).data,
    enabled: productEditorOpen && productEditorProductId != null,
  });
  const isAddedRow = row.rowKind === 'added';
  const displayTitle = rowBookmark.title || (isAddedRow ? 'Added item' : 'Manifest line');
  const priorCheckIns = useMemo(() => (row.items ?? []).filter(isCheckedInItem), [row.items]);
  const itemCheckIns = row.itemCheckIns ?? [];
  const historyRows = useMemo(
    () => buildCheckedInHistoryRows(row.items, itemCheckIns),
    [row.items, itemCheckIns],
  );
  const productGroups = useMemo(
    () => buildProductGroupedHistory(row.items, itemCheckIns),
    [row.items, itemCheckIns],
  );
  const attachedProducts = useMemo((): AttachedRowProduct[] => {
    const links = row.productLinks ?? {};
    const qtyByProductId = new Map(
      productGroups
        .filter((group) => group.productId != null)
        .map((group) => [group.productId as number, group.totalQty]),
    );
    const fromApi = row.attachedProducts ?? [];
    if (fromApi.length > 0) {
      return fromApi.map((p) => ({
        key: `product:${p.id}`,
        productId: p.id,
        productNumber: p.product_number,
        title: p.title,
        brand: p.brand,
        model: p.model,
        category: p.category,
        checkedInQty: qtyByProductId.get(p.id) ?? p.checkedInQty ?? 0,
        linkConfig: normalizeProductLink(links[String(p.id)]),
      }));
    }
    // List/patch payloads without detail hydration - fall back to matched product + check-ins.
    const out = new Map<string, AttachedRowProduct>();
    if (product) {
      out.set(`product:${product.id}`, {
        key: `product:${product.id}`,
        productId: product.id,
        productNumber: product.product_number,
        title: product.title || displayTitle,
        brand: product.brand,
        model: product.model,
        category: product.category,
        checkedInQty: qtyByProductId.get(product.id) ?? 0,
        linkConfig: normalizeProductLink(links[String(product.id)]),
      });
    }
    for (const [productId, linkKey] of Object.entries(links)) {
      const pid = Number(productId);
      if (!Number.isFinite(pid) || out.has(`product:${pid}`)) continue;
      out.set(`product:${pid}`, {
        key: `product:${pid}`,
        productId: pid,
        productNumber: null,
        title: `Product #${pid}`,
        checkedInQty: qtyByProductId.get(pid) ?? 0,
        linkConfig: normalizeProductLink(linkKey),
      });
    }
    for (const group of productGroups) {
      const first = group.historyRows[0]?.item;
      const key = group.productId != null ? `product:${group.productId}` : `history:${group.productLabel}`;
      const existing = out.get(key);
      if (existing) {
        existing.checkedInQty = group.totalQty;
        continue;
      }
      out.set(key, {
        key,
        productId: group.productId,
        productNumber: first?.product_number,
        title: first?.product_title || group.productLabel,
        brand: first?.product_brand,
        model: first?.product_model,
        category: group.historyRows[0]?.checkInProductCategory,
        checkedInQty: group.totalQty,
        linkConfig: normalizeProductLink(group.productId != null ? links[String(group.productId)] : undefined),
      });
    }
    return [...out.values()].sort((a, b) => b.checkedInQty - a.checkedInQty || a.title.localeCompare(b.title));
  }, [displayTitle, product, productGroups, row.attachedProducts, row.productLinks]);
  const attachedProductIds = useMemo(
    () => new Set(attachedProducts.map((p) => p.productId).filter((id): id is number => id != null)),
    [attachedProducts],
  );
  const attachedProductOptions = useMemo((): CheckInAttachedProductOption[] => {
    return attachedProducts
      .filter((p): p is AttachedRowProduct & { productId: number } => p.productId != null)
      .map((p) => {
        const productNumber = p.productNumber?.trim() || `#${p.productId}`;
        const title = p.title?.trim() || productNumber;
        return {
          productId: p.productId,
          label: title,
          hint: productNumber,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [attachedProducts]);
  const manifestProgress = useMemo(
    () => computeManifestProgress(row, productGroups),
    [row, productGroups],
  );
  const distinctProducts = row.distinctProductCount ?? distinctProductCount(priorCheckIns);
  const productsChipLabel = queueProductsChipLabel(distinctProducts);
  useEffect(() => {
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
  const checkInCount = itemCheckIns.length;
  const disputedCount = useMemo(() => disputedItemCount(priorCheckIns), [priorCheckIns]);

  // P7 collapse: a master's tiles/caps cover the WHOLE group (5/3/7 ⇒ Expected 15).
  const effQty = effectiveRowQty(row);
  const qtyExpected = effQty.qty;
  const qtyCheckedIn = manifestProgress.usesManifestAccounting ? manifestProgress.manifestUnits : effQty.dispositioned;
  const qtyRemaining = Math.max(0, qtyExpected - qtyCheckedIn);
  const qtyOverage = Math.max(0, qtyCheckedIn - qtyExpected);
  const collapseGroupLabel =
    row.collapsedGroup ?
      `⊟ Rows ${[row.rowNum, ...row.collapsedGroup.memberRowNumbers].join(', ')} as one`
    : null;
  const activeStatus = activeItem?.status ?? 'intake';
  const terminalDisputed = activeStatus === 'scrapped' || activeStatus === 'lost';

  async function patchRow(payload: Record<string, unknown>) {
    await Promise.resolve(onPatchRowDefaults?.({ processing_row_id: row.processing_row_id, ...payload }));
  }

  function handleSelectPriorCheckIn(itemId: number) {
    onSelectItemId(itemId);
    const item = priorCheckIns.find((it) => it.id === itemId);
    if (!item) return;
    const checkIn = itemCheckIns.find((c) => c.items.some((it) => it.id === itemId)) ?? null;
    setCheckInProductId(null);
    setCheckInSeed({ item, itemCheckIn: checkIn });
    setCheckInOpen(true);
  }

  function openDetailedCheckIn(productId?: number | null) {
    setCheckInProductId(productId ?? null);
    setCheckInSeed(null);
    setCheckInOpen(true);
  }

  function closeDetailedCheckIn() {
    setCheckInOpen(false);
    setCheckInSeed(null);
    setCheckInProductId(null);
  }

  function openProductEditor(productId: number | null) {
    setProductEditorProductId(productId);
    setProductEditorOpen(true);
  }

  function closeProductEditor() {
    setProductEditorOpen(false);
    setProductEditorProductId(null);
  }

  function refreshSavedProductInRow(savedProduct: Product) {
    queryClient.setQueryData<ProcessingWorkspaceRowDTO>(
      ['processing-row-detail', orderId, row.processing_row_id],
      (prev) => updateProductSnapshotInProcessingRow(prev, savedProduct),
    );
    queryClient.setQueriesData<{ rows?: ProcessingWorkspaceRowDTO[] }>(
      { queryKey: ['processing-workspace', orderId] },
      (prev) => (
        prev?.rows ?
          {
            ...prev,
            rows: prev.rows.map((r) =>
              r.processing_row_id === row.processing_row_id ?
                updateProductSnapshotInProcessingRow(r, savedProduct) ?? r
              : r,
            ),
          }
        : prev
      ),
    );
    void queryClient.invalidateQueries({ queryKey: ['processing-row-detail', orderId, row.processing_row_id] });
    void queryClient.invalidateQueries({ queryKey: ['processing-workspace', orderId] });
  }

  async function handleSaveProductDecision(payload: Record<string, unknown>): Promise<boolean> {
    try {
      await setRowProduct.mutateAsync({
        processing_row_id: row.processing_row_id,
        ...payload,
      });
      return true;
    } catch (err) {
      enqueueSnackbar(apiErrorDetail(err, 'Could not save product'), { variant: 'error' });
      return false;
    }
  }

  async function handleAttachExistingProduct(productId: number | null | undefined) {
    if (productId == null) return;
    if (attachedProductIds.has(productId)) {
      enqueueSnackbar('That product is already attached to this row.', { variant: 'info' });
      return;
    }
    const ok = await handleSaveProductDecision({
      product_mode: 'existing',
      product_id: productId,
    });
    if (ok) {
      enqueueSnackbar('Product attached.', { variant: 'success' });
    }
  }

  async function handleProductLinkConfigChange(productId: number, config: ProcessingProductLinkConfig) {
    await patchRow({
      product_links: buildProductLinksPatch(row.productLinks, productId, config),
    });
  }

  async function handleDetachAttachedProduct(productId: number) {
    const attached = attachedProducts.find((p) => p.productId === productId);
    const label = attached?.productNumber || attached?.title || `product #${productId}`;
    const ok = await confirm({
      title: 'Remove attached product?',
      message: `Remove ${label} from this manifest row? Prior check-ins for this product are not deleted.`,
      confirmLabel: 'Remove',
      severity: 'warning',
    });
    if (!ok) return;
    try {
      await patchRow({
        product_links: buildProductLinksRemove(row.productLinks, productId),
      });
    } catch {
      // Parent patch handler shows error snackbar.
    }
  }

  async function handleReprintCheckIn(historyRow: CheckedInHistoryRow) {
    if (!onReprintItems) return;
    const qty = historyRow.qty;
    const action = checkInPrintActionLabel(historyRow.items, qty);
    const ok = await confirm({
      title: `${action} labels?`,
      message: `${action} ${qty.toLocaleString()} label${qty === 1 ? '' : 's'} for this check-in?`,
      confirmLabel: action,
      severity: 'info',
    });
    if (!ok) return;
    await onReprintItems(historyRow.items);
  }

  async function handleDeleteItemCheckIn(historyRow: CheckedInHistoryRow) {
    if (historyRow.itemCheckInId == null) return;
    const n = historyRow.qty;
    const productLabel = historyRow.item.product_number || product?.product_number || null;
    const ok = await confirm({
      title: 'Delete check-in?',
      message: productLabel ?
        `This removes ${n.toLocaleString()} item${n === 1 ? '' : 's'} (tag${n === 1 ? '' : 's'}) from inventory. Product ${productLabel} will also be deleted if no other items or rows reference it.`
      : `This removes ${n.toLocaleString()} item${n === 1 ? '' : 's'} (tag${n === 1 ? '' : 's'}) from inventory. The check-in product will also be deleted if nothing else references it.`,
      confirmLabel: 'Delete check-in',
      severity: 'error',
      confirmColor: 'error',
    });
    if (!ok) return;
    try {
      const data = await deleteItemCheckIn.mutateAsync(historyRow.itemCheckInId);
      enqueueSnackbar(
        data.product_deleted ?
          `Deleted check-in - ${data.items_deleted} item(s) removed; orphaned product deleted.`
        : `Deleted check-in - ${data.items_deleted} item(s) removed.`,
        { variant: 'success' },
      );
      if (activeItem && historyRow.items.some((it) => it.id === activeItem.id)) {
        onSelectItemId(historyRow.items[0]?.id ?? 0);
      }
    } catch (err) {
      enqueueSnackbar(apiErrorDetail(err, 'Could not delete check-in'), { variant: 'error' });
    }
  }

  /** Edit mode of the detailed dialog: update the clicked ItemCheckIn in place. */
  async function handleUpdateItemCheckIn(
    itemCheckInId: number,
    payload: ProcessingCheckInPayload,
    options: { printLabels: boolean },
  ): Promise<boolean> {
    try {
      const data = await updateItemCheckIn.mutateAsync({ itemCheckInId, payload });
      const parts: string[] = [];
      if (data.items_added) parts.push(`${data.items_added} added`);
      if (data.items_removed) parts.push(`${data.items_removed} removed`);
      if (data.items_updated) parts.push(`${data.items_updated} updated`);
      enqueueSnackbar(`Check-in saved${parts.length ? ` - ${parts.join(', ')}` : ''}.`, { variant: 'success' });
      if (options.printLabels && data.printed_items_preview?.length) {
        const result = await printProcessingLabelsAndMarkPrinted(
          printedPreviewToLabelInputs(data.printed_items_preview),
        );
        if (result.failed > 0) enqueueSnackbar(`${result.failed} label(s) failed to print.`, { variant: 'warning' });
        if (result.markFailed) {
          enqueueSnackbar('Labels printed but printed status could not be saved.', { variant: 'warning' });
        }
      }
      if (payload.dispatch === 'restoration' && data.restoration_job_id) {
        const from = `/inventory/processing/${orderId}`;
        navigate(
          `/inventory/restorations?lane=to&job=${data.restoration_job_id}&from=${encodeURIComponent(from)}`,
        );
      }
      return true;
    } catch (err) {
      enqueueSnackbar(apiErrorDetail(err, 'Could not save check-in'), { variant: 'error' });
      return false;
    }
  }

  /** Inline condition/dispatch edit in the Prior check-ins table - applies to the whole check-in. */
  async function handleSetCheckInField(
    target: CheckedInHistoryRow,
    field: 'condition' | 'dispatch',
    value: string,
  ) {
    const editable = target.items.filter((it) => it.status === 'on_shelf');
    const skipped = target.items.length - editable.length;
    try {
      for (const it of editable) {
        await patchItem.mutateAsync({ itemId: it.id, payload: { [field]: value } });
      }
      enqueueSnackbar(
        `${field === 'dispatch' ? 'Dispatch' : 'Condition'} updated on ${editable.length} item(s)`
          + (skipped > 0 ? ` - ${skipped} skipped (not on shelf).` : '.'),
        { variant: skipped > 0 ? 'warning' : 'success' },
      );
    } catch (err) {
      enqueueSnackbar(apiErrorDetail(err, 'Could not update check-in'), { variant: 'error' });
    }
  }

  async function handleSetCheckInPrice(target: CheckedInHistoryRow, value: string) {
    if (!isValidCheckInPrice(value)) {
      enqueueSnackbar('Enter a valid shelf price.', { variant: 'warning' });
      return;
    }
    try {
      if (target.itemCheckInId != null) {
        await updateItemCheckIn.mutateAsync({
          itemCheckInId: target.itemCheckInId,
          payload: { price: value },
        });
        enqueueSnackbar('Price updated for this check-in.', { variant: 'success' });
        return;
      }
      const editable = target.items.filter((it) => it.status === 'on_shelf');
      const skipped = target.items.length - editable.length;
      for (const it of editable) {
        await patchItem.mutateAsync({ itemId: it.id, payload: { price: value } });
      }
      enqueueSnackbar(
        `Price updated on ${editable.length} item(s)`
          + (skipped > 0 ? ` - ${skipped} skipped (not on shelf).` : '.'),
        { variant: skipped > 0 ? 'warning' : 'success' },
      );
    } catch (err) {
      enqueueSnackbar(apiErrorDetail(err, 'Could not update price'), { variant: 'error' });
    }
  }

  /** Inline product remap in Prior check-ins - limited to products attached on this row. */
  async function handleSetCheckInProduct(target: CheckedInHistoryRow, productId: number) {
    if (target.itemCheckInId == null) return;
    const currentId = target.checkInProduct?.id ?? target.item.product;
    if (currentId === productId) return;
    if (!attachedProductIds.has(productId)) {
      enqueueSnackbar('That product is not attached to this manifest row.', { variant: 'warning' });
      return;
    }
    try {
      await remapItemCheckInProduct.mutateAsync({
        itemCheckInId: target.itemCheckInId,
        payload: { product_mode: 'existing', product_id: productId },
      });
      enqueueSnackbar('Check-in product updated.', { variant: 'success' });
    } catch (err) {
      enqueueSnackbar(apiErrorDetail(err, 'Could not update check-in product'), { variant: 'error' });
    }
  }

  // Legacy split rows may still offer Restart (manager only).
  const canRestart = isManager && (row.splitFamily?.canRestart ?? false);

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
        `Row ${data.summary.root_row_number} restarted - ${data.summary.item_count} item(s) removed.`,
        { variant: 'success' },
      );
      // A restarted SUB row no longer exists; return to the queue rather than a dead detail.
      if (row.splitParentId != null) onBackToQueue();
    } catch (err) {
      enqueueSnackbar(apiErrorDetail(err, 'Restart failed'), { variant: 'error' });
    }
  }

  const rowDetailsBand = (
    <Paper
      variant="outlined"
      sx={{
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        mb: 0.75,
        borderColor: alpha(processingTokens.primary, 0.24),
        borderLeft: 3,
        borderLeftColor: processingTokens.primary,
        bgcolor: processingTokens.surfaceRaised,
        overflow: 'hidden',
        boxShadow: '0 1px 4px rgba(26, 27, 24, 0.05)',
      }}
    >
      <Box
        sx={{
          px: 0.75,
          pt: 0.5,
          pb: 0.25,
          bgcolor: processingTokens.cardHeaderRowDetailBg,
          borderBottom: 1,
          borderColor: alpha(processingTokens.primary, 0.16),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: 0.25,
        }}
      >
        <Typography
          variant="caption"
          sx={{
            fontWeight: 900,
            letterSpacing: 0.7,
            fontSize: '0.625rem',
            textTransform: 'uppercase',
            color: processingTokens.cardHeaderRowDetailText,
            lineHeight: 1.2,
          }}
        >
          Row details
        </Typography>
        <ProcessingGoogleSearchButton
          brand={rowBookmark.brand || product?.brand}
          title={displayTitle}
          model={rowBookmark.model || product?.model}
          searchTags={parseSearchTagsCsv(row.tags || '')}
          color={processingTokens.cardHeaderRowDetailText}
          sx={{ ml: -0.15 }}
        />
      </Box>
      <Box sx={{ minWidth: 0, px: 0.75, pb: 0.55 }}>
        <ManifestFieldNavProvider>
          <ManifestModalNavBridge
            onOpenIdentifiers={() => setIdentifiersModalOpen(true)}
            onOpenTags={() => setTagsModalOpen(true)}
            onOpenNotes={() => setNotesModalOpen(true)}
          />
          <Box sx={{ ...processingRowManifestToolbarRowSx, gap: 0.45, flexWrap: 'nowrap', overflowX: 'auto', pb: 0.15 }}>
            <ManifestToolbarSlot sx={manifestToolbarTitleSx}>
              <ManifestField fieldId="title" label="Title" value={rowBookmark.title} layerSources={row.rowLayerSources?.title ?? {}} variant="pill" onSave={(v) => patchRow({ title: v.trim() })} />
            </ManifestToolbarSlot>
            <ManifestToolbarSlot sx={manifestToolbarCompactFieldSx}>
              <ManifestField fieldId="brand" label="Brand" value={rowBookmark.brand} layerSources={row.rowLayerSources?.brand ?? {}} variant="pill" onSave={(v) => patchRow({ brand: v })} />
            </ManifestToolbarSlot>
            <ManifestToolbarSlot sx={manifestToolbarCompactFieldSx}>
              <ManifestField fieldId="model" label="Model" value={rowBookmark.model} layerSources={row.rowLayerSources?.model ?? {}} variant="pill" onSave={(v) => patchRow({ model: v })} />
            </ManifestToolbarSlot>
            <ManifestToolbarSlot sx={manifestToolbarEditablePillSlotSx}>
              <ManifestField
                fieldId="category"
                label="Category"
                value={rowBookmark.category}
                layerSources={row.rowLayerSources?.category ?? {}}
                variant="pill"
                selectOptions={TAXONOMY_V1_CATEGORY_NAMES}
                onSave={(v) => patchRow({ category: v })}
              />
            </ManifestToolbarSlot>
            <ManifestToolbarSlot sx={manifestToolbarMoneyFieldSx}>
              <ManifestField
                fieldId="unitRetail"
                label="Retail"
                currency
                value={displayRetail}
                layerSources={row.rowLayerSources?.unitRetail ?? {}}
                variant="pill"
                onSave={(v) => {
                  const nextPrice = retailPriceLock.priceForRetail(v, {
                    retail: displayRetail,
                    price: displayPrice,
                  });
                  if (nextPrice) retailPriceLock.syncPctFromPrice(v, nextPrice);
                  setMoneyOverlay({
                    retail: v,
                    price: nextPrice ?? displayPrice,
                  });
                  void patchRow({
                    unit_retail: v || undefined,
                    ...(nextPrice ? { shelf_price: nextPrice } : {}),
                  });
                }}
              />
            </ManifestToolbarSlot>
            {/* Spacer matches ManifestField label so lock sits mid-pill, not mid-label+pill. */}
            <Box
              sx={{
                flex: '0 0 auto',
                display: 'flex',
                flexDirection: 'column',
                py: 0.35,
                px: 0.15,
              }}
            >
              <Box sx={{ ...processingRowLabelSx, visibility: 'hidden', userSelect: 'none' }} aria-hidden>
                &nbsp;
              </Box>
              <Box
                sx={{
                  height: PROCESSING_ROW_FIELD_HEIGHT,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <RetailPriceLockToggle
                  locked={retailPriceLock.locked}
                  pct={retailPriceLock.effectivePct(displayRetail, displayPrice)}
                  size="small"
                  onToggle={() => retailPriceLock.toggleLock(displayRetail, displayPrice)}
                />
              </Box>
            </Box>
            <ManifestToolbarSlot sx={manifestToolbarMoneyFieldSx}>
              <ManifestField
                fieldId="price"
                label="Price"
                currency
                value={displayPrice}
                layerSources={row.rowLayerSources?.price ?? {}}
                variant="pill"
                onSave={(v) => {
                  retailPriceLock.syncPctFromPrice(displayRetail, v);
                  setMoneyOverlay({ retail: displayRetail, price: v });
                  void patchRow({ shelf_price: v || undefined });
                }}
              />
            </ManifestToolbarSlot>
            {/* % badge outside ManifestField so click/Enter don't fight pill edit + tooltip. */}
            <Box
              sx={{
                flex: '0 0 auto',
                display: 'flex',
                flexDirection: 'column',
                py: 0.35,
                pl: 0.15,
                pr: 0.35,
              }}
            >
              <Box sx={{ ...processingRowLabelSx, visibility: 'hidden', userSelect: 'none' }} aria-hidden>
                &nbsp;
              </Box>
              <Box
                sx={{
                  height: PROCESSING_ROW_FIELD_HEIGHT,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <RetailPricePctButton
                  retail={displayRetail}
                  price={displayPrice}
                  pct={retailPriceLock.effectivePct(displayRetail, displayPrice)}
                  isFallback={retailPriceLock.isPctFallback(displayRetail, displayPrice)}
                  size="small"
                  onCommitPct={(nextPct, nextPrice) => {
                    retailPriceLock.setPct(nextPct);
                    setMoneyOverlay({ retail: displayRetail, price: nextPrice });
                    void patchRow({ shelf_price: nextPrice });
                  }}
                />
              </Box>
            </Box>
            <ManifestModalField
              label="Identifiers"
              summary={identifiersSummary(rowBookmark.identifiers)}
              hoverTitle={identifiersFullText(rowBookmark.identifiers)}
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
                value={rowBookmark.identifiers}
                onSave={(identifiers) => patchRow({ identifiers })}
              />
            </ManifestModalField>
            <ManifestModalField
              label="Tags"
              summary={tagsSummary(row.tags || '')}
              hoverTitle={tagsFullText(row.tags || '')}
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
              hoverTitle={notesFullText(row.manifestNotes || '')}
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
      </Box>
    </Paper>
  );

  return (
    <Card variant="outlined" sx={{ height: '100%', width: '100%', maxWidth: '100%', minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', borderRadius: 0 }}>
      <ProcessingRowHeader
        qtyCheckedIn={qtyCheckedIn}
        qtyExpected={qtyExpected}
        qtyRemaining={qtyRemaining}
        qtyOverage={qtyOverage}
        itemCount={manifestProgress.itemCount}
        usesManifestAccounting={manifestProgress.usesManifestAccounting}
        distinctProducts={distinctProducts}
        itemCheckInCount={checkInCount}
        disputedCount={disputedCount}
        productsChipLabel={productsChipLabel}
        groupChipLabel={collapseGroupLabel}
        onBackToQueue={onBackToQueue}
        onRefreshDetail={onRefreshDetail}
        detailRefreshing={detailRefreshing}
      />

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          px: { xs: 1, md: 1.5 },
          py: { xs: 0.75, md: 1 },
          bgcolor: processingTokens.cardDeckBg,
        }}
      >
        <Box sx={{ flexShrink: 0, minWidth: 0, width: '100%' }}>
          {rowDetailsBand}

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', mb: 0.65 }}>
            {canRestart ?
              <Button
                size="small"
                color="warning"
                variant="outlined"
                disabled={restartRow.isPending}
                onClick={() => void openRestartConfirm()}
                sx={{ fontSize: '0.6875rem', py: 0.2 }}
              >
                Restart row…
              </Button>
            : null}
          </Box>

          <Stack spacing={0.55} sx={{ mb: 0.75 }}>
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
            {row.splitParentId != null ?
              <Alert severity="info" sx={{ mt: 0.75, py: 0.25, '& .MuiAlert-message': { py: 0.4 } }}>
                Sub row {row.splitParentRowNumber != null && row.splitSeq != null ? `#${row.splitParentRowNumber}.${row.splitSeq}` : ''} -
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
                    .map((c) => `#${row.splitFamily!.rootRowNumber}.${c.splitSeq ?? '?'} (${c.qty.toLocaleString()})`)
                    .join(', ')} - remainder stays here.`
                : 'This row was converted by Break apart / Make set.'}
              </Alert>
            : null}
          </Stack>

          <Paper
            variant="outlined"
            sx={{
              flex: '0 1 auto',
              minHeight: 0,
              width: '100%',
              maxWidth: '100%',
              maxHeight: { xs: 280, md: '34vh' },
              mb: 0.65,
              p: 0.65,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              borderColor: processingTokens.cardboardBrownBorder,
              borderLeft: 3,
              borderLeftColor: processingTokens.cardboardBrown,
              bgcolor: '#fbfaf8',
              boxShadow: '0 1px 4px rgba(26, 27, 24, 0.05)',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                mx: -0.65,
                mt: -0.65,
                mb: 0.5,
                px: 0.75,
                py: 0.5,
                minWidth: 0,
                bgcolor: processingTokens.cardboardBrownSoft,
                borderBottom: 1,
                borderColor: processingTokens.cardboardBrownBorder,
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 900,
                  letterSpacing: 0.7,
                  fontSize: '0.625rem',
                  textTransform: 'uppercase',
                  color: processingTokens.cardboardBrownDark,
                }}
              >
                Attached products ({attachedProducts.length})
              </Typography>
              <Box sx={{ flex: 1, minWidth: 8 }} />
              <Button size="small" variant="outlined" sx={{ fontSize: '0.6875rem', py: 0.2 }} startIcon={<Add sx={{ fontSize: 14 }} />} onClick={() => openProductEditor(null)}>
                New product
              </Button>
            </Box>
            <Stack spacing={0.45} sx={{ flex: '1 1 auto', minHeight: 0, overflow: 'hidden' }}>
              <Box
                sx={{
                  flexShrink: 0,
                  px: 0.75,
                  py: 0.35,
                  border: 1,
                  borderColor: processingTokens.border,
                  borderRadius: 1,
                  bgcolor: processingTokens.surfaceRaised,
                }}
              >
                <ProductSearchAutocomplete
                  scope="processing-row-attach"
                  label="Search to add product"
                  placeholder="Type product #, title, brand, model, UPC…"
                  value={null}
                  onSelect={(product) => void handleAttachExistingProduct(product?.id)}
                  searchOnly
                  helperText=""
                />
              </Box>
              <Stack
                spacing={0.45}
                sx={{
                  flex: '1 1 auto',
                  minHeight: 0,
                  overflowY: 'auto',
                  overscrollBehavior: 'contain',
                  pr: 0.25,
                }}
              >
                {attachedProducts.map((attached) => (
                  <AttachedProductCard
                    key={attached.key}
                    product={attached}
                    hideManifestAccounting={isAddedRow}
                    onCheckIn={() => openDetailedCheckIn(attached.productId)}
                    onEditProduct={() => {
                      if (attached.productId != null) openProductEditor(attached.productId);
                    }}
                    onLinkConfigChange={(config) => {
                      if (attached.productId != null) void handleProductLinkConfigChange(attached.productId, config);
                    }}
                    onRemove={
                      attached.productId != null && !attached.checkedInQty
                        ? () => void handleDetachAttachedProduct(attached.productId!)
                        : undefined
                    }
                  />
                ))}
              </Stack>
            </Stack>
          </Paper>

          {terminalDisputed ?
            <Alert severity="error" variant="outlined" sx={{ py: 0.25, mb: 1 }}>
              Terminal dispute ({activeStatus}).
            </Alert>
          : null}
        </Box>

        <Box
          ref={priorCheckInsRef}
          sx={{ flex: '1 1 0', minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column' }}
        >
          <ProcessingRowSection
            title="Prior check-ins"
            note="Select a row to review or edit it."
            surface="priorCheckIns"
            fill
            sx={{
              mb: 0,
              minWidth: 0,
              maxWidth: '100%',
              borderColor: processingTokens.borderStrong,
              borderLeft: 3,
              borderLeftColor: processingTokens.accentBlue,
              boxShadow: '0 1px 4px rgba(26, 27, 24, 0.05)',
            }}
            bodySx={{ p: 0, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          >
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
                fallbackProduct={product}
                attachedProductOptions={attachedProductOptions}
                activeItemId={activeItem?.id ?? null}
                onSelectItemId={handleSelectPriorCheckIn}
                onReprintCheckIn={onReprintItems ? (historyRow) => void handleReprintCheckIn(historyRow) : undefined}
                onDeleteItemCheckIn={isManager ? (historyRow) => void handleDeleteItemCheckIn(historyRow) : undefined}
                onSetCheckInProduct={
                  attachedProductOptions.length > 0 ?
                    (historyRow, productId) => void handleSetCheckInProduct(historyRow, productId)
                  : undefined
                }
                onSetCheckInCondition={(historyRow, value) => void handleSetCheckInField(historyRow, 'condition', value)}
                onSetCheckInDispatch={(historyRow, value) => void handleSetCheckInField(historyRow, 'dispatch', value)}
                onSetCheckInPrice={(historyRow, value) => void handleSetCheckInPrice(historyRow, value)}
                onEditCheckInProduct={(productId) => openProductEditor(productId)}
                showDeleteCheckInAction={isManager}
                scrollable
              />
            </Paper>
          </ProcessingRowSection>
        </Box>

      </Box>

      <ProcessingCheckInDialog
        open={checkInOpen}
        row={row}
        initialProductId={checkInProductId}
        loading={checkInLoading || updateItemCheckIn.isPending}
        seed={checkInSeed}
        onClose={closeDetailedCheckIn}
        onSubmit={onCheckIn}
        onUpdateItemCheckIn={handleUpdateItemCheckIn}
      />
      {productEditorOpen && (productEditorProductId == null || productEditorQuery.data) ?
        <ProductManagePanel
          open
          initialProduct={productEditorProductId == null ? null : productEditorQuery.data ?? null}
          rowDetailsSeed={productEditorProductId == null ? newProductEditorSeed : undefined}
          rowDetailsSeedKey={productEditorProductId == null ? row.processing_row_id : undefined}
          onClose={closeProductEditor}
          onProductSaved={(savedProduct: Product, ctx) => {
            refreshSavedProductInRow(savedProduct);
            if (ctx.created) {
              void handleAttachExistingProduct(savedProduct.id);
            }
            closeProductEditor();
          }}
        />
      : null}
      <ProcessingRestartRowDialog
        open={restartSummary != null}
        summary={restartSummary}
        loading={restartRow.isPending}
        onClose={() => setRestartSummary(null)}
        onConfirm={handleRestartConfirm}
      />
      {ConfirmDialogHost}
    </Card>
  );
}

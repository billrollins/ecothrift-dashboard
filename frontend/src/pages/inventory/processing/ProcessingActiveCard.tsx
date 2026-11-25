import LinearScale from '@mui/icons-material/LinearScale';
import JoinFull from '@mui/icons-material/JoinFull';
import {
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
  Switch,
  TextField,
  Tooltip,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react';
import { CheckInUndoDialog, type CheckInUndoTarget } from './CheckInUndoDialog';
import { useSnackbar } from 'notistack';
import { canAccess } from '../../../auth/access';
import { useAuth } from '../../../contexts/AuthContext';
import {
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
import { ProcessingLikelyProducts, ProcessingProductSearch } from './ProcessingProductFinder';
import { PaneNote, PaneStat, ProductPane } from './ProcessingProductPane';
import { lastCheckInForProduct } from './processingCheckInDefaults';
import { attachedStatusLine, attachedTotals } from './processingAttachedStats';
import {
  fieldsPhrase,
  patchFor,
  pendingFields,
  revertField,
  sameFieldValue,
  savedValuesOf,
  shownValues,
  stageValue,
  type RowEditField,
  type RowEditValues,
  type RowPending,
} from './processingRowEdits';
import { useProcessingUndo } from './processingUndo';
import { PROCESSING_QUEUE_TABLE_HEAD_HEIGHT, PROCESSING_QUEUE_TABLE_ROW_HEIGHT } from './processingQueueLayout';
import type { NewPackResult } from '../../../api/productPacks.api';
import {
  openRowSearchTabs,
  readAutoOpenRowSearch,
  rowSearchTabs,
  writeAutoOpenRowSearch,
} from './processingVendorSearch';
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
import { preventWheelChangeNumber, sanitizeDecimalPaste } from '../../../utils/formInputs';
import { isTaxonomyV1CategoryName, TAXONOMY_V1_CATEGORY_NAMES } from '../../../constants/taxonomyV1';
import { ProcessingGoogleSearchButton } from './ProcessingGoogleSearchButton';
import { PhotoSheetButton } from '../../../components/photoSheets/PhotoSheetButton';
import { parseSearchTagsCsv } from './processingGoogleQuery';
import { ProcessingCheckInDialog, type ProcessingCheckInSeed } from './ProcessingCheckInDialog';
import { RowDisputeDialog } from './RowDisputeDialog';
import { RestorationRequestDialog } from '../restorationRequest/RestorationRequestDialog';
import { ProcessingRowSection } from './ProcessingRowSection';
import { processingTokens } from './processingTokens';
import { ManifestFieldNavContext, ManifestFieldNavProvider } from './manifestFieldNav';
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
  PROCESSING_ROW_VALUE_FONT,
  PROCESSING_ROW_VALUE_FONT_COMPACT,
  PROCESSING_ROW_VALUE_FONT_EMPHASIZED,
  PROCESSING_ROW_VALUE_FONT_WEIGHT,
  processingRowLabelSx,
} from './processingRowFieldTokens';
import { IconAdd as Add, IconBack as ArrowBack, IconClose as Close, IconConfirm as Check, IconDelete as DeleteOutline, IconRefresh as Refresh, IconUndo } from '../../../icons/ecoIcons';

/**
 * The row screen's fixed heights (#229, Bill 2026-11-25: "Checkin Area gets WAY too much space (4 lines with vert
 * scroll when needed is plenty)"; the two product lists "are static so if empty they still hold a fixed height").
 */
export const CHECK_INS_VISIBLE_LINES = 4;
/** The check-ins table: its heading line and four lines; more scroll inside. */
export const CHECK_INS_TABLE_PX = PROCESSING_QUEUE_TABLE_HEAD_HEIGHT + CHECK_INS_VISIBLE_LINES * PROCESSING_QUEUE_TABLE_ROW_HEIGHT + 2;
/**
 * The least height of the two product lists on a computer (their heading and three lines); they take all the height
 * that is left above it. A 1366 x 768 laptop gives them 139 px with no scrolling; a shorter screen scrolls.
 */
export const PRODUCT_PANES_MIN_PX = 130;
/** On a phone the two lists stack, each at this height. */
export const PRODUCT_PANE_PHONE_PX = 212;
/** The Row details heading line: fixed, so a note chip or the Restart button in it moves nothing. */
const ROW_DETAILS_HEADER_PX = 32;

const manifestToolbarEmphasisFieldSx = {
  valueFontSize: PROCESSING_ROW_VALUE_FONT_EMPHASIZED,
  valueFontWeight: PROCESSING_ROW_VALUE_FONT_WEIGHT,
} as const;

/** No change typed on the row: one object, so a row with nothing pending never re-renders for it. */
const NO_PENDING: RowPending = {};

/**
 * The manifest row's fields, one kept line (#230, Bill 2026-11-25: fields "wide enough" that the X and the tick
 * never move the fields beside them, and "use the space ... stretch Notes or other fields if screen is big enough").
 *
 * A grid: each column has a least width that holds its text with the two buttons inside, and takes its share of
 * any room left. Title, Brand, Model, Category, Retail, the lock, Price, the percent, Identifiers, Tags, Notes,
 * then "Apply changes" / "Cancel all". A screen too narrow for the least widths scrolls the line sideways, and the
 * two buttons stay in view at its right edge.
 */
const ROW_FIELDS_GRID_COLUMNS = [
  'minmax(150px, 2.4fr)', // Title
  'minmax(108px, 1fr)', // Brand
  'minmax(108px, 1fr)', // Model
  'minmax(132px, 1.4fr)', // Category
  'minmax(100px, 0.8fr)', // Retail
  'auto', // lock
  'minmax(100px, 0.8fr)', // Price
  'auto', // percent
  'minmax(118px, 1.3fr)', // Identifiers
  'minmax(86px, 1fr)', // Tags
  'minmax(90px, 2fr)', // Notes
  'auto', // Apply changes / Cancel all
].join(' ');

/**
 * "Apply changes" and "Cancel all" at the end of the row (#230). Always there, greyed until a field is highlighted,
 * so they never push the fields. After the last field, Tab lands on "Apply changes".
 */
export function RowEditActions({ count, busy, onApply, onCancel }: {
  count: number;
  busy: boolean;
  onApply: () => void;
  onCancel: () => void;
}) {
  const nav = useContext(ManifestFieldNavContext);
  const applyRef = useRef<HTMLButtonElement>(null);
  useEffect(() => nav?.registerEnd(() => applyRef.current?.focus()), [nav]);
  const idle = count === 0 || busy;
  const what = count === 1 ? '1 change' : `${count} changes`;
  return (
    <Box
      data-testid="row-edit-actions"
      sx={{
        position: 'sticky',
        right: 0,
        zIndex: 1,
        alignSelf: 'stretch',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        gap: '2px',
        pl: 0.75,
        py: 0.35,
        bgcolor: processingTokens.surfaceRaised,
        boxShadow: '-8px 0 6px -6px rgba(255, 255, 255, 0.95)',
      }}
    >
      <Tooltip title={count ? `Save ${what} (Enter in a field does the same)` : ''} enterDelay={400} disableInteractive>
        <span style={{ display: 'block', lineHeight: 0 }}>
          <Button
            ref={applyRef}
            size="small"
            variant="contained"
            disabled={idle}
            onClick={onApply}
            aria-label={count ? `Apply ${what}` : 'Apply changes'}
            sx={{ width: '100%', height: 19, minHeight: 19, py: 0, px: 0.9, fontSize: '0.6875rem', fontWeight: 800, whiteSpace: 'nowrap', lineHeight: 1 }}
          >
            Apply changes
          </Button>
        </span>
      </Tooltip>
      <Button
        size="small"
        color="inherit"
        variant="outlined"
        disabled={idle}
        onClick={onCancel}
        sx={{ height: 17, minHeight: 17, py: 0, px: 0.9, fontSize: '0.6875rem', fontWeight: 700, whiteSpace: 'nowrap', lineHeight: 1, borderColor: processingTokens.border }}
      >
        Cancel all
      </Button>
    </Box>
  );
}

/**
 * Undo and Redo with their keys said on them (#230, Bill 2026-11-25: "a hot key hint so processors know they can
 * undo"). Always the same size at the right end of the row's header; greyed when there is nothing to undo.
 */
function UndoRedoButtons() {
  const undo = useProcessingUndo();
  if (!undo) return null;
  const buttonSx = {
    minWidth: 0,
    height: 22,
    px: 0.7,
    py: 0,
    gap: 0.4,
    fontSize: '0.625rem',
    fontWeight: 800,
    whiteSpace: 'nowrap',
    textTransform: 'none',
    color: processingTokens.rowStatusHeaderText,
    borderColor: 'rgba(27, 94, 32, 0.35)',
    bgcolor: 'rgba(255, 255, 255, 0.55)',
    '& .MuiButton-startIcon': { mr: 0.1, ml: 0 },
    '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.9)', borderColor: processingTokens.primaryDark },
  } as const;
  const keySx = { fontFamily: processingTokens.monoFontFamily, fontWeight: 700, opacity: 0.75 } as const;
  return (
    <Box data-testid="undo-redo" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, flexShrink: 0 }}>
      <Tooltip title={undo.undoLabel ? `Undo: ${undo.undoLabel}` : 'Nothing to undo'} enterDelay={300} disableInteractive>
        <span>
          <Button
            size="small"
            variant="outlined"
            disabled={!undo.undoLabel || undo.busy}
            onClick={() => void undo.undo()}
            startIcon={<IconUndo sx={{ fontSize: 13 }} />}
            aria-label="Undo (Ctrl+Z)"
            sx={buttonSx}
          >
            Undo
            <Box component="span" sx={keySx}>Ctrl+Z</Box>
          </Button>
        </span>
      </Tooltip>
      <Tooltip title={undo.redoLabel ? `Redo: ${undo.redoLabel}` : 'Nothing to redo'} enterDelay={300} disableInteractive>
        <span>
          <Button
            size="small"
            variant="outlined"
            disabled={!undo.redoLabel || undo.busy}
            onClick={() => void undo.redo()}
            startIcon={<IconUndo sx={{ fontSize: 13, transform: 'scaleX(-1)' }} />}
            aria-label="Redo (Ctrl+Y)"
            sx={buttonSx}
          >
            Redo
            <Box component="span" sx={keySx}>Ctrl+Y</Box>
          </Button>
        </span>
      </Tooltip>
    </Box>
  );
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
          useFlexGap
          alignItems="center"
          justifyContent={{ xs: 'flex-start', md: 'flex-end' }}
          sx={{
            justifySelf: { xs: 'start', md: 'end' },
            gridColumn: { xs: '2', md: '4' },
            gridRow: { xs: '1', md: '1' },
            minWidth: 0,
            maxWidth: '100%',
            // One line on a computer: more chips never make the header taller (they are cut at the left instead).
            flexWrap: { xs: 'wrap', md: 'nowrap' },
            overflow: { md: 'hidden' },
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
          {/* Last, so they keep their place at the right end whatever chips the row has. */}
          <UndoRedoButtons />
        </Stack>
      </Box>
    </Box>
  );
}

function resolveSelectOptions(
  options: readonly string[],
  currentRaw: string,
  isKnown: (v: string) => boolean = (v) => options.includes(v),
): string[] {
  const current = currentRaw.trim();
  if (current && !isKnown(current)) return [...options, current];
  return [...options];
}

function manifestFieldValueFont(emphasis: 'compact' | 'normal' | 'emphasized' = 'normal'): string {
  return (
    emphasis === 'compact' ? PROCESSING_ROW_VALUE_FONT_COMPACT
    : emphasis === 'emphasized' ? PROCESSING_ROW_VALUE_FONT_EMPHASIZED
    : PROCESSING_ROW_VALUE_FONT
  );
}

/** One of the two small buttons inside a field that is being typed in: the tick saves, the X puts the field back. */
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
      tabIndex={-1}
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

/** The look of a field whose change is typed but not yet saved (#230: "leaves the field highlighted"). */
const CHANGED_FIELD_BORDER = '#d39a1b';
const CHANGED_FIELD_BG = '#fff6dc';

/**
 * One field of the manifest row, typed in place (#230, Bill 2026-11-25).
 *
 * - The field never changes size: the X and the tick sit inside its own width while it is being typed in, so the
 *   fields beside it do not move.
 * - Tab moves on (Shift+Tab back) and leaves a change **highlighted**, not saved. Clicking away does the same.
 * - Enter saves every highlighted change on the row and moves on; the tick saves and stays.
 * - The X puts this one field back to what is saved; Esc only stops the typing.
 *
 * The pending values live in the row card (`processingRowEdits.ts`); `value` is what the row shows now.
 */
export function ManifestField({
  fieldId,
  label,
  value,
  layerSources,
  currency = false,
  selectOptions,
  emphasis = 'normal',
  changed = false,
  onStage,
  onApply,
  onRevert,
}: {
  fieldId: RowEditField;
  label: string;
  /** What the row shows now: the pending value where there is one, else the saved one. */
  value: string;
  /** Manifest vs AI source values for hover tooltip. Pass `{}` to always show layer lines. */
  layerSources?: { manifest?: string; ai?: string; final?: string };
  currency?: boolean;
  selectOptions?: readonly string[];
  emphasis?: 'compact' | 'normal' | 'emphasized';
  /** This field holds a change that is not saved yet. */
  changed?: boolean;
  /** Keep the typed value as a highlighted change (Tab, or clicking away). */
  onStage: (value: string) => void;
  /** Keep the typed value and save every highlighted change (Enter, or the tick). */
  onApply: (value: string) => void | Promise<unknown>;
  /** Put this field back to what is saved (the X). */
  onRevert: () => void;
}) {
  const nav = useContext(ManifestFieldNavContext);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [selectMenuOpen, setSelectMenuOpen] = useState(false);
  const editContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);
  const suppressBlurRef = useRef(false);
  const valueFontSize = manifestFieldValueFont(emphasis);
  const trimmed = value?.trim() ?? '';
  const isEmpty = !trimmed;
  const shown = currency ? (isEmpty ? '-' : formatCurrency(value)) : (trimmed || '-');
  const pillPlaceholder = `Add ${label.toLowerCase()}`;
  const resolvedSelectOptions = useMemo(
    () => (selectOptions ? resolveSelectOptions(selectOptions, draft || value, isTaxonomyV1CategoryName) : []),
    [selectOptions, draft, value],
  );

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const beginEdit = useCallback(() => {
    setDraft(value);
    setEditing(true);
    if (selectOptions) setSelectMenuOpen(true);
  }, [selectOptions, value]);

  useEffect(() => {
    if (!nav) return;
    return nav.registerOpener(fieldId, beginEdit);
  }, [fieldId, nav, beginEdit]);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    if (inputRef.current instanceof HTMLInputElement || inputRef.current instanceof HTMLTextAreaElement) {
      inputRef.current.select();
    }
  }, [editing, selectMenuOpen]);

  function closeEditor() {
    suppressBlurRef.current = true;
    setSelectMenuOpen(false);
    setEditing(false);
    window.setTimeout(() => {
      suppressBlurRef.current = false;
    }, 0);
  }

  function typed(raw: string = draft): string {
    return currency ? sanitizeDecimalPaste(raw.trim()) : raw;
  }

  /** Tab, or clicking away: the change stays, highlighted. */
  function stageAndClose(direction?: 1 | -1, raw?: string) {
    const next = typed(raw);
    closeEditor();
    onStage(next);
    if (direction) nav?.focusAdjacent(fieldId, direction);
  }

  /** Enter (moves on) or the tick (stays): save everything highlighted. */
  function applyAndClose(move: boolean) {
    const next = typed();
    closeEditor();
    void onApply(next);
    if (move) nav?.focusAdjacent(fieldId, 1);
  }

  /** Esc: stop typing; what was highlighted before stays as it was. */
  function cancelEdit() {
    closeEditor();
    setDraft(value);
  }

  /** The X: this field goes back to what is saved. */
  function revertAndClose() {
    closeEditor();
    onRevert();
  }

  function handleBlur(e: FocusEvent) {
    if (suppressBlurRef.current) return;
    const related = e.relatedTarget as HTMLElement | null;
    if (editContainerRef.current?.contains(related)) return;
    // The category list opens in its own layer: focus there is still this field.
    if (related?.closest('.MuiPopover-root, .MuiMenu-root')) return;
    if (selectOptions && selectMenuOpen) return;
    stageAndClose();
  }

  function handleEditorKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancelEdit();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      stageAndClose(e.shiftKey ? -1 : 1);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      applyAndClose(true);
    }
  }

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
      data-testid={`row-field-${fieldId}`}
      data-changed={changed ? 'true' : undefined}
      data-editing={editing ? 'true' : undefined}
      sx={{
        display: 'flex',
        alignItems: 'stretch',
        width: '100%',
        minWidth: 0,
        height: PROCESSING_ROW_FIELD_HEIGHT,
        borderRadius: 1,
        border: '1px solid',
        borderColor:
          changed ? CHANGED_FIELD_BORDER
          : editing ? processingTokens.borderStrong
          : processingTokens.border,
        bgcolor:
          editing ? processingTokens.surfaceTint
          : changed ? CHANGED_FIELD_BG
          : (t) => alpha(t.palette.background.default, 0.4),
        overflow: 'hidden',
        cursor: editing ? 'default' : 'pointer',
        transition: (theme) => theme.transitions.create(['background-color', 'border-color'], { duration: 120 }),
        ...(!editing ?
          {
            '&:hover': {
              bgcolor: changed ? CHANGED_FIELD_BG : 'action.hover',
              borderColor: changed ? CHANGED_FIELD_BORDER : processingTokens.borderStrong,
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
              onKeyDown={(e) => handleEditorKeyDown(e as KeyboardEvent)}
              onBlur={(e) => handleBlur(e as FocusEvent)}
              slotProps={{
                select: {
                  open: selectMenuOpen,
                  onOpen: () => setSelectMenuOpen(true),
                  onClose: () => setSelectMenuOpen(false),
                  inputRef,
                },
                input: {
                  sx: {
                    fontSize: valueFontSize,
                    fontWeight: PROCESSING_ROW_VALUE_FONT_WEIGHT,
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
                height: '100%',
                '& .MuiInput-root': { alignItems: 'center', height: '100%' },
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
          : currency ?
            <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 0.25, pl: 1 }}>
              <Typography
                component="span"
                sx={{ color: 'text.secondary', fontWeight: 600, fontSize: valueFontSize, lineHeight: 1, flexShrink: 0 }}
              >
                $
              </Typography>
              <Box
                component="input"
                ref={inputRef}
                value={draft}
                inputMode="decimal"
                aria-label={label}
                onChange={(e) => setDraft(sanitizeDecimalPaste(e.target.value))}
                onBlur={handleBlur}
                onKeyDown={handleEditorKeyDown}
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
                  fontSize: valueFontSize,
                  fontVariantNumeric: 'tabular-nums',
                }}
              />
            </Box>
          : <Box
              component="input"
              ref={inputRef}
              value={draft}
              aria-label={label}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={handleEditorKeyDown}
              sx={{ ...manifestInputSx, fontSize: valueFontSize }}
            />
          }
          <FieldEditSegment
            kind="cancel"
            ariaLabel={`Put ${label} back`}
            onPointerDown={() => {
              suppressBlurRef.current = true;
            }}
            onClick={revertAndClose}
          />
          <FieldEditSegment
            kind="save"
            ariaLabel={`Save ${label}`}
            onPointerDown={() => {
              suppressBlurRef.current = true;
            }}
            onClick={() => applyAndClose(false)}
          />
        </>
      : <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', px: 0.75, gap: 0.5 }}>
          <Typography
            sx={{
              flex: 1,
              minWidth: 0,
              fontSize: valueFontSize,
              fontWeight: PROCESSING_ROW_VALUE_FONT_WEIGHT,
              lineHeight: 1.25,
              color: isEmpty ? 'text.disabled' : 'text.primary',
              fontStyle: isEmpty ? 'italic' : 'normal',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {isEmpty ? pillPlaceholder : shown}
          </Typography>
        </Box>
      }
    </Box>
  );

  return (
    // The same box whether the field is read or typed in: nothing beside it moves.
    <Box sx={{ minWidth: 0, width: '100%', py: 0.35 }}>
      <Typography variant="caption" color="text.secondary" fontWeight={editing ? 600 : 400} sx={processingRowLabelSx}>
        {label}
      </Typography>

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

export interface AttachedRowProduct {
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
  /** Pack standard (#224): "3 boxes × 100". */
  packLabel?: string;
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

/** A row note as a chip in the Row details heading line: it says what an Alert used to, without moving the page. */
function RowNoteChip({ label, title, color = 'info' }: { label: string; title?: string; color?: 'info' | 'error' }) {
  const chip = (
    <Chip
      size="small"
      color={color}
      variant="outlined"
      label={label}
      data-testid="row-note"
      sx={{ flexShrink: 1, minWidth: 0, height: 20, fontSize: '0.6875rem', fontWeight: 800, bgcolor: '#fff', '& .MuiChip-label': { px: 0.75 } }}
    />
  );
  return title ? <Tooltip title={title} enterDelay={300} disableInteractive>{chip}</Tooltip> : chip;
}

/** One attached product: Check in, what it is, its counts on this row, and a badge when other rows hold it too. */
export function AttachedProductCard({
  product,
  lastPrice,
  sameRows,
  onCheckInTogether,
  onCheckIn,
  onEditProduct,
  onLinkConfigChange,
  onRemove,
  hideManifestAccounting = false,
}: {
  product: AttachedRowProduct;
  /** Price of this product's last check-in on this row. */
  lastPrice?: string | null;
  /** Other rows of the order with this same product: a badge on the line, never a note that moves the page. */
  sameRows?: number[];
  onCheckInTogether?: () => void;
  onCheckIn: () => void;
  onEditProduct: () => void;
  onLinkConfigChange: (config: ProcessingProductLinkConfig) => void;
  onRemove?: () => void;
  hideManifestAccounting?: boolean;
}) {
  const line2 = [product.packLabel, product.brand, product.category].filter(Boolean).join(' · ');
  const titleLine = [product.productNumber, product.title].filter(Boolean).join(' · ');
  const statusLine = attachedStatusLine(product, lastPrice);
  const sameRowsText = sameRows?.length ? `row${sameRows.length === 1 ? '' : 's'} ${sameRows.join(', ')}` : '';
  return (
    <Box
      role="listitem"
      data-testid="attached-row"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 0.6,
        py: 0.4,
        minWidth: 0,
        bgcolor: processingTokens.surfaceRaised,
        borderBottom: '1px solid',
        borderBottomColor: processingTokens.border,
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
        <Typography title={titleLine} sx={{ minWidth: 0, fontSize: '0.78rem', fontWeight: 800, lineHeight: 1.2 }} noWrap>
          {product.productNumber ?
            <>
              <Box component="span" sx={{ fontFamily: processingTokens.monoFontFamily, color: 'text.secondary', mr: 0.5 }}>
                {product.productNumber}
              </Box>
              {product.title}
            </>
          : titleLine || '-'}
        </Typography>
        {/* The second line is always there (a space when empty), so every attached line is the same height. */}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.05, fontWeight: 600, fontSize: '0.625rem', lineHeight: 1.2 }} noWrap>
          {line2 || ' '}
        </Typography>
      </Box>
      {sameRowsText ?
        <Tooltip
          title={`Same product as ${sameRowsText}${onCheckInTogether ? '. Click to check them in together.' : ''}`}
          enterDelay={300}
          disableInteractive
        >
          <Chip
            size="small"
            color="info"
            variant="outlined"
            icon={<JoinFull sx={{ fontSize: 14 }} />}
            label={`Also ${sameRowsText}`}
            onClick={onCheckInTogether ? (e) => { e.stopPropagation(); onCheckInTogether(); } : undefined}
            data-testid="same-product-rows"
            sx={{ flexShrink: 0, height: 20, maxWidth: 170, fontSize: '0.6875rem', fontWeight: 800, '& .MuiChip-label': { px: 0.6 } }}
          />
        </Tooltip>
      : null}
      <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        <ProcessingGoogleSearchButton
          brand={product.brand}
          title={product.title}
          model={product.model}
          searchTags={product.tags}
          iconSize={17}
        />
        {/* A sheet of photos and the title for a closed box (Dash Update #95). */}
        <PhotoSheetButton product={product.productId} compact data-testid="row-photo-sheet" />
      </Box>
      <Box sx={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', gap: 0.1, pl: 0.25 }}>
        <Typography
          color={product.checkedInQty ? 'text.primary' : 'text.secondary'}
          data-testid="attached-status"
          sx={{ fontWeight: 800, whiteSpace: 'nowrap', fontSize: '0.6875rem', lineHeight: 1.15 }}
        >
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
    </Box>
  );
}

export interface ProcessingActiveCardProps {
  orderId: number;
  /** The order's vendor: its site search opens beside Google (#223). */
  vendorName?: string;
  vendorCode?: string;
  row: ProcessingWorkspaceRowDTO;
  activeItem: ProcessingWorkspaceItemDTO | null;
  onSelectItemId: (itemId: number) => void;
  onBackToQueue: () => void;
  onCheckIn: (payload: ProcessingCheckInPayload, options?: { printLabels?: boolean }) => Promise<boolean>;
  /** The check-in window closed (saved or not): the page puts the cursor in its search (#97). */
  onCheckInClosed?: () => void;
  /** The page's scan bar, shown at the top of the check-in window too (#97). */
  checkInSearchBar?: ReactNode;
  checkInLoading: boolean;
  onPatchCheckedIn: (payload: Record<string, unknown>) => void;
  patchLoading: boolean;
  onReprintItems?: (items: ProcessingWorkspaceItemDTO[]) => Promise<void>;
  /** Saves fields of a row. Answers `false` when it could not save (the page says why). */
  onPatchRowDefaults?: (payload: Record<string, unknown>) => void | boolean | Promise<void | boolean>;
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
  onRestorationCreated?: (jobId: number) => void;
}

export function ProcessingActiveCard({
  orderId,
  vendorName,
  vendorCode,
  row,
  activeItem,
  onSelectItemId,
  onBackToQueue,
  onCheckIn,
  onCheckInClosed,
  checkInSearchBar,
  checkInLoading,
  onReprintItems,
  onPatchRowDefaults,
  onOpenCheckInTogether,
  onAddItem,
  scrollToHistory,
  onScrollToHistoryDone,
  onRefreshDetail,
  detailRefreshing,
  onRestorationCreated,
}: ProcessingActiveCardProps) {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialogHost } = useWorkbenchConfirmDialog();
  const retailPriceLock = useRetailPriceLock();
  /** The page's undo list (#230): what is done on this row can be put back with Ctrl+Z. */
  const undo = useProcessingUndo();
  const priorCheckInsRef = useRef<HTMLDivElement | null>(null);
  const { user } = useAuth();
  const isManager = canAccess(user, ['processing:manage']);
  const setRowProduct = useProcessingSetRowProduct(orderId);
  const [undoTarget, setUndoTarget] = useState<CheckInUndoTarget | null>(null);
  const updateItemCheckIn = useProcessingUpdateItemCheckIn(orderId);
  const remapItemCheckInProduct = useRemapItemCheckInProduct(orderId);
  const restartRow = useProcessingRestartRow(orderId);
  const [restartSummary, setRestartSummary] = useState<ProcessingRestartSummary | null>(null);
  const patchItem = useProcessingPatchItem(orderId);
  const [checkInOpen, setCheckInOpen] = useState(false);
  /** A check-in the Goes-to dropdown is sending to Restoration: it waits for the request. */
  const [restorationTarget, setRestorationTarget] = useState<CheckedInHistoryRow | null>(null);
  // Mark as disputed (Ashley, Dash Updates #1).
  const [disputeTarget, setDisputeTarget] = useState<CheckedInHistoryRow | null>(null);
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

  // ── Changes typed on the row but not saved yet (#230) ────────────────────────────────────────────────────────
  // Tab leaves a change highlighted; Enter, the tick or "Apply changes" saves every highlighted field in one
  // request. They are kept with the row they belong to, so another row never shows them or saves them.
  const rowId = row.processing_row_id;
  const [pendingState, setPendingState] = useState<{ rowId: number; values: RowPending }>({ rowId, values: NO_PENDING });
  const pending = pendingState.rowId === rowId ? pendingState.values : NO_PENDING;
  const rowSaved = useMemo<RowEditValues>(
    () => ({
      title: rowBookmark.title ?? '',
      brand: rowBookmark.brand ?? '',
      model: rowBookmark.model ?? '',
      category: rowBookmark.category ?? '',
      unitRetail: row.unitRetail ?? '',
      price: row.price ?? '',
    }),
    [rowBookmark, row.unitRetail, row.price],
  );
  /** What the row shows: a highlighted change where there is one, else what is saved. */
  const rowValues = useMemo(() => shownValues(rowSaved, pending), [rowSaved, pending]);
  const displayRetail = rowValues.unitRetail;
  const displayPrice = rowValues.price;
  const pendingList = useMemo(() => pendingFields(pending), [pending]);
  const [applyingEdits, setApplyingEdits] = useState(false);
  /** The newest values, for handlers that run after this render (a save that comes back, a key press). */
  const editsRef = useRef({ rowId, pending, rowSaved, rowNum: row.rowNum });
  editsRef.current = { rowId, pending, rowSaved, rowNum: row.rowNum };

  function setPending(values: RowPending) {
    editsRef.current = { ...editsRef.current, pending: values };
    setPendingState({ rowId: editsRef.current.rowId, values });
  }

  /** Keep one typed value as a highlighted change. With the lock on, a new retail moves the price with it. */
  function stageField(field: RowEditField, value: string): RowPending {
    const { pending: current, rowSaved: saved } = editsRef.current;
    const shownNow = shownValues(saved, current);
    let next = stageValue(current, saved, field, value);
    if (field === 'unitRetail' && !sameFieldValue('unitRetail', value, shownNow.unitRetail)) {
      const nextPrice = retailPriceLock.priceForRetail(value, { retail: shownNow.unitRetail, price: shownNow.price });
      if (nextPrice) {
        retailPriceLock.syncPctFromPrice(value, nextPrice);
        next = stageValue(next, saved, 'price', nextPrice);
      }
    } else if (field === 'price') {
      retailPriceLock.syncPctFromPrice(shownNow.unitRetail, value);
    }
    setPending(next);
    return next;
  }

  /**
   * Save highlighted changes in one request (Enter, the tick, "Apply changes"). A save that fails leaves them
   * highlighted, to try again. A field typed while the save was on its way stays highlighted.
   */
  async function applyPending(values: RowPending = editsRef.current.pending): Promise<boolean> {
    const fields = pendingFields(values);
    if (!fields.length) return true;
    const target = editsRef.current.rowId;
    const rowNum = editsRef.current.rowNum;
    const before = savedValuesOf(values, editsRef.current.rowSaved);
    setApplyingEdits(true);
    let ok = false;
    try {
      ok = await patchRowById(target, patchFor(values));
    } finally {
      setApplyingEdits(false);
    }
    if (!ok) return false;
    if (editsRef.current.rowId === target) {
      const still = { ...editsRef.current.pending };
      for (const f of fields) if (still[f] === values[f]) delete still[f];
      setPending(still);
    }
    undo?.record({
      label: `${fieldsPhrase(fields)} on row ${rowNum}`,
      undo: () => patchRowById(target, patchFor(before)),
      redo: () => patchRowById(target, patchFor(values)),
    });
    return true;
  }

  // Leaving the row with highlighted changes saves them, as Tab alone used to: nothing a processor typed is lost
  // (and Ctrl+Z puts them back). Kept per row, so the save goes to the row that was left.
  const leftPendingRef = useRef(new Map<number, { pending: RowPending; saved: RowEditValues; rowNum: number }>());
  useEffect(() => {
    leftPendingRef.current.set(rowId, { pending, saved: rowSaved, rowNum: row.rowNum });
  }, [rowId, pending, rowSaved, row.rowNum]);
  const leaveToolsRef = useRef({ patch: onPatchRowDefaults, undo });
  leaveToolsRef.current = { patch: onPatchRowDefaults, undo };
  useEffect(() => {
    const leaving = rowId;
    const kept = leftPendingRef.current;
    return () => {
      const left = kept.get(leaving);
      kept.delete(leaving);
      const fields = left ? pendingFields(left.pending) : [];
      if (!left || !fields.length) return;
      const { patch, undo: undoList } = leaveToolsRef.current;
      const save = (values: RowPending) =>
        Promise.resolve(patch?.({ processing_row_id: leaving, ...patchFor(values) })).then((r) => r !== false, () => false);
      const before = savedValuesOf(left.pending, left.saved);
      void save(left.pending).then((ok) => {
        if (ok) {
          undoList?.record({
            label: `${fieldsPhrase(fields)} on row ${left.rowNum}`,
            undo: () => save(before),
            redo: () => save(left.pending),
          });
        }
      });
    };
  }, [rowId]);

  /** What each field of the row needs to be typed in place: its highlight, and what Tab, Enter and the X do. */
  function fieldHandlers(field: RowEditField) {
    return {
      changed: field in pending,
      onStage: (value: string) => {
        stageField(field, value);
      },
      onApply: (value: string) => applyPending(stageField(field, value)),
      onRevert: () => setPending(revertField(editsRef.current.pending, field)),
    };
  }

  /** Identifiers, Tags and Notes are saved from their own window; Ctrl+Z puts the old value back. */
  async function saveRowExtra(label: string, payload: Record<string, unknown>, before: Record<string, unknown>) {
    const target = editsRef.current.rowId;
    const rowNum = editsRef.current.rowNum;
    if (!(await patchRowById(target, payload))) return;
    undo?.record({
      label: `${label} on row ${rowNum}`,
      undo: () => patchRowById(target, before),
      redo: () => patchRowById(target, payload),
    });
  }
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
        packLabel: p.pack_label || '',
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
  // Counts on top of the attached products, and each line's last price on this row (#229).
  const attachedCounts = useMemo(() => attachedTotals(attachedProducts), [attachedProducts]);
  const lastPriceByProductId = useMemo(() => {
    const out = new Map<number, string>();
    for (const p of attachedProducts) {
      if (p.productId == null) continue;
      const price = lastCheckInForProduct(row.itemCheckIns, p.productId)?.defaults?.price;
      if (price != null && String(price) !== '') out.set(p.productId, String(price));
    }
    return out;
  }, [attachedProducts, row.itemCheckIns]);
  // "Same product as row 65" is a badge on that product's line (the row's matched product), never a note.
  const sameProductRows = row.sameProductRowNumbers ?? [];
  const sameProductLineId =
    sameProductRows.length && product?.id != null && attachedProductIds.has(product.id) ? product.id : null;
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

  /** Save fields of a row by its id. True when it saved (the page says what went wrong when it did not). */
  async function patchRowById(processingRowId: number, payload: Record<string, unknown>): Promise<boolean> {
    try {
      const result = await Promise.resolve(onPatchRowDefaults?.({ processing_row_id: processingRowId, ...payload }));
      return result !== false;
    } catch {
      return false;
    }
  }

  function patchRow(payload: Record<string, unknown>): Promise<boolean> {
    return patchRowById(row.processing_row_id, payload);
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

  async function openDetailedCheckIn(productId?: number | null) {
    // A check-in starts from the row's price and retail: highlighted changes are saved first (#230).
    if (pendingFields(editsRef.current.pending).length && !(await applyPending())) return;
    setCheckInProductId(productId ?? null);
    setCheckInSeed(null);
    setCheckInStartOverride(null);
    setCheckInOpen(true);
  }

  function closeDetailedCheckIn() {
    setCheckInOpen(false);
    setCheckInSeed(null);
    setCheckInProductId(null);
    setCheckInStartOverride(null);
    onCheckInClosed?.();
  }

  // "New pack size" (#224): the new product joins the row's attached products and is checked in next, starting from
  // the price and retail scaled from its base. Nothing else on the row changes.
  const [checkInStartOverride, setCheckInStartOverride] = useState<{ price: string; retail: string; from: 'pack' | 'page' } | null>(null);
  async function handlePackMade(result: NewPackResult) {
    const ok = await handleSaveProductDecision({ product_mode: 'existing', product_id: result.product.id });
    if (!ok) return;
    enqueueSnackbar(
      `Made ${result.product.title}${result.base.fixed ? ` and fixed ${result.base.title}` : ''}.`,
      { variant: 'success' },
    );
    setCheckInSeed(null);
    setCheckInStartOverride({ price: result.price ?? '', retail: result.retail ?? '', from: 'pack' });
    setCheckInProductId(result.product.id);
    setCheckInOpen(true);
  }

  // A scan from the check-in window opened another row: this row's check-in window closes with it.
  const shownRowId = row.processing_row_id;
  useEffect(() => {
    setCheckInOpen(false);
    setCheckInSeed(null);
    setCheckInProductId(null);
  }, [shownRowId]);

  // Vendor + Google search for the row, in new tabs; optionally on every row opened (#223), remembered per person.
  const searchTabs = useMemo(
    () => rowSearchTabs(
      {
        brand: rowBookmark.brand || product?.brand,
        model: rowBookmark.model || product?.model,
        title: displayTitle,
        searchTags: parseSearchTagsCsv(row.tags || ''),
      },
      { name: vendorName, code: vendorCode },
    ),
    [rowBookmark.brand, rowBookmark.model, product?.brand, product?.model, displayTitle, row.tags, vendorName, vendorCode],
  );
  const [autoOpenSearch, setAutoOpenSearch] = useState(() => readAutoOpenRowSearch(user?.id));
  useEffect(() => setAutoOpenSearch(readAutoOpenRowSearch(user?.id)), [user?.id]);
  const openSearchTabs = useCallback(() => {
    const blocked = openRowSearchTabs(searchTabs);
    if (blocked > 0) {
      enqueueSnackbar('The browser blocked a tab. Allow pop-ups for Dash to open the vendor and Google searches together.', {
        variant: 'warning',
      });
    }
  }, [searchTabs, enqueueSnackbar]);
  const autoOpenedRowRef = useRef<number | null>(null);
  useEffect(() => {
    if (!autoOpenSearch || autoOpenedRowRef.current === shownRowId || !searchTabs.length) return;
    autoOpenedRowRef.current = shownRowId;
    openSearchTabs();
  }, [autoOpenSearch, shownRowId, searchTabs.length, openSearchTabs]);

  // The retail a pasted product page gave a new product (#224); its first check-in starts from it.
  const [pageRetail, setPageRetail] = useState<string | null>(null);

  function openProductEditor(productId: number | null) {
    setPageRetail(null);
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
      const target = row.processing_row_id;
      undo?.record({
        label: `Product attached on row ${row.rowNum}`,
        undo: () => patchRowById(target, { product_links: buildProductLinksRemove(linksOfRow(target), productId) }),
        redo: () => attachProductToRow(target, productId),
      });
    }
  }

  /** The row's product links as they are now (the saved row, not this render): an undo runs later. */
  function linksOfRow(processingRowId: number) {
    const cached = queryClient.getQueryData<ProcessingWorkspaceRowDTO>(['processing-row-detail', orderId, processingRowId]);
    return cached?.productLinks ?? (processingRowId === row.processing_row_id ? row.productLinks : undefined);
  }

  async function attachProductToRow(processingRowId: number, productId: number): Promise<boolean> {
    try {
      await setRowProduct.mutateAsync({ processing_row_id: processingRowId, product_mode: 'existing', product_id: productId });
      return true;
    } catch {
      return false;
    }
  }

  async function handleProductLinkConfigChange(productId: number, config: ProcessingProductLinkConfig) {
    const target = row.processing_row_id;
    const before = normalizeProductLink(row.productLinks?.[String(productId)]);
    const ok = await patchRow({
      product_links: buildProductLinksPatch(row.productLinks, productId, config),
    });
    if (!ok) return;
    const setRatio = (to: ProcessingProductLinkConfig) =>
      patchRowById(target, { product_links: buildProductLinksPatch(linksOfRow(target), productId, to) });
    undo?.record({
      label: `Row unit ratio on row ${row.rowNum}`,
      undo: () => setRatio(before),
      redo: () => setRatio(config),
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
    const target = row.processing_row_id;
    const before = normalizeProductLink(row.productLinks?.[String(productId)]);
    const removed = await patchRow({
      product_links: buildProductLinksRemove(row.productLinks, productId),
    });
    if (!removed) return;
    undo?.record({
      label: `Product removed from row ${row.rowNum}`,
      // Back on the row, with the ratio it had.
      undo: async () =>
        (await attachProductToRow(target, productId))
        && patchRowById(target, { product_links: buildProductLinksPatch(linksOfRow(target), productId, before) }),
      redo: () => patchRowById(target, { product_links: buildProductLinksRemove(linksOfRow(target), productId) }),
    });
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

  // A check-in printed tags, so Ctrl+Z does not delete it by itself: it opens the Undo check-in window for the
  // newest check-in of that row, where the person chooses (move or delete) and sees what blocks it. No redo.
  const cardMountedRef = useRef(true);
  useEffect(() => {
    cardMountedRef.current = true;
    return () => {
      cardMountedRef.current = false;
    };
  }, []);
  function recordCheckInUndo() {
    const target = row.processing_row_id;
    undo?.record({
      label: `Check-in on row ${row.rowNum}`,
      quiet: true,
      undo: () => {
        if (!cardMountedRef.current) return false;
        const cached = queryClient.getQueryData<ProcessingWorkspaceRowDTO>(['processing-row-detail', orderId, target]);
        const newest = Math.max(0, ...(cached?.itemCheckIns ?? []).map((c) => c.id));
        if (!newest) return false;
        setUndoTarget({ orderId, itemCheckInId: newest });
        return true;
      },
    });
  }

  function handleUndoItemCheckIn(historyRow: CheckedInHistoryRow) {
    if (historyRow.itemCheckInId == null) return;
    setUndoTarget({ orderId, itemCheckInId: historyRow.itemCheckInId });
  }

  /** Edit mode of the detailed dialog: update the clicked ItemCheckIn in place. */
  async function handleUpdateItemCheckIn(
    itemCheckInId: number,
    payload: Partial<ProcessingCheckInPayload>,
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
        onRestorationCreated?.(data.restoration_job_id);
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
    if (field === 'dispatch' && value === 'restoration') {
      // Restoration needs the request and a job, so the whole check-in goes (owner, 2026-10-28).
      if (target.itemCheckInId == null) {
        enqueueSnackbar('Open this check-in to send it to Restoration.', { variant: 'warning' });
        return;
      }
      setRestorationTarget(target);
      return;
    }
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
      // Ctrl+Z puts each item back to what it was (never to Restoration: that needs its own request).
      const before = editable.map((it) => ({ id: it.id, was: field === 'dispatch' ? it.dispatch : it.condition }));
      if (editable.length && before.every((b) => b.was && b.was !== 'restoration')) {
        const setAll = async (valueOf: (id: number) => string) => {
          try {
            for (const b of before) await patchItem.mutateAsync({ itemId: b.id, payload: { [field]: valueOf(b.id) } });
            return true;
          } catch {
            return false;
          }
        };
        undo?.record({
          label: `${field === 'dispatch' ? 'Goes to' : 'Condition'} on a check-in, row ${row.rowNum}`,
          undo: () => setAll((id) => before.find((b) => b.id === id)!.was),
          redo: () => setAll(() => value),
        });
      }
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
        const checkInId = target.itemCheckInId;
        const was = target.items.find((it) => it.price)?.price ?? '';
        await updateItemCheckIn.mutateAsync({
          itemCheckInId: checkInId,
          payload: { price: value },
        });
        enqueueSnackbar('Price updated for this check-in.', { variant: 'success' });
        if (was && target.items.every((it) => it.price === was)) {
          const setPrice = (price: string) =>
            updateItemCheckIn.mutateAsync({ itemCheckInId: checkInId, payload: { price } }).then(() => true, () => false);
          undo?.record({
            label: `Price on a check-in, row ${row.rowNum}`,
            undo: () => setPrice(was),
            redo: () => setPrice(value),
          });
        }
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
      const checkInId = target.itemCheckInId;
      await remapItemCheckInProduct.mutateAsync({
        itemCheckInId: checkInId,
        payload: { product_mode: 'existing', product_id: productId },
      });
      enqueueSnackbar('Check-in product updated.', { variant: 'success' });
      if (currentId != null) {
        const remap = (to: number) =>
          remapItemCheckInProduct
            .mutateAsync({ itemCheckInId: checkInId, payload: { product_mode: 'existing', product_id: to } })
            .then(() => true, () => false);
        undo?.record({
          label: `Product of a check-in, row ${row.rowNum}`,
          undo: () => remap(currentId),
          redo: () => remap(productId),
        });
      }
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
          py: { xs: 0.35, md: 0 },
          // One kept line on a computer: a note chip or the Restart button in it changes no height (#229).
          minHeight: ROW_DETAILS_HEADER_PX,
          height: { md: ROW_DETAILS_HEADER_PX },
          overflow: 'hidden',
          bgcolor: processingTokens.cardHeaderRowDetailBg,
          borderBottom: 1,
          borderColor: alpha(processingTokens.primary, 0.16),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          flexWrap: { xs: 'wrap', md: 'nowrap' },
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
            whiteSpace: 'nowrap',
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
        {searchTabs.length ?
          <Tooltip title={`Opens ${searchTabs.map((t) => t.label).join(' and ')} in new tabs`} enterDelay={300} disableInteractive>
            <Button
              size="small"
              variant="outlined"
              onClick={openSearchTabs}
              data-testid="row-search-tabs"
              sx={{ ml: 0.5, minHeight: 22, py: 0, px: 0.75, fontSize: '0.6875rem', fontWeight: 800, whiteSpace: 'nowrap' }}
            >
              Search {searchTabs.map((t) => t.label).join(' + ')}
            </Button>
          </Tooltip>
        : null}
        {/* What is special about this row, as chips in a kept place: a note here never moves the page (#229,
            Bill 2026-11-25: "NO notifications that cause content to shift"). */}
        <Box
          data-testid="row-notes"
          sx={{ flex: '1 1 0', minWidth: 0, display: 'flex', alignItems: 'center', gap: 0.5, ml: 0.75, overflow: 'hidden' }}
        >
          {row.splitParentId != null ?
            <RowNoteChip
              label={`Sub row${row.splitParentRowNumber != null && row.splitSeq != null ? ` #${row.splitParentRowNumber}.${row.splitSeq}` : ''}`}
              title={`Created by Break apart / Make set on row ${row.splitParentRowNumber ?? row.splitFamily?.rootRowNumber ?? ''}.`}
            />
          : null}
          {row.splitFamily && row.splitParentId == null ?
            <RowNoteChip
              label={
                row.splitFamily.children.length ?
                  `Split into ${row.splitFamily.children
                    .map((c) => `#${row.splitFamily!.rootRowNumber}.${c.splitSeq ?? '?'} (${c.qty.toLocaleString()})`)
                    .join(', ')}`
                : 'Converted by Break apart / Make set'
              }
              title={row.splitFamily.children.length ? 'The remainder stays on this row.' : undefined}
            />
          : null}
          {terminalDisputed ? <RowNoteChip color="error" label={`Terminal dispute (${activeStatus})`} /> : null}
          {canRestart ?
            <Button
              size="small"
              color="warning"
              variant="outlined"
              disabled={restartRow.isPending}
              onClick={() => void openRestartConfirm()}
              sx={{ flexShrink: 0, minHeight: 22, py: 0, px: 0.75, fontSize: '0.6875rem', fontWeight: 800, whiteSpace: 'nowrap', bgcolor: '#fff' }}
            >
              Restart row…
            </Button>
          : null}
        </Box>
        <Box component="label" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, cursor: 'pointer', flexShrink: 0 }}>
          <Switch
            size="small"
            checked={autoOpenSearch}
            onChange={(e) => {
              const on = e.target.checked;
              writeAutoOpenRowSearch(user?.id, on);
              setAutoOpenSearch(on);
            }}
            slotProps={{ input: { 'aria-label': 'Open the search on every row I open' } }}
          />
          <Typography sx={{ fontSize: '0.6875rem', fontWeight: 700, color: processingTokens.cardHeaderRowDetailText, whiteSpace: 'nowrap' }}>
            Search every row I open
          </Typography>
        </Box>
      </Box>
      <Box sx={{ minWidth: 0, px: 0.75, pb: 0.55 }}>
        <ManifestFieldNavProvider>
          <ManifestModalNavBridge
            onOpenIdentifiers={() => setIdentifiersModalOpen(true)}
            onOpenTags={() => setTagsModalOpen(true)}
            onOpenNotes={() => setNotesModalOpen(true)}
          />
          {/* One kept line that fills the width (#230): no field changes size when it is typed in, and the two
              buttons at the end are always there. */}
          <Box
            data-testid="row-fields"
            sx={{
              display: 'grid',
              gridTemplateColumns: ROW_FIELDS_GRID_COLUMNS,
              columnGap: 0.45,
              alignItems: 'end',
              overflowX: 'auto',
              // A narrow screen slides the line sideways (Tab brings each field into view) without a scroll bar
              // under it, which would make the line taller and push the lists down.
              scrollbarWidth: 'none',
              '&::-webkit-scrollbar': { display: 'none' },
              pb: 0.15,
            }}
          >
            <ManifestField
              fieldId="title"
              label="Title"
              value={rowValues.title}
              layerSources={row.rowLayerSources?.title ?? {}}
              {...fieldHandlers('title')}
            />
            <ManifestField
              fieldId="brand"
              label="Brand"
              value={rowValues.brand}
              layerSources={row.rowLayerSources?.brand ?? {}}
              {...fieldHandlers('brand')}
            />
            <ManifestField
              fieldId="model"
              label="Model"
              value={rowValues.model}
              layerSources={row.rowLayerSources?.model ?? {}}
              {...fieldHandlers('model')}
            />
            <ManifestField
              fieldId="category"
              label="Category"
              value={rowValues.category}
              layerSources={row.rowLayerSources?.category ?? {}}
              selectOptions={TAXONOMY_V1_CATEGORY_NAMES}
              {...fieldHandlers('category')}
            />
            <ManifestField
              fieldId="unitRetail"
              label="Retail"
              currency
              value={rowValues.unitRetail}
              layerSources={row.rowLayerSources?.unitRetail ?? {}}
              {...fieldHandlers('unitRetail')}
            />
            {/* The lock sits level with the fields, not with their labels. */}
            <Box
              sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: PROCESSING_ROW_FIELD_HEIGHT, mb: 0.35, px: 0.15 }}
            >
              <RetailPriceLockToggle
                locked={retailPriceLock.locked}
                pct={retailPriceLock.effectivePct(displayRetail, displayPrice)}
                size="small"
                onToggle={() => retailPriceLock.toggleLock(displayRetail, displayPrice)}
              />
            </Box>
            <ManifestField
              fieldId="price"
              label="Price"
              currency
              value={rowValues.price}
              layerSources={row.rowLayerSources?.price ?? {}}
              {...fieldHandlers('price')}
            />
            {/* The percent is a button of its own: choosing one saves that price at once. */}
            <Box
              sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: PROCESSING_ROW_FIELD_HEIGHT, mb: 0.35, pl: 0.15, pr: 0.35 }}
            >
              <RetailPricePctButton
                retail={displayRetail}
                price={displayPrice}
                pct={retailPriceLock.effectivePct(displayRetail, displayPrice)}
                isFallback={retailPriceLock.isPctFallback(displayRetail, displayPrice)}
                size="small"
                onCommitPct={(nextPct, nextPrice) => {
                  retailPriceLock.setPct(nextPct);
                  setPending(stageValue(editsRef.current.pending, editsRef.current.rowSaved, 'price', nextPrice));
                  void applyPending({ price: nextPrice });
                }}
              />
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
              fill
              valueFontSize={manifestToolbarEmphasisFieldSx.valueFontSize}
              valueFontWeight={manifestToolbarEmphasisFieldSx.valueFontWeight}
            >
              <ManifestIdentifiersField
                ref={identifiersEditorRef}
                presentation="modal"
                value={rowBookmark.identifiers}
                onSave={(identifiers) => saveRowExtra('Identifiers', { identifiers }, { identifiers: rowBookmark.identifiers ?? {} })}
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
              fill
              valueFontSize={manifestToolbarEmphasisFieldSx.valueFontSize}
              valueFontWeight={manifestToolbarEmphasisFieldSx.valueFontWeight}
            >
              <ManifestTagsField
                ref={tagsEditorRef}
                presentation="modal"
                value={row.tags || ''}
                onSave={(tags) => saveRowExtra('Tags', { search_tags: tags }, { search_tags: row.tags || '' })}
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
              fill
              valueFontSize={manifestToolbarEmphasisFieldSx.valueFontSize}
              valueFontWeight={manifestToolbarEmphasisFieldSx.valueFontWeight}
            >
              <ManifestNotesField
                ref={notesEditorRef}
                value={row.manifestNotes || ''}
                onSave={(v) => saveRowExtra('Notes', { notes: v }, { notes: row.manifestNotes || '' })}
              />
            </ManifestModalField>
            <RowEditActions
              count={pendingList.length}
              busy={applyingEdits}
              onApply={() => void applyPending()}
              onCancel={() => setPending(NO_PENDING)}
            />
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
          // A screen too short for the kept heights below scrolls; nothing is cut off and nothing is squeezed.
          overflowX: 'hidden',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          px: { xs: 1, md: 1.5 },
          py: { xs: 0.75, md: 1 },
          bgcolor: processingTokens.cardDeckBg,
        }}
      >
        {rowDetailsBand}

        {/* #229 (Bill 2026-11-25): the search across the top; under it Attached (left) and Likely (right), each a
            list that is always open at a kept height; the check-ins at the bottom, four lines. None of them is
            sized by what is in it, so nothing moves when a list fills or empties. */}
        <Box
          key={`search:${row.processing_row_id}`}
          sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 0.6, mb: 0.6, minWidth: 0 }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <ProcessingProductSearch
              processingRowId={row.processing_row_id}
              attachedProductIds={attachedProductIds}
              onUse={(productId) => void handleAttachExistingProduct(productId)}
            />
          </Box>
          <Button
            size="small"
            variant="outlined"
            startIcon={<Add sx={{ fontSize: 14 }} />}
            onClick={() => openProductEditor(null)}
            sx={{ flexShrink: 0, height: 32, fontSize: '0.75rem', whiteSpace: 'nowrap', bgcolor: 'background.paper' }}
          >
            New product
          </Button>
        </Box>

        <Box
          data-testid="product-panes"
          sx={{
            flex: { xs: '0 0 auto', md: '1 1 0' },
            minHeight: { md: PRODUCT_PANES_MIN_PX },
            minWidth: 0,
            display: 'grid',
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 1fr)' },
            gridTemplateRows: { xs: `${PRODUCT_PANE_PHONE_PX}px ${PRODUCT_PANE_PHONE_PX}px`, md: 'minmax(0, 1fr)' },
            gap: 0.6,
            mb: 0.6,
          }}
        >
          <ProductPane
            title="Attached products"
            testId="attached-pane"
            accent={processingTokens.cardboardBrown}
            headerBg={processingTokens.cardboardBrownSoft}
            titleColor={processingTokens.cardboardBrownDark}
            stats={
              <PaneStat>
                <span data-testid="attached-count">
                  {attachedCounts.products} product{attachedCounts.products === 1 ? '' : 's'}
                </span>
                {' · '}
                <span data-testid="attached-checked-in">{attachedCounts.checkedIn.toLocaleString()} checked in</span>
              </PaneStat>
            }
            trailing={
              // The matched product is not in the list (it should be): the badge still has a kept place.
              sameProductRows.length && sameProductLineId == null ?
                <Chip
                  size="small"
                  color="info"
                  variant="outlined"
                  icon={<JoinFull sx={{ fontSize: 14 }} />}
                  label={`Also row${sameProductRows.length === 1 ? '' : 's'} ${sameProductRows.join(', ')}`}
                  onClick={onOpenCheckInTogether}
                  data-testid="same-product-rows"
                  sx={{ flexShrink: 0, height: 20, fontSize: '0.6875rem', fontWeight: 800 }}
                />
              : null
            }
          >
            {attachedProducts.length ?
              <Box role="list" aria-label="Attached products">
                {attachedProducts.map((attached) => (
                  <AttachedProductCard
                    key={attached.key}
                    product={attached}
                    lastPrice={attached.productId != null ? lastPriceByProductId.get(attached.productId) : undefined}
                    sameRows={
                      attached.productId != null && attached.productId === sameProductLineId ? sameProductRows : undefined
                    }
                    onCheckInTogether={onOpenCheckInTogether}
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
              </Box>
            : <PaneNote>No product attached yet.</PaneNote>}
          </ProductPane>
          <ProcessingLikelyProducts
            key={row.processing_row_id}
            processingRowId={row.processing_row_id}
            attachedProductIds={attachedProductIds}
            onUse={(productId) => void handleAttachExistingProduct(productId)}
          />
        </Box>

        <Box ref={priorCheckInsRef} sx={{ flexShrink: 0, minWidth: 0 }}>
          <ProcessingRowSection
            title="Check-ins"
            trailing={
              <PaneStat testId="check-in-counts">
                {historyRows.length.toLocaleString()} check-in{historyRows.length === 1 ? '' : 's'} ·{' '}
                {priorCheckIns.length.toLocaleString()} item{priorCheckIns.length === 1 ? '' : 's'}
              </PaneStat>
            }
            surface="priorCheckIns"
            sx={{
              mb: 0,
              minWidth: 0,
              maxWidth: '100%',
              borderColor: processingTokens.borderStrong,
              borderLeft: 3,
              borderLeftColor: processingTokens.accentBlue,
              boxShadow: '0 1px 4px rgba(26, 27, 24, 0.05)',
            }}
            // Four lines and their heading, always: more check-ins scroll inside, fewer leave the space empty.
            bodySx={{ px: 0, py: 0, height: CHECK_INS_TABLE_PX, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          >
            <CheckedInItemsTable
              rows={historyRows}
              fallbackProduct={product}
              attachedProductOptions={attachedProductOptions}
              activeItemId={activeItem?.id ?? null}
              onSelectItemId={handleSelectPriorCheckIn}
              onReprintCheckIn={onReprintItems ? (historyRow) => void handleReprintCheckIn(historyRow) : undefined}
              onDeleteItemCheckIn={handleUndoItemCheckIn}
              onDisputeCheckIn={setDisputeTarget}
              onSetCheckInProduct={
                attachedProductOptions.length > 0 ?
                  (historyRow, productId) => void handleSetCheckInProduct(historyRow, productId)
                : undefined
              }
              onSetCheckInCondition={(historyRow, value) => void handleSetCheckInField(historyRow, 'condition', value)}
              onSetCheckInDispatch={(historyRow, value) => void handleSetCheckInField(historyRow, 'dispatch', value)}
              onSetCheckInPrice={(historyRow, value) => void handleSetCheckInPrice(historyRow, value)}
              onEditCheckInProduct={(productId) => openProductEditor(productId)}
              showDeleteCheckInAction
              scrollable
            />
          </ProcessingRowSection>
        </Box>
      </Box>

      {/* Dash Update #102: one dispute record. Mark as disputed opens the queue's Dispute window for these items. */}
      <RowDisputeDialog
        open={disputeTarget != null}
        orderId={orderId}
        processingRowId={disputeTarget ? row.processing_row_id : null}
        items={(disputeTarget?.items ?? []).filter((it) => it.status === 'on_shelf').map((it) => ({ id: it.id, sku: it.sku ?? '' }))}
        onClose={() => setDisputeTarget(null)}
      />
      <RestorationRequestDialog
        open={restorationTarget != null}
        price={restorationTarget?.items.find((it) => it.price)?.price ?? null}
        busy={updateItemCheckIn.isPending}
        onCancel={() => setRestorationTarget(null)}
        onConfirm={async (estimate) => {
          if (restorationTarget?.itemCheckInId == null) return;
          const ok = await handleUpdateItemCheckIn(
            restorationTarget.itemCheckInId,
            { dispatch: 'restoration', restoration: estimate },
            { printLabels: false },
          );
          if (ok) setRestorationTarget(null);
        }}
      />
      <ProcessingCheckInDialog
        open={checkInOpen}
        row={row}
        orderId={orderId}
        initialProductId={checkInProductId}
        loading={checkInLoading || updateItemCheckIn.isPending}
        seed={checkInSeed}
        onClose={closeDetailedCheckIn}
        onSubmit={async (payload, options) => {
          const ok = await onCheckIn(payload, options);
          if (ok) recordCheckInUndo();
          return ok;
        }}
        onUpdateItemCheckIn={handleUpdateItemCheckIn}
        onUpdateRowRetail={(retail) => saveRowExtra('Retail', { unit_retail: retail }, { unit_retail: row.unitRetail ?? '' })}
        onPackMade={handlePackMade}
        startOverride={checkInStartOverride}
        searchBar={checkInSearchBar}
      />
      {productEditorOpen && (productEditorProductId == null || productEditorQuery.data) ?
        <ProductManagePanel
          open
          initialProduct={productEditorProductId == null ? null : productEditorQuery.data ?? null}
          rowDetailsSeed={productEditorProductId == null ? newProductEditorSeed : undefined}
          rowDetailsSeedKey={productEditorProductId == null ? row.processing_row_id : undefined}
          onClose={closeProductEditor}
          pagePaste={
            productEditorProductId == null ?
              { processingRowId: row.processing_row_id, onDraft: (r) => setPageRetail(r.retail) }
            : undefined
          }
          onProductSaved={(savedProduct: Product, ctx) => {
            refreshSavedProductInRow(savedProduct);
            if (ctx.created) {
              void (async () => {
                await handleAttachExistingProduct(savedProduct.id);
                // A product filled from a pasted page (#224) is checked in next, from the page's retail; the price
                // keeps the row's price-to-retail share. Free to change.
                if (pageRetail) {
                  const r = Number.parseFloat(row.unitRetail ?? '');
                  const p = Number.parseFloat(row.price ?? '');
                  const share = r > 0 && p > 0 ? p / r : null;
                  setCheckInSeed(null);
                  setCheckInStartOverride({
                    retail: pageRetail,
                    price: share ? (Math.round(Number.parseFloat(pageRetail) * share * 100) / 100).toFixed(2) : '',
                    from: 'page',
                  });
                  setCheckInProductId(savedProduct.id);
                  setCheckInOpen(true);
                }
                setPageRetail(null);
              })();
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
      <CheckInUndoDialog target={undoTarget} onClose={() => setUndoTarget(null)} />
      {ConfirmDialogHost}
    </Card>
  );
}

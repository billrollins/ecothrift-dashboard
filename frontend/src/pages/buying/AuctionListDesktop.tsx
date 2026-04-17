import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbUpOutlinedIcon from '@mui/icons-material/ThumbUpOutlined';
import UndoOutlinedIcon from '@mui/icons-material/UndoOutlined';
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { Box, Chip, IconButton, Typography } from '@mui/material';
import { keyframes } from '@mui/system';
import {
  DataGrid,
  GridRow,
  type GridColDef,
  type GridPaginationModel,
  type GridRenderCellParams,
  type GridRowClassNameParams,
  type GridRowHeightParams,
  type GridRowParams,
  type GridRowProps,
  type GridRowSelectionModel,
  type GridSortModel,
} from '@mui/x-data-grid';
import { formatCurrencyWhole } from '../../utils/format';
import {
  formatAuctionCostToRetailPct,
  formatPriceToRetailPct,
  formatTimeRemaining,
  msUntilEnd,
  MS_TIME_REMAINING_WITH_SECONDS,
  orderingFromSortModel,
  sortModelFromOrdering,
  timeRemainingSx,
} from '../../utils/buyingAuctionList';
import AuctionCategoryListBlock from '../../components/buying/AuctionCategoryListBlock';
import AuctionManifestStateIcon from '../../components/buying/AuctionManifestStateIcon';
import {
  BUYING_AUCTION_LIST_HEADER_ICON_PX,
  BUYING_AUCTION_LIST_ROW_HEIGHT_PX,
  BUYING_AUCTION_LIST_ROW_ICON_PX,
} from '../../constants/buyingAuctionListUi';
import type { BuyingAuctionListItem } from '../../types/buying.types';

/** Star / archive: icon + sort (tight). */
const BUYING_COL_STAR_ARCHIVE_WIDTH = 66;
/** Thumbs: icon + tally + sort. */
const BUYING_COL_THUMBS_WIDTH = 78;
/** Expand/collapse chevron column. */
const EXPAND_COL_WIDTH = 40;
/** Extra height for inline detail strip under an expanded row (matches getRowHeight). */
const DETAIL_STRIP_PX = 44;
/** Default row body height (must match DataGrid `rowHeight` and expanded-row split). */
const ESTIMATE_ROW_BASE_PX = BUYING_AUCTION_LIST_ROW_HEIGHT_PX;
/** Priority / Need — numeric. */
const BUYING_COL_PRIORITY_NEED_WIDTH = 72;
/** Vendor chip. */
const BUYING_COL_VENDOR_WIDTH = 104;

/** Watch / thumbs / archive / expand: same icon size and tap target; vertically centered in tall rows. */
const buyingGridIconBtnSx = {
  p: 0.5,
  minWidth: 44,
  minHeight: 44,
  '& .MuiSvgIcon-root': {
    fontSize: BUYING_AUCTION_LIST_ROW_ICON_PX,
  },
} as const;

const buyingGridIconOnlySx = { fontSize: BUYING_AUCTION_LIST_ROW_ICON_PX } as const;

/** Centered icon cell wrapper (star, expand toggle). */
const buyingGridIconCellBoxSx = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
} as const;

/** Centered icon cell wrapper (full-width variant, e.g. inert star placeholder). */
const buyingGridIconCellFullBoxSx = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
} as const;

/** Thumbs cell wrapper (icon + tally). */
const buyingGridThumbsCellBoxSx = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 0.25,
  width: '100%',
} as const;

/** Thumbs cell wrapper (toggleable, no gap so IconButton padding supplies spacing). */
const buyingGridThumbsToggleCellBoxSx = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 0,
  width: '100%',
} as const;

/** Thumbs tally typography sx. */
const buyingGridThumbsTallySx = {
  fontVariantNumeric: 'tabular-nums',
  fontSize: '0.7rem',
} as const;

/** Inert star (no toggle handler) — uses muted color. */
const buyingGridInertStarSx = {
  ...buyingGridIconOnlySx,
  color: 'action.disabled',
} as const;

/** Header only: same size for bulk action icons, expand-all, and sort up/down (matches text column headers). */
const buyingGridHeaderIconBtnSx = {
  p: 0.25,
  minWidth: 32,
  minHeight: 32,
  maxHeight: 32,
  '& .MuiSvgIcon-root': {
    fontSize: BUYING_AUCTION_LIST_HEADER_ICON_PX,
  },
} as const;

/**
 * Mutable state read by column closures via ref.
 * Avoids rebuilding the columns array on every data change — cells read current
 * values at render time, so DataGrid only re-renders rows whose data actually changed.
 */
interface GridCellState {
  watchlistIds: Set<number> | undefined;
  rows: BuyingAuctionListItem[];
  selectedIds: number[];
  sortModel: GridSortModel;
  expandedIds: Set<number>;
  /** Rows currently inside the 2s archive/unarchive grace window. */
  archivePendingIds: Set<number>;
}

/**
 * Subtle pulse on the archive icon button while the 2s grace window is open.
 * Signals "something is happening, click again to cancel" without the visual
 * weight of a progress ring. Matches the feel of a checkbox state change.
 */
const archiveGracePulse = keyframes({
  '0%, 100%': { backgroundColor: 'rgba(15, 110, 86, 0.10)' },
  '50%': { backgroundColor: 'rgba(15, 110, 86, 0.26)' },
});

const buyingGridArchiveIconBtnPendingSx = {
  p: 0.5,
  minWidth: 44,
  minHeight: 44,
  color: 'primary.main',
  backgroundColor: 'rgba(15, 110, 86, 0.16)',
  animation: `${archiveGracePulse} 1.2s ease-in-out infinite`,
  transition: 'background-color 160ms ease',
  '&:hover': {
    backgroundColor: 'rgba(15, 110, 86, 0.28)',
  },
  '& .MuiSvgIcon-root': {
    fontSize: BUYING_AUCTION_LIST_ROW_ICON_PX,
    color: 'primary.main',
  },
} as const;

function formatNeedScoreRaw(score: string | number | null | undefined): string {
  if (score == null || score === '') return '—';
  const n = Number.parseFloat(String(score));
  if (Number.isNaN(n)) return String(score);
  if (Number.isInteger(n)) return String(n);
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatRatioOrDash(v: string | null | undefined): string {
  if (v == null || v === '') return '—';
  const n = Number.parseFloat(String(v));
  if (Number.isNaN(n)) return String(v);
  return `${n.toFixed(2)}×`;
}

function getTargetRowsForBulk(rows: BuyingAuctionListItem[], selectedIds: number[]): BuyingAuctionListItem[] {
  if (selectedIds.length > 0) {
    const sel = new Set(selectedIds);
    return rows.filter((r) => sel.has(r.id));
  }
  return rows;
}

function scopePhrase(selectedIds: number[]): string {
  return selectedIds.length > 0 ? 'selected' : 'on page';
}

/** Renders children only — disables MUI X header/tooltip wrappers (no hover popovers). */
function DataGridTooltipPassthrough({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

type BulkSortableField = 'thumbs_up' | 'archived_at' | 'watchlist_sort';

function bulkColumnSortTooltip(field: BulkSortableField, dir: 'asc' | 'desc' | null): string {
  if (field === 'watchlist_sort') {
    if (dir === 'asc') return 'Sorted by unwatched first — click for watched first';
    if (dir === 'desc') return 'Sorted by watched first — click to clear sort';
    return 'Sort by watch status';
  }
  if (dir === 'asc') return `Sorted by ${field === 'thumbs_up' ? 'thumbs up' : 'archive date'} ascending — click for descending`;
  if (dir === 'desc') return `Sorted by ${field === 'thumbs_up' ? 'thumbs up' : 'archive date'} descending — click to clear sort`;
  return field === 'thumbs_up' ? 'Sort by thumbs up' : 'Sort by archived date';
}

/** Maps include/exclude selection models to selected row ids on the current page (GridRowId is often string). */
function rowSelectionModelToSelectedIds(model: GridRowSelectionModel, pageRowIds: number[]): number[] {
  const key = (id: number) => String(id);
  if (model.type === 'exclude') {
    const excluded = new Set([...model.ids].map((id) => String(id)));
    return pageRowIds.filter((id) => !excluded.has(key(id)));
  }
  const included = new Set([...model.ids].map((id) => String(id)));
  return pageRowIds.filter((id) => included.has(key(id)));
}

/**
 * Self-managing countdown cell.
 * Sets up a 1 s interval only while under the "live seconds" threshold so the
 * parent doesn't need to push countdownTick into the columns memo.
 */
function TimeRemainingCell({ endTime }: { endTime: string | null }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const ms = msUntilEnd(endTime);
    if (ms == null || ms <= 0 || ms >= MS_TIME_REMAINING_WITH_SECONDS) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [endTime]);
  return (
    <Box component="span" sx={timeRemainingSx(endTime)}>
      {formatTimeRemaining(endTime)}
    </Box>
  );
}

function BulkColumnSortAffordance({
  sortDir,
  sortTip,
  onSortClick,
}: {
  sortDir: 'asc' | 'desc' | null;
  sortTip: string;
  onSortClick: () => void;
}) {
  return (
    <Box
      className="bulk-sort-affordance"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 32,
        height: 32,
        borderRadius: 1,
        '& .MuiSvgIcon-root': {
          opacity: sortDir ? 1 : 0,
        },
        '&:hover .MuiSvgIcon-root': {
          opacity: 1,
        },
      }}
    >
      <IconButton
        aria-label={sortTip}
        onClick={(e) => {
          e.stopPropagation();
          onSortClick();
        }}
        sx={buyingGridHeaderIconBtnSx}
      >
        {sortDir === 'desc' ? <ArrowDownwardIcon /> : <ArrowUpwardIcon />}
      </IconButton>
    </Box>
  );
}

export type AuctionListDesktopProps = {
  rows: BuyingAuctionListItem[];
  rowCount: number;
  loading: boolean;
  ordering: string;
  onOrderingChange: (ordering: string) => void;
  paginationModel: GridPaginationModel;
  onPaginationModelChange: (model: GridPaginationModel) => void;
  onRowNavigate: (id: number) => void;
  canThumbsToggle?: boolean;
  onThumbsToggle?: (id: number, next: boolean) => void;
  onWatchToggle?: (id: number, add: boolean) => void;
  watchlistIds?: Set<number>;
  /** Forces time-remaining cells to re-render every second when any row is under 5 min. */
  countdownTick: number;
  onArchiveToggle: (row: BuyingAuctionListItem) => void;
  onBulkWatch: (ids: number[], add: boolean) => void | Promise<void>;
  onBulkThumbs: (ids: number[], active: boolean) => void | Promise<void>;
  onBulkArchive: (ids: number[], archive: boolean) => void | Promise<void>;
  /** Rows currently in the archive grace window (2s undo). */
  archivePendingIds: Set<number>;
};

/**
 * Build column definitions once.
 * All frequently-changing state is read from `stateRef.current` inside closures
 * so the returned array is referentially stable across data-only changes.
 */
function buildColumns(
  canThumbsToggle: boolean,
  onThumbsToggle: AuctionListDesktopProps['onThumbsToggle'],
  onWatchToggle: AuctionListDesktopProps['onWatchToggle'],
  onArchiveToggle: AuctionListDesktopProps['onArchiveToggle'],
  onBulkWatch: AuctionListDesktopProps['onBulkWatch'],
  onBulkThumbs: AuctionListDesktopProps['onBulkThumbs'],
  onBulkArchive: AuctionListDesktopProps['onBulkArchive'],
  onBulkColumnSort: (field: BulkSortableField) => void,
  onExpandToggle: (id: number) => void,
  onExpandAll: () => void,
  stateRef: MutableRefObject<GridCellState>
): GridColDef<BuyingAuctionListItem>[] {
  return [
    {
      field: 'watchlist_sort',
      headerName: '',
      width: BUYING_COL_STAR_ARCHIVE_WIDTH,
      sortable: true,
      hideSortIcons: true,
      align: 'center',
      headerAlign: 'center',
      headerClassName: 'buying-col-header-icon buying-col-centered-tight',
      cellClassName: 'buying-col-centered-tight',
      valueGetter: (_v, row) => (stateRef.current.watchlistIds?.has(row.id) ? 1 : 0),
      renderHeader: () => {
        const { rows, selectedIds, watchlistIds, sortModel } = stateRef.current;
        const targetRows = getTargetRowsForBulk(rows, selectedIds);
        const scope = scopePhrase(selectedIds);
        const watchLimited = watchlistIds === undefined;
        const noRows = targetRows.length === 0;
        const disabled = watchLimited || noRows || !onWatchToggle;
        let anyUnwatched = false;
        if (!watchLimited && watchlistIds && targetRows.length > 0) {
          anyUnwatched = targetRows.some((r) => !watchlistIds.has(r.id));
        }
        const tooltipTitle = watchLimited
          ? 'Watchlist status limited to first 100 auctions — bulk actions disabled'
          : noRows
            ? 'No rows on this page'
            : anyUnwatched
              ? `Watch all ${scope} (${targetRows.length})`
              : `Unwatch all ${scope} (${targetRows.length})`;
        const onClick = (e: MouseEvent) => {
          e.stopPropagation();
          const s = stateRef.current;
          if (s.watchlistIds === undefined || !onWatchToggle) return;
          const tr = getTargetRowsForBulk(s.rows, s.selectedIds);
          if (tr.length === 0) return;
          const anyUn = tr.some((r) => !s.watchlistIds!.has(r.id));
          void onBulkWatch(tr.map((r) => r.id), anyUn);
        };
        const sortEntry = sortModel.find((s) => s.field === 'watchlist_sort');
        const sortDir = sortEntry?.sort === 'asc' || sortEntry?.sort === 'desc' ? sortEntry.sort : null;
        const sortTip = bulkColumnSortTooltip('watchlist_sort', sortDir);
        return (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.25,
              width: '100%',
              px: 0,
            }}
          >
            <IconButton
              aria-label={tooltipTitle}
              disabled={disabled}
              onClick={onClick}
              sx={buyingGridHeaderIconBtnSx}
            >
              <StarIcon sx={{ color: disabled ? 'action.disabled' : 'action.active' }} />
            </IconButton>
            <BulkColumnSortAffordance sortDir={sortDir} sortTip={sortTip} onSortClick={() => onBulkColumnSort('watchlist_sort')} />
          </Box>
        );
      },
      renderCell: (params: GridRenderCellParams<BuyingAuctionListItem>) => {
        const { watchlistIds } = stateRef.current;
        const row = params.row;
        if (watchlistIds === undefined) {
          return (
            <Box sx={{ display: 'flex', width: '100%', justifyContent: 'center', alignItems: 'center' }}>
              <StarBorderIcon sx={buyingGridInertStarSx} aria-hidden />
            </Box>
          );
        }
        const watched = watchlistIds.has(row.id);
        const icon = watched ? (
          <StarIcon color="warning" />
        ) : (
          <StarBorderIcon sx={{ color: 'action.disabled' }} />
        );
        if (onWatchToggle) {
          return (
            <Box
              component="span"
              onClick={(e) => e.stopPropagation()}
              sx={buyingGridIconCellBoxSx}
            >
              <IconButton
                aria-label={watched ? 'Remove from watchlist' : 'Add to watchlist'}
                onClick={(e) => {
                  e.stopPropagation();
                  onWatchToggle(row.id, !watched);
                }}
                sx={buyingGridIconBtnSx}
              >
                {icon}
              </IconButton>
            </Box>
          );
        }
        return <Box sx={buyingGridIconCellFullBoxSx}>{icon}</Box>;
      },
    },
    {
      field: 'thumbs_up',
      headerName: '',
      width: BUYING_COL_THUMBS_WIDTH,
      sortable: true,
      hideSortIcons: true,
      align: 'center',
      headerAlign: 'center',
      headerClassName: 'buying-col-header-icon buying-col-centered-tight',
      cellClassName: 'buying-col-centered-tight',
      valueGetter: (_v, row) => (row.thumbs_up ? 1 : 0),
      renderHeader: () => {
        const { rows, selectedIds, sortModel } = stateRef.current;
        const targetRows = getTargetRowsForBulk(rows, selectedIds);
        const scope = scopePhrase(selectedIds);
        const noRows = targetRows.length === 0;
        const disabled = !canThumbsToggle || !onThumbsToggle || noRows;
        const anyDown = targetRows.some((r) => !r.thumbs_up);
        const tooltipTitle = !canThumbsToggle
          ? 'Thumbs up (staff only)'
          : noRows
            ? 'No rows on this page'
            : anyDown
              ? `Thumbs up all ${scope} (${targetRows.length})`
              : `Remove thumbs up from all ${scope} (${targetRows.length})`;
        const onClick = (e: MouseEvent) => {
          e.stopPropagation();
          if (!canThumbsToggle || !onThumbsToggle) return;
          const s = stateRef.current;
          const tr = getTargetRowsForBulk(s.rows, s.selectedIds);
          if (tr.length === 0) return;
          const anyUn = tr.some((r) => !r.thumbs_up);
          void onBulkThumbs(tr.map((r) => r.id), anyUn);
        };
        const sortEntry = sortModel.find((s) => s.field === 'thumbs_up');
        const sortDir = sortEntry?.sort === 'asc' || sortEntry?.sort === 'desc' ? sortEntry.sort : null;
        const sortTip = bulkColumnSortTooltip('thumbs_up', sortDir);
        return (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.25,
              width: '100%',
              px: 0,
            }}
          >
            <IconButton aria-label={tooltipTitle} disabled={disabled} onClick={onClick} sx={buyingGridHeaderIconBtnSx}>
              <ThumbUpIcon sx={{ color: disabled ? 'action.disabled' : 'action.active' }} />
            </IconButton>
            <BulkColumnSortAffordance
              sortDir={sortDir}
              sortTip={sortTip}
              onSortClick={() => onBulkColumnSort('thumbs_up')}
            />
          </Box>
        );
      },
      renderCell: (params: GridRenderCellParams<BuyingAuctionListItem>) => {
        const row = params.row;
        const active = Boolean(row.thumbs_up);
        const count = row.thumbs_up_count ?? 0;
        const canToggle = canThumbsToggle && onThumbsToggle;
        const icon = active ? (
          <ThumbUpIcon color="primary" />
        ) : (
          <ThumbUpOutlinedIcon color="disabled" />
        );
        const tally = (
          <Typography variant="caption" color="text.secondary" sx={buyingGridThumbsTallySx}>
            {count}
          </Typography>
        );
        if (!canToggle) {
          return (
            <Box
              component="span"
              sx={buyingGridThumbsCellBoxSx}
              onClick={(e) => e.stopPropagation()}
            >
              {icon}
              {tally}
            </Box>
          );
        }
        return (
          <Box
            component="span"
            sx={buyingGridThumbsToggleCellBoxSx}
            onClick={(e) => e.stopPropagation()}
          >
            <IconButton
              sx={buyingGridIconBtnSx}
              aria-label={active ? 'Remove thumbs up' : 'Thumbs up'}
              onClick={(e) => {
                e.stopPropagation();
                onThumbsToggle(row.id, !active);
              }}
            >
              {icon}
            </IconButton>
            {tally}
          </Box>
        );
      },
    },
    {
      field: 'archived_at',
      headerName: '',
      width: BUYING_COL_STAR_ARCHIVE_WIDTH,
      sortable: true,
      hideSortIcons: true,
      align: 'center',
      headerAlign: 'center',
      headerClassName: 'buying-col-header-icon buying-col-centered-tight',
      cellClassName: 'buying-col-centered-tight',
      valueGetter: (_v, row) => (row.archived_at ? 1 : 0),
      renderHeader: () => {
        const { rows, selectedIds, sortModel } = stateRef.current;
        const targetRows = getTargetRowsForBulk(rows, selectedIds);
        const scope = scopePhrase(selectedIds);
        const noRows = targetRows.length === 0;
        const disabled = noRows;
        const anyUnarchived = targetRows.some((r) => !r.archived_at);
        const tooltipTitle = noRows
          ? 'No rows on this page'
          : anyUnarchived
            ? `Archive all ${scope} (${targetRows.length})`
            : `Unarchive all ${scope} (${targetRows.length})`;
        const onClick = (e: MouseEvent) => {
          e.stopPropagation();
          const s = stateRef.current;
          const tr = getTargetRowsForBulk(s.rows, s.selectedIds);
          if (tr.length === 0) return;
          const anyUn = tr.some((r) => !r.archived_at);
          void onBulkArchive(tr.map((r) => r.id), anyUn);
        };
        const sortEntry = sortModel.find((s) => s.field === 'archived_at');
        const sortDir = sortEntry?.sort === 'asc' || sortEntry?.sort === 'desc' ? sortEntry.sort : null;
        const sortTip = bulkColumnSortTooltip('archived_at', sortDir);
        return (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.25,
              width: '100%',
              px: 0,
            }}
          >
            <IconButton aria-label={tooltipTitle} disabled={disabled} onClick={onClick} sx={buyingGridHeaderIconBtnSx}>
              <ArchiveOutlinedIcon sx={{ color: disabled ? 'action.disabled' : 'action.active' }} />
            </IconButton>
            <BulkColumnSortAffordance
              sortDir={sortDir}
              sortTip={sortTip}
              onSortClick={() => onBulkColumnSort('archived_at')}
            />
          </Box>
        );
      },
      renderCell: (params: GridRenderCellParams<BuyingAuctionListItem>) => {
        const row = params.row;
        const archived = Boolean(row.archived_at);
        const pending = stateRef.current.archivePendingIds.has(row.id);
        return (
          <Box
            component="span"
            onClick={(e) => e.stopPropagation()}
            sx={buyingGridIconCellBoxSx}
          >
            <IconButton
              aria-label={pending ? 'Cancel archive' : archived ? 'Unarchive' : 'Archive'}
              onClick={(e) => {
                e.stopPropagation();
                onArchiveToggle(row);
              }}
              sx={pending ? buyingGridArchiveIconBtnPendingSx : buyingGridIconBtnSx}
            >
              {archived ? (
                <UndoOutlinedIcon color={pending ? 'primary' : 'action'} />
              ) : (
                <ArchiveOutlinedIcon color={pending ? 'primary' : 'action'} />
              )}
            </IconButton>
          </Box>
        );
      },
    },
    {
      field: 'priority',
      headerName: 'Priority',
      width: BUYING_COL_PRIORITY_NEED_WIDTH,
      minWidth: 64,
      type: 'number',
      sortable: true,
      align: 'center',
      headerAlign: 'center',
      headerClassName: 'buying-col-centered-tight',
      cellClassName: 'buying-col-centered-tight',
      renderCell: (params: GridRenderCellParams<BuyingAuctionListItem>) => {
        const p = params.row.priority ?? '—';
        return (
          <Box sx={{ display: 'flex', width: '100%', justifyContent: 'center', alignItems: 'center' }}>
            <Typography variant="body2" fontWeight={600} sx={{ fontVariantNumeric: 'tabular-nums', textAlign: 'center' }}>
              {p}
            </Typography>
          </Box>
        );
      },
    },
    {
      field: 'need_score',
      headerName: 'Need',
      width: BUYING_COL_PRIORITY_NEED_WIDTH,
      minWidth: 64,
      type: 'number',
      sortable: true,
      align: 'center',
      headerAlign: 'center',
      headerClassName: 'buying-col-centered-tight',
      cellClassName: 'buying-col-centered-tight',
      valueGetter: (_v, row) => {
        const s = row.need_score;
        if (s == null) return null;
        const n = Number.parseFloat(String(s));
        return Number.isNaN(n) ? null : n;
      },
      renderCell: (params) => (
        <Box sx={{ display: 'flex', width: '100%', justifyContent: 'center', alignItems: 'center' }}>
          <Typography variant="body2" component="span" sx={{ fontVariantNumeric: 'tabular-nums', textAlign: 'center' }}>
            {formatNeedScoreRaw(params.row.need_score)}
          </Typography>
        </Box>
      ),
    },
    {
      field: 'marketplace__name',
      headerName: 'Vendor',
      width: BUYING_COL_VENDOR_WIDTH,
      minWidth: 88,
      sortable: true,
      align: 'center',
      headerAlign: 'center',
      headerClassName: 'buying-col-centered-tight',
      cellClassName: 'buying-col-centered-tight',
      valueGetter: (_value, row) => row.marketplace?.name ?? '',
      renderCell: (params: GridRenderCellParams<BuyingAuctionListItem>) => (
        <Box sx={{ display: 'flex', width: '100%', justifyContent: 'center', alignItems: 'center', minWidth: 0 }}>
          <Chip
            size="small"
            label={params.row.marketplace?.name ?? '—'}
            color="primary"
            variant="outlined"
            sx={{ maxWidth: '100%' }}
          />
        </Box>
      ),
    },
    {
      field: 'has_manifest',
      headerName: 'Manifest',
      width: 76,
      minWidth: 68,
      sortable: true,
      align: 'center',
      headerAlign: 'center',
      valueGetter: (_v, row) => (row.has_manifest ? 1 : 0),
      renderCell: (params: GridRenderCellParams<BuyingAuctionListItem>) => (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            minHeight: BUYING_AUCTION_LIST_ROW_ICON_PX,
          }}
        >
          <AuctionManifestStateIcon row={params.row} size={BUYING_AUCTION_LIST_ROW_ICON_PX} />
        </Box>
      ),
    },
    {
      field: 'title',
      headerName: 'Title',
      flex: 1,
      minWidth: 160,
      sortable: true,
      renderCell: (params: GridRenderCellParams<BuyingAuctionListItem>) => (
        <Typography variant="body2" noWrap sx={{ overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
          {params.row.title}
        </Typography>
      ),
    },
    {
      field: 'category_distribution',
      headerName: 'Top category %',
      width: 128,
      minWidth: 112,
      sortable: false,
      hideSortIcons: true,
      filterable: false,
      align: 'left',
      headerAlign: 'left',
      renderCell: (params: GridRenderCellParams<BuyingAuctionListItem>) => (
        <Box sx={{ width: '100%', minWidth: 0, overflow: 'hidden', display: 'flex', alignItems: 'center' }}>
          <AuctionCategoryListBlock row={params.row} />
        </Box>
      ),
    },
    {
      field: 'current_price',
      headerName: 'Price',
      width: 88,
      type: 'number',
      sortable: true,
      valueFormatter: (v) => formatCurrencyWhole(v as string | null),
      renderCell: (params: GridRenderCellParams<BuyingAuctionListItem>) => (
        <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatCurrencyWhole(params.row.current_price)}
        </Typography>
      ),
    },
    {
      field: 'price_retail_pct',
      headerName: 'P/R %',
      width: 64,
      sortable: true,
      align: 'right',
      headerAlign: 'right',
      valueGetter: (_v, row) => {
        const price = row.current_price;
        const retail = row.total_retail_display ?? row.total_retail_value;
        if (price == null || price === '' || retail == null || retail === '') return null;
        const p = Number.parseFloat(String(price));
        const r = Number.parseFloat(String(retail));
        if (!Number.isFinite(p) || !Number.isFinite(r) || r <= 0) return null;
        return Math.round((p / r) * 100);
      },
      renderCell: (params: GridRenderCellParams<BuyingAuctionListItem>) => (
        <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatPriceToRetailPct(params.row)}
        </Typography>
      ),
    },
    {
      field: 'retail_sort',
      headerName: 'Retail',
      width: 100,
      type: 'number',
      sortable: true,
      valueGetter: (_v, row) => {
        const s = row.retail_sort;
        if (s == null || s === '') return null;
        const n = Number.parseFloat(String(s));
        return Number.isNaN(n) ? null : n;
      },
      renderCell: (params: GridRenderCellParams<BuyingAuctionListItem>) => {
        const row = params.row;
        const display = row.total_retail_display ?? row.total_retail_value;
        return <Box component="span">{formatCurrencyWhole(display)}</Box>;
      },
    },
    {
      field: 'end_time',
      headerName: 'Time left',
      width: 104,
      sortable: true,
      renderCell: (params: GridRenderCellParams<BuyingAuctionListItem>) => (
        <TimeRemainingCell endTime={params.row.end_time} />
      ),
    },
    {
      field: 'expand',
      headerName: '',
      width: EXPAND_COL_WIDTH,
      sortable: false,
      hideSortIcons: true,
      filterable: false,
      disableColumnMenu: true,
      align: 'center',
      headerAlign: 'center',
      headerClassName: 'buying-col-header-icon',
      renderHeader: () => {
        const { rows, expandedIds } = stateRef.current;
        const pageIds = rows.map((r) => r.id);
        const noRows = pageIds.length === 0;
        const allExpanded = !noRows && pageIds.every((id) => expandedIds.has(id));
        const label = allExpanded ? 'Collapse all rows on this page' : 'Expand all rows on this page';
        return (
          <Box sx={buyingGridIconCellFullBoxSx}>
            <IconButton
              aria-label={label}
              disabled={noRows}
              onClick={(e) => {
                e.stopPropagation();
                onExpandAll();
              }}
              sx={buyingGridHeaderIconBtnSx}
            >
              {allExpanded ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
            </IconButton>
          </Box>
        );
      },
      renderCell: (params: GridRenderCellParams<BuyingAuctionListItem>) => {
        const { expandedIds } = stateRef.current;
        const row = params.row;
        const isOpen = expandedIds.has(row.id);
        return (
          <Box
            component="span"
            onClick={(e) => e.stopPropagation()}
            sx={buyingGridIconCellBoxSx}
          >
            <IconButton
              aria-expanded={isOpen}
              aria-label={isOpen ? 'Collapse row details' : 'Expand row details'}
              onClick={(e) => {
                e.stopPropagation();
                onExpandToggle(row.id);
              }}
              sx={buyingGridIconBtnSx}
            >
              {isOpen ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
            </IconButton>
          </Box>
        );
      },
    },
  ];
}

function InlineDetailStrip({ row }: { row: BuyingAuctionListItem }) {
  const top = row.top_categories ?? [];
  const costPct = formatAuctionCostToRetailPct(row);
  const mcount = row.manifest_row_count ?? 0;
  const bids = row.bid_count != null ? String(row.bid_count) : '—';
  const srcLabel =
    row.valuation_source === 'manifest' ? 'Manifest' : row.valuation_source === 'ai' ? 'AI estimate' : '—';
  const profit = row.est_profit != null && row.est_profit !== '' ? formatCurrencyWhole(row.est_profit) : '—';
  const estCost =
    row.estimated_total_cost != null && row.estimated_total_cost !== ''
      ? formatCurrencyWhole(row.estimated_total_cost)
      : '—';
  const cats =
    top.length === 0
      ? '—'
      : top.map((c) => `${c.name.length > 14 ? `${c.name.slice(0, 13)}…` : c.name} ${c.pct.toFixed(0)}%`).join(', ');

  const parts = [
    `Profit: ${profit}`,
    `C/R: ${costPct}`,
    `Profitability: ${formatRatioOrDash(row.profitability_ratio)}`,
    `Est. cost: ${estCost}`,
    `Bids: ${bids}`,
    `Manifest: ${row.has_manifest ? `Yes (${mcount})` : 'No'}`,
    `Condition: ${row.condition_summary || '—'}`,
    `Lot: ${row.lot_size != null ? String(row.lot_size) : '—'}`,
    `Source: ${srcLabel}`,
    `Top cats: ${cats}`,
  ];

  return (
    <Box
      component="span"
      sx={{
        display: 'block',
        fontSize: '0.75rem',
        lineHeight: 1.35,
      }}
    >
      <Typography component="span" variant="caption" sx={{ fontSize: 'inherit' }}>
        {parts.join(' | ')}
      </Typography>
    </Box>
  );
}

function createAuctionRowSlot(stateRef: MutableRefObject<GridCellState>) {
  const Row = forwardRef<HTMLDivElement, GridRowProps>(function AuctionRowSlot(props, ref) {
    const row = props.row as BuyingAuctionListItem | null | undefined;
    if (!row) {
      return <GridRow {...props} ref={ref} />;
    }
    const expanded = stateRef.current.expandedIds.has(row.id);
    if (!expanded) {
      return <GridRow {...props} ref={ref} />;
    }

    const { style: styleProp, rowHeight } = props;
    const total =
      typeof rowHeight === 'number' ? rowHeight : ESTIMATE_ROW_BASE_PX + DETAIL_STRIP_PX;
    const base = Math.max(total - DETAIL_STRIP_PX, 1);

    const outerStyle: CSSProperties = {
      ...(styleProp as CSSProperties),
      display: 'flex',
      flexDirection: 'column',
      height: total,
      minHeight: total,
    };

    const innerStyle: CSSProperties = {
      ...(styleProp as CSSProperties),
      position: 'relative',
      top: 0,
      transform: 'none',
      height: base,
      minHeight: base,
      maxHeight: base,
      flex: '0 0 auto',
    };

    return (
      <div ref={ref} style={outerStyle} className="buying-auction-row--inlineWrap">
        <GridRow {...props} rowHeight={base} style={innerStyle} />
        <Box
          sx={{
            flex: '0 0 auto',
            width: '100%',
            boxSizing: 'border-box',
            py: 0.5,
            px: 1,
            bgcolor: 'action.hover',
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          <InlineDetailStrip row={row} />
        </Box>
      </div>
    );
  });
  Row.displayName = 'AuctionRowSlot';
  return Row;
}

export default function AuctionListDesktop({
  rows,
  rowCount,
  loading,
  ordering,
  onOrderingChange,
  paginationModel,
  onPaginationModelChange,
  onRowNavigate,
  canThumbsToggle = false,
  onThumbsToggle,
  onWatchToggle,
  watchlistIds,
  countdownTick,
  onArchiveToggle,
  onBulkWatch,
  onBulkThumbs,
  onBulkArchive,
  archivePendingIds,
}: AuctionListDesktopProps) {
  void countdownTick;
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set());
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const sortModel: GridSortModel = useMemo(() => sortModelFromOrdering(ordering), [ordering]);

  const gridStateRef = useRef<GridCellState>({
    watchlistIds,
    rows,
    selectedIds,
    sortModel,
    expandedIds,
    archivePendingIds,
  });
  gridStateRef.current = {
    watchlistIds,
    rows,
    selectedIds,
    sortModel,
    expandedIds,
    archivePendingIds,
  };

  const pageRowIds = useMemo(() => rows.map((r) => r.id), [rows]);

  const handleRowSelectionModelChange = useCallback((model: GridRowSelectionModel) => {
    setSelectedIds(rowSelectionModelToSelectedIds(model, pageRowIds));
  }, [pageRowIds]);

  useEffect(() => {
    setSelectedIds([]);
    setExpandedIds(new Set());
  }, [paginationModel.page, paginationModel.pageSize]);

  const onExpandToggle = useCallback((id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onExpandAll = useCallback(() => {
    setExpandedIds((prev) => {
      const pageIds = rows.map((r) => r.id);
      if (pageIds.length === 0) return prev;
      const allExpanded = pageIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allExpanded) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [rows]);

  const handleSortModelChange = useCallback(
    (model: GridSortModel) => {
      onOrderingChange(orderingFromSortModel(model));
    },
    [onOrderingChange]
  );

  const handleBulkColumnSort = useCallback(
    (field: BulkSortableField) => {
      const current = gridStateRef.current.sortModel.find((s) => s.field === field);
      let next: GridSortModel;
      if (!current) {
        next = [{ field, sort: 'asc' }];
      } else if (current.sort === 'asc') {
        next = [{ field, sort: 'desc' }];
      } else {
        next = [];
      }
      handleSortModelChange(next);
    },
    [handleSortModelChange]
  );

  const columns = useMemo(
    () =>
      buildColumns(
        canThumbsToggle,
        onThumbsToggle,
        onWatchToggle,
        onArchiveToggle,
        onBulkWatch,
        onBulkThumbs,
        onBulkArchive,
        handleBulkColumnSort,
        onExpandToggle,
        onExpandAll,
        gridStateRef
      ),
    [canThumbsToggle, onThumbsToggle, onWatchToggle, onArchiveToggle, onBulkWatch, onBulkThumbs, onBulkArchive, handleBulkColumnSort, onExpandToggle, onExpandAll]
  );

  const auctionRowSlot = useMemo(() => createAuctionRowSlot(gridStateRef), []);

  const getRowHeight = useCallback(
    ({ id }: GridRowHeightParams) => {
      if (expandedIds.has(Number(id))) {
        return ESTIMATE_ROW_BASE_PX + DETAIL_STRIP_PX;
      }
      return undefined;
    },
    [expandedIds]
  );

  const getRowClassName = useCallback((params: GridRowClassNameParams<BuyingAuctionListItem>) => {
    const id = Number(params.id);
    const { watchlistIds: wids, expandedIds: eids } = gridStateRef.current;
    const parts: string[] = [];
    if (wids?.has(id)) parts.push('buying-auction-row--watched');
    if (eids.has(id)) parts.push('buying-auction-row--expanded');
    return parts.join(' ');
  }, []);

  const handleRowClick = useCallback(
    (params: GridRowParams<BuyingAuctionListItem>, event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('[data-field="expand"]') && !event.shiftKey) {
        return;
      }
      if (event.shiftKey) {
        event.preventDefault();
        onExpandToggle(Number(params.id));
        return;
      }
      onRowNavigate(Number(params.id));
    },
    [onRowNavigate, onExpandToggle]
  );

  return (
    <Box sx={{ flex: 1, minHeight: 400, display: 'flex', flexDirection: 'column' }}>
      <DataGrid
        rows={rows}
        columns={columns}
        rowCount={rowCount}
        loading={loading}
        disableColumnMenu
        pageSizeOptions={[50, 25, 100]}
        paginationMode="server"
        sortingMode="server"
        paginationModel={paginationModel}
        onPaginationModelChange={onPaginationModelChange}
        hideFooterPagination
        sortModel={sortModel}
        onSortModelChange={handleSortModelChange}
        onRowClick={handleRowClick}
        disableRowSelectionOnClick
        checkboxSelection
        disableRowSelectionExcludeModel
        sortingOrder={['asc', 'desc']}
        getRowId={(row) => String(row.id)}
        rowSelectionModel={{ type: 'include' as const, ids: new Set(selectedIds.map(String)) }}
        onRowSelectionModelChange={handleRowSelectionModelChange}
        localeText={{
          checkboxSelectionSelectAllRows: 'Select all rows on this page',
          checkboxSelectionUnselectAllRows: 'Deselect all rows on this page',
          checkboxSelectionSelectRow: 'Select row',
          checkboxSelectionUnselectRow: 'Deselect row',
        }}
        density="compact"
        rowHeight={BUYING_AUCTION_LIST_ROW_HEIGHT_PX}
        columnHeaderHeight={40}
        getRowClassName={getRowClassName}
        getRowHeight={getRowHeight}
        slots={{ row: auctionRowSlot, baseTooltip: DataGridTooltipPassthrough }}
        slotProps={{
          cell: { title: '' },
        }}
        sx={{
          flex: 1,
          minHeight: 360,
          border: 'none',
          '& .MuiDataGrid-row': { cursor: 'pointer' },
          '& .MuiDataGrid-columnHeader': {
            display: 'flex',
            alignItems: 'center',
            py: 0,
            px: 0.75,
          },
          '& .MuiDataGrid-sortIcon': {
            fontSize: BUYING_AUCTION_LIST_HEADER_ICON_PX,
          },
          '& .MuiDataGrid-cell': {
            display: 'flex',
            alignItems: 'center',
            py: 0.5,
            px: 0.75,
            lineHeight: 1.25,
          },
          '& .MuiDataGrid-columnHeaderCheckbox': {
            maxWidth: 42,
            minWidth: 42,
            width: 42,
            px: 0,
            justifyContent: 'center',
          },
          '& .MuiDataGrid-cellCheckbox': {
            maxWidth: 42,
            minWidth: 42,
            width: 42,
            py: 0,
            px: 0,
            justifyContent: 'center',
          },
          '& .MuiDataGrid-cell.buying-col-centered-tight': {
            justifyContent: 'center',
            px: 0.5,
          },
          '& .MuiDataGrid-columnHeader.buying-col-centered-tight': {
            justifyContent: 'center',
            px: 0.5,
          },
          '& .MuiDataGrid-columnHeader.buying-col-centered-tight .MuiDataGrid-columnHeaderTitleContainer': {
            justifyContent: 'center',
            width: '100%',
          },
          '& .MuiDataGrid-footerContainer': {
            minHeight: 44,
            py: 0.5,
          },
          '& .MuiDataGrid-row.buying-auction-row--watched': {
            backgroundColor: '#fffde7',
          },
          '& .MuiDataGrid-row.buying-auction-row--expanded': {
            backgroundColor: (theme) => theme.palette.action.selected,
          },
          '& .MuiDataGrid-columnHeader.buying-col-header-icon .MuiDataGrid-columnHeaderTitleContainer': {
            width: '100%',
            justifyContent: 'center',
          },
          '& .MuiDataGrid-columnHeader:not(.buying-col-header-icon) .MuiDataGrid-columnHeaderTitleContainer': {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
            gap: 0.5,
          },
          '& .MuiDataGrid-columnHeader:not(.buying-col-header-icon) .MuiDataGrid-columnHeaderTitleContainerContent': {
            flex: '1 1 auto',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          },
          '& .MuiDataGrid-columnHeader:not(.buying-col-header-icon) .MuiDataGrid-iconButtonContainer': {
            marginLeft: 'auto',
            flexShrink: 0,
          },
          '& .MuiDataGrid-columnHeader.buying-col-centered-tight .MuiDataGrid-iconButtonContainer': {
            marginLeft: 0,
          },
        }}
      />
    </Box>
  );
}

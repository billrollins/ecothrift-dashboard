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
  formatTimeRemaining,
  msUntilEnd,
  MS_TIME_REMAINING_WITH_SECONDS,
  orderingFromSortModel,
  sortModelFromOrdering,
  timeRemainingSx,
} from '../../utils/buyingAuctionList';
import type { BuyingAuctionListItem } from '../../types/buying.types';

/** Star / thumbs / archive columns — same width for visual continuity. */
const BUYING_ACTION_COL_WIDTH = 76;
/** Expand/collapse chevron column. */
const EXPAND_COL_WIDTH = 36;
/** Extra height for inline detail strip under an expanded row (matches getRowHeight). */
const DETAIL_STRIP_PX = 44;
/** Default compact row body height when splitting expanded row (must match grid default ~compact). */
const ESTIMATE_ROW_BASE_PX = 52;
/** Priority through Vendor — same width for continuity. */
const BUYING_PRIORITY_BLOCK_COL_WIDTH = 108;

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
  expandedId: number | null;
}

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
        minWidth: 28,
        height: 28,
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
        size="small"
        aria-label={sortTip}
        onClick={(e) => {
          e.stopPropagation();
          onSortClick();
        }}
        sx={{ p: 0.25 }}
      >
        {sortDir === 'desc' ? (
          <ArrowDownwardIcon fontSize="small" />
        ) : (
          <ArrowUpwardIcon fontSize="small" />
        )}
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
  isAdmin?: boolean;
  onThumbsToggle?: (id: number, next: boolean) => void;
  onWatchToggle?: (id: number, add: boolean) => void;
  watchlistIds?: Set<number>;
  /** Forces time-remaining cells to re-render every second when any row is under 5 min. */
  countdownTick: number;
  onArchiveToggle: (row: BuyingAuctionListItem) => void;
  onBulkWatch: (ids: number[], add: boolean) => void | Promise<void>;
  onBulkThumbs: (ids: number[], active: boolean) => void | Promise<void>;
  onBulkArchive: (ids: number[], archive: boolean) => void | Promise<void>;
};

/**
 * Build column definitions once.
 * All frequently-changing state is read from `stateRef.current` inside closures
 * so the returned array is referentially stable across data-only changes.
 */
function buildColumns(
  isAdmin: boolean,
  onThumbsToggle: AuctionListDesktopProps['onThumbsToggle'],
  onWatchToggle: AuctionListDesktopProps['onWatchToggle'],
  onArchiveToggle: AuctionListDesktopProps['onArchiveToggle'],
  onBulkWatch: AuctionListDesktopProps['onBulkWatch'],
  onBulkThumbs: AuctionListDesktopProps['onBulkThumbs'],
  onBulkArchive: AuctionListDesktopProps['onBulkArchive'],
  onBulkColumnSort: (field: BulkSortableField) => void,
  onExpandToggle: (id: number) => void,
  stateRef: MutableRefObject<GridCellState>
): GridColDef<BuyingAuctionListItem>[] {
  return [
    {
      field: 'watchlist_sort',
      headerName: '',
      width: BUYING_ACTION_COL_WIDTH,
      sortable: true,
      hideSortIcons: true,
      align: 'center',
      headerAlign: 'center',
      headerClassName: 'buying-col-header-icon',
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
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.25, width: '100%', px: 0.25 }}>
            <IconButton
              size="small"
              aria-label={tooltipTitle}
              disabled={disabled}
              onClick={onClick}
              sx={{ p: 0.25 }}
            >
              <StarIcon fontSize="small" sx={{ color: disabled ? 'action.disabled' : 'action.active' }} />
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
            <StarBorderIcon fontSize="small" sx={{ color: 'action.disabled' }} aria-hidden />
          );
        }
        const watched = watchlistIds.has(row.id);
        const icon = watched ? (
          <StarIcon fontSize="small" color="warning" />
        ) : (
          <StarBorderIcon fontSize="small" sx={{ color: 'action.disabled' }} />
        );
        if (onWatchToggle) {
          return (
            <Box component="span" onClick={(e) => e.stopPropagation()} sx={{ display: 'flex', justifyContent: 'center' }}>
              <IconButton
                size="small"
                aria-label={watched ? 'Remove from watchlist' : 'Add to watchlist'}
                onClick={(e) => {
                  e.stopPropagation();
                  onWatchToggle(row.id, !watched);
                }}
              >
                {icon}
              </IconButton>
            </Box>
          );
        }
        return <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%' }}>{icon}</Box>;
      },
    },
    {
      field: 'thumbs_up',
      headerName: '',
      width: BUYING_ACTION_COL_WIDTH,
      sortable: true,
      hideSortIcons: true,
      align: 'center',
      headerAlign: 'center',
      headerClassName: 'buying-col-header-icon',
      valueGetter: (_v, row) => (row.thumbs_up ? 1 : 0),
      renderHeader: () => {
        const { rows, selectedIds, sortModel } = stateRef.current;
        const targetRows = getTargetRowsForBulk(rows, selectedIds);
        const scope = scopePhrase(selectedIds);
        const noRows = targetRows.length === 0;
        const disabled = !isAdmin || !onThumbsToggle || noRows;
        const anyDown = targetRows.some((r) => !r.thumbs_up);
        const tooltipTitle = !isAdmin
          ? 'Thumbs up (admins only)'
          : noRows
            ? 'No rows on this page'
            : anyDown
              ? `Thumbs up all ${scope} (${targetRows.length})`
              : `Remove thumbs up from all ${scope} (${targetRows.length})`;
        const onClick = (e: MouseEvent) => {
          e.stopPropagation();
          if (!isAdmin || !onThumbsToggle) return;
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
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.25, width: '100%', px: 0.25 }}>
            <IconButton size="small" aria-label={tooltipTitle} disabled={disabled} onClick={onClick} sx={{ p: 0.25 }}>
              <ThumbUpIcon fontSize="small" sx={{ color: disabled ? 'action.disabled' : 'action.active' }} />
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
        const canToggle = isAdmin && onThumbsToggle;
        const icon = active ? (
          <ThumbUpIcon fontSize="small" color="primary" />
        ) : (
          <ThumbUpOutlinedIcon fontSize="small" color="disabled" />
        );
        const tally = (
          <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.7rem' }}>
            {count}
          </Typography>
        );
        if (!canToggle) {
          return (
            <Box
              component="span"
              sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.25, width: '100%' }}
            >
              {icon}
              {tally}
            </Box>
          );
        }
        return (
          <Box
            component="span"
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0,
              width: '100%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <IconButton
              size="small"
              sx={{ p: 0.25 }}
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
      width: BUYING_ACTION_COL_WIDTH,
      sortable: true,
      hideSortIcons: true,
      align: 'center',
      headerAlign: 'center',
      headerClassName: 'buying-col-header-icon',
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
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.25, width: '100%', px: 0.25 }}>
            <IconButton size="small" aria-label={tooltipTitle} disabled={disabled} onClick={onClick} sx={{ p: 0.25 }}>
              <ArchiveOutlinedIcon fontSize="small" sx={{ color: disabled ? 'action.disabled' : 'action.active' }} />
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
        return (
          <Box component="span" onClick={(e) => e.stopPropagation()} sx={{ display: 'flex', justifyContent: 'center' }}>
            <IconButton
              size="small"
              aria-label={archived ? 'Unarchive' : 'Archive'}
              onClick={(e) => {
                e.stopPropagation();
                onArchiveToggle(row);
              }}
            >
              {archived ? (
                <UndoOutlinedIcon fontSize="small" color="action" />
              ) : (
                <ArchiveOutlinedIcon fontSize="small" color="action" />
              )}
            </IconButton>
          </Box>
        );
      },
    },
    {
      field: 'priority',
      headerName: 'Priority',
      width: BUYING_PRIORITY_BLOCK_COL_WIDTH,
      type: 'number',
      sortable: true,
      renderCell: (params: GridRenderCellParams<BuyingAuctionListItem>) => {
        const p = params.row.priority ?? '—';
        return (
          <Typography variant="body2" fontWeight={600} sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {p}
          </Typography>
        );
      },
    },
    {
      field: 'need_score',
      headerName: 'Need',
      width: BUYING_PRIORITY_BLOCK_COL_WIDTH,
      type: 'number',
      sortable: true,
      valueGetter: (_v, row) => {
        const s = row.need_score;
        if (s == null) return null;
        const n = Number.parseFloat(String(s));
        return Number.isNaN(n) ? null : n;
      },
      renderCell: (params) => (
        <Typography variant="body2" component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatNeedScoreRaw(params.row.need_score)}
        </Typography>
      ),
    },
    {
      field: 'marketplace__name',
      headerName: 'Vendor',
      width: BUYING_PRIORITY_BLOCK_COL_WIDTH,
      sortable: true,
      valueGetter: (_value, row) => row.marketplace?.name ?? '',
      renderCell: (params: GridRenderCellParams<BuyingAuctionListItem>) => (
        <Chip size="small" label={params.row.marketplace?.name ?? '—'} color="primary" variant="outlined" />
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
      filterable: false,
      disableColumnMenu: true,
      align: 'center',
      headerAlign: 'center',
      headerClassName: 'buying-col-header-icon',
      renderHeader: () => null,
      renderCell: (params: GridRenderCellParams<BuyingAuctionListItem>) => {
        const { expandedId } = stateRef.current;
        const row = params.row;
        const isOpen = expandedId === row.id;
        return (
          <Box component="span" onClick={(e) => e.stopPropagation()} sx={{ display: 'flex', justifyContent: 'center' }}>
            <IconButton
              size="small"
              aria-expanded={isOpen}
              aria-label={isOpen ? 'Collapse row details' : 'Expand row details'}
              onClick={(e) => {
                e.stopPropagation();
                onExpandToggle(row.id);
              }}
              sx={{ p: 0.25 }}
            >
              {isOpen ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
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
    const expanded = stateRef.current.expandedId === row.id;
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
  isAdmin = false,
  onThumbsToggle,
  onWatchToggle,
  watchlistIds,
  countdownTick,
  onArchiveToggle,
  onBulkWatch,
  onBulkThumbs,
  onBulkArchive,
}: AuctionListDesktopProps) {
  void countdownTick;
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const sortModel: GridSortModel = useMemo(() => sortModelFromOrdering(ordering), [ordering]);

  const gridStateRef = useRef<GridCellState>({
    watchlistIds,
    rows,
    selectedIds,
    sortModel,
    expandedId,
  });
  gridStateRef.current = { watchlistIds, rows, selectedIds, sortModel, expandedId };

  const pageRowIds = useMemo(() => rows.map((r) => r.id), [rows]);

  const handleRowSelectionModelChange = useCallback((model: GridRowSelectionModel) => {
    setSelectedIds(rowSelectionModelToSelectedIds(model, pageRowIds));
  }, [pageRowIds]);

  useEffect(() => {
    setSelectedIds([]);
  }, [paginationModel.page, paginationModel.pageSize]);

  const onExpandToggle = useCallback((id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

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
        isAdmin,
        onThumbsToggle,
        onWatchToggle,
        onArchiveToggle,
        onBulkWatch,
        onBulkThumbs,
        onBulkArchive,
        handleBulkColumnSort,
        onExpandToggle,
        gridStateRef
      ),
    [isAdmin, onThumbsToggle, onWatchToggle, onArchiveToggle, onBulkWatch, onBulkThumbs, onBulkArchive, handleBulkColumnSort, onExpandToggle]
  );

  const auctionRowSlot = useMemo(() => createAuctionRowSlot(gridStateRef), []);

  const getRowHeight = useCallback(
    ({ id }: GridRowHeightParams) => {
      if (expandedId === Number(id)) {
        return ESTIMATE_ROW_BASE_PX + DETAIL_STRIP_PX;
      }
      return undefined;
    },
    [expandedId]
  );

  const getRowClassName = useCallback(
    (params: GridRowClassNameParams<BuyingAuctionListItem>) => {
      const id = Number(params.id);
      const { watchlistIds: wids, expandedId: eid } = gridStateRef.current;
      const parts: string[] = [];
      if (wids?.has(id)) parts.push('buying-auction-row--watched');
      if (eid === id) parts.push('buying-auction-row--expanded');
      return parts.join(' ');
    },
    []
  );

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
          '& .MuiDataGrid-row.buying-auction-row--watched': {
            backgroundColor: '#fffde7',
          },
          '& .MuiDataGrid-row.buying-auction-row--expanded': {
            backgroundColor: (theme) => theme.palette.action.selected,
          },
          '& .MuiDataGrid-columnHeader.buying-col-header-icon .MuiDataGrid-columnHeaderTitleContainer': {
            width: '100%',
            justifyContent: 'flex-start',
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
        }}
      />
    </Box>
  );
}

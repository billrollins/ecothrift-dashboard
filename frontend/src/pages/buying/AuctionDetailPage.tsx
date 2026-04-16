import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import StarIcon from '@mui/icons-material/Star';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { DataGrid, type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import { isAxiosError } from 'axios';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import AiManifestComparisonStrip from '../../components/buying/AiManifestComparisonStrip';
import AuctionDetailsInfoCard from '../../components/buying/AuctionDetailsInfoCard';
import AuctionPrimaryCard from '../../components/buying/AuctionPrimaryCard';
import AuctionSecondaryCard from '../../components/buying/AuctionSecondaryCard';
import { ValuationCategoryTableCard, ValuationCostsCard } from '../../components/buying/AuctionValuationCard';
import BuyingDetailSectionTitle from '../../components/buying/BuyingDetailSectionTitle';
import CategoryDistributionBar from '../../components/buying/CategoryDistributionBar';
import { useAuth } from '../../contexts/AuthContext';
import { ManifestPullProgressPanel } from '../../components/buying/ManifestPullProgressPanel';
import {
  ManifestUploadProgress,
  type ManifestMappingPhase,
} from '../../components/buying/ManifestUploadProgress';
import {
  deleteBuyingAuctionArchive,
  deleteBuyingManifest,
  deleteBuyingWatchlist,
  postBuyingAuctionArchive,
  postBuyingAuctionRefreshFromBstock,
  postBuyingMapFastCatBatch,
  postBuyingPullManifest,
  postBuyingUploadManifest,
  postBuyingWatchlist,
} from '../../api/buying.api';
import { useBuyingAuctionDetail } from '../../hooks/useBuyingAuctionDetail';
import { useBuyingManifestPullProgress } from '../../hooks/useBuyingManifestPullProgress';
import { useLiveBuyingCountdownTick } from '../../hooks/useLiveBuyingCountdown';
import { useBuyingAuctionSnapshots } from '../../hooks/useBuyingAuctionSnapshots';
import {
  useBuyingManifestRowsInfinite,
  useBuyingManifestRowsPage,
} from '../../hooks/useBuyingManifestRows';
import type {
  BuyingAuctionDetail,
  BuyingManifestRow,
  BuyingUploadManifestResponse,
} from '../../types/buying.types';
import { formatCurrency, formatNumber } from '../../utils/format';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
const MANIFEST_PAGE_SIZE = 50;

function categoryConfidenceChipProps(conf: string | null | undefined): {
  color: 'primary' | 'secondary' | 'warning' | 'default';
  variant: 'filled' | 'outlined';
} {
  if (conf === 'direct') return { color: 'primary', variant: 'filled' };
  if (conf === 'ai_mapped') return { color: 'warning', variant: 'filled' };
  if (conf === 'fast_cat') return { color: 'secondary', variant: 'filled' };
  return { color: 'default', variant: 'outlined' };
}

function manifestExtRetail(row: BuyingManifestRow): number {
  const q = row.quantity != null && row.quantity > 0 ? row.quantity : 1;
  const r = parseFloat(String(row.retail_value ?? '0'));
  if (!Number.isFinite(r)) return 0;
  return q * r;
}

function buildManifestColumns(manifestExtendedTotal: string | null | undefined): GridColDef<BuyingManifestRow>[] {
  const denom = (() => {
    const t = manifestExtendedTotal?.trim();
    if (!t) return 0;
    const n = parseFloat(t);
    return Number.isFinite(n) && n > 0 ? n : 0;
  })();

  return [
    { field: 'row_number', headerName: '#', width: 64, type: 'number' },
    {
      field: 'canonical_category',
      headerName: 'Category',
      width: 112,
      minWidth: 96,
      maxWidth: 140,
      sortable: false,
      renderCell: (params) => {
        const row = params.row;
        const label = row.canonical_category ?? row.fast_cat_value;
        if (!label) {
          return (
            <Typography variant="body2" color="text.secondary">
              —
            </Typography>
          );
        }
        const chip = categoryConfidenceChipProps(row.category_confidence);
        return (
          <Chip
            size="small"
            label={label}
            color={chip.color}
            variant={chip.variant}
            sx={{
              maxWidth: '100%',
              height: 24,
              '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis', px: 0.75 },
            }}
          />
        );
      },
    },
    { field: 'brand', headerName: 'Brand', width: 100, minWidth: 88, maxWidth: 120 },
    { field: 'title', headerName: 'Title', flex: 1, minWidth: 200 },
    {
      field: 'quantity',
      headerName: 'Qty',
      width: 72,
      type: 'number',
      valueFormatter: (v) => formatNumber(v as number | null),
    },
    {
      field: 'retail_value',
      headerName: 'Retail',
      width: 100,
      type: 'number',
      valueFormatter: (v) => formatCurrency(v as string | null),
    },
    {
      field: 'ext_retail',
      headerName: 'Ext Retail',
      width: 110,
      sortable: false,
      align: 'right',
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatCurrency(manifestExtRetail(params.row).toFixed(2))}
        </Typography>
      ),
    },
    {
      field: 'pct_manifest',
      headerName: '% of Manifest',
      width: 118,
      sortable: false,
      align: 'right',
      renderCell: (params) => {
        const ext = manifestExtRetail(params.row);
        if (denom <= 0) {
          return (
            <Typography variant="body2" color="text.secondary">
              —
            </Typography>
          );
        }
        const pct = (ext / denom) * 100;
        return (
          <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {pct.toFixed(1)}%
          </Typography>
        );
      },
    },
    { field: 'condition', headerName: 'Condition', width: 96, minWidth: 80, maxWidth: 112 },
    { field: 'upc', headerName: 'UPC', width: 88, minWidth: 72, maxWidth: 104 },
    { field: 'sku', headerName: 'SKU', width: 96, minWidth: 80, maxWidth: 112 },
  ];
}

function dragHasFiles(e: DragEvent): boolean {
  const types = e.dataTransfer?.types;
  if (!types) return false;
  return [...types].includes('Files');
}

export default function AuctionDetailPage() {
  const theme = useTheme();
  const isMdUp = useMediaQuery(theme.breakpoints.up('md'));
  const { id: rawId } = useParams<{ id: string }>();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('Admin');

  const auctionId = useMemo(() => {
    const n = Number(rawId);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [rawId]);

  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: MANIFEST_PAGE_SIZE,
  });

  const [manifestSearch, setManifestSearch] = useState('');
  const [debouncedManifestSearch, setDebouncedManifestSearch] = useState('');
  const [manifestCategoryFilter, setManifestCategoryFilter] = useState('');

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedManifestSearch(manifestSearch), 300);
    return () => window.clearTimeout(t);
  }, [manifestSearch]);

  useEffect(() => {
    setPaginationModel((pm) => ({ ...pm, page: 0 }));
  }, [debouncedManifestSearch, manifestCategoryFilter]);

  const manifestFilters = useMemo(
    () => ({
      search: debouncedManifestSearch.trim() || undefined,
      category: manifestCategoryFilter || undefined,
    }),
    [debouncedManifestSearch, manifestCategoryFilter]
  );

  const { data: detail, isLoading: detailLoading, isError: detailError } =
    useBuyingAuctionDetail(auctionId);

  const countdownTick = useLiveBuyingCountdownTick([detail?.end_time]);

  const manifestCols = useMemo(
    () => buildManifestColumns(detail?.manifest_extended_retail_total),
    [detail?.manifest_extended_retail_total]
  );

  const refreshBstockMutation = useMutation({
    mutationFn: () => postBuyingAuctionRefreshFromBstock(auctionId!),
    onSuccess: (data) => {
      queryClient.setQueryData(['buying', 'auctions', 'detail', auctionId], data);
      void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions'] });
      enqueueSnackbar('Refreshed from B-Stock.', { variant: 'success' });
    },
    onError: () => {
      enqueueSnackbar('Could not refresh from B-Stock.', { variant: 'error' });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (unarchive: boolean) => {
      if (!auctionId) throw new Error('missing auction');
      return unarchive ? deleteBuyingAuctionArchive(auctionId) : postBuyingAuctionArchive(auctionId);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['buying', 'auctions', 'detail', auctionId], data);
      void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions'] });
      void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions', 'summary'] });
      enqueueSnackbar(data.archived_at ? 'Archived.' : 'Unarchived.', { variant: 'success' });
    },
    onError: () => {
      enqueueSnackbar('Could not update archive.', { variant: 'error' });
    },
  });

  const snapshotsQuery = useBuyingAuctionSnapshots(auctionId);
  const chartAsTable = useMediaQuery(theme.breakpoints.down('sm'));

  const manifestPage = useBuyingManifestRowsPage(
    auctionId,
    paginationModel.page,
    manifestFilters,
    Boolean(isMdUp && auctionId)
  );

  const manifestInfinite = useBuyingManifestRowsInfinite(
    auctionId,
    manifestFilters,
    Boolean(!isMdUp && auctionId)
  );

  const categoryFilterOptions = useMemo(() => {
    const d = detail?.category_distribution;
    if (!d || d.total_rows === 0) return [];
    const opts: { value: string; label: string }[] = d.top.map((t) => ({
      value: t.canonical_category,
      label: t.canonical_category,
    }));
    if (d.not_yet_categorized.count > 0) {
      opts.push({ value: '__uncategorized__', label: 'Not yet categorized' });
    }
    return opts;
  }, [detail]);

  const flatManifestRows = useMemo(() => {
    if (!manifestInfinite.data?.pages?.length) return [];
    return manifestInfinite.data.pages.flatMap((p) => p.results);
  }, [manifestInfinite.data]);

  const invalidateAuctionAndManifest = () => {
    void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions', 'detail', auctionId] });
    void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions', auctionId, 'manifest_rows'] });
    void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions'] });
  };

  const debounceMappingInvalidateRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleDebouncedManifestInvalidate = useCallback(() => {
    if (debounceMappingInvalidateRef.current != null) return;
    debounceMappingInvalidateRef.current = setTimeout(() => {
      debounceMappingInvalidateRef.current = null;
      void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions', 'detail', auctionId] });
      void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions', auctionId, 'manifest_rows'] });
      void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions'] });
    }, 1000);
  }, [auctionId, queryClient]);

  const cancelMappingRef = useRef(false);
  const mappingRunningRef = useRef(false);
  const aiUnavailableRef = useRef(false);

  const [mappingPhase, setMappingPhase] = useState<ManifestMappingPhase>('idle');
  const [step1Info, setStep1Info] = useState<BuyingUploadManifestResponse | null>(null);
  const [unmappedKeyCountStart, setUnmappedKeyCountStart] = useState(0);
  const [mappingKeysRemaining, setMappingKeysRemaining] = useState<number | null>(null);
  const [mappingTotalCost, setMappingTotalCost] = useState(0);
  const [mappingLatest, setMappingLatest] = useState<string | null>(null);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);

  // Timestamp (ms) when the API-pull mutation kicked off, or null when idle.
  // Used to compute a live elapsed-seconds counter independent of React Query
  // cache state so the user sees the clock move even during quiet periods.
  const [apiPullStartedAt, setApiPullStartedAt] = useState<number | null>(null);
  const [apiPullElapsedMs, setApiPullElapsedMs] = useState(0);
  /** Distinguish CSV upload vs API pull so the API progress panel does not duplicate CSV mapping UI. */
  const [manifestSource, setManifestSource] = useState<'none' | 'upload' | 'api_pull'>(
    'none'
  );
  const [mappingFollowUpAt, setMappingFollowUpAt] = useState<number | null>(null);

  useEffect(() => {
    setMappingPhase('idle');
    setStep1Info(null);
    setUnmappedKeyCountStart(0);
    setMappingKeysRemaining(null);
    setMappingTotalCost(0);
    setMappingLatest(null);
    cancelMappingRef.current = false;
    setManifestSource('none');
    setMappingFollowUpAt(null);
  }, [auctionId]);

  const runMappingWorkers = useCallback(async () => {
    if (!auctionId || mappingRunningRef.current) return;
    mappingRunningRef.current = true;
    cancelMappingRef.current = false;
    aiUnavailableRef.current = false;

    const worker = async () => {
      while (!cancelMappingRef.current && !aiUnavailableRef.current) {
        const res = await postBuyingMapFastCatBatch(auctionId);
        setMappingKeysRemaining(res.keys_remaining ?? null);
        setMappingTotalCost((c) => c + (res.estimated_cost_usd ?? 0));
        if (res.mappings?.length) {
          const m = res.mappings[res.mappings.length - 1];
          setMappingLatest(`${m.fast_cat_key} → ${m.canonical_category}`);
        }
        scheduleDebouncedManifestInvalidate();
        if (res.error === 'ai_not_configured') {
          aiUnavailableRef.current = true;
          setMappingPhase('ai_unavailable');
          setManifestSource('none');
          setMappingFollowUpAt(null);
          break;
        }
        if (!res.has_more) break;
      }
    };

    await Promise.all([worker(), worker(), worker(), worker()]);
    await queryClient.refetchQueries({ queryKey: ['buying', 'auctions', 'detail', auctionId] });
    await queryClient.refetchQueries({ queryKey: ['buying', 'auctions', auctionId, 'manifest_rows'] });
    mappingRunningRef.current = false;

    if (aiUnavailableRef.current) return;
    if (cancelMappingRef.current) {
      setMappingPhase('cancelled');
      setManifestSource('none');
      setMappingFollowUpAt(null);
    } else {
      setMappingPhase('complete');
      window.setTimeout(() => {
        setMappingPhase('idle');
        setStep1Info(null);
        setManifestSource('none');
        setMappingFollowUpAt(null);
      }, 5000);
    }
  }, [auctionId, queryClient, scheduleDebouncedManifestInvalidate]);

  const onCancelMapping = () => {
    cancelMappingRef.current = true;
  };

  const pullManifestMutation = useMutation({
    mutationFn: () => {
      if (auctionId == null) {
        return Promise.reject(new Error('Invalid auction'));
      }
      return postBuyingPullManifest(auctionId);
    },
    onMutate: () => {
      setApiPullStartedAt(Date.now());
      setApiPullElapsedMs(0);
    },
    onSettled: () => {
      setApiPullStartedAt(null);
    },
    onSuccess: async (data) => {
      if (auctionId == null) return;
      invalidateAuctionAndManifest();
      await queryClient.refetchQueries({
        queryKey: ['buying', 'auctions', 'detail', auctionId],
      });
      await queryClient.refetchQueries({
        queryKey: ['buying', 'auctions', auctionId, 'manifest_rows'],
      });
      const savedRows = data.rows_saved ?? data.manifest_rows_saved ?? 0;
      const withFc = data.rows_with_fast_cat ?? 0;
      const tplSource = data.template_source ?? 'existing';
      const apiCalls = data.api_calls;
      const durSec = data.duration_seconds;
      const timingSuffix =
        apiCalls != null && durSec != null
          ? ` · ${apiCalls} API calls in ${Number(durSec).toFixed(1)}s`
          : '';
      enqueueSnackbar(
        `Manifest via API: ${savedRows} rows, ${withFc} with fast category (template: ${tplSource})${timingSuffix}.`,
        { variant: 'success' }
      );
      // Server already loops AI mapping; fall back to client worker loop if any keys remain
      // (e.g. AI cap hit or ai_not_configured so user can retry after setting the env var).
      if ((data.unmapped_key_count ?? 0) > 0) {
        setManifestSource('api_pull');
        setMappingFollowUpAt(Date.now());
        setStep1Info({
          rows_saved: data.rows_saved ?? savedRows,
          rows_with_fast_cat: withFc,
          template_source: tplSource === 'ai_created' ? 'ai_created' : 'existing',
          ai_mappings_created: data.ai_mappings_created ?? 0,
          unmapped_key_count: data.unmapped_key_count ?? 0,
          total_batches: data.total_batches ?? 0,
          manifest_template_id: data.manifest_template_id ?? 0,
          template_display_name: data.template_display_name ?? '',
          header_signature: data.header_signature ?? '',
          warnings: data.warnings ?? [],
        });
        setUnmappedKeyCountStart(data.unmapped_key_count ?? 0);
        setMappingKeysRemaining(data.unmapped_key_count ?? 0);
        setMappingTotalCost(0);
        setMappingLatest(null);
        setMappingPhase('mapping');
        void runMappingWorkers();
      } else {
        setManifestSource('none');
        setMappingFollowUpAt(null);
      }
    },
    onError: (err: unknown) => {
      const msg = isAxiosError(err)
        ? (typeof err.response?.data?.detail === 'string'
            ? err.response.data.detail
            : 'Could not pull manifest via API.')
        : 'Could not pull manifest via API.';
      enqueueSnackbar(msg, { variant: 'error' });
    },
  });

  const isApiPulling = pullManifestMutation.isPending;

  const pullProgressQuery = useBuyingManifestPullProgress(auctionId, isApiPulling);
  const pullProgress = pullProgressQuery.data;

  // Drive the elapsed-seconds ticker while the pull is active. A 500ms tick
  // keeps the counter feeling "live" without burning React renders; the
  // effect is cheap since the deps are just the pull-start timestamp.
  useEffect(() => {
    if (apiPullStartedAt == null) return;
    const id = window.setInterval(() => {
      setApiPullElapsedMs(Date.now() - apiPullStartedAt);
    }, 500);
    setApiPullElapsedMs(Date.now() - apiPullStartedAt);
    return () => window.clearInterval(id);
  }, [apiPullStartedAt]);

  const showApiPullProgressPanel =
    isApiPulling || (manifestSource === 'api_pull' && mappingPhase === 'mapping');
  const manifestFollowUpActive =
    manifestSource === 'api_pull' && mappingPhase === 'mapping' && !isApiPulling;

  const removeManifestMutation = useMutation({
    mutationFn: () => deleteBuyingManifest(auctionId!),
    onSuccess: async () => {
      cancelMappingRef.current = true;
      setMappingPhase('idle');
      setStep1Info(null);
      setRemoveDialogOpen(false);
      await queryClient.refetchQueries({ queryKey: ['buying', 'auctions', 'detail', auctionId] });
      await queryClient.refetchQueries({ queryKey: ['buying', 'auctions', auctionId, 'manifest_rows'] });
      enqueueSnackbar('Manifest removed.', { variant: 'success' });
    },
    onError: () => {
      enqueueSnackbar('Could not remove manifest.', { variant: 'error' });
    },
  });

  const invalidateAuctionSnapshots = () => {
    void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions', 'detail', auctionId] });
    void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions', auctionId, 'snapshots'] });
  };

  const addWatchlist = useMutation({
    mutationFn: () => postBuyingWatchlist(auctionId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions', 'detail', auctionId] });
      void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions', auctionId, 'snapshots'] });
    },
    onError: () => {
      enqueueSnackbar('Could not add to watchlist.', { variant: 'error' });
    },
  });

  const removeWatchlist = useMutation({
    mutationFn: () => deleteBuyingWatchlist(auctionId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions', 'detail', auctionId] });
      void queryClient.invalidateQueries({ queryKey: ['buying', 'auctions', auctionId, 'snapshots'] });
    },
    onError: () => {
      enqueueSnackbar('Could not remove from watchlist.', { variant: 'error' });
    },
  });

  const manifestFileInputRef = useRef<HTMLInputElement>(null);
  const fullManifestDropDepth = useRef(0);
  const replaceManifestDropDepth = useRef(0);
  const [fullManifestDropOver, setFullManifestDropOver] = useState(false);
  const [replaceManifestDropOver, setReplaceManifestDropOver] = useState(false);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => postBuyingUploadManifest(auctionId!, file),
    onSuccess: async (data) => {
      setManifestSource('upload');
      setStep1Info(data);
      if (data.unmapped_key_count > 0) {
        setUnmappedKeyCountStart(data.unmapped_key_count);
        setMappingKeysRemaining(data.unmapped_key_count);
        setMappingTotalCost(0);
        setMappingLatest(null);
      }
      invalidateAuctionAndManifest();
      await queryClient.refetchQueries({ queryKey: ['buying', 'auctions', 'detail', auctionId] });
      await queryClient.refetchQueries({
        queryKey: ['buying', 'auctions', auctionId, 'manifest_rows'],
      });
      enqueueSnackbar(
        `Saved ${data.rows_saved} row(s). ${data.rows_with_fast_cat} with fast category. Template: ${data.template_source}.`,
        { variant: 'success' }
      );
      if (data.unmapped_key_count > 0) {
        setMappingPhase('mapping');
        void runMappingWorkers();
      } else {
        setMappingPhase('complete');
        window.setTimeout(() => {
          setMappingPhase('idle');
          setStep1Info(null);
          setManifestSource('none');
        }, 4000);
      }
    },
    onError: (err: unknown) => {
      if (isAxiosError(err)) {
        const data = err.response?.data as { detail?: string } | undefined;
        const msg = typeof data?.detail === 'string' ? data.detail : 'Could not upload manifest.';
        enqueueSnackbar(msg, { variant: 'error' });
        return;
      }
      enqueueSnackbar('Could not upload manifest.', { variant: 'error' });
    },
  });

  const watchlistBusy = addWatchlist.isPending || removeWatchlist.isPending;

  const snapshotRows = snapshotsQuery.data?.results ?? [];
  const chartSeries = useMemo(() => {
    return [...snapshotRows].reverse().map((s) => ({
      t: s.captured_at,
      price: s.price != null ? Number.parseFloat(s.price) : Number.NaN,
      bids: s.bid_count,
    }));
  }, [snapshotRows]);

  const onToggleWatchlist = () => {
    if (!detail || !auctionId) return;
    if (detail.watchlist_entry) {
      removeWatchlist.mutate();
    } else {
      addWatchlist.mutate();
    }
  };

  if (auctionId == null) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography color="error">Invalid auction id.</Typography>
        <Button component={RouterLink} to="/buying/auctions" sx={{ mt: 2 }}>
          Back to auctions
        </Button>
      </Box>
    );
  }

  if (detailLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (detailError || !detail) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography color="error">Could not load this auction.</Typography>
        <Button component={RouterLink} to="/buying/auctions" sx={{ mt: 2 }}>
          Back to auctions
        </Button>
      </Box>
    );
  }

  const watched = Boolean(detail.watchlist_entry);
  const hasManifestRows = (detail.manifest_row_count ?? 0) > 0;
  const showRemoveManifest =
    hasManifestRows ||
    mappingPhase === 'mapping' ||
    mappingPhase === 'complete' ||
    mappingPhase === 'cancelled' ||
    mappingPhase === 'ai_unavailable';
  const categorizedRows =
    detail.category_distribution != null
      ? detail.category_distribution.total_rows - detail.category_distribution.not_yet_categorized.count
      : 0;
  const isMappingBatch = mappingPhase === 'mapping';

  const onPickManifestFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && auctionId) uploadMutation.mutate(f);
    e.target.value = '';
  };

  const handleFullManifestDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fullManifestDropDepth.current += 1;
    if (dragHasFiles(e)) {
      setFullManifestDropOver(true);
    }
  };

  const handleFullManifestDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fullManifestDropDepth.current -= 1;
    if (fullManifestDropDepth.current <= 0) {
      fullManifestDropDepth.current = 0;
      setFullManifestDropOver(false);
    }
  };

  const handleFullManifestDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleFullManifestDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fullManifestDropDepth.current = 0;
    setFullManifestDropOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && auctionId) uploadMutation.mutate(f);
  };

  const handleReplaceManifestDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    replaceManifestDropDepth.current += 1;
    if (dragHasFiles(e)) {
      setReplaceManifestDropOver(true);
    }
  };

  const handleReplaceManifestDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    replaceManifestDropDepth.current -= 1;
    if (replaceManifestDropDepth.current <= 0) {
      replaceManifestDropDepth.current = 0;
      setReplaceManifestDropOver(false);
    }
  };

  const handleReplaceManifestDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleReplaceManifestDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    replaceManifestDropDepth.current = 0;
    setReplaceManifestDropOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && auctionId) uploadMutation.mutate(f);
  };

  void countdownTick;

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Button
        component={RouterLink}
        to="/buying/auctions"
        startIcon={<ArrowBackIcon />}
        sx={{ mb: 2 }}
      >
        Auctions
      </Button>

      <Box sx={{ mb: 0.75 }}>
        {detail.marketplace?.name ? (
          <Typography
            variant="overline"
            sx={{
              display: 'block',
              fontWeight: 800,
              letterSpacing: 0.14,
              color: 'primary.main',
              mb: 0.5,
              lineHeight: 1.2,
            }}
          >
            {detail.marketplace.name}
          </Typography>
        ) : null}
        <Typography
          variant="h4"
          component="h1"
          fontWeight={600}
          sx={{ lineHeight: 1.25, wordBreak: 'break-word', m: 0 }}
        >
          {detail.url ? (
            <Box
              component="a"
              href={detail.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open on B-Stock: ${detail.title}`}
              sx={{
                display: 'inline',
                color: 'inherit',
                textDecoration: 'none',
                '&:hover': { color: 'primary.main' },
              }}
            >
              {detail.title}
              <OpenInNewIcon
                sx={{
                  fontSize: '0.85em',
                  ml: 0.5,
                  verticalAlign: '0.05em',
                  display: 'inline-block',
                }}
                aria-hidden
              />
            </Box>
          ) : (
            detail.title
          )}
        </Typography>
      </Box>

      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 2.5 }}>
        <Tooltip title={watched ? 'Remove from watchlist' : 'Add to watchlist'}>
          <span>
            <IconButton
              aria-label={watched ? 'Remove from watchlist' : 'Add to watchlist'}
              color={watched ? 'warning' : 'default'}
              disabled={watchlistBusy}
              onClick={onToggleWatchlist}
              size="small"
            >
              {watchlistBusy ? (
                <CircularProgress size={20} />
              ) : watched ? (
                <StarIcon fontSize="small" />
              ) : (
                <StarBorderIcon fontSize="small" />
              )}
            </IconButton>
          </span>
        </Tooltip>

        <Tooltip title="Pull latest price, bids, and timing from B-Stock (public auction state API)">
          <span>
            <Button
              variant="contained"
              color="primary"
              size="small"
              disabled={!auctionId || refreshBstockMutation.isPending}
              onClick={() => auctionId && refreshBstockMutation.mutate()}
              sx={{ textTransform: 'none', minWidth: 0, px: 1.25, py: 0.25 }}
            >
              {refreshBstockMutation.isPending ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                'Refresh'
              )}
            </Button>
          </span>
        </Tooltip>

        <Tooltip
          title={
            detail.archived_at
              ? 'Unarchive — show in default auction lists again'
              : 'Archive — hide from default lists (still in Archived filter)'
          }
        >
          <span>
            <Button
              variant="text"
              color="error"
              size="small"
              disabled={archiveMutation.isPending}
              onClick={() => archiveMutation.mutate(Boolean(detail.archived_at))}
              sx={{ textTransform: 'none', minWidth: 0, px: 1.25, py: 0.25 }}
            >
              {archiveMutation.isPending ? (
                <CircularProgress size={16} color="inherit" />
              ) : detail.archived_at ? (
                'Unarchive'
              ) : (
                'Archive'
              )}
            </Button>
          </span>
        </Tooltip>
      </Stack>

      <input
        ref={manifestFileInputRef}
        id="auction-manifest-upload-input"
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={onPickManifestFile}
      />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          gap: 1.5,
          mb: 3,
          alignItems: 'stretch',
        }}
      >
        <AuctionPrimaryCard detail={detail} isAdmin={isAdmin} />
        <AuctionSecondaryCard detail={detail} />
        <ValuationCostsCard detail={detail} isAdmin={isAdmin} />
        <AuctionDetailsInfoCard detail={detail} />
        <ValuationCategoryTableCard detail={detail} />
        <Card
          variant="outlined"
          sx={{
            p: 1.25,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            overflow: 'visible',
          }}
        >
          <Box sx={{ flexShrink: 0 }}>
            <AiManifestComparisonStrip detail={detail} />
          </Box>
          <BuyingDetailSectionTitle first sx={{ mt: 1.25 }}>
            Manifest
          </BuyingDetailSectionTitle>
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, gap: 1.5 }}>
            <ManifestUploadProgress
              phase={uploadMutation.isPending ? 'uploading' : mappingPhase}
              step1={step1Info}
              isUploadPending={uploadMutation.isPending}
              unmappedKeyCountStart={unmappedKeyCountStart}
              keysRemaining={mappingKeysRemaining}
              totalCostUsd={mappingTotalCost}
              latestMapping={mappingLatest}
              showCancel={mappingPhase === 'mapping'}
              onCancel={onCancelMapping}
            />
            {showApiPullProgressPanel ? (
              <ManifestPullProgressPanel
                live={pullProgress?.live ?? null}
                rowsDownloaded={pullProgress?.rows_downloaded ?? 0}
                elapsedMs={apiPullElapsedMs}
                pullActive={isApiPulling}
                manifestFollowUpActive={manifestFollowUpActive}
                mappingFollowUpAt={mappingFollowUpAt}
                mappingPhase={mappingPhase}
                mappingKeysRemaining={mappingKeysRemaining}
                unmappedKeyCountStart={unmappedKeyCountStart}
              />
            ) : null}
            {!hasManifestRows ? (
              isMappingBatch ? (
                <Box sx={{ flex: 1, minHeight: 0 }} />
              ) : (
                <Card
                  variant="outlined"
                  onDragEnter={handleFullManifestDragEnter}
                  onDragLeave={handleFullManifestDragLeave}
                  onDragOver={handleFullManifestDragOver}
                  onDrop={handleFullManifestDrop}
                  onClick={() => !uploadMutation.isPending && manifestFileInputRef.current?.click()}
                  sx={{
                    position: 'relative',
                    flex: 1,
                    minHeight: 0,
                    borderStyle: 'dashed',
                    borderWidth: 2,
                    borderColor: fullManifestDropOver ? 'primary.main' : 'divider',
                    bgcolor: fullManifestDropOver ? 'action.selected' : 'background.paper',
                    cursor: uploadMutation.isPending ? 'wait' : 'pointer',
                    overflow: 'hidden',
                    transition: 'border-color 0.15s ease, background-color 0.15s ease',
                  }}
                >
                  {fullManifestDropOver ? (
                    <Box
                      sx={{
                        position: 'absolute',
                        inset: 0,
                        bgcolor: 'primary.main',
                        opacity: 0.12,
                        pointerEvents: 'none',
                        zIndex: 1,
                      }}
                    />
                  ) : null}
                  <Stack
                    alignItems="center"
                    justifyContent="center"
                    spacing={2}
                    sx={{
                      position: 'relative',
                      zIndex: 2,
                      minHeight: 260,
                      height: '100%',
                      px: 2,
                      py: 3,
                      pointerEvents: uploadMutation.isPending ? 'none' : 'auto',
                    }}
                  >
                    <Typography variant="h6" align="center" color="text.secondary" sx={{ fontWeight: 600 }}>
                      Drop manifest CSV here
                    </Typography>
                    <Typography variant="body2" align="center" color="text.secondary">
                      Or click the card to browse, or use Choose file below.
                    </Typography>
                    <Stack spacing={0.75} alignItems="center">
                      <Button
                        variant="contained"
                        size="small"
                        component="label"
                        htmlFor="auction-manifest-upload-input"
                        disabled={uploadMutation.isPending}
                        onClick={(e) => e.stopPropagation()}
                      >
                        Choose file
                      </Button>
                      <Typography variant="caption" color="text.secondary">
                        Download
                      </Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="center">
                        <Button
                          variant="outlined"
                          size="small"
                          {...(detail.url
                            ? {
                                component: 'a',
                                href: detail.url,
                                target: '_blank',
                                rel: 'noopener noreferrer',
                              }
                            : {})}
                          disabled={!detail.url}
                          onClick={(e) => e.stopPropagation()}
                          startIcon={detail.url ? <OpenInNewIcon sx={{ fontSize: 16 }} /> : undefined}
                          sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                        >
                          Manual
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          disabled={
                            !isAdmin ||
                            !detail.lot_id ||
                            pullManifestMutation.isPending ||
                            uploadMutation.isPending
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            void pullManifestMutation.mutate();
                          }}
                          sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                        >
                          {pullManifestMutation.isPending ? 'API…' : 'API'}
                        </Button>
                      </Stack>
                    </Stack>
                    {uploadMutation.isPending ? (
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <CircularProgress size={22} />
                        <Typography variant="body2">Processing manifest…</Typography>
                      </Stack>
                    ) : null}
                  </Stack>
                </Card>
              )
            ) : (
              <Box
                onDragEnter={handleReplaceManifestDragEnter}
                onDragLeave={handleReplaceManifestDragLeave}
                onDragOver={handleReplaceManifestDragOver}
                onDrop={handleReplaceManifestDrop}
                sx={{
                  flex: 1,
                  minHeight: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.25,
                  cursor: replaceManifestDropOver ? 'copy' : 'default',
                  borderRadius: 1,
                  bgcolor: replaceManifestDropOver ? 'action.selected' : 'transparent',
                  transition: 'background-color 0.15s ease',
                  position: 'relative',
                }}
              >
                {replaceManifestDropOver ? (
                  <Box
                    sx={{
                      position: 'absolute',
                      inset: 0,
                      bgcolor: 'primary.main',
                      opacity: 0.06,
                      pointerEvents: 'none',
                      borderRadius: 1,
                    }}
                  />
                ) : null}

                {/* Manifest metadata */}
                <Box
                  sx={{
                    p: 1.25,
                    borderRadius: 1,
                    bgcolor: 'action.hover',
                    border: 1,
                    borderColor: 'divider',
                  }}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                    <Typography variant="body2" fontWeight={600}>
                      {formatNumber(detail.manifest_row_count ?? 0)} rows
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {formatNumber(categorizedRows)} categorized
                    </Typography>
                  </Stack>
                  {detail.manifest_template_name ? (
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                      Template: {detail.manifest_template_name}
                    </Typography>
                  ) : null}
                  {detail.manifest_extended_retail_total != null && (
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25, fontVariantNumeric: 'tabular-nums' }}>
                      Manifest retail: {formatCurrency(detail.manifest_extended_retail_total)}
                    </Typography>
                  )}
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mt: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Download:
                    </Typography>
                    <Button
                      variant="text"
                      size="small"
                      {...(detail.url
                        ? {
                            component: 'a',
                            href: detail.url,
                            target: '_blank',
                            rel: 'noopener noreferrer',
                          }
                        : {})}
                      disabled={!detail.url}
                      sx={{ textTransform: 'none', fontSize: '0.7rem', minWidth: 0 }}
                    >
                      Manual
                    </Button>
                    <Button
                      variant="text"
                      size="small"
                      disabled={
                        !isAdmin ||
                        !detail.lot_id ||
                        pullManifestMutation.isPending ||
                        uploadMutation.isPending
                      }
                      onClick={() => void pullManifestMutation.mutate()}
                      sx={{ textTransform: 'none', fontSize: '0.7rem', minWidth: 0 }}
                    >
                      {pullManifestMutation.isPending ? 'API…' : 'API'}
                    </Button>
                  </Stack>
                </Box>

                {/* Compact replace zone */}
                {!isMappingBatch ? (
                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    sx={{ px: 0.5 }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Button
                        variant="text"
                        size="small"
                        component="label"
                        htmlFor="auction-manifest-upload-input"
                        onClick={(e) => e.stopPropagation()}
                        disabled={uploadMutation.isPending}
                        sx={{ textTransform: 'none', fontSize: '0.75rem', minWidth: 0 }}
                      >
                        {uploadMutation.isPending ? 'Processing…' : 'Replace manifest'}
                      </Button>
                      {uploadMutation.isPending && <CircularProgress size={16} />}
                    </Stack>
                    {showRemoveManifest ? (
                      <Button
                        size="small"
                        variant="text"
                        color="error"
                        onClick={() => setRemoveDialogOpen(true)}
                        sx={{ textTransform: 'none', fontSize: '0.75rem', minWidth: 0, flexShrink: 0 }}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </Stack>
                ) : null}
              </Box>
            )}
          </Box>
        </Card>
      </Box>

      <Divider sx={{ mb: 2 }} />

      <Box sx={{ mb: 3, minWidth: 0 }}>
        <Typography variant="subtitle1" component="h2" fontWeight={600} sx={{ mb: 1.5 }}>
          Manifest Rows
        </Typography>
        {detail.category_distribution && detail.category_distribution.total_rows > 0 ? (
          <CategoryDistributionBar dist={detail.category_distribution} />
        ) : null}
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          sx={{ mt: detail.category_distribution?.total_rows ? 1.5 : 0 }}
          alignItems={{ sm: 'flex-start' }}
        >
          <TextField
            size="small"
            fullWidth
            label="Search rows"
            placeholder="Title, brand, SKU, UPC, category…"
            value={manifestSearch}
            onChange={(e) => setManifestSearch(e.target.value)}
          />
          <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 220 } }}>
            <InputLabel id="manifest-cat-filter">Fast category</InputLabel>
            <Select
              labelId="manifest-cat-filter"
              label="Fast category"
              value={manifestCategoryFilter}
              onChange={(e) => setManifestCategoryFilter(e.target.value)}
            >
              <MenuItem value="">All categories</MenuItem>
              {categoryFilterOptions.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </Box>

      {isMdUp ? (
        <Box sx={{ flex: 1, minHeight: 400 }}>
          <DataGrid
            rows={manifestPage.data?.results ?? []}
            columns={manifestCols}
            rowCount={manifestPage.data?.count ?? 0}
            loading={manifestPage.isLoading || manifestPage.isFetching}
            pageSizeOptions={[MANIFEST_PAGE_SIZE]}
            paginationMode="server"
            paginationModel={paginationModel}
            onPaginationModelChange={setPaginationModel}
            getRowId={(row) => row.id}
            disableRowSelectionOnClick
            density="compact"
            autoHeight
            sx={{
              border: 'none',
              '& .MuiDataGrid-footerContainer': { borderTop: '1px solid', borderColor: 'divider' },
            }}
          />
        </Box>
      ) : (
        <Stack spacing={2}>
          {manifestInfinite.isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            flatManifestRows.map((row) => (
              <Card key={row.id} variant="outlined">
                <CardContent sx={{ '&:last-child': { pb: 2 } }}>
                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                    #{row.row_number} · {row.title || '—'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {row.brand || '—'}
                    {row.model ? ` · ${row.model}` : ''}
                  </Typography>
                  <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 1 }}>
                    {row.canonical_category || row.fast_cat_value ? (
                      <Chip
                        size="small"
                        label={row.canonical_category ?? row.fast_cat_value ?? ''}
                        color={categoryConfidenceChipProps(row.category_confidence).color}
                        variant={categoryConfidenceChipProps(row.category_confidence).variant}
                      />
                    ) : null}
                    <Chip size="small" label={`Qty ${formatNumber(row.quantity)}`} variant="outlined" />
                    <Chip size="small" label={`Retail ${formatCurrency(row.retail_value)}`} variant="outlined" />
                    {row.condition ? (
                      <Chip size="small" label={row.condition} variant="outlined" />
                    ) : null}
                  </Stack>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                    UPC {row.upc || '—'} · SKU {row.sku || '—'}
                  </Typography>
                </CardContent>
              </Card>
            ))
          )}
          {!manifestInfinite.isLoading && flatManifestRows.length === 0 ? (
            <Typography color="text.secondary">No manifest rows yet. Upload a CSV above.</Typography>
          ) : null}
          {manifestInfinite.hasNextPage ? (
            <Button
              variant="outlined"
              fullWidth
              disabled={manifestInfinite.isFetchingNextPage}
              onClick={() => void manifestInfinite.fetchNextPage()}
            >
              {manifestInfinite.isFetchingNextPage ? <CircularProgress size={22} /> : 'Load more'}
            </Button>
          ) : null}
        </Stack>
      )}

      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2} sx={{ mt: 4, mb: 2 }}>
        <Typography variant="h6" component="h2">
          Price history
        </Typography>
        {detail.watchlist_entry ? (
          <Typography variant="body2" color="text.secondary">
            {detail.watchlist_entry.last_polled_at
              ? `Last polled ${formatDistanceToNow(parseISO(detail.watchlist_entry.last_polled_at), { addSuffix: true })}`
              : 'Not polled yet'}
          </Typography>
        ) : null}
      </Stack>

      {snapshotsQuery.isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : snapshotRows.length === 0 ? (
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          No price history yet. Snapshots are recorded when watchlist polling runs.
        </Typography>
      ) : chartAsTable ? (
        <Stack spacing={1} sx={{ mb: 3 }}>
          {snapshotRows.map((s) => (
            <Paper key={s.id} variant="outlined" sx={{ p: 1.5 }}>
              <Typography variant="body2">
                {format(parseISO(s.captured_at), 'MMM d, h:mm a')} · {formatCurrency(s.price)} ·{' '}
                {formatNumber(s.bid_count)} bids
              </Typography>
            </Paper>
          ))}
        </Stack>
      ) : (
        <Box sx={{ width: '100%', height: 320, mb: 3 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartSeries} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="t"
                tickFormatter={(v) => {
                  try {
                    return format(parseISO(String(v)), 'M/d h:mm');
                  } catch {
                    return '';
                  }
                }}
                minTickGap={24}
              />
              <YAxis yAxisId="left" domain={['auto', 'auto']} tickFormatter={(v) => `$${v}`} />
              <YAxis yAxisId="right" orientation="right" domain={['auto', 'auto']} allowDecimals={false} />
              <RechartsTooltip
                labelFormatter={(v) => {
                  try {
                    return format(parseISO(String(v)), 'MMM d, yyyy h:mm a');
                  } catch {
                    return String(v);
                  }
                }}
              />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="price"
                name="price"
                stroke={theme.palette.primary.main}
                dot={false}
                strokeWidth={2}
                connectNulls
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="bids"
                name="bids"
                stroke={theme.palette.secondary.main}
                dot={false}
                strokeWidth={1}
              />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      )}

      <Dialog open={removeDialogOpen} onClose={() => setRemoveDialogOpen(false)}>
        <DialogTitle>Remove manifest?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This will delete all {formatNumber(detail.manifest_row_count ?? 0)} manifest rows. Category mappings
            created by AI will be kept for future use.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoveDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={() => removeManifestMutation.mutate()}
            disabled={removeManifestMutation.isPending}
            color="primary"
          >
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

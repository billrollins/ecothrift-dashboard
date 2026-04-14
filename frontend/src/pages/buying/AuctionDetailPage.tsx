import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
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
  Grid,
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
import AuctionValuationCard from '../../components/buying/AuctionValuationCard';
import CategoryDistributionBar from '../../components/buying/CategoryDistributionBar';
import { useAuth } from '../../contexts/AuthContext';
import {
  ManifestUploadProgress,
  type ManifestMappingPhase,
} from '../../components/buying/ManifestUploadProgress';
import {
  deleteBuyingManifest,
  deleteBuyingWatchlist,
  postBuyingAuctionRecomputeValuation,
  postBuyingMapFastCatBatch,
  postBuyingUploadManifest,
  postBuyingWatchlist,
} from '../../api/buying.api';
import { useBuyingAuctionDetail } from '../../hooks/useBuyingAuctionDetail';
import { useBuyingAuctionSnapshots } from '../../hooks/useBuyingAuctionSnapshots';
import {
  useBuyingManifestRowsInfinite,
  useBuyingManifestRowsPage,
} from '../../hooks/useBuyingManifestRows';
import type { BuyingManifestRow, BuyingUploadManifestResponse } from '../../types/buying.types';
import { formatCurrency, formatCurrencyWhole, formatNumber } from '../../utils/format';
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
import { formatTimeRemaining, timeRemainingSx } from '../../utils/buyingAuctionList';

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

function formatEndTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'MMM d, yyyy h:mm a');
  } catch {
    return iso;
  }
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

  const manifestCols = useMemo(
    () => buildManifestColumns(detail?.manifest_extended_retail_total),
    [detail?.manifest_extended_retail_total]
  );

  const recomputeMutation = useMutation({
    mutationFn: () => postBuyingAuctionRecomputeValuation(auctionId!),
    onSuccess: (data) => {
      queryClient.setQueryData(['buying', 'auctions', 'detail', auctionId], data);
      enqueueSnackbar('Auction updated (local recompute).', { variant: 'success' });
    },
    onError: () => {
      enqueueSnackbar('Could not update auction.', { variant: 'error' });
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

  useEffect(() => {
    setMappingPhase('idle');
    setStep1Info(null);
    setUnmappedKeyCountStart(0);
    setMappingKeysRemaining(null);
    setMappingTotalCost(0);
    setMappingLatest(null);
    cancelMappingRef.current = false;
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
    } else {
      setMappingPhase('complete');
      window.setTimeout(() => {
        setMappingPhase('idle');
        setStep1Info(null);
      }, 5000);
    }
  }, [auctionId, queryClient, scheduleDebouncedManifestInvalidate]);

  const onCancelMapping = () => {
    cancelMappingRef.current = true;
  };

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

      <Typography
        variant="h4"
        component="h1"
        fontWeight={600}
        sx={{ lineHeight: 1.25, wordBreak: 'break-word', mb: 0.75 }}
      >
        {detail.title}
      </Typography>

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

        <Tooltip title="Recompute priority, need, and valuation from current data (no B-Stock token)">
          <span>
            <Button
              variant="outlined"
              size="small"
              disabled={recomputeMutation.isPending || !auctionId}
              onClick={() => auctionId && recomputeMutation.mutate()}
              sx={{ textTransform: 'none', minWidth: 0, px: 1.25, py: 0.25 }}
            >
              {recomputeMutation.isPending ? <CircularProgress size={16} color="inherit" /> : 'Update'}
            </Button>
          </span>
        </Tooltip>

        {detail.url ? (
          <Tooltip title="View on B-Stock">
            <IconButton
              component="a"
              href={detail.url}
              target="_blank"
              rel="noopener noreferrer"
              size="small"
              aria-label="View on B-Stock"
              sx={{ color: 'text.secondary' }}
            >
              <OpenInNewIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : null}
      </Stack>

      <input
        ref={manifestFileInputRef}
        id="auction-manifest-upload-input"
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={onPickManifestFile}
      />

      <Grid container spacing={1.5} sx={{ mb: 3, alignItems: 'stretch' }}>
        <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Typography
            variant="subtitle2"
            color="text.secondary"
            sx={{ display: 'block', fontWeight: 700, letterSpacing: 0.04, mb: 0.75, textTransform: 'none' }}
          >
            Auction Details
          </Typography>
          <Card variant="outlined" sx={{ p: 1.25, flex: 1, minHeight: 0, overflow: 'auto' }}>
            {detail.marketplace?.name ? (
              <Box sx={{ mb: 1.25 }}>
                <Chip size="small" label={detail.marketplace.name} color="primary" variant="outlined" />
                <Divider sx={{ mt: 1.25 }} />
              </Box>
            ) : null}
            <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2, mb: 0.5 }}>
              Pricing
            </Typography>
            <Grid container spacing={0.75} columns={12} sx={{ mb: 1.25 }}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.7rem', lineHeight: 1.2 }}>
                  Current price
                </Typography>
                <Typography variant="body2" fontWeight={600} sx={{ mt: 0.2 }}>
                  {formatCurrency(detail.current_price)}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.7rem', lineHeight: 1.2 }}>
                  Starting price
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.2 }}>{formatCurrency(detail.starting_price)}</Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.7rem', lineHeight: 1.2 }}>
                  Buy now price
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.2 }}>{formatCurrency(detail.buy_now_price)}</Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.7rem', lineHeight: 1.2 }}>
                  Total retail (listing)
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.2 }}>{formatCurrencyWhole(detail.total_retail_value)}</Typography>
              </Grid>
            </Grid>

            <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2, mb: 0.5 }}>
              Timing
            </Typography>
            <Grid container spacing={0.75} columns={12} sx={{ mb: 1.25 }}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.7rem', lineHeight: 1.2 }}>
                  End time
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.2 }}>{formatEndTime(detail.end_time)}</Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.7rem', lineHeight: 1.2 }}>
                  Time remaining
                </Typography>
                <Typography variant="body2" sx={[{ mt: 0.2 }, timeRemainingSx(detail.end_time)]}>
                  {formatTimeRemaining(detail.end_time)}
                </Typography>
              </Grid>
            </Grid>

            <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2, mb: 0.5 }}>
              Auction
            </Typography>
            <Grid container spacing={0.75} columns={12}>
              <Grid size={{ xs: 6, sm: 4 }}>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.7rem', lineHeight: 1.2 }}>
                  Status
                </Typography>
                <Chip size="small" label={detail.status} sx={{ mt: 0.35 }} variant="outlined" />
              </Grid>
              <Grid size={{ xs: 6, sm: 4 }}>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.7rem', lineHeight: 1.2 }}>
                  Condition
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.2 }}>{detail.condition_summary || '—'}</Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 4 }}>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.7rem', lineHeight: 1.2 }}>
                  Bid count
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.2 }}>{formatNumber(detail.bid_count)}</Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 4 }}>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.7rem', lineHeight: 1.2 }}>
                  Lot size
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.2 }}>{formatNumber(detail.lot_size)}</Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 4 }}>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.7rem', lineHeight: 1.2 }}>
                  Listing type
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.2 }}>{detail.listing_type || '—'}</Typography>
              </Grid>
            </Grid>

            {detail.description ? (
              <Box sx={{ mt: 1.25 }}>
                <Typography variant="caption" color="text.secondary" display="block">
                  Description
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 0.25 }}>
                  {detail.description}
                </Typography>
              </Box>
            ) : null}
          </Card>
          {detail ? <AiManifestComparisonStrip detail={detail} /> : null}
          {detail ? <AuctionValuationCard detail={detail} isAdmin={isAdmin} /> : null}
        </Grid>

        <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Typography
            variant="subtitle2"
            color="text.secondary"
            sx={{ display: 'block', fontWeight: 700, letterSpacing: 0.04, mb: 0.75, textTransform: 'none' }}
          >
            Manifest
          </Typography>
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
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="center">
                      <Button
                        variant="outlined"
                        component="label"
                        htmlFor="auction-manifest-upload-input"
                        disabled={uploadMutation.isPending}
                        onClick={(e) => e.stopPropagation()}
                      >
                        Choose file
                      </Button>
                      {detail.url ? (
                        <Button
                          variant="text"
                          color="primary"
                          component="a"
                          href={detail.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          startIcon={<OpenInNewIcon fontSize="small" />}
                          onClick={(e) => e.stopPropagation()}
                        >
                          Download from B-Stock
                        </Button>
                      ) : null}
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
              <Card
                variant="outlined"
                sx={{
                  flex: 1,
                  minHeight: 0,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <Box
                  sx={{
                    p: 1.25,
                    pb: 1,
                    flexShrink: 0,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 1,
                  }}
                >
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0, flex: 1, minWidth: 0 }}>
                    {formatNumber(detail.manifest_row_count ?? 0)} rows · {formatNumber(categorizedRows)} categorized
                    {detail.manifest_template_name ? ` · ${detail.manifest_template_name}` : ''}
                  </Typography>
                  {showRemoveManifest ? (
                    <Button size="small" variant="text" color="inherit" onClick={() => setRemoveDialogOpen(true)} sx={{ flexShrink: 0 }}>
                      Remove manifest
                    </Button>
                  ) : null}
                </Box>

                {!isMappingBatch ? (
                  <Box
                    onDragEnter={handleReplaceManifestDragEnter}
                    onDragLeave={handleReplaceManifestDragLeave}
                    onDragOver={handleReplaceManifestDragOver}
                    onDrop={handleReplaceManifestDrop}
                    onClick={() => !uploadMutation.isPending && manifestFileInputRef.current?.click()}
                    sx={{
                      position: 'relative',
                      mt: 'auto',
                      minHeight: 120,
                      flex: '1 1 auto',
                      borderTop: '2px dashed',
                      borderTopColor: replaceManifestDropOver ? 'primary.main' : 'divider',
                      px: 2,
                      py: 2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: uploadMutation.isPending ? 'wait' : 'pointer',
                      bgcolor: replaceManifestDropOver ? 'action.selected' : 'action.hover',
                      transition: 'background-color 0.15s ease, border-color 0.15s ease',
                      overflow: 'hidden',
                    }}
                  >
                    {replaceManifestDropOver ? (
                      <Box
                        sx={{
                          position: 'absolute',
                          inset: 0,
                          bgcolor: 'primary.main',
                          opacity: 0.1,
                          pointerEvents: 'none',
                        }}
                      />
                    ) : null}
                    <Stack alignItems="center" spacing={1} sx={{ position: 'relative', zIndex: 1 }}>
                      {uploadMutation.isPending ? (
                        <>
                          <CircularProgress size={22} />
                          <Typography variant="body2">Processing manifest…</Typography>
                        </>
                      ) : (
                        <>
                          <Typography variant="body2" color="text.secondary" align="center" fontWeight={500}>
                            Replace manifest — drop CSV here or click
                          </Typography>
                          <Button
                            variant="outlined"
                            size="small"
                            component="label"
                            htmlFor="auction-manifest-upload-input"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Choose file
                          </Button>
                        </>
                      )}
                    </Stack>
                  </Box>
                ) : null}
              </Card>
            )}
          </Box>
        </Grid>
      </Grid>

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

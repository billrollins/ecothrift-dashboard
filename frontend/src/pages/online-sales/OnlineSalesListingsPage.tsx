import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import Search from '@mui/icons-material/Search';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import {
  useCreateWebListing,
  useDeleteWebListing,
  useRemoveWorkQueueItem,
  useWebListings,
  useWorkQueue,
} from '../../hooks/useWebStore';
import type { WebListing } from '../../api/webstore.api';
import { formatCurrency } from '../../utils/format';
import {
  FacebookPostedCell,
  GRID_FILL_SX,
  PAGE_FILL_SX,
  GRID_PAGE_PROPS,
  GRID_SX,
  GRID_SX_STATIC,
  humanize,
  ListingStatusChip,
  noRowsSlot,
  WhenCell,
} from './presentation';
import { useOnlineSalesMobile } from './useOnlineSalesMobile';

const LISTING_STATUSES = ['draft', 'ready', 'published', 'paused', 'sold', 'archived'];

type WorkQueueItem = {
  id: number;
  sku: string;
  title: string;
  status: string;
  location: string;
  price: string | null;
  existing_listing_id: number | null;
};

type ListingsTab = 'catalog' | 'tolist';
type FbFilter = '' | '1' | '0';

function ListingThumb({ listing }: { listing: WebListing }) {
  const url = listing.images?.[0]?.url;
  return (
    <Box
      sx={{
        width: 44,
        height: 44,
        borderRadius: 1,
        overflow: 'hidden',
        bgcolor: 'action.hover',
        border: '1px solid',
        borderColor: 'divider',
        flexShrink: 0,
      }}
    >
      {url ? (
        <Box
          component="img"
          src={url}
          alt=""
          sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : null}
    </Box>
  );
}

function CatalogPanel() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [fbPosted, setFbPosted] = useState<FbFilter>('');
  const createListing = useCreateWebListing();

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, isError } = useWebListings({
    search: search || undefined,
    status: status || undefined,
    fb_posted: fbPosted || undefined,
    ordering: '-updated_at',
  });

  const columns = useMemo<GridColDef<WebListing>[]>(
    () => [
      {
        field: 'thumb',
        headerName: '',
        width: 64,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        renderCell: ({ row }) => (
          <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <ListingThumb listing={row} />
          </Box>
        ),
      },
      {
        field: 'title',
        headerName: 'Listing',
        flex: 1.6,
        minWidth: 220,
        renderCell: ({ row }) => (
          <Stack spacing={0.15} sx={{ minWidth: 0, py: 0.5 }}>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                {row.title}
              </Typography>
              {row.featured ? (
                <Chip
                  size="small"
                  label="Featured"
                  color="primary"
                  variant="outlined"
                  sx={{ height: 20, '& .MuiChip-label': { px: 0.6, fontSize: '0.7rem', fontWeight: 700 } }}
                />
              ) : null}
            </Stack>
            <Typography variant="caption" color="text.secondary" noWrap>
              {[row.sku, row.category_name].filter(Boolean).join(' · ') || 'No SKU'}
            </Typography>
          </Stack>
        ),
      },
      {
        field: 'status',
        headerName: 'Status',
        width: 120,
        renderCell: ({ row }) => (
          <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <ListingStatusChip status={row.status} />
          </Box>
        ),
      },
      {
        field: 'price',
        headerName: 'Price',
        width: 96,
        align: 'right',
        headerAlign: 'right',
        valueFormatter: (value) => formatCurrency(value == null ? null : String(value)),
      },
      {
        field: 'available',
        headerName: 'Qty',
        width: 72,
        align: 'right',
        headerAlign: 'right',
        valueGetter: (_v, row) => row.available,
        renderCell: ({ row }) => (
          <Typography
            variant="body2"
            sx={{
              fontWeight: 700,
              color: row.available <= 0 ? 'text.disabled' : 'text.primary',
            }}
          >
            {row.available}
          </Typography>
        ),
      },
      {
        field: 'fb_posted_at',
        headerName: 'Facebook',
        width: 148,
        renderCell: ({ row }) => (
          <FacebookPostedCell postedAt={row.fb_posted_at} postedUrl={row.fb_posted_url} />
        ),
      },
      {
        field: 'updated_at',
        headerName: 'Updated',
        width: 128,
        renderCell: ({ value }) => <WhenCell value={value as string} tone="happened" />,
      },
    ],
    [],
  );

  const onCreate = async () => {
    try {
      const listing = await createListing.mutateAsync({
        title: 'New listing',
        status: 'draft',
        on_hand: 1,
        price: '0.00',
        return_policy: 'final_sale',
      });
      navigate(`/online-sales/listings/${listing.id}`);
    } catch {
      enqueueSnackbar('Could not create listing', { variant: 'error' });
    }
  };

  if (isLoading && !data) return <LoadingScreen />;
  if (isError) return <Alert severity="error">Could not load listings.</Alert>;

  return (
    <Box sx={PAGE_FILL_SX}>
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ mb: 2, flexShrink: 0 }}
        flexWrap="wrap"
        useFlexGap
        alignItems="center"
      >
        <TextField
          size="small"
          placeholder="Search title or SKU"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ minWidth: 220, flex: '1 1 220px' }}
        />
        <TextField
          select
          size="small"
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="">All statuses</MenuItem>
          {LISTING_STATUSES.map((s) => (
            <MenuItem key={s} value={s}>
              {humanize(s)}
            </MenuItem>
          ))}
        </TextField>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={fbPosted}
          onChange={(_e, next: FbFilter | null) => next !== null && setFbPosted(next)}
        >
          <ToggleButton value="" sx={{ textTransform: 'none', px: 1.5 }}>
            All FB
          </ToggleButton>
          <ToggleButton value="1" sx={{ textTransform: 'none', px: 1.5 }}>
            Posted
          </ToggleButton>
          <ToggleButton value="0" sx={{ textTransform: 'none', px: 1.5 }}>
            Not posted
          </ToggleButton>
        </ToggleButtonGroup>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={onCreate}
          sx={{ ml: { sm: 'auto' } }}
        >
          New listing
        </Button>
      </Stack>
      <Box sx={GRID_FILL_SX}>
        <DataGrid
          rows={data?.results || []}
          columns={columns}
          getRowId={(r) => r.id}
          disableRowSelectionOnClick
          onRowClick={(params) => navigate(`/online-sales/listings/${params.row.id}`)}
          slots={noRowsSlot(
            search || status || fbPosted
              ? 'No listings match this filter'
              : 'No listings yet',
            search || status || fbPosted
              ? undefined
              : 'Start one from New listing or the To list tab.',
          )}
          sx={GRID_SX}
          {...GRID_PAGE_PROPS}
          rowHeight={64}
        />
      </Box>
    </Box>
  );
}

function ToListPanel() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { data, isLoading, isError } = useWorkQueue();
  const createListing = useCreateWebListing();
  const removeItem = useRemoveWorkQueueItem();
  const deleteListing = useDeleteWebListing();

  const [removeTarget, setRemoveTarget] = useState<WorkQueueItem | null>(null);
  const [deleteDraft, setDeleteDraft] = useState<WebListing | null>(null);

  if (isLoading) return <LoadingScreen />;
  if (isError || !data) {
    return <Alert severity="error">Could not load items to list.</Alert>;
  }

  const startFromItem = async (item: WorkQueueItem) => {
    if (item.existing_listing_id) {
      navigate(`/online-sales/listings/${item.existing_listing_id}`);
      return;
    }
    try {
      const listing = await createListing.mutateAsync({
        title: item.title || `Item ${item.sku}`,
        sku: item.sku,
        item: item.id,
        price: item.price || '0.00',
        on_hand: 1,
        status: 'draft',
        return_policy: 'final_sale',
      });
      navigate(`/online-sales/listings/${listing.id}`);
    } catch {
      enqueueSnackbar('Could not start listing', { variant: 'error' });
    }
  };

  const confirmRemoveItem = async () => {
    if (!removeTarget) return;
    try {
      await removeItem.mutateAsync(removeTarget.id);
      enqueueSnackbar(`${removeTarget.sku} removed from Online Sales`, { variant: 'success' });
      setRemoveTarget(null);
    } catch {
      enqueueSnackbar('Could not remove item', { variant: 'error' });
    }
  };

  const confirmDeleteDraft = async () => {
    if (!deleteDraft) return;
    try {
      await deleteListing.mutateAsync(deleteDraft.id);
      enqueueSnackbar('Draft removed', { variant: 'success' });
      setDeleteDraft(null);
    } catch {
      enqueueSnackbar('Could not remove draft', { variant: 'error' });
    }
  };

  const itemCols: GridColDef<WorkQueueItem>[] = [
    { field: 'sku', headerName: 'SKU', width: 120 },
    { field: 'title', headerName: 'Title', flex: 1, minWidth: 180 },
    {
      field: 'status',
      headerName: 'Status',
      width: 130,
      valueFormatter: (v) => humanize(String(v || '')),
    },
    {
      field: 'price',
      headerName: 'Price',
      width: 100,
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (v) => formatCurrency(v == null ? null : String(v)),
    },
    {
      field: 'actions',
      headerName: '',
      width: 260,
      sortable: false,
      align: 'right',
      headerAlign: 'right',
      renderCell: ({ row }) => (
        <Stack
          direction="row"
          spacing={0.75}
          justifyContent="flex-end"
          sx={{ width: '100%' }}
          onClick={(e) => e.stopPropagation()}
        >
          {row.existing_listing_id ? (
            <Button
              size="small"
              variant="outlined"
              onClick={() => navigate(`/online-sales/listings/${row.existing_listing_id}`)}
            >
              Open listing
            </Button>
          ) : (
            <Button size="small" variant="contained" onClick={() => startFromItem(row)}>
              Start listing
            </Button>
          )}
          <Button
            size="small"
            color="inherit"
            onClick={() => setRemoveTarget(row)}
          >
            Remove
          </Button>
        </Stack>
      ),
    },
  ];

  const draftCols: GridColDef<WebListing>[] = [
    { field: 'title', headerName: 'Draft', flex: 1, minWidth: 180 },
    { field: 'sku', headerName: 'SKU', width: 120 },
    {
      field: 'status',
      headerName: 'Status',
      width: 130,
      renderCell: ({ row }) => <ListingStatusChip status={String(row.status || '')} />,
    },
    {
      field: 'open',
      headerName: '',
      width: 200,
      sortable: false,
      align: 'right',
      headerAlign: 'right',
      renderCell: ({ row }) => (
        <Stack
          direction="row"
          spacing={0.75}
          justifyContent="flex-end"
          sx={{ width: '100%' }}
          onClick={(e) => e.stopPropagation()}
        >
          <Button size="small" onClick={() => navigate(`/online-sales/listings/${row.id}`)}>
            Open
          </Button>
          <Button size="small" color="inherit" onClick={() => setDeleteDraft(row)}>
            Remove
          </Button>
        </Stack>
      ),
    },
  ];

  return (
    <Stack spacing={2.5}>
      <Section
        title="Waiting at Online Sales"
        caption="Inventory at the online_sales location. Remove sends it back to the floor."
        count={data.items.length}
      >
        <Box sx={{ height: 320 }}>
          <DataGrid
            rows={data.items}
            columns={itemCols}
            getRowId={(r) => r.id}
            disableRowSelectionOnClick
            density="compact"
            slots={noRowsSlot('Nothing waiting to be listed')}
            sx={GRID_SX_STATIC}
          />
        </Box>
      </Section>
      <Section
        title="Drafts in progress"
        caption="Listings started but not published yet."
        count={data.draft_listings.length}
      >
        <Box sx={{ height: 280 }}>
          <DataGrid
            rows={data.draft_listings}
            columns={draftCols}
            getRowId={(r) => r.id}
            disableRowSelectionOnClick
            density="compact"
            slots={noRowsSlot('No drafts in progress')}
            sx={GRID_SX_STATIC}
          />
        </Box>
      </Section>

      <ConfirmDialog
        open={removeTarget != null}
        title="Remove from Online Sales?"
        message={
          removeTarget
            ? `Remove ${removeTarget.sku}${removeTarget.title ? ` (${removeTarget.title})` : ''} from the to-list? It goes back on the floor (on shelf).`
            : ''
        }
        confirmLabel="Remove"
        severity="warning"
        loading={removeItem.isPending}
        onConfirm={() => void confirmRemoveItem()}
        onCancel={() => setRemoveTarget(null)}
      />
      <ConfirmDialog
        open={deleteDraft != null}
        title="Remove draft listing?"
        message={
          deleteDraft
            ? `Delete draft “${deleteDraft.title}”? This cannot be undone.`
            : ''
        }
        confirmLabel="Remove"
        severity="error"
        loading={deleteListing.isPending}
        onConfirm={() => void confirmDeleteDraft()}
        onCancel={() => setDeleteDraft(null)}
      />
    </Stack>
  );
}

function Section({
  title,
  caption,
  count,
  children,
}: {
  title: string;
  caption: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <Stack direction="row" spacing={1} alignItems="baseline" sx={{ mb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        <Chip size="small" label={count} variant="outlined" />
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        {caption}
      </Typography>
      {children}
    </Paper>
  );
}

export default function OnlineSalesListingsPage() {
  // Tab lives in the URL like the Holds page, so a refresh, a bookmark, or the
  // back button all land where you were.
  const isMobile = useOnlineSalesMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: ListingsTab = searchParams.get('tab') === 'tolist' ? 'tolist' : 'catalog';

  const setTab = (next: ListingsTab) => {
    const nextParams = new URLSearchParams(searchParams);
    if (next === 'catalog') nextParams.delete('tab');
    else nextParams.set('tab', next);
    setSearchParams(nextParams, { replace: true });
  };

  return (
    <Box sx={PAGE_FILL_SX}>
      <PageHeader
        title="Listings"
        dense={isMobile}
        subtitle={
          isMobile
            ? 'Catalog and to-list queue.'
            : 'Catalog and work queue. Click a row to open Listing Studio - photos, price, Facebook, publish.'
        }
      />
      <Tabs
        value={tab}
        onChange={(_, v: ListingsTab) => setTab(v)}
        variant={isMobile ? 'scrollable' : 'standard'}
        scrollButtons={isMobile ? 'auto' : false}
        allowScrollButtonsMobile
        sx={{ mb: 2, flexShrink: 0, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab value="catalog" label="Catalog" sx={{ textTransform: 'none', fontWeight: 600 }} />
        <Tab value="tolist" label="To list" sx={{ textTransform: 'none', fontWeight: 600 }} />
      </Tabs>
      {tab === 'catalog' && <CatalogPanel />}
      {tab === 'tolist' && <ToListPanel />}
    </Box>
  );
}

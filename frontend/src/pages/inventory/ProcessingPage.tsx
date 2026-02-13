import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  InputAdornment,
  MenuItem,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import Search from '@mui/icons-material/Search';
import UploadFile from '@mui/icons-material/UploadFile';
import CheckCircle from '@mui/icons-material/CheckCircle';
import { DataGrid, type GridColDef, type GridRenderCellParams } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import {
  usePurchaseOrders,
  useUploadManifest,
  useProcessManifest,
  useItems,
  useUpdateItem,
  useMarkItemReady,
} from '../../hooks/useInventory';
import type { Item } from '../../types/inventory.types';

function formatCurrency(value: string | null): string {
  if (value == null) return '—';
  const n = parseFloat(value);
  return isNaN(n) ? '—' : `$${n.toFixed(2)}`;
}

export default function ProcessingPage() {
  const [searchParams] = useSearchParams();
  const orderParam = searchParams.get('order');
  const { enqueueSnackbar } = useSnackbar();
  const [tab, setTab] = useState(0);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(
    orderParam ? parseInt(orderParam, 10) : null
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [search, setSearch] = useState('');

  const { data: ordersData } = usePurchaseOrders({
    status__in: ['delivered', 'processing'],
  });
  const { data: itemsData, isLoading } = useItems({
    status__in: ['intake', 'processing'],
    ...(search && { search }),
  });
  const uploadManifest = useUploadManifest();
  const processManifest = useProcessManifest();
  const updateItem = useUpdateItem();
  const markItemReady = useMarkItemReady();

  const orders = ordersData?.results ?? [];
  const items = itemsData?.results ?? [];

  const handleUploadAndProcess = async () => {
    if (!selectedOrderId || !selectedFile) return;
    try {
      await uploadManifest.mutateAsync({ orderId: selectedOrderId, file: selectedFile });
      await processManifest.mutateAsync({
        orderId: selectedOrderId,
        data: {},
      });
      enqueueSnackbar('Manifest processed', { variant: 'success' });
      setSelectedFile(null);
    } catch {
      enqueueSnackbar('Failed to process manifest', { variant: 'error' });
    }
  };

  const handleMarkReady = async (itemId: number) => {
    try {
      await markItemReady.mutateAsync(itemId);
      enqueueSnackbar('Item marked ready', { variant: 'success' });
    } catch {
      enqueueSnackbar('Failed to mark item ready', { variant: 'error' });
    }
  };

  const itemColumns: GridColDef[] = [
    { field: 'sku', headerName: 'SKU', width: 140 },
    {
      field: 'title',
      headerName: 'Title',
      flex: 1,
      minWidth: 180,
      renderCell: (params: GridRenderCellParams<Item>) => (
        <EditableCell
          value={params.row.title}
          field="title"
          onSave={(val) =>
            updateItem.mutate({ id: params.row.id, data: { title: val } })
          }
          disabled={updateItem.isPending}
        />
      ),
    },
    {
      field: 'brand',
      headerName: 'Brand',
      width: 120,
      renderCell: (params: GridRenderCellParams<Item>) => (
        <EditableCell
          value={params.row.brand}
          field="brand"
          onSave={(val) =>
            updateItem.mutate({ id: params.row.id, data: { brand: val } })
          }
          disabled={updateItem.isPending}
        />
      ),
    },
    {
      field: 'category',
      headerName: 'Category',
      width: 120,
      renderCell: (params: GridRenderCellParams<Item>) => (
        <EditableCell
          value={params.row.category}
          field="category"
          onSave={(val) =>
            updateItem.mutate({ id: params.row.id, data: { category: val } })
          }
          disabled={updateItem.isPending}
        />
      ),
    },
    {
      field: 'price',
      headerName: 'Price',
      width: 100,
      renderCell: (params: GridRenderCellParams<Item>) => (
        <EditableCell
          value={params.row.price}
          field="price"
          onSave={(val) =>
            updateItem.mutate({ id: params.row.id, data: { price: val } })
          }
          disabled={updateItem.isPending}
        />
      ),
    },
    {
      field: 'id',
      headerName: '',
      width: 120,
      renderCell: (params: GridRenderCellParams<Item>) => (
        <Button
          size="small"
          variant="outlined"
          color="success"
          startIcon={<CheckCircle />}
          onClick={(e) => {
            e.stopPropagation();
            handleMarkReady(params.row.id);
          }}
          disabled={markItemReady.isPending}
        >
          Mark Ready
        </Button>
      ),
    },
  ];

  return (
    <Box>
      <PageHeader
        title="Processing"
        subtitle="Process manifests and prepare items for shelf"
      />

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Manifest Processing" />
        <Tab label="Item Queue" />
      </Tabs>

      {tab === 0 && (
        <Card>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Select order and upload CSV
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  select
                  label="Purchase Order"
                  value={selectedOrderId ?? ''}
                  onChange={(e) =>
                    setSelectedOrderId(e.target.value ? parseInt(e.target.value, 10) : null)
                  }
                >
                  <MenuItem value="">Select order</MenuItem>
                  {orders.map((o) => (
                    <MenuItem key={o.id} value={o.id}>
                      {o.order_number} – {o.vendor_name}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Button variant="outlined" component="label" startIcon={<UploadFile />} fullWidth>
                  {selectedFile ? selectedFile.name : 'Select CSV'}
                  <input
                    type="file"
                    hidden
                    accept=".csv"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                  />
                </Button>
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Button
                  variant="contained"
                  onClick={handleUploadAndProcess}
                  disabled={
                    !selectedOrderId ||
                    !selectedFile ||
                    uploadManifest.isPending ||
                    processManifest.isPending
                  }
                >
                  {uploadManifest.isPending || processManifest.isPending
                    ? 'Processing...'
                    : 'Upload & Process'}
                </Button>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {tab === 1 && (
        <>
          <Box sx={{ mb: 2 }}>
            <TextField
              size="small"
              placeholder="Search items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
              sx={{ maxWidth: 320 }}
            />
          </Box>
          {isLoading && items.length === 0 ? (
            <LoadingScreen />
          ) : (
            <Box sx={{ height: 500 }}>
              <DataGrid
                rows={items}
                columns={itemColumns}
                loading={isLoading}
                pageSizeOptions={[10, 25, 50, 100]}
                initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
                getRowId={(row: Item) => row.id}
                sx={{ border: 'none' }}
              />
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

function EditableCell({
  value,
  field,
  onSave,
  disabled,
}: {
  value: string;
  field: string;
  onSave: (val: string) => void;
  disabled: boolean;
}) {
  const [edit, setEdit] = useState(false);
  const [local, setLocal] = useState(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  if (edit) {
    return (
      <TextField
        size="small"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          if (local !== value) onSave(local);
          setEdit(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (local !== value) onSave(local);
            setEdit(false);
          }
        }}
        autoFocus
        disabled={disabled}
        sx={{ width: '100%', '& .MuiInputBase-input': { py: 0.5 } }}
      />
    );
  }
  return (
    <Box
      onClick={() => setEdit(true)}
      sx={{
        cursor: 'pointer',
        width: '100%',
        py: 0.5,
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      {field === 'price' ? formatCurrency(value) : value || '—'}
    </Box>
  );
}

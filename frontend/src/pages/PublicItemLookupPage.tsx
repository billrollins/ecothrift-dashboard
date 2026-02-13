import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  TextField,
  Typography,
} from '@mui/material';
import Search from '@mui/icons-material/Search';
import { itemLookup } from '../api/inventory.api';
import type { Item } from '../types/inventory.types';
import logoImg from '../assets/logo-full-180x60.png';

function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num ?? 0);
}

export default function PublicItemLookupPage() {
  const { sku: skuParam } = useParams<{ sku?: string }>();
  const [sku, setSku] = useState(skuParam ?? '');

  useEffect(() => {
    if (skuParam) setSku(skuParam);
  }, [skuParam]);
  const [result, setResult] = useState<Item | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLookup = async () => {
    const val = sku.trim();
    if (!val) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const { data } = await itemLookup(val);
      setResult(data as Item);
    } catch {
      setError('Item not found');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLookup();
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        px: 2,
        py: 4,
        bgcolor: 'background.default',
      }}
    >
      <Box
        component="img"
        src={logoImg}
        alt="Eco-Thrift"
        sx={{ height: 48, mb: 4, objectFit: 'contain' }}
      />

      <Typography variant="h5" fontWeight={600} gutterBottom textAlign="center">
        Item Price Lookup
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }} textAlign="center">
        Enter or scan SKU to view item details
      </Typography>

      <Box sx={{ width: '100%', maxWidth: 400, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            fullWidth
            size="medium"
            placeholder="SKU"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            slotProps={{
              input: {
                autoComplete: 'off',
                inputProps: { 'data-lpignore': 'true' },
              },
            }}
          />
          <Button
            variant="contained"
            onClick={handleLookup}
            disabled={!sku.trim() || loading}
            sx={{ minWidth: 56 }}
          >
            {loading ? (
              <CircularProgress size={24} color="inherit" />
            ) : (
              <Search />
            )}
          </Button>
        </Box>
      </Box>

      {error && (
        <Card sx={{ width: '100%', maxWidth: 400, borderColor: 'error.main' }}>
          <CardContent>
            <Typography color="error">{error}</Typography>
          </CardContent>
        </Card>
      )}

      {result && !error && (
        <Card sx={{ width: '100%', maxWidth: 400 }}>
          <CardContent>
            <Typography variant="h6" fontWeight={600} gutterBottom>
              {result.title}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 2 }}>
              <Typography variant="body2">
                <strong>Brand:</strong> {result.brand || '—'}
              </Typography>
              <Typography variant="body2">
                <strong>Category:</strong> {result.category || '—'}
              </Typography>
              <Typography variant="body2">
                <strong>SKU:</strong> {result.sku}
              </Typography>
              <Typography
                variant="h5"
                fontWeight={600}
                color="primary.main"
                sx={{ mt: 2 }}
              >
                {formatCurrency(result.price)}
              </Typography>
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import LocalOffer from '@mui/icons-material/LocalOffer';
import QrCodeScanner from '@mui/icons-material/QrCodeScanner';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import ArrowDownward from '@mui/icons-material/ArrowDownward';
import { useSnackbar } from 'notistack';
import { quickReprice } from '../../api/inventory.api';
import { localPrintService } from '../../services/localPrintService';

interface RepriceResult {
  sku: string;
  title: string;
  old_price: string;
  new_price: string;
  discount_amount: string;
  discount_type: string;
}

export default function QuickRepricePage() {
  const { enqueueSnackbar } = useSnackbar();

  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [minPrice, setMinPrice] = useState('0.50');
  const [skuInput, setSkuInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<RepriceResult | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [sessionSavings, setSessionSavings] = useState(0);
  const [error, setError] = useState('');

  const skuRef = useRef<HTMLInputElement>(null);

  // Keep SKU field focused
  useEffect(() => {
    skuRef.current?.focus();
  }, [lastResult, loading]);

  const handleScan = useCallback(async () => {
    const sku = skuInput.trim();
    if (!sku) return;
    if (!discountValue || isNaN(Number(discountValue))) {
      setError('Set a discount value before scanning.');
      return;
    }
    const val = Number(discountValue);
    if (discountType === 'percent' && (val <= 0 || val > 100)) {
      setError('Percent discount must be between 1 and 100.');
      return;
    }
    if (val <= 0) {
      setError('Discount value must be greater than 0.');
      return;
    }

    setError('');
    setLoading(true);
    setSkuInput('');

    try {
      // Use the items API to find by SKU
      const itemsResp = await fetch(
        `/api/inventory/items/?sku=${encodeURIComponent(sku)}`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('access')}` } },
      );
      const itemsData = await itemsResp.json();
      const item = itemsData.results?.[0] || itemsData[0];

      if (!item) {
        setError(`Item not found: ${sku}`);
        setLoading(false);
        return;
      }

      const { data: result } = await quickReprice(item.id, {
        discount_type: discountType,
        discount_value: val,
        min_price: Number(minPrice) || 0.50,
      });

      setLastResult(result);
      setSessionCount(c => c + 1);
      setSessionSavings(s => s + Number(result.discount_amount));

      // Auto-print new label
      const printOk = await localPrintService.printLabel({
        qr_data: result.sku,
        text: `$${Number(result.new_price).toFixed(2)}`,
        product_title: result.title,
        include_text: true,
      }).then(() => true).catch(() => false);

      if (!printOk) {
        enqueueSnackbar('Label printed — but print server may be offline', { variant: 'warning' });
      }

    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Reprice failed.';
      setError(msg);
    } finally {
      setLoading(false);
      setTimeout(() => skuRef.current?.focus(), 50);
    }
  }, [skuInput, discountType, discountValue, minPrice, enqueueSnackbar]);

  const handleSkuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleScan();
  };

  const isConfigured = discountValue && !isNaN(Number(discountValue)) && Number(discountValue) > 0;

  return (
    <Box sx={{ p: 3, maxWidth: 680, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" spacing={1.5} mb={3}>
        <LocalOffer color="primary" sx={{ fontSize: 32 }} />
        <Box>
          <Typography variant="h5" fontWeight={700}>Quick Reprice</Typography>
          <Typography variant="body2" color="text.secondary">
            Set a discount, then scan items — price updates and new label prints automatically.
          </Typography>
        </Box>
      </Stack>

      {/* Discount Configuration */}
      <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} mb={2}>Discount Settings</Typography>

        <Stack spacing={2}>
          <RadioGroup
            row
            value={discountType}
            onChange={e => setDiscountType(e.target.value as 'percent' | 'fixed')}
          >
            <FormControlLabel value="percent" control={<Radio />} label="Percentage off (e.g. 30%)" />
            <FormControlLabel value="fixed" control={<Radio />} label="Fixed amount off (e.g. $5.00)" />
          </RadioGroup>

          <Stack direction="row" spacing={2}>
            <TextField
              label={discountType === 'percent' ? 'Discount %' : 'Discount Amount ($)'}
              value={discountValue}
              onChange={e => setDiscountValue(e.target.value)}
              type="number"
              inputProps={{ min: 0.01, step: discountType === 'percent' ? 1 : 0.01 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    {discountType === 'percent' ? '%' : '$'}
                  </InputAdornment>
                ),
              }}
              sx={{ width: 180 }}
              size="small"
              autoFocus
            />
            <TextField
              label="Minimum price floor ($)"
              value={minPrice}
              onChange={e => setMinPrice(e.target.value)}
              type="number"
              inputProps={{ min: 0, step: 0.01 }}
              InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
              sx={{ width: 180 }}
              size="small"
              helperText="Won't discount below this"
            />
          </Stack>
        </Stack>
      </Paper>

      {/* Scan Field */}
      <Paper
        variant="outlined"
        sx={{
          p: 2.5, mb: 3,
          borderColor: isConfigured ? 'primary.main' : 'divider',
          borderWidth: isConfigured ? 2 : 1,
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <QrCodeScanner color={isConfigured ? 'primary' : 'disabled'} sx={{ fontSize: 28 }} />
          <TextField
            inputRef={skuRef}
            fullWidth
            label="Scan barcode or type SKU"
            value={skuInput}
            onChange={e => setSkuInput(e.target.value)}
            onKeyDown={handleSkuKeyDown}
            disabled={!isConfigured || loading}
            placeholder={isConfigured ? 'Ready to scan...' : 'Set discount above first'}
            size="small"
          />
          <Button
            variant="contained"
            onClick={handleScan}
            disabled={!isConfigured || !skuInput.trim() || loading}
            sx={{ minWidth: 90 }}
          >
            {loading ? 'Repricing...' : 'Apply'}
          </Button>
        </Stack>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Last Result */}
      {lastResult && (
        <Card variant="outlined" sx={{ mb: 3, borderColor: 'success.main', borderWidth: 2 }}>
          <CardContent>
            <Stack direction="row" alignItems="center" spacing={1} mb={1.5}>
              <CheckCircleOutline color="success" />
              <Typography variant="subtitle1" fontWeight={600} color="success.main">
                Repriced and label printed
              </Typography>
            </Stack>
            <Typography variant="body1" fontWeight={600} mb={0.5}>
              {lastResult.title}
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={1.5}>
              SKU: {lastResult.sku}
            </Typography>
            <Stack direction="row" spacing={3} alignItems="center">
              <Box textAlign="center">
                <Typography variant="caption" color="text.secondary">Old Price</Typography>
                <Typography variant="h6" sx={{ textDecoration: 'line-through', color: 'text.secondary' }}>
                  ${Number(lastResult.old_price).toFixed(2)}
                </Typography>
              </Box>
              <ArrowDownward color="success" sx={{ fontSize: 28 }} />
              <Box textAlign="center">
                <Typography variant="caption" color="success.main">New Price</Typography>
                <Typography variant="h4" fontWeight={700} color="success.main">
                  ${Number(lastResult.new_price).toFixed(2)}
                </Typography>
              </Box>
              <Box textAlign="center">
                <Typography variant="caption" color="text.secondary">Discount</Typography>
                <Typography variant="h6" color="error.main">
                  −${Number(lastResult.discount_amount).toFixed(2)}
                </Typography>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Session Stats */}
      {sessionCount > 0 && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" mb={1}>This Session</Typography>
          <Stack direction="row" spacing={4}>
            <Box>
              <Typography variant="h5" fontWeight={700}>{sessionCount}</Typography>
              <Typography variant="caption" color="text.secondary">Items Repriced</Typography>
            </Box>
            <Box>
              <Typography variant="h5" fontWeight={700} color="error.main">
                −${sessionSavings.toFixed(2)}
              </Typography>
              <Typography variant="caption" color="text.secondary">Total Discounted</Typography>
            </Box>
          </Stack>
        </Paper>
      )}
    </Box>
  );
}

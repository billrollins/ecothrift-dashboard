import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputAdornment,
  InputLabel,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import Close from '@mui/icons-material/Close';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import Search from '@mui/icons-material/Search';
import { useSnackbar } from 'notistack';
import { format, parseISO, isValid, subDays } from 'date-fns';
import { getCart, getCarts, suggestDeliveryAddresses } from '../../../api/pos.api';
import type { DeliveryAddressSuggestion } from '../../../api/pos.api';
import { getItems } from '../../../api/inventory.api';
import { useCreateDeliveryJob } from '../../../hooks/usePOS';
import { formatPhone, maskPhoneInput } from '../../../utils/formatPhone';
import type { DeliveryAvailability } from '../../../types/pos.types';

type ItemMode = 'sale' | 'inventory' | 'describe';

type CartSummary = {
  id: number;
  completed_at?: string | null;
  total?: string;
  cashier_name?: string;
  receipt?: { receipt_number?: string } | null;
  lines?: Array<{
    id: number;
    description: string;
    quantity: number;
    line_kind?: string;
    item?: number | null;
  }>;
};

type Props = {
  open: boolean;
  onClose: () => void;
  daySlots: DeliveryAvailability[];
  defaultAvailabilityId?: number | null;
  onCreated?: () => void;
};

const fieldSx = {
  '& .MuiInputBase-root': { minHeight: 44 },
};

export function AddDeliveryDialog({
  open,
  onClose,
  daySlots,
  defaultAvailabilityId,
  onCreated,
}: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const createJob = useCreateDeliveryJob();

  const [itemMode, setItemMode] = useState<ItemMode>('describe');
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [isApt, setIsApt] = useState(false);
  const [unit, setUnit] = useState('');
  const [notes, setNotes] = useState('');
  const [notesOpen, setNotesOpen] = useState(false);
  const [itemsDelivered, setItemsDelivered] = useState('');
  const [availId, setAvailId] = useState<number | '' | 'later'>('later');
  const [tier, setTier] = useState<'' | '5mi' | '10mi'>('');

  const [saleQuery, setSaleQuery] = useState('');
  const [saleDateFrom, setSaleDateFrom] = useState(() =>
    format(subDays(new Date(), 90), 'yyyy-MM-dd'),
  );
  const [saleResults, setSaleResults] = useState<CartSummary[]>([]);
  const [saleSearching, setSaleSearching] = useState(false);
  const [selectedCart, setSelectedCart] = useState<CartSummary | null>(null);
  const [selectedLineIds, setSelectedLineIds] = useState<number[]>([]);

  const [skuQuery, setSkuQuery] = useState('');
  const [skuResults, setSkuResults] = useState<
    Array<{ id: number; sku: string; title?: string; description?: string }>
  >([]);
  const [skuSearching, setSkuSearching] = useState(false);

  const [addrSuggestions, setAddrSuggestions] = useState<DeliveryAddressSuggestion[]>([]);

  useEffect(() => {
    if (!open) return;
    setItemMode('describe');
    setCustomerName('');
    setPhone('');
    setAddress('');
    setIsApt(false);
    setUnit('');
    setNotes('');
    setNotesOpen(false);
    setItemsDelivered('');
    setTier('');
    setSaleQuery('');
    setSaleResults([]);
    setSelectedCart(null);
    setSelectedLineIds([]);
    setSkuQuery('');
    setSkuResults([]);
    setAddrSuggestions([]);
    if (defaultAvailabilityId) {
      setAvailId(defaultAvailabilityId);
    } else if (daySlots[0]) {
      setAvailId(daySlots[0].id);
    } else {
      setAvailId('later');
    }
  }, [open, defaultAvailabilityId, daySlots]);

  const merchandiseLines = useMemo(() => {
    const lines = selectedCart?.lines || [];
    return lines.filter((l) => (l.line_kind || 'item') === 'item' || l.item);
  }, [selectedCart]);

  useEffect(() => {
    if (!selectedCart) {
      if (itemMode === 'sale') setItemsDelivered('');
      return;
    }
    const chosen = merchandiseLines.filter((l) => selectedLineIds.includes(l.id));
    setItemsDelivered(
      chosen
        .map((l) => {
          const qty = l.quantity > 1 ? `${l.quantity}× ` : '';
          return `${qty}${l.description}`.trim();
        })
        .join(', '),
    );
  }, [selectedCart, selectedLineIds, merchandiseLines, itemMode]);

  const searchSales = async () => {
    setSaleSearching(true);
    try {
      const { data } = await getCarts({
        status: 'completed',
        date_from: saleDateFrom,
        receipt_number: saleQuery.trim() || undefined,
        page_size: 20,
      });
      const rows = (data?.results || []) as CartSummary[];
      setSaleResults(rows);
      if (rows.length === 0) enqueueSnackbar('No completed sales found', { variant: 'info' });
    } catch {
      enqueueSnackbar('Could not search sales', { variant: 'error' });
    } finally {
      setSaleSearching(false);
    }
  };

  const pickSale = async (cartId: number) => {
    try {
      const { data } = await getCart(cartId);
      const cart = data as CartSummary;
      setSelectedCart(cart);
      const lines = (cart.lines || []).filter(
        (l) => (l.line_kind || 'item') === 'item' || l.item,
      );
      setSelectedLineIds(lines.map((l) => l.id));
    } catch {
      enqueueSnackbar('Could not load sale', { variant: 'error' });
    }
  };

  const searchSku = async () => {
    const q = skuQuery.trim();
    if (!q) return;
    setSkuSearching(true);
    try {
      const { data } = await getItems({ search: q, page_size: 15 });
      const rows = (data?.results || []).map((it) => ({
        id: it.id,
        sku: String(it.sku || ''),
        title: String(it.title || it.product_title || it.brand || it.sku || ''),
        description: String(it.title || it.product_title || ''),
      }));
      setSkuResults(rows);
      if (rows.length === 0) enqueueSnackbar('No items found', { variant: 'info' });
    } catch {
      enqueueSnackbar('Item search failed', { variant: 'error' });
    } finally {
      setSkuSearching(false);
    }
  };

  const addInventoryItem = (row: { sku: string; title?: string; description?: string }) => {
    const label = (row.title || row.description || row.sku).trim();
    const piece = row.sku ? `${label} (SKU ${row.sku})` : label;
    setItemsDelivered((prev) => (prev ? `${prev}, ${piece}` : piece));
    enqueueSnackbar('Item added', { variant: 'success' });
  };

  const searchAddress = async () => {
    const q = address.trim();
    if (q.length < 3) return;
    try {
      const { data } = await suggestDeliveryAddresses(q);
      setAddrSuggestions(data?.results || []);
    } catch {
      setAddrSuggestions([]);
    }
  };

  const canSubmit =
    customerName.trim() &&
    phone.trim() &&
    address.trim() &&
    itemsDelivered.trim() &&
    (!isApt || unit.trim()) &&
    !(itemMode === 'sale' && selectedCart && selectedLineIds.length === 0);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      await createJob.mutateAsync({
        customer_name: customerName.trim(),
        phone: formatPhone(phone) || phone.trim(),
        address: address.trim(),
        is_apt: isApt,
        unit: unit.trim(),
        items_delivered: itemsDelivered.trim(),
        notes: notes.trim(),
        tier: tier || undefined,
        schedule_later: availId === 'later',
        availability_id: availId === 'later' || availId === '' ? undefined : Number(availId),
        cart_id: selectedCart?.id,
        cart_line_ids: selectedLineIds.length ? selectedLineIds : undefined,
      });
      enqueueSnackbar('Delivery added', { variant: 'success' });
      onCreated?.();
      onClose();
    } catch (err: unknown) {
      const detail =
        err && typeof err === 'object' && 'response' in err
          ? String(
              (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ||
                'Could not add delivery',
            )
          : 'Could not add delivery';
      enqueueSnackbar(detail, { variant: 'error' });
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={isMobile}
      fullWidth
      maxWidth="sm"
      scroll="paper"
      aria-labelledby="add-delivery-title"
      PaperProps={{
        sx: isMobile
          ? undefined
          : { maxHeight: 'min(900px, calc(100vh - 48px))' },
      }}
    >
      <DialogTitle
        id="add-delivery-title"
        sx={{
          py: { xs: 1.25, md: 1.5 },
          px: { xs: 1.5, md: 2.5 },
          pr: { xs: 1, md: 1.5 },
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontWeight: 800,
        }}
      >
        Add delivery
        <IconButton aria-label="Close" onClick={onClose} edge="end">
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent
        dividers
        sx={{
          px: { xs: 1.5, md: 2.5 },
          py: { xs: 1.5, md: 2 },
          display: 'flex',
          flexDirection: 'column',
          gap: 1.25,
        }}
      >
        <ToggleButtonGroup
          exclusive
          fullWidth
          size="small"
          value={itemMode}
          onChange={(_e, next: ItemMode | null) => {
            if (next) setItemMode(next);
          }}
        >
          <ToggleButton value="describe" sx={{ minHeight: 40, py: 0.5, textTransform: 'none', fontSize: '0.8rem' }}>
            Describe
          </ToggleButton>
          <ToggleButton value="sale" sx={{ minHeight: 40, py: 0.5, textTransform: 'none', fontSize: '0.8rem' }}>
            Past sale
          </ToggleButton>
          <ToggleButton value="inventory" sx={{ minHeight: 40, py: 0.5, textTransform: 'none', fontSize: '0.8rem' }}>
            Inventory
          </ToggleButton>
        </ToggleButtonGroup>

        {itemMode === 'sale' && (
          <Stack spacing={1}>
            <Stack direction="row" spacing={1} alignItems="flex-start">
              <TextField
                size="small"
                label="Receipt #"
                value={saleQuery}
                onChange={(e) => setSaleQuery(e.target.value)}
                sx={{ ...fieldSx, flex: 1.2 }}
              />
              <TextField
                size="small"
                label="From"
                type="date"
                value={saleDateFrom}
                onChange={(e) => setSaleDateFrom(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ ...fieldSx, width: 132 }}
              />
              <IconButton
                color="primary"
                onClick={() => void searchSales()}
                disabled={saleSearching}
                aria-label="Search sales"
                sx={{ mt: 0.25, border: 1, borderColor: 'divider' }}
              >
                <Search />
              </IconButton>
            </Stack>
            {!selectedCart && saleResults.length > 0 && (
              <List dense disablePadding sx={{ border: 1, borderColor: 'divider', borderRadius: 1, maxHeight: 140, overflow: 'auto' }}>
                {saleResults.map((c) => {
                  const when = c.completed_at ? parseISO(c.completed_at) : null;
                  return (
                    <ListItemButton key={c.id} dense onClick={() => void pickSale(c.id)}>
                      <ListItemText
                        primary={c.receipt?.receipt_number || `Sale #${c.id}`}
                        secondary={`${when && isValid(when) ? format(when, 'MMM d') : '—'} · $${c.total || '0'}`}
                        primaryTypographyProps={{ variant: 'body2', fontWeight: 700 }}
                        secondaryTypographyProps={{ variant: 'caption' }}
                      />
                    </ListItemButton>
                  );
                })}
              </List>
            )}
            {selectedCart && (
              <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2" fontWeight={700} noWrap sx={{ flex: 1, mr: 1 }}>
                    {selectedCart.receipt?.receipt_number || `Sale #${selectedCart.id}`}
                  </Typography>
                  <Button size="small" onClick={() => { setSelectedCart(null); setSelectedLineIds([]); }}>
                    Change
                  </Button>
                </Stack>
                <Box sx={{ maxHeight: 120, overflow: 'auto' }}>
                  {merchandiseLines.map((l) => (
                    <FormControlLabel
                      key={l.id}
                      control={
                        <Checkbox
                          size="small"
                          checked={selectedLineIds.includes(l.id)}
                          onChange={(e) => {
                            setSelectedLineIds((prev) =>
                              e.target.checked
                                ? [...prev, l.id]
                                : prev.filter((id) => id !== l.id),
                            );
                          }}
                        />
                      }
                      label={
                        <Typography variant="body2" noWrap>
                          {l.quantity > 1 ? `${l.quantity}× ` : ''}
                          {l.description}
                        </Typography>
                      }
                      sx={{ display: 'flex', ml: 0, mr: 0, width: '100%' }}
                    />
                  ))}
                </Box>
              </Box>
            )}
          </Stack>
        )}

        {itemMode === 'inventory' && (
          <Stack spacing={1}>
            <TextField
              size="small"
              label="SKU or title"
              value={skuQuery}
              onChange={(e) => setSkuQuery(e.target.value)}
              fullWidth
              sx={fieldSx}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void searchSku();
                }
              }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton edge="end" onClick={() => void searchSku()} disabled={skuSearching}>
                      <Search />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            {skuResults.length > 0 && (
              <List dense disablePadding sx={{ border: 1, borderColor: 'divider', borderRadius: 1, maxHeight: 140, overflow: 'auto' }}>
                {skuResults.map((row) => (
                  <ListItemButton key={row.id} dense onClick={() => addInventoryItem(row)}>
                    <ListItemText
                      primary={row.title || row.sku}
                      secondary={row.sku ? `SKU ${row.sku}` : undefined}
                      primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                      secondaryTypographyProps={{ variant: 'caption' }}
                    />
                  </ListItemButton>
                ))}
              </List>
            )}
          </Stack>
        )}

        <TextField
          size="small"
          label="Items"
          value={itemsDelivered}
          onChange={(e) => setItemsDelivered(e.target.value)}
          fullWidth
          required
          multiline
          minRows={1}
          maxRows={3}
          sx={fieldSx}
          placeholder={itemMode === 'describe' ? 'Washer, dryer…' : 'Auto-filled — edit if needed'}
        />

        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          alignItems={{ sm: 'flex-start' }}
        >
          <TextField
            size="small"
            label="Name"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            required
            sx={{ ...fieldSx, flex: 1, minWidth: 0, width: '100%' }}
          />
          <TextField
            size="small"
            label="Phone"
            value={phone}
            onChange={(e) => setPhone(maskPhoneInput(e.target.value))}
            required
            inputProps={{ inputMode: 'tel' }}
            sx={{
              ...fieldSx,
              width: { xs: '100%', sm: 188 },
              flexShrink: 0,
            }}
          />
        </Stack>

        <Stack direction="row" spacing={1} alignItems="flex-start">
          <TextField
            size="small"
            label="Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            required
            onBlur={() => void searchAddress()}
            sx={{ ...fieldSx, flex: 1, minWidth: 0 }}
          />
          <FormControlLabel
            control={<Checkbox size="small" checked={isApt} onChange={(e) => setIsApt(e.target.checked)} />}
            label={<Typography variant="caption">Apt</Typography>}
            sx={{ m: 0, mt: 0.5, flexShrink: 0 }}
          />
          <TextField
            size="small"
            label="Unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            disabled={!isApt}
            sx={{ ...fieldSx, width: 72, flexShrink: 0 }}
          />
        </Stack>
        {addrSuggestions.length > 0 && (
          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
            {addrSuggestions.slice(0, 4).map((s) => (
              <Chip
                key={`${s.display_name}-${s.lat}`}
                size="small"
                label={s.display_name}
                onClick={() => {
                  setAddress(s.address_line || s.display_name);
                  setAddrSuggestions([]);
                  if (s.tier === '5mi' || s.tier === '10mi') setTier(s.tier);
                }}
                sx={{ maxWidth: '100%', height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal', py: 0.5 } }}
              />
            ))}
          </Stack>
        )}

        <Stack direction="row" spacing={1}>
          <FormControl size="small" sx={{ flex: 1.4, minWidth: 0 }}>
            <InputLabel>Date</InputLabel>
            <Select
              label="Date"
              value={availId}
              onChange={(e) => setAvailId(e.target.value as number | 'later')}
            >
              <MenuItem value="later">Later (no date)</MenuItem>
              {daySlots.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.date.slice(5)} · {String(s.time_start).slice(0, 5)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ width: 128, flexShrink: 0 }}>
            <InputLabel>Fee</InputLabel>
            <Select
              label="Fee"
              value={tier}
              onChange={(e) => setTier(e.target.value as '' | '5mi' | '10mi')}
            >
              <MenuItem value="">None</MenuItem>
              <MenuItem value="5mi">$50</MenuItem>
              <MenuItem value="10mi">$75</MenuItem>
            </Select>
          </FormControl>
        </Stack>

        <Box
          onClick={() => setNotesOpen((v) => !v)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setNotesOpen((v) => !v);
            }
          }}
          sx={{
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            px: 1.25,
            py: 1,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            minHeight: 44,
          }}
        >
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={700}>
              Notes {notes.trim() ? '' : '(optional)'}
            </Typography>
            <Typography
              variant="body2"
              noWrap={!notesOpen}
              color={notes.trim() ? 'text.primary' : 'text.secondary'}
            >
              {notes.trim() || 'Tap to add notes'}
            </Typography>
          </Box>
          {notesOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
        </Box>
        <Collapse in={notesOpen}>
          <TextField
            size="small"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            fullWidth
            multiline
            minRows={2}
            maxRows={4}
            autoFocus={notesOpen}
            placeholder="Gate code, stairs, call first…"
            sx={fieldSx}
          />
        </Collapse>

        {daySlots.length === 0 && availId !== 'later' && (
          <Alert severity="warning" sx={{ py: 0 }}>
            No bookable dates in range — use Later or add a date first.
          </Alert>
        )}
      </DialogContent>
      <DialogActions
        sx={{
          px: { xs: 1.5, md: 2.5 },
          py: 1.25,
          pb: 'calc(10px + env(safe-area-inset-bottom))',
          gap: 1,
        }}
      >
        <Button onClick={onClose} sx={{ minHeight: 48, flex: 1 }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={!canSubmit || createJob.isPending}
          onClick={() => void handleSubmit()}
          sx={{ minHeight: 48, flex: 1.4 }}
        >
          Add
        </Button>
      </DialogActions>
    </Dialog>
  );
}

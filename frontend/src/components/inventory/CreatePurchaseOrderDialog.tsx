import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  IconButton,
  Popover,
  Typography,
} from '@mui/material';
import ExpandMore from '@mui/icons-material/ExpandMore';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { guessOrderVendor } from '../../api/inventory.api';
import { useCreatePurchaseOrder, useVendors } from '../../hooks/useInventory';
import type { PurchaseOrder, PurchaseOrderCondition, Vendor } from '../../types/inventory.types';
import {
  preventWheelChangeNumber,
  sanitizeDecimalPaste,
  selectInputContentsOnFocus,
} from '../../utils/formInputs';
import { moneySumDisplay, parseMoneySum, sanitizeMoneySumPaste } from '../../utils/moneySum';
import { IconClose as Close, IconOpenExternal as OpenInNew } from '../../icons/ecoIcons';

/** Mock-aligned labels; values match backend `PurchaseOrderCondition`. */
const CREATE_PO_CONDITIONS: { label: string; value: PurchaseOrderCondition }[] = [
  { label: 'New', value: 'new' },
  { label: 'Good', value: 'good' },
  { label: 'Mixed', value: 'mixed' },
  { label: 'Fair', value: 'fair' },
  { label: 'Poor', value: 'salvage' },
];

function orderCreateErrorMessage(err: unknown): string {
  const ax = err as {
    response?: { data?: { detail?: unknown } };
    message?: string;
  };
  const d = ax.response?.data?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) {
    return d.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('; ');
  }
  return ax.message ?? 'Failed to create order';
}

function codeChip(code: string): string {
  const c = code.trim();
  return (c.length >= 2 ? c.slice(0, 2) : c.padEnd(2, '?')).toUpperCase();
}

function ChevronDownIcon({ size = 16, sx = {} }: { size?: number; sx?: object }) {
  return (
    <Box
      component="svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      sx={{ flexShrink: 0, ...sx }}
    >
      <path d="m6 9 6 6 6-6" />
    </Box>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      sx={{
        fontSize: 10,
        fontWeight: 700,
        color: '#94a3b8',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        mb: 1.5,
        mt: 0.5,
      }}
    >
      {children}
    </Typography>
  );
}

function DividerLine() {
  return <Box sx={{ height: 1, bgcolor: '#f1f5f9', my: '18px' }} />;
}

const inputSx = {
  width: '100%',
  py: '9px',
  px: '12px',
  height: 40,
  fontSize: 13,
  fontFamily: 'inherit',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  outline: 'none',
  color: '#0f172a',
  bgcolor: 'white',
  transition: 'border-color 150ms ease, box-shadow 150ms ease',
  boxSizing: 'border-box',
} as const;

const labelSx = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: '#475569',
  mb: 0.625,
  letterSpacing: '0.01em',
} as const;

function VendorSelect({
  vendors,
  value,
  onChange,
  onPick,
  hint,
}: {
  vendors: Vendor[];
  value: Vendor | null;
  onChange: (v: Vendor | null) => void;
  onPick: () => void;
  /** Shown under the box when the vendor was filled from the order number. */
  hint?: string | null;
}) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const open = Boolean(anchorEl);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return vendors;
    return vendors.filter(
      (v) => v.name.toLowerCase().includes(q) || v.code.toLowerCase().includes(q),
    );
  }, [vendors, search]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      return;
    }
    const t = window.setTimeout(() => searchRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  const panelWidth = anchorEl?.offsetWidth ?? undefined;

  const handlePick = (v: Vendor) => {
    onChange(v);
    setAnchorEl(null);
    onPick();
  };

  return (
    <Box sx={{ position: 'relative' }}>
      <Typography component="label" sx={labelSx}>
        Vendor <Box component="span" sx={{ color: '#ef4444' }}>*</Box>
      </Typography>
      <Box
        component="button"
        type="button"
        data-create-po-vendor-trigger="true"
        onClick={(e) => {
          setAnchorEl(open ? null : e.currentTarget);
        }}
        sx={{
          ...inputSx,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          textAlign: 'left',
          borderColor: open ? '#0f172a' : '#e2e8f0',
          boxShadow: open ? '0 0 0 3px rgba(15,23,42,0.06)' : 'none',
          color: value ? '#0f172a' : '#94a3b8',
        }}
      >
        {value ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap' }} title={`${value.name} (${value.code})`}>
            <Box
              sx={{
                width: 22,
                height: 22,
                borderRadius: '5px',
                bgcolor: '#f1f5f9',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                fontWeight: 700,
                color: '#475569',
              }}
            >
              {codeChip(value.code)}
            </Box>
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{value.name}</Box>
          </Box>
        ) : (
          'Select...'
        )}
        <ChevronDownIcon
          sx={{
            color: '#94a3b8',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 200ms ease',
          }}
        />
      </Box>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              width: Math.max(panelWidth ?? 0, 300),
              maxWidth: 'calc(100% - 32px)',
              mt: 0.5,
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
              overflow: 'hidden',
            },
          },
        }}
      >
        <Box sx={{ p: '8px 8px 4px' }}>
          <Box
            component="input"
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              if (filtered.length === 1) {
                e.preventDefault();
                handlePick(filtered[0]);
              }
            }}
            placeholder="Search vendors..."
            sx={{
              ...inputSx,
              m: 0,
              fontSize: 13,
              py: '8px',
              px: '10px',
              height: 36,
              bgcolor: '#f8fafc',
            }}
          />
        </Box>
        <Box sx={{ maxHeight: 200, overflowY: 'auto', px: 0.5, pb: 0.5 }}>
          {filtered.length === 0 ? (
            <Typography sx={{ py: 2, px: 1.5, fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>
              No vendors found
            </Typography>
          ) : (
            filtered.map((v) => {
              const sel = value?.id === v.id;
              return (
                <Box
                  key={v.id}
                  component="button"
                  type="button"
                  onClick={() => handlePick(v)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    width: '100%',
                    py: '9px',
                    px: '10px',
                    border: 'none',
                    borderRadius: '6px',
                    bgcolor: sel ? '#f1f5f9' : 'transparent',
                    cursor: 'pointer',
                    fontSize: 13,
                    color: '#0f172a',
                    fontFamily: 'inherit',
                    textAlign: 'left',
                    '&:hover': { bgcolor: sel ? '#f1f5f9' : '#f8fafc' },
                  }}
                >
                  <Box
                    sx={{
                      width: 24,
                      height: 24,
                      borderRadius: '5px',
                      bgcolor: sel ? '#0f172a' : '#f1f5f9',
                      color: sel ? 'white' : '#475569',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {codeChip(v.code)}
                  </Box>
                  <Typography component="span" sx={{ fontWeight: 500 }}>
                    {v.name}
                  </Typography>
                  <Typography
                    component="span"
                    sx={{ color: '#94a3b8', fontSize: 11, ml: 'auto' }}
                  >
                    {v.code}
                  </Typography>
                </Box>
              );
            })
          )}
        </Box>
      </Popover>
      {hint ? (
        <Typography sx={{ fontSize: 11, color: '#64748b', mt: 0.5 }}>{hint}</Typography>
      ) : null}
    </Box>
  );
}

/** A money box that takes a sum such as `412.50+38`; shows the sum when you leave it. */
function MoneyField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error: string | null;
}) {
  return (
    <Box sx={{ flex: 1, minWidth: 90 }}>
      <Typography component="label" sx={labelSx}>
        {label}
      </Typography>
      <Box sx={{ position: 'relative' }}>
        <Typography
          component="span"
          sx={{
            position: 'absolute',
            left: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: 13,
            color: '#94a3b8',
            pointerEvents: 'none',
            fontWeight: 500,
          }}
        >
          $
        </Typography>
        <Box
          component="input"
          type="text"
          inputMode="decimal"
          aria-label={label}
          aria-invalid={error ? true : undefined}
          title="You can type a sum, like 412.50+38"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onChange(moneySumDisplay(e.target.value))}
          onFocus={selectInputContentsOnFocus}
          onWheel={preventWheelChangeNumber}
          onPaste={(ev: React.ClipboardEvent<HTMLInputElement>) => {
            ev.preventDefault();
            const el = ev.currentTarget;
            const pasted = sanitizeMoneySumPaste(ev.clipboardData.getData('text'));
            const start = el.selectionStart ?? value.length;
            const end = el.selectionEnd ?? value.length;
            onChange(value.slice(0, start) + pasted + value.slice(end));
          }}
          placeholder="0.00"
          sx={{
            ...inputSx,
            pl: '22px',
            fontVariantNumeric: 'tabular-nums',
            borderColor: error ? '#ef4444' : '#e2e8f0',
          }}
        />
      </Box>
      {error ? <Typography sx={{ fontSize: 11, color: '#dc2626', mt: 0.5 }}>{error}</Typography> : null}
    </Box>
  );
}

export interface CreatePurchaseOrderDialogProps {
  open: boolean;
  onClose: () => void;
  /**
   * Told about the new order. `open` is true for **Create & Open**.
   * Without it, Create & Open goes to the order's link and Create just closes.
   */
  onCreated?: (order: PurchaseOrder, open: boolean) => void;
}

const MONEY_FIELDS = [
  ['purchase', 'Purchase Cost'],
  ['fees', 'Fees'],
  ['shipping', 'Shipping'],
] as const;

type MoneyKey = 'retail' | (typeof MONEY_FIELDS)[number][0];

export default function CreatePurchaseOrderDialog({ open, onClose, onCreated }: CreatePurchaseOrderDialogProps) {
  const navigate = useNavigate();
  const createOrder = useCreatePurchaseOrder();
  const { data: vendorsData } = useVendors({ is_active: true, page_size: 200 });

  const vendorOptions = useMemo(
    () => vendorsData?.results ?? [],
    [vendorsData?.results],
  );

  const [vendor, setVendor] = useState<Vendor | null>(null);
  /** True while the vendor came from the order number (a hand pick turns it off). */
  const [vendorGuessed, setVendorGuessed] = useState(false);
  const [vendorPicked, setVendorPicked] = useState(false);
  const [orderNumber, setOrderNumber] = useState('');
  const [orderedDate, setOrderedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [paidDate, setPaidDate] = useState('');
  const [description, setDescription] = useState('');
  const [condition, setCondition] = useState<PurchaseOrderCondition | ''>('');
  const [itemCount, setItemCount] = useState('');
  const [palletCount, setPalletCount] = useState('');
  const [money, setMoney] = useState<Record<MoneyKey, string>>({ retail: '', purchase: '', fees: '', shipping: '' });
  const [submitError, setSubmitError] = useState<string | null>(null);

  const orderNumberRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setSubmitError(null);
    const id = window.setTimeout(() => orderNumberRef.current?.focus(), 100);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setVendor(null);
      setVendorGuessed(false);
      setVendorPicked(false);
      setOrderNumber('');
      setOrderedDate(format(new Date(), 'yyyy-MM-dd'));
      setPaidDate('');
      setDescription('');
      setCondition('');
      setItemCount('');
      setPalletCount('');
      setMoney({ retail: '', purchase: '', fees: '', shipping: '' });
      setSubmitError(null);
    }
  }, [open]);

  // Fill the vendor from the order number's prefix until someone picks one by hand.
  useEffect(() => {
    if (!open || vendorPicked) return;
    const number = orderNumber.trim();
    if (number.length < 2) {
      if (vendorGuessed) {
        setVendor(null);
        setVendorGuessed(false);
      }
      return;
    }
    let live = true;
    const t = window.setTimeout(async () => {
      try {
        const { data } = await guessOrderVendor(number);
        if (!live) return;
        const match = data.vendor ? vendorOptions.find((v) => v.id === data.vendor!.id) ?? null : null;
        if (match) {
          setVendor(match);
          setVendorGuessed(true);
        } else if (vendorGuessed) {
          setVendor(null);
          setVendorGuessed(false);
        }
      } catch {
        // A failed guess leaves the vendor for the person to pick.
      }
    }, 250);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [open, orderNumber, vendorPicked, vendorGuessed, vendorOptions]);

  const parsed = useMemo(
    () => ({
      retail: parseMoneySum(money.retail),
      purchase: parseMoneySum(money.purchase),
      fees: parseMoneySum(money.fees),
      shipping: parseMoneySum(money.shipping),
    }),
    [money],
  );
  const moneyError = Object.values(parsed).some((p) => p.error);
  const totalCost = (parsed.purchase.value ?? 0) + (parsed.fees.value ?? 0) + (parsed.shipping.value ?? 0);
  const hasCosts = totalCost > 0;
  const retailN = parsed.retail.value ?? 0;
  const marginPct =
    hasCosts && retailN > 0 ? ((retailN - totalCost) / retailN) * 100 : null;

  const canSubmit = Boolean(vendor && orderNumber.trim().length > 0) && !moneyError;
  const busy = createOrder.isPending;

  const setMoneyField = (key: MoneyKey) => (v: string) => setMoney((m) => ({ ...m, [key]: v }));

  const buildPayload = (): Record<string, unknown> => {
    if (!vendor) throw new Error('Vendor required');
    const payload: Record<string, unknown> = {
      vendor: vendor.id,
      order_number: orderNumber.trim(),
    };
    if (orderedDate) payload.ordered_date = orderedDate;
    if (paidDate) payload.paid_date = paidDate;
    if (description.trim()) payload.description = description.trim();
    if (condition) payload.condition = condition;
    if (itemCount.trim()) payload.item_count = Number.parseInt(itemCount, 10);
    if (palletCount.trim()) {
      const n = Number.parseInt(palletCount, 10);
      if (Number.isFinite(n) && n >= 0) payload.pallet_count = n;
    }
    const put = (field: string, key: MoneyKey) => {
      const v = parsed[key].value;
      if (v !== null) payload[field] = v.toFixed(2);
    };
    put('retail_value', 'retail');
    put('purchase_cost', 'purchase');
    put('shipping_cost', 'shipping');
    put('fees', 'fees');
    return payload;
  };

  const submit = async (openAfter: boolean) => {
    if (!canSubmit || busy) return;
    setSubmitError(null);
    try {
      const created = await createOrder.mutateAsync(buildPayload());
      onClose();
      if (onCreated) onCreated(created, openAfter);
      else if (openAfter) navigate(`/inventory/orders/${created.id}`);
    } catch (err) {
      setSubmitError(orderCreateErrorMessage(err));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submit(false);
  };

  const vendorHint =
    vendorGuessed && vendor ? `From the order number (${vendor.code})` : null;

  return (
    <Dialog
      open={open}
      onClose={(_, reason) => {
        if (reason === 'backdropClick' || reason === 'escapeKeyDown') onClose();
      }}
      maxWidth={false}
      slotProps={{
        backdrop: {
          sx: {
            bgcolor: 'rgba(15,23,42,0.25)',
            backdropFilter: 'blur(3px)',
          },
        },
        paper: {
          sx: {
            width: 520,
            maxWidth: 'calc(100% - 32px)',
            maxHeight: 'calc(100vh - 96px)',
            borderRadius: '14px',
            fontFamily: '"DM Sans", "Segoe UI", system-ui, sans-serif',
            boxShadow: '0 24px 80px rgba(0,0,0,0.15), 0 4px 16px rgba(0,0,0,0.06)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            m: '48px 16px',
          },
        },
      }}
    >
      <Box
        component="form"
        onSubmit={handleSubmit}
        noValidate
        sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 3,
            pt: 2.5,
            pb: 2,
            borderBottom: '1px solid #f1f5f9',
            flexShrink: 0,
          }}
        >
          <Typography
            component="h2"
            sx={{
              fontSize: 17,
              fontWeight: 700,
              m: 0,
              color: '#0f172a',
              letterSpacing: '-0.01em',
            }}
          >
            New Purchase Order
          </Typography>
          <IconButton
            type="button"
            aria-label="Close"
            size="small"
            onClick={onClose}
            sx={{
              color: '#94a3b8',
              p: 0.5,
              borderRadius: '6px',
              '&:hover': { color: '#0f172a', bgcolor: 'transparent' },
            }}
          >
            <Close sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>

        <Box sx={{ px: 3, py: 2.5, overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {submitError ? (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSubmitError(null)}>
              {submitError}
            </Alert>
          ) : null}

          <Box sx={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <Box sx={{ flex: 2, minWidth: 0 }}>
              <Typography component="label" htmlFor="create-po-order-number" sx={labelSx}>
                Order Number <Box component="span" sx={{ color: '#ef4444' }}>*</Box>
              </Typography>
              <Box
                component="input"
                id="create-po-order-number"
                ref={orderNumberRef}
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                onBlur={(e) => setOrderNumber(e.target.value.replace(/\r?\n/g, ' ').trim())}
                onFocus={selectInputContentsOnFocus}
                placeholder="e.g. AMZON-OQL-CCP4"
                autoComplete="off"
                sx={{
                  ...inputSx,
                  fontFamily: '"DM Mono", "SF Mono", ui-monospace, monospace',
                  fontSize: 13,
                  letterSpacing: '0.02em',
                }}
              />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <VendorSelect
                vendors={vendorOptions}
                value={vendor}
                onChange={(v) => {
                  setVendor(v);
                  setVendorGuessed(false);
                  setVendorPicked(true);
                }}
                onPick={() => requestAnimationFrame(() => orderNumberRef.current?.focus())}
                hint={vendorHint}
              />
            </Box>
          </Box>

          <Box sx={{ display: 'flex', gap: '10px', mt: 1.75 }}>
            <Box sx={{ flex: 1 }}>
              <Typography component="label" htmlFor="create-po-ordered" sx={labelSx}>
                Ordered Date
              </Typography>
              <Box
                component="input"
                id="create-po-ordered"
                type="date"
                value={orderedDate}
                onChange={(e) => setOrderedDate(e.target.value)}
                onFocus={selectInputContentsOnFocus}
                sx={inputSx}
              />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography component="label" htmlFor="create-po-paid" sx={labelSx}>
                Paid Date
              </Typography>
              <Box
                component="input"
                id="create-po-paid"
                type="date"
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
                onFocus={selectInputContentsOnFocus}
                sx={inputSx}
              />
            </Box>
          </Box>

          <DividerLine />

          <SectionLabel>Details</SectionLabel>

          <Box sx={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <Box sx={{ flex: 2, minWidth: 0 }}>
              <Typography component="label" htmlFor="create-po-description" sx={labelSx}>
                Description
              </Typography>
              <Box
                component="input"
                id="create-po-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onFocus={selectInputContentsOnFocus}
                placeholder="e.g. 24 Pallets of FBA Home Improvement"
                maxLength={500}
                sx={inputSx}
              />
            </Box>
            <MoneyField label="Retail" value={money.retail} onChange={setMoneyField('retail')} error={parsed.retail.error} />
          </Box>

          <Box sx={{ display: 'flex', gap: '10px', mt: 1.75, flexWrap: 'wrap' }}>
            <Box sx={{ flex: 1, position: 'relative', minWidth: 140 }}>
              <Typography component="label" sx={labelSx}>
                Condition
              </Typography>
              <Box
                component="select"
                value={condition}
                onChange={(e) =>
                  setCondition(e.target.value as PurchaseOrderCondition | '')
                }
                sx={{
                  ...inputSx,
                  appearance: 'none',
                  pr: '32px',
                  color: condition ? '#0f172a' : '#94a3b8',
                  cursor: 'pointer',
                }}
              >
                <option value="">Select...</option>
                {CREATE_PO_CONDITIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Box>
              <ChevronDownIcon
                size={14}
                sx={{
                  position: 'absolute',
                  right: 10,
                  bottom: 13,
                  color: '#94a3b8',
                  pointerEvents: 'none',
                }}
              />
            </Box>
            <Box sx={{ flex: 1, minWidth: 100 }}>
              <Typography component="label" sx={labelSx}>
                Item Count
              </Typography>
              <Box
                component="input"
                type="number"
                min={0}
                value={itemCount}
                onChange={(e) => setItemCount(e.target.value)}
                onFocus={selectInputContentsOnFocus}
                onWheel={preventWheelChangeNumber}
                onPaste={(e) => {
                  e.preventDefault();
                  const v = sanitizeDecimalPaste(e.clipboardData.getData('text')).replace(/\..*$/, '');
                  setItemCount(v);
                }}
                placeholder="0"
                sx={inputSx}
              />
            </Box>
            <Box sx={{ flex: 1, minWidth: 100 }}>
              <Typography component="label" sx={labelSx}>
                # of Pallets
              </Typography>
              <Box
                component="input"
                type="number"
                min={0}
                value={palletCount}
                onChange={(e) => setPalletCount(e.target.value)}
                onFocus={selectInputContentsOnFocus}
                onWheel={preventWheelChangeNumber}
                onPaste={(e) => {
                  e.preventDefault();
                  const v = sanitizeDecimalPaste(e.clipboardData.getData('text')).replace(/\..*$/, '');
                  setPalletCount(v);
                }}
                placeholder="Optional"
                sx={inputSx}
              />
            </Box>
          </Box>

          <DividerLine />

          <SectionLabel>Costs</SectionLabel>
          <Typography sx={{ fontSize: 11, color: '#94a3b8', mt: -1, mb: 1 }}>
            Money boxes add sums: type 412.50+38.
          </Typography>

          <Box sx={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {MONEY_FIELDS.map(([key, lab]) => (
              <MoneyField key={key} label={lab} value={money[key]} onChange={setMoneyField(key)} error={parsed[key].error} />
            ))}
          </Box>

          <Box
            sx={{
              mt: 1.25,
              px: 1.5,
              py: 1,
              bgcolor: hasCosts ? '#f0fdf4' : '#f8fafc',
              borderRadius: '8px',
              border: `1px solid ${hasCosts ? '#dcfce7' : '#f1f5f9'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 13,
              transition: 'all 200ms ease',
            }}
          >
            <Typography sx={{ color: '#64748b', fontWeight: 500, fontSize: 12 }}>Total Cost</Typography>
            <Typography
              data-testid="create-po-total"
              sx={{
                fontWeight: 700,
                color: hasCosts ? '#2e7d32' : '#cbd5e1',
                fontVariantNumeric: 'tabular-nums',
                fontSize: 14,
              }}
            >
              $
              {totalCost.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Typography>
          </Box>

          {marginPct != null ? (
            <Box
              sx={{
                mt: 1,
                px: 1.5,
                py: 1,
                bgcolor: '#f8fafc',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 12,
                color: '#64748b',
              }}
              aria-hidden
            >
              <Typography sx={{ fontWeight: 500 }}>Est. Margin</Typography>
              <Typography
                sx={{
                  fontWeight: 700,
                  fontSize: 13,
                  color: marginPct > 50 ? '#2e7d32' : '#0f172a',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {marginPct.toFixed(1)}%
                <Box component="span" sx={{ fontWeight: 400, color: '#94a3b8', ml: 0.75, fontSize: 11 }}>
                  (retail - cost) / retail
                </Box>
              </Typography>
            </Box>
          ) : null}

          <Box sx={{ height: 4 }} />
        </Box>

        <Box
          sx={{
            px: 3,
            py: 1.75,
            borderTop: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            flexShrink: 0,
            bgcolor: 'white',
          }}
        >
          <Button
            type="button"
            tabIndex={-1}
            onClick={onClose}
            sx={{
              py: '9px',
              px: 2,
              borderRadius: '8px',
              fontSize: 13,
              fontWeight: 500,
              textTransform: 'none',
              border: '1px solid #e2e8f0',
              bgcolor: 'white',
              color: '#64748b',
              '&:hover': { borderColor: '#cbd5e1', color: '#334155', bgcolor: 'white' },
            }}
          >
            Cancel
          </Button>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {/* Create is the form's submit button, so Enter means Create. */}
            <Button
              type="button"
              disabled={!canSubmit || busy}
              onClick={() => void submit(true)}
              startIcon={<OpenInNew sx={{ fontSize: 13 }} />}
              sx={{
                py: '9px',
                px: 2,
                borderRadius: '8px',
                fontSize: 13,
                fontWeight: 500,
                textTransform: 'none',
                border: `1px solid ${canSubmit && !busy ? '#e2e8f0' : '#f1f5f9'}`,
                bgcolor: 'white',
                color: canSubmit && !busy ? '#334155' : '#cbd5e1',
                '&:hover': {
                  bgcolor: 'white',
                  borderColor: canSubmit && !busy ? '#0f172a' : '#f1f5f9',
                },
              }}
            >
              Create & Open
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit || busy}
              sx={{
                py: '9px',
                px: 2.5,
                borderRadius: '8px',
                fontSize: 13,
                fontWeight: 600,
                textTransform: 'none',
                border: 'none',
                bgcolor: canSubmit && !busy ? '#0f172a' : '#e2e8f0',
                color: canSubmit && !busy ? 'white' : '#94a3b8',
                minWidth: 120,
                '&:hover': {
                  bgcolor: canSubmit && !busy ? '#1e293b' : '#e2e8f0',
                },
              }}
            >
              {busy ? <CircularProgress size={22} color="inherit" /> : 'Create'}
            </Button>
          </Box>
        </Box>
      </Box>
    </Dialog>
  );
}

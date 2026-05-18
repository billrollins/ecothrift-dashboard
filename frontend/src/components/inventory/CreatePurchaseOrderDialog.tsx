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
import Close from '@mui/icons-material/Close';
import ExpandMore from '@mui/icons-material/ExpandMore';
import OpenInNew from '@mui/icons-material/OpenInNew';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useCreatePurchaseOrder, useVendors } from '../../hooks/useInventory';
import type { PurchaseOrderCondition, Vendor } from '../../types/inventory.types';
import { isPurchaseOrderDashboardVendorName } from '../../constants/purchaseOrdersDashboard';
import {
  preventWheelChangeNumber,
  sanitizeDecimalPaste,
  selectInputContentsOnFocus,
} from '../../utils/formInputs';

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
}: {
  vendors: Vendor[];
  value: Vendor | null;
  onChange: (v: Vendor | null) => void;
  onPick: () => void;
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
            {value.name}
            <Typography component="span" sx={{ color: '#94a3b8', fontSize: 12 }}>
              {value.code}
            </Typography>
          </Box>
        ) : (
          'Select vendor...'
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
              width: panelWidth,
              maxWidth: '100%',
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
    </Box>
  );
}

export interface CreatePurchaseOrderDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function CreatePurchaseOrderDialog({ open, onClose }: CreatePurchaseOrderDialogProps) {
  const navigate = useNavigate();
  const createOrder = useCreatePurchaseOrder();
  const { data: vendorsData } = useVendors();

  const vendorOptions = useMemo(
    () => (vendorsData?.results ?? []).filter((v) => isPurchaseOrderDashboardVendorName(v.name)),
    [vendorsData?.results],
  );

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [orderNumber, setOrderNumber] = useState('');
  const [orderedDate, setOrderedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [description, setDescription] = useState('');
  const [condition, setCondition] = useState<PurchaseOrderCondition | ''>('');
  const [itemCount, setItemCount] = useState('');
  const [palletCount, setPalletCount] = useState('');
  const [retailValue, setRetailValue] = useState('');
  const [purchaseCost, setPurchaseCost] = useState('');
  const [fees, setFees] = useState('');
  const [shippingCost, setShippingCost] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const orderNumberRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setSubmitError(null);
    const id = window.setTimeout(() => {
      const el = document.querySelector(
        '[data-create-po-vendor-trigger="true"]',
      ) as HTMLElement | null;
      el?.focus?.();
    }, 100);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setVendor(null);
      setOrderNumber('');
      setOrderedDate(format(new Date(), 'yyyy-MM-dd'));
      setExpectedDelivery('');
      setDescription('');
      setCondition('');
      setItemCount('');
      setPalletCount('');
      setRetailValue('');
      setPurchaseCost('');
      setFees('');
      setShippingCost('');
      setSubmitError(null);
    }
  }, [open]);

  const purchaseN = Number.parseFloat(purchaseCost) || 0;
  const feesN = Number.parseFloat(fees) || 0;
  const shipN = Number.parseFloat(shippingCost) || 0;
  const totalCost = purchaseN + feesN + shipN;
  const hasCosts = totalCost > 0;
  const retailN = Number.parseFloat(retailValue) || 0;
  const marginPct =
    hasCosts && retailN > 0 ? ((retailN - totalCost) / retailN) * 100 : null;

  const canSubmit = Boolean(vendor && orderNumber.trim().length > 0);

  const focusOrderNumber = () => {
    requestAnimationFrame(() => orderNumberRef.current?.focus());
  };

  const buildPayload = (): Record<string, unknown> => {
    if (!vendor) throw new Error('Vendor required');
    const payload: Record<string, unknown> = {
      vendor: vendor.id,
      order_number: orderNumber.trim(),
    };
    if (orderedDate) payload.ordered_date = orderedDate;
    if (expectedDelivery.trim()) payload.expected_delivery = expectedDelivery.trim();
    if (description.trim()) payload.description = description.trim();
    if (condition) payload.condition = condition;
    if (itemCount.trim()) payload.item_count = Number.parseInt(itemCount, 10);
    if (palletCount.trim()) {
      const n = Number.parseInt(palletCount, 10);
      if (Number.isFinite(n) && n >= 0) payload.pallet_count = n;
    }
    if (retailValue.trim()) payload.retail_value = retailValue.trim();
    if (purchaseCost.trim()) payload.purchase_cost = purchaseCost.trim();
    if (shippingCost.trim()) payload.shipping_cost = shippingCost.trim();
    if (fees.trim()) payload.fees = fees.trim();
    return payload;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || createOrder.isPending) return;
    setSubmitError(null);
    try {
      const payload = buildPayload();
      const created = await createOrder.mutateAsync(payload);
      onClose();
      navigate(`/inventory/orders/${created.id}`);
    } catch (err) {
      setSubmitError(orderCreateErrorMessage(err));
    }
  };

  const handlePasteCurrency =
    (setter: (v: string) => void) => (ev: React.ClipboardEvent<HTMLInputElement>) => {
      ev.preventDefault();
      setter(sanitizeDecimalPaste(ev.clipboardData.getData('text')));
    };

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
            width: 500,
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

          <VendorSelect
            vendors={vendorOptions}
            value={vendor}
            onChange={setVendor}
            onPick={focusOrderNumber}
          />

          <Box sx={{ mt: 1.75 }}>
            <Typography component="label" sx={labelSx}>
              Order Number <Box component="span" sx={{ color: '#ef4444' }}>*</Box>
            </Typography>
            <Box
              component="input"
              ref={orderNumberRef}
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              onBlur={(e) => setOrderNumber(e.target.value.replace(/\r?\n/g, ' ').trim())}
              onFocus={selectInputContentsOnFocus}
              placeholder="e.g. AMZON-OQL-CCP4"
              sx={{
                ...inputSx,
                fontFamily: '"DM Mono", "SF Mono", ui-monospace, monospace',
                fontSize: 13,
                letterSpacing: '0.02em',
              }}
            />
          </Box>

          <Box sx={{ display: 'flex', gap: '10px', mt: 1.75 }}>
            <Box sx={{ flex: 1 }}>
              <Typography component="label" sx={labelSx}>
                Ordered Date
              </Typography>
              <Box
                component="input"
                type="date"
                value={orderedDate}
                onChange={(e) => setOrderedDate(e.target.value)}
                onFocus={selectInputContentsOnFocus}
                sx={inputSx}
              />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography component="label" sx={labelSx}>
                Expected Delivery
              </Typography>
              <Box
                component="input"
                type="date"
                value={expectedDelivery}
                onChange={(e) => setExpectedDelivery(e.target.value)}
                onFocus={selectInputContentsOnFocus}
                sx={inputSx}
              />
            </Box>
          </Box>

          <DividerLine />

          <SectionLabel>Details</SectionLabel>

          <Box>
            <Typography component="label" sx={labelSx}>
              Description
            </Typography>
            <Box
              component="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onFocus={selectInputContentsOnFocus}
              placeholder="e.g. 24 Pallets of FBA Home Improvement"
              maxLength={500}
              sx={inputSx}
            />
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

          <Box sx={{ mt: 1.75 }}>
            <Typography component="label" sx={labelSx}>
              Retail Value
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
                value={retailValue}
                onChange={(e) => setRetailValue(e.target.value)}
                onFocus={selectInputContentsOnFocus}
                onWheel={preventWheelChangeNumber}
                onPaste={handlePasteCurrency(setRetailValue)}
                placeholder="0.00"
                sx={{
                  ...inputSx,
                  pl: '22px',
                  fontVariantNumeric: 'tabular-nums',
                }}
              />
            </Box>
          </Box>

          <DividerLine />

          <SectionLabel>Costs</SectionLabel>

          <Box sx={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {(
              [
                ['Purchase Cost', purchaseCost, setPurchaseCost] as const,
                ['Fees', fees, setFees] as const,
                ['Shipping', shippingCost, setShippingCost] as const,
              ] as const
            ).map(([lab, val, setVal]) => (
              <Box key={lab} sx={{ flex: 1, minWidth: 90 }}>
                <Typography component="label" sx={labelSx}>
                  {lab}
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
                    value={val}
                    onChange={(e) => setVal(e.target.value)}
                    onFocus={selectInputContentsOnFocus}
                    onWheel={preventWheelChangeNumber}
                    onPaste={handlePasteCurrency(setVal)}
                    placeholder="0.00"
                    sx={{
                      ...inputSx,
                      pl: '22px',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  />
                </Box>
              </Box>
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
            aria-hidden
          >
            <Typography sx={{ color: '#64748b', fontWeight: 500, fontSize: 12 }}>Total Cost</Typography>
            <Typography
              sx={{
                fontWeight: 700,
                color: hasCosts ? '#15803d' : '#cbd5e1',
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
                  color: marginPct > 50 ? '#15803d' : '#0f172a',
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
            <Button
              type="submit"
              disabled={!canSubmit || createOrder.isPending}
              startIcon={<OpenInNew sx={{ fontSize: 13 }} />}
              sx={{
                py: '9px',
                px: 2,
                borderRadius: '8px',
                fontSize: 13,
                fontWeight: 500,
                textTransform: 'none',
                border: `1px solid ${canSubmit && !createOrder.isPending ? '#e2e8f0' : '#f1f5f9'}`,
                bgcolor: 'white',
                color: canSubmit && !createOrder.isPending ? '#334155' : '#cbd5e1',
                '&:hover': {
                  bgcolor: 'white',
                  borderColor: canSubmit && !createOrder.isPending ? '#0f172a' : '#f1f5f9',
                },
              }}
            >
              Create & Open
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit || createOrder.isPending}
              sx={{
                py: '9px',
                px: 2.5,
                borderRadius: '8px',
                fontSize: 13,
                fontWeight: 600,
                textTransform: 'none',
                border: 'none',
                bgcolor: canSubmit && !createOrder.isPending ? '#0f172a' : '#e2e8f0',
                color: canSubmit && !createOrder.isPending ? 'white' : '#94a3b8',
                minWidth: 120,
                '&:hover': {
                  bgcolor: canSubmit && !createOrder.isPending ? '#1e293b' : '#e2e8f0',
                },
              }}
            >
              {createOrder.isPending ? <CircularProgress size={22} color="inherit" /> : 'Create'}
            </Button>
          </Box>
        </Box>
      </Box>
    </Dialog>
  );
}

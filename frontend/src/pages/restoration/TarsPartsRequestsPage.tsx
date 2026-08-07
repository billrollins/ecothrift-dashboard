import OpenInNew from '@mui/icons-material/OpenInNew';
import {
  Autocomplete,
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
  InputAdornment,
  Link,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/common/PageHeader';
import {
  useReceiveRestorationPartsRequest,
  useRecordRestorationPartsOrder,
  useRestorationPartsRequestDetail,
  useRestorationPartsRequests,
  useSubmitRestorationPartsRequest,
} from '../../hooks/useRestorationBench';
import type {
  RestorationPartsRequestDTO,
  RestorationPartsRequestSiteDTO,
  RestorationPartsRequestLineDTO,
  RestorationPartsOrderDTO,
  RestorationPartsOrderLineDTO,
} from '../../types/inventory.types';
import { TarsGradeDirectionCards } from './tars/TarsGradeDirectionCards';
import { parseMoney as parseMoneyStr } from './tars/tarsMoney';
import { fmtUsd } from './tars/tarsProfit';
import { absoluteUrl, urlDomain } from './tars/tarsUrl';
import type { TarsGradeDirectionRow } from './tars/tarsWorkTypes';

function fmtUsdSafe(value: string | number | null | undefined): string {
  if (value == null || value === '') return '-';
  const n = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? fmtUsd(n) : String(value);
}

/** Returns an error message for a money field, or null when the value is valid. */
function moneyFieldError(raw: string, required = false): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return required ? 'Required' : null;
  const n = Number.parseFloat(trimmed);
  if (!Number.isFinite(n)) return 'Enter a number';
  if (n < 0) return 'Must be 0 or more';
  return null;
}

function EvalSnapshotCards({ snapshot }: { snapshot: Record<string, unknown> | null }) {
  const directions: TarsGradeDirectionRow[] = snapshot && Array.isArray(snapshot.directions)
    ? (snapshot.directions as TarsGradeDirectionRow[])
    : snapshot && typeof snapshot.grade === 'string'
      ? [snapshot as unknown as TarsGradeDirectionRow]
      : [];
  if (directions.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No eval snapshot stored.
      </Typography>
    );
  }
  return <TarsGradeDirectionCards directions={directions} readOnly />;
}

const APPROVE_LINE_GRID = 'minmax(0, 1.7fr) 44px minmax(0, 1.1fr) 64px 84px';

function lineEstimate(line: RestorationPartsRequestLineDTO): number {
  return parseMoneyStr(line.unit_price_estimate);
}

function lineActualStored(line: RestorationPartsRequestLineDTO): number {
  return parseMoneyStr(line.unit_price_actual);
}

function OrderRecordDialog({
  open,
  request,
  siteId,
  siteName,
  lines,
  onClose,
  onSaved,
}: {
  open: boolean;
  request: RestorationPartsRequestDTO;
  siteId: number | null;
  siteName: string;
  lines: RestorationPartsRequestLineDTO[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const recordOrder = useRecordRestorationPartsOrder();
  const [poNumber, setPoNumber] = useState('');
  const [supplierUrl, setSupplierUrl] = useState('');
  const [actuals, setActuals] = useState<Record<number, string>>({});
  const [subtotal, setSubtotal] = useState('');
  const [shipping, setShipping] = useState('0');
  const [tax, setTax] = useState('0');
  const [fees, setFees] = useState('0');
  const [shipTo, setShipTo] = useState('');
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [notes, setNotes] = useState('');

  const domainOptions = useMemo(() => {
    const set = new Set<string>();
    for (const l of lines) {
      const d = urlDomain(l.url);
      if (d) set.add(d);
    }
    return Array.from(set);
  }, [lines]);

  const selectedVendorDomain = urlDomain(supplierUrl);

  useEffect(() => {
    if (!open) return;
    const initActuals: Record<number, string> = {};
    let sum = 0;
    for (const l of lines) {
      const stored = lineActualStored(l);
      const est = lineEstimate(l);
      const val = stored > 0 ? stored : est;
      initActuals[l.id] = val ? String(val) : '';
      sum += val * l.qty;
    }
    setActuals(initActuals);
    setSubtotal(sum ? sum.toFixed(2) : '');
    setPoNumber('');
    setSupplierUrl(domainOptions[0] ?? '');
    setShipping('0');
    setTax('0');
    setFees('0');
    setShipTo('');
    setExpectedDelivery('');
    setNotes('');
  }, [open, lines, domainOptions]);

  const actualNum = (id: number) => parseMoneyStr(actuals[id] ?? '');
  const computedSubtotal = useMemo(
    () => lines.reduce((s, l) => s + actualNum(l.id) * l.qty, 0),
    [lines, actuals],
  );

  const setActual = (id: number, v: string) => {
    setActuals((prev) => ({ ...prev, [id]: v }));
    setSubtotal(
      lines
        .reduce((s, l) => s + (l.id === id ? parseMoneyStr(v) : actualNum(l.id)) * l.qty, 0)
        .toFixed(2),
    );
  };

  const subtotalError = moneyFieldError(subtotal, true);
  const shippingError = moneyFieldError(shipping);
  const taxError = moneyFieldError(tax);
  const feesError = moneyFieldError(fees);
  const hasMoneyError = Boolean(subtotalError || shippingError || taxError || feesError);

  const handleSave = async () => {
    if (hasMoneyError) {
      enqueueSnackbar('Fix the highlighted amounts before approving.', { variant: 'warning' });
      return;
    }
    try {
      await recordOrder.mutateAsync({
        requestId: request.id,
        payload: {
          site_id: siteId,
          po_number: poNumber.trim(),
          supplier_name: siteName,
          supplier_url: supplierUrl.trim(),
          subtotal,
          shipping,
          tax,
          fees,
          ship_to_address: shipTo,
          expected_delivery: expectedDelivery || null,
          line_ids: lines.map((l) => l.id),
          notes,
          lines: lines.map((l) => ({ id: l.id, unit_cost: actuals[l.id] ?? '' })),
        },
      });
      enqueueSnackbar('Request approved', { variant: 'success' });
      onSaved();
      onClose();
    } catch (err) {
      enqueueSnackbar(err instanceof Error ? err.message : 'Failed to approve request', { variant: 'error' });
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Approve request - {siteName}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 0.5 }}>
          <Autocomplete
            freeSolo
            options={domainOptions}
            value={supplierUrl}
            onInputChange={(_, v) => setSupplierUrl(v)}
            renderInput={(params) => (
              <TextField {...params} size="small" label="Vendor website" placeholder="amazon.com or full URL" />
            )}
          />

          <Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: APPROVE_LINE_GRID, gap: 0.75, px: 0.25, mb: 0.5 }}>
              <Typography variant="caption" fontWeight={800} color="text.secondary">Part</Typography>
              <Typography variant="caption" fontWeight={800} color="text.secondary">Qty</Typography>
              <Typography variant="caption" fontWeight={800} color="text.secondary">Link</Typography>
              <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textAlign: 'right' }}>Est</Typography>
              <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textAlign: 'right' }}>Actual</Typography>
            </Box>
            <Stack spacing={0.5}>
              {lines.map((line) => {
                const est = lineEstimate(line);
                const act = actualNum(line.id);
                const mismatch = act > 0 && est > 0 && act !== est;
                const wrongVendor =
                  !!selectedVendorDomain && !!line.url && urlDomain(line.url) !== selectedVendorDomain;
                return (
                  <Box
                    key={line.id}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: APPROVE_LINE_GRID,
                      gap: 0.75,
                      alignItems: 'center',
                      px: 0.75,
                      py: 0.5,
                      borderRadius: 1,
                      border: '1px solid #e2e8f0',
                      bgcolor: '#fff',
                    }}
                  >
                    <Box minWidth={0}>
                      <Typography variant="body2" fontWeight={700} noWrap>
                        {line.description || line.part_number || 'Part'}
                      </Typography>
                      <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
                        {mismatch ?
                          <Chip size="small" color="warning" label="cost differs" sx={{ height: 18, fontSize: 10 }} />
                        : null}
                        {wrongVendor ?
                          <Chip size="small" color="error" label="wrong vendor?" sx={{ height: 18, fontSize: 10 }} />
                        : null}
                      </Stack>
                    </Box>
                    <Typography variant="body2" color="text.secondary">{line.qty}</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {line.url ? urlDomain(line.url) : '-'}
                      </Typography>
                      {line.url ?
                        <Link href={absoluteUrl(line.url)} target="_blank" rel="noopener noreferrer" sx={{ display: 'flex', lineHeight: 0, flexShrink: 0 }}>
                          <OpenInNew sx={{ fontSize: 14 }} />
                        </Link>
                      : null}
                    </Box>
                    <Typography variant="body2" fontFamily="monospace" sx={{ textAlign: 'right' }}>
                      {fmtUsdSafe(est)}
                    </Typography>
                    <TextField
                      size="small"
                      type="number"
                      value={actuals[line.id] ?? ''}
                      onChange={(e) => setActual(line.id, e.target.value)}
                      slotProps={{
                        htmlInput: { min: 0, step: 0.01, style: { textAlign: 'right' } },
                        input: { startAdornment: <InputAdornment position="start">$</InputAdornment> },
                      }}
                      sx={{ '& .MuiInputBase-input': { py: 0.5, fontSize: 13 } }}
                    />
                  </Box>
                );
              })}
            </Stack>
          </Box>

          <TextField
            size="small"
            label={`Subtotal $ (computed ${fmtUsd(computedSubtotal)})`}
            required
            type="number"
            value={subtotal}
            onChange={(e) => setSubtotal(e.target.value)}
            error={subtotalError != null}
            helperText={subtotalError}
          />
          <Stack direction="row" spacing={1}>
            <TextField
              size="small"
              label="Shipping"
              type="number"
              value={shipping}
              onChange={(e) => setShipping(e.target.value)}
              error={shippingError != null}
              helperText={shippingError}
              fullWidth
            />
            <TextField
              size="small"
              label="Tax"
              type="number"
              value={tax}
              onChange={(e) => setTax(e.target.value)}
              error={taxError != null}
              helperText={taxError}
              fullWidth
            />
            <TextField
              size="small"
              label="Fees"
              type="number"
              value={fees}
              onChange={(e) => setFees(e.target.value)}
              error={feesError != null}
              helperText={feesError}
              fullWidth
            />
          </Stack>
          <TextField size="small" label="PO number (optional)" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
          <TextField size="small" label="Ship-to address" multiline minRows={2} value={shipTo} onChange={(e) => setShipTo(e.target.value)} />
          <TextField
            size="small"
            label="Expected delivery"
            type="date"
            value={expectedDelivery}
            onChange={(e) => setExpectedDelivery(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField size="small" label="Notes" multiline minRows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={recordOrder.isPending || hasMoneyError} onClick={() => void handleSave()}>
          Approve
        </Button>
      </DialogActions>
    </Dialog>
  );
}

const DETAIL_LINE_GRID = 'minmax(0, 1.7fr) 40px minmax(0, 1.1fr) 60px 70px';

function RequestDetailPanel({ requestId, onClose }: { requestId: number; onClose: () => void }) {
  const { enqueueSnackbar } = useSnackbar();
  const navigate = useNavigate();
  const { data: request, isLoading } = useRestorationPartsRequestDetail(requestId);
  const submitRequest = useSubmitRestorationPartsRequest();
  const receiveRequest = useReceiveRestorationPartsRequest();
  const [orderDialog, setOrderDialog] = useState<{
    siteId: number;
    siteName: string;
    lines: RestorationPartsRequestLineDTO[];
  } | null>(null);

  if (isLoading || !request) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  const requestLineById = new Map<number, RestorationPartsRequestLineDTO>();
  for (const site of request.sites) {
    for (const l of site.lines) requestLineById.set(l.id, l);
  }

  return (
    <Stack spacing={1.25}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
        <Box>
          <Typography variant="h6" fontWeight={900}>
            {request.job_name}
          </Typography>
          <Typography variant="body2" color="text.secondary" fontFamily="monospace">
            {request.job_sku ?? `Job #${request.job}`}
          </Typography>
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.75 }}>
            <Chip size="small" label={request.status} />
            {request.selected_grade ?
              <Chip size="small" color="primary" variant="outlined" label={`Grade: ${request.selected_grade}`} sx={{ fontWeight: 700 }} />
            : null}
          </Stack>
        </Box>
        <Stack direction="row" spacing={0.5}>
          {request.status === 'draft' ?
            <Button
              size="small"
              variant="contained"
              disabled={submitRequest.isPending}
              onClick={async () => {
                try {
                  await submitRequest.mutateAsync(request.id);
                  enqueueSnackbar('Request submitted', { variant: 'success' });
                } catch (err) {
                  enqueueSnackbar(err instanceof Error ? err.message : 'Submit failed', { variant: 'error' });
                }
              }}
            >
              Submit request
            </Button>
          : null}
          {request.status === 'ordered' ?
            <Button
              size="small"
              variant="contained"
              color="success"
              disabled={receiveRequest.isPending}
              onClick={async () => {
                try {
                  await receiveRequest.mutateAsync(request.id);
                  enqueueSnackbar('Marked received', { variant: 'success' });
                } catch (err) {
                  enqueueSnackbar(err instanceof Error ? err.message : 'Receive failed', { variant: 'error' });
                }
              }}
            >
              Mark received
            </Button>
          : null}
          <Button size="small" variant="outlined" onClick={() => navigate('/restoration/tars', { state: { selectJobId: request.job } })}>
            Open in TARS
          </Button>
          <Button size="small" onClick={onClose}>
            Close
          </Button>
        </Stack>
      </Stack>

      <Divider />

      <Typography variant="overline" fontWeight={800} color="text.secondary">
        Eval cards at request time
      </Typography>
      <EvalSnapshotCards snapshot={request.eval_snapshot} />

      <Typography variant="overline" fontWeight={800} color="text.secondary">
        Parts by supplier / site
      </Typography>
      {request.sites.length === 0 ?
        <Typography variant="body2" color="text.secondary">No parts lines yet.</Typography>
      : request.sites.map((site: RestorationPartsRequestSiteDTO) => (
          <Card key={site.id} variant="outlined">
            <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.75}>
                <Typography variant="subtitle2" fontWeight={900}>
                  {site.supplier_name || 'Unassigned supplier'}
                </Typography>
                {request.status === 'submitted' || request.status === 'draft' ?
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() =>
                      setOrderDialog({
                        siteId: site.id,
                        siteName: site.supplier_name || 'Supplier',
                        lines: site.lines,
                      })
                    }
                    disabled={site.lines.length === 0}
                  >
                    Approve
                  </Button>
                : null}
              </Stack>

              <Box sx={{ display: 'grid', gridTemplateColumns: DETAIL_LINE_GRID, gap: 0.75, px: 0.25, mb: 0.25 }}>
                <Typography variant="caption" fontWeight={800} color="text.secondary">Part</Typography>
                <Typography variant="caption" fontWeight={800} color="text.secondary">Qty</Typography>
                <Typography variant="caption" fontWeight={800} color="text.secondary">Link</Typography>
                <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textAlign: 'right' }}>Est</Typography>
                <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textAlign: 'right' }}>Actual</Typography>
              </Box>
              {site.lines.map((line: RestorationPartsRequestLineDTO) => {
                const est = lineEstimate(line);
                const act = lineActualStored(line);
                const mismatch = act > 0 && est > 0 && act !== est;
                return (
                  <Box
                    key={line.id}
                    sx={{ display: 'grid', gridTemplateColumns: DETAIL_LINE_GRID, gap: 0.75, alignItems: 'center', py: 0.4, borderTop: '1px solid #e2e8f0' }}
                  >
                    <Box minWidth={0}>
                      <Typography variant="body2" fontWeight={700} noWrap>
                        {line.description || line.part_number || 'Part'}
                      </Typography>
                      <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Typography variant="caption" color="text.secondary">{line.status}</Typography>
                        {mismatch ?
                          <Chip size="small" color="warning" label="cost differs" sx={{ height: 18, fontSize: 10 }} />
                        : null}
                      </Stack>
                    </Box>
                    <Typography variant="body2" color="text.secondary">{line.qty}</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {line.url ? urlDomain(line.url) : '-'}
                      </Typography>
                      {line.url ?
                        <Link href={absoluteUrl(line.url)} target="_blank" rel="noopener noreferrer" sx={{ display: 'flex', lineHeight: 0, flexShrink: 0 }}>
                          <OpenInNew sx={{ fontSize: 14 }} />
                        </Link>
                      : null}
                    </Box>
                    <Typography variant="body2" fontFamily="monospace" sx={{ textAlign: 'right' }}>{fmtUsdSafe(est)}</Typography>
                    <Typography variant="body2" fontFamily="monospace" sx={{ textAlign: 'right', color: mismatch ? 'warning.main' : undefined, fontWeight: mismatch ? 800 : 400 }}>
                      {fmtUsdSafe(act)}
                    </Typography>
                  </Box>
                );
              })}
            </CardContent>
          </Card>
        ))
      }

      {request.orders.length > 0 ?
        <>
          <Typography variant="overline" fontWeight={800} color="text.secondary">
            Orders
          </Typography>
          {request.orders.map((order: RestorationPartsOrderDTO) => (
            <Card key={order.id} variant="outlined" sx={{ bgcolor: '#f8fafc' }}>
              <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
                  <Typography variant="subtitle2" fontWeight={900}>
                    PO {order.po_number || '-'} - {order.supplier_name}
                  </Typography>
                  {order.supplier_url ?
                    <Link href={absoluteUrl(order.supplier_url)} target="_blank" rel="noopener noreferrer" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: 12 }}>
                      {urlDomain(order.supplier_url)} <OpenInNew sx={{ fontSize: 13 }} />
                    </Link>
                  : null}
                </Stack>
                <Typography variant="caption" color="text.secondary" display="block">
                  Subtotal {fmtUsdSafe(order.subtotal)} · Ship {fmtUsdSafe(order.shipping)} · Tax {fmtUsdSafe(order.tax)} · Fees {fmtUsdSafe(order.fees)} · Total {fmtUsdSafe(order.total)}
                </Typography>
                {order.ship_to_address ?
                  <Typography variant="caption" display="block">Ship to: {order.ship_to_address}</Typography>
                : null}
                {order.expected_delivery ?
                  <Typography variant="caption" display="block">Expected: {order.expected_delivery}</Typography>
                : null}

                {order.lines.length > 0 ?
                  <Box sx={{ mt: 0.75 }}>
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.7fr) 40px 70px 80px', gap: 0.75, px: 0.25, mb: 0.25 }}>
                      <Typography variant="caption" fontWeight={800} color="text.secondary">Part</Typography>
                      <Typography variant="caption" fontWeight={800} color="text.secondary">Qty</Typography>
                      <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textAlign: 'right' }}>Unit</Typography>
                      <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textAlign: 'right' }}>Total</Typography>
                    </Box>
                    {order.lines.map((ol: RestorationPartsOrderLineDTO) => {
                      const rl = requestLineById.get(ol.request_line_id);
                      return (
                        <Box key={ol.id} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.7fr) 40px 70px 80px', gap: 0.75, alignItems: 'center', py: 0.35, borderTop: '1px solid #e2e8f0' }}>
                          <Box minWidth={0}>
                            <Typography variant="body2" noWrap>{rl?.description || rl?.part_number || 'Part'}</Typography>
                            {rl?.url ?
                              <Link href={absoluteUrl(rl.url)} target="_blank" rel="noopener noreferrer" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, fontSize: 11, color: 'text.secondary' }}>
                                {urlDomain(rl.url)} <OpenInNew sx={{ fontSize: 12 }} />
                              </Link>
                            : null}
                          </Box>
                          <Typography variant="body2" color="text.secondary">{ol.qty}</Typography>
                          <Typography variant="body2" fontFamily="monospace" sx={{ textAlign: 'right' }}>{fmtUsdSafe(ol.unit_cost)}</Typography>
                          <Typography variant="body2" fontFamily="monospace" sx={{ textAlign: 'right', fontWeight: 800 }}>{fmtUsdSafe(ol.line_total)}</Typography>
                        </Box>
                      );
                    })}
                  </Box>
                : null}
              </CardContent>
            </Card>
          ))}
        </>
      : null}

      {orderDialog ?
        <OrderRecordDialog
          open
          request={request}
          siteId={orderDialog.siteId}
          siteName={orderDialog.siteName}
          lines={orderDialog.lines}
          onClose={() => setOrderDialog(null)}
          onSaved={() => setOrderDialog(null)}
        />
      : null}
    </Stack>
  );
}

/** Manager view for restoration parts requests. */
export default function TarsPartsRequestsPage() {
  const { data: requests = [], isLoading } = useRestorationPartsRequests();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [tab, setTab] = useState<'open' | 'received'>('open');

  const openRequests = useMemo(
    () =>
      requests.filter(
        (r: RestorationPartsRequestDTO) =>
          r.status === 'draft' || r.status === 'submitted' || r.status === 'ordered',
      ),
    [requests],
  );
  const receivedRequests = useMemo(
    () => requests.filter((r: RestorationPartsRequestDTO) => r.status === 'received'),
    [requests],
  );
  const listed = tab === 'open' ? openRequests : receivedRequests;

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ mb: 1.25 }}>
        <PageHeader title="Parts requests" subtitle="Review eval cards, approve spend, and track received parts" />
      </Box>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '280px minmax(0, 1fr)' },
          gap: 1,
        }}
      >
        <Card variant="outlined" sx={{ overflowY: 'auto' }}>
          <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
            <Tabs
              value={tab}
              onChange={(_, v) => {
                setTab(v as 'open' | 'received');
                setSelectedId(null);
              }}
              variant="fullWidth"
              sx={{ minHeight: 36, mb: 0.75 }}
            >
              <Tab value="open" label={`Open (${openRequests.length})`} sx={{ minHeight: 36, fontWeight: 700 }} />
              <Tab value="received" label={`Received (${receivedRequests.length})`} sx={{ minHeight: 36, fontWeight: 700 }} />
            </Tabs>
            {isLoading ?
              <CircularProgress size={24} />
            : listed.length === 0 ?
              <Typography variant="body2" color="text.secondary" py={2} textAlign="center">
                {tab === 'open' ? 'No open requests.' : 'No received requests.'}
              </Typography>
            : listed.map((req: RestorationPartsRequestDTO) => (
                <Button
                  key={req.id}
                  fullWidth
                  variant={selectedId === req.id ? 'outlined' : 'text'}
                  onClick={() => setSelectedId(req.id)}
                  sx={{ justifyContent: 'flex-start', textAlign: 'left', mb: 0.5 }}
                >
                  <Box minWidth={0}>
                    <Typography variant="body2" fontWeight={700} noWrap>
                      {req.job_name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" fontFamily="monospace" noWrap display="block">
                      {req.job_sku ?? `#${req.job}`} · {req.status}
                    </Typography>
                  </Box>
                </Button>
              ))
            }
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ overflowY: 'auto' }}>
          <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
            {selectedId == null ?
              <Typography variant="body2" color="text.secondary" py={4} textAlign="center">
                Select a parts request to review.
              </Typography>
            : <RequestDetailPanel requestId={selectedId} onClose={() => setSelectedId(null)} />
            }
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}

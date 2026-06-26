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
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useMemo, useState } from 'react';
import { PageHeader } from '../../components/common/PageHeader';
import {
  useRecordRestorationPartsOrder,
  useRestorationPartsRequestDetail,
  useRestorationPartsRequests,
  useSubmitRestorationPartsRequest,
} from '../../hooks/useRestorationBench';
import type { RestorationPartsRequestDTO, RestorationPartsRequestSiteDTO, RestorationPartsRequestLineDTO, RestorationPartsOrderDTO } from '../../types/inventory.types';
import { TarsGradeDirectionCards } from './tars/TarsGradeDirectionCards';
import { fmtUsd } from './tars/tarsProfit';
import type { TarsGradeDirectionRow } from './tars/tarsWorkTypes';

function fmtUsdSafe(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—';
  const n = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? fmtUsd(n) : String(value);
}

function EvalSnapshotCards({ snapshot }: { snapshot: Record<string, unknown> }) {
  const directions = (snapshot.directions as TarsGradeDirectionRow[] | undefined) ?? [];
  if (directions.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No eval snapshot stored.
      </Typography>
    );
  }
  return <TarsGradeDirectionCards directions={directions} readOnly />;
}

function OrderRecordDialog({
  open,
  request,
  siteId,
  siteName,
  lineIds,
  onClose,
  onSaved,
}: {
  open: boolean;
  request: RestorationPartsRequestDTO;
  siteId: number | null;
  siteName: string;
  lineIds: number[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const recordOrder = useRecordRestorationPartsOrder();
  const [poNumber, setPoNumber] = useState('');
  const [subtotal, setSubtotal] = useState('');
  const [shipping, setShipping] = useState('0');
  const [tax, setTax] = useState('0');
  const [fees, setFees] = useState('0');
  const [shipTo, setShipTo] = useState('');
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [notes, setNotes] = useState('');

  const handleSave = async () => {
    if (!poNumber.trim() || !subtotal.trim()) {
      enqueueSnackbar('PO number and subtotal required', { variant: 'warning' });
      return;
    }
    try {
      await recordOrder.mutateAsync({
        requestId: request.id,
        payload: {
          site_id: siteId,
          po_number: poNumber.trim(),
          supplier_name: siteName,
          subtotal,
          shipping,
          tax,
          fees,
          ship_to_address: shipTo,
          expected_delivery: expectedDelivery || null,
          line_ids: lineIds,
          notes,
        },
      });
      enqueueSnackbar('Order recorded', { variant: 'success' });
      onSaved();
      onClose();
    } catch (err) {
      enqueueSnackbar(err instanceof Error ? err.message : 'Failed to record order', { variant: 'error' });
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Record order — {siteName}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.25} sx={{ pt: 0.5 }}>
          <TextField size="small" label="PO number" required value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
          <TextField size="small" label="Subtotal $" required type="number" value={subtotal} onChange={(e) => setSubtotal(e.target.value)} />
          <Stack direction="row" spacing={1}>
            <TextField size="small" label="Shipping" type="number" value={shipping} onChange={(e) => setShipping(e.target.value)} fullWidth />
            <TextField size="small" label="Tax" type="number" value={tax} onChange={(e) => setTax(e.target.value)} fullWidth />
            <TextField size="small" label="Fees" type="number" value={fees} onChange={(e) => setFees(e.target.value)} fullWidth />
          </Stack>
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
        <Button variant="contained" disabled={recordOrder.isPending} onClick={() => void handleSave()}>
          Save order
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function RequestDetailPanel({
  requestId,
  onClose,
}: {
  requestId: number;
  onClose: () => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const { data: request, isLoading } = useRestorationPartsRequestDetail(requestId);
  const submitRequest = useSubmitRestorationPartsRequest();
  const [orderDialog, setOrderDialog] = useState<{ siteId: number; siteName: string; lineIds: number[] } | null>(null);

  if (isLoading || !request) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <CircularProgress size={28} />
      </Box>
    );
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
          <Chip size="small" label={request.status} sx={{ mt: 0.75 }} />
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
        <Typography variant="body2" color="text.secondary">
          No parts lines yet.
        </Typography>
      : request.sites.map((site: RestorationPartsRequestSiteDTO) => (
          <Card key={site.id} variant="outlined">
            <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.75}>
                <Typography variant="subtitle2" fontWeight={900}>
                  {site.supplier_name || 'Unassigned supplier'}
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() =>
                    setOrderDialog({
                      siteId: site.id,
                      siteName: site.supplier_name || 'Supplier',
                      lineIds: site.lines.map((l: RestorationPartsRequestLineDTO) => l.id),
                    })
                  }
                  disabled={site.lines.length === 0}
                >
                  Record PO
                </Button>
              </Stack>
              {site.lines.map((line: RestorationPartsRequestLineDTO) => (
                <Box key={line.id} sx={{ py: 0.5, borderTop: '1px solid #e2e8f0' }}>
                  <Typography variant="body2" fontWeight={700}>
                    {line.description || line.part_number || 'Part'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Qty {line.qty} · Est {fmtUsdSafe(line.unit_price_estimate)} · Actual {fmtUsdSafe(line.unit_price_actual)} · {line.status}
                  </Typography>
                </Box>
              ))}
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
                <Typography variant="subtitle2" fontWeight={900}>
                  PO {order.po_number} — {order.supplier_name}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  Subtotal {fmtUsdSafe(order.subtotal)} · Ship {fmtUsdSafe(order.shipping)} · Tax {fmtUsdSafe(order.tax)} · Fees {fmtUsdSafe(order.fees)} · Total {fmtUsdSafe(order.total)}
                </Typography>
                {order.ship_to_address ?
                  <Typography variant="caption" display="block">
                    Ship to: {order.ship_to_address}
                  </Typography>
                : null}
                {order.expected_delivery ?
                  <Typography variant="caption" display="block">
                    Expected: {order.expected_delivery}
                  </Typography>
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
          lineIds={orderDialog.lineIds}
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

  const pending = useMemo(
    () => requests.filter((r: RestorationPartsRequestDTO) => r.status === 'submitted' || r.status === 'draft'),
    [requests],
  );

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ mb: 1.25 }}>
        <PageHeader title="Parts requests" subtitle="Review eval cards and record purchase orders" />
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
            <Typography variant="overline" fontWeight={800} color="text.secondary" display="block" mb={0.75}>
              Pending ({pending.length})
            </Typography>
            {isLoading ?
              <CircularProgress size={24} />
            : pending.length === 0 ?
              <Typography variant="body2" color="text.secondary" py={2} textAlign="center">
                No pending requests.
              </Typography>
            : pending.map((req: RestorationPartsRequestDTO) => (
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

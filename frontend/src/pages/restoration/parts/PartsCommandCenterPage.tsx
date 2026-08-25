import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useSnackbar } from 'notistack';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../../components/common/PageHeader';
import { useAuth } from '../../../hooks/useAuth';
import {
  useApproveRestorationPartsOrder,
  useCancelRestorationPartsOrder,
  useDenyRestorationPartsOrder,
  usePurchaseRestorationPartsOrder,
  useReceiveRestorationPartsOrder,
  useResolveCancelRestorationPartsOrder,
  useRestorationPartsOrders,
  useInspectRestorationPartsOrder,
  useReviseRestorationPartsOrderEta,
} from '../../../hooks/useRestorationBench';
import type { RestorationPartsOrderDTO } from '../../../types/inventory.types';
import { restorationBenchPath } from '../restorationRoutes';
import { studio } from '../tars/studio/tarsStudioTheme';
import {
  attentionCounts,
  filterByAttention,
  ordersForLane,
  PARTS_LANES,
  type AttentionKey,
} from './partsBoard';
import {
  groupHistoryByItem,
  sinceForWindow,
  type HistoryItemGroup,
  type HistoryStatusFilter,
  type HistoryWindow,
} from './partsHistory';
import { PartsAttentionStrip } from './PartsAttentionStrip';
import { PartsHistoryPanel } from './PartsHistoryPanel';
import { PAPER } from './partsChrome';
import { PartsLane } from './PartsLane';
import { PartsOrderDrawer } from './PartsOrderDrawer';

function isoDatePlusDays(days: number): string {
  const when = new Date();
  when.setDate(when.getDate() + days);
  const y = when.getFullYear();
  const m = String(when.getMonth() + 1).padStart(2, '0');
  const d = String(when.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function actionError(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return typeof detail === 'string' && detail.trim() ? detail : fallback;
}

export default function PartsCommandCenterPage() {
  const { enqueueSnackbar } = useSnackbar();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canAct = Boolean(user?.is_superuser);
  const [tab, setTab] = useState<'live' | 'history'>('live');
  const [attention, setAttention] = useState<AttentionKey | ''>('');
  const [historyWindow, setHistoryWindow] = useState<HistoryWindow>('90d');
  const [historyStatus, setHistoryStatus] = useState<HistoryStatusFilter>('all');
  const [search, setSearch] = useState('');
  const [openOrder, setOpenOrder] = useState<RestorationPartsOrderDTO | null>(null);
  const [openGroup, setOpenGroup] = useState<HistoryItemGroup | null>(null);
  const [denyOrder, setDenyOrder] = useState<RestorationPartsOrderDTO | null>(null);
  const [denyReason, setDenyReason] = useState('');
  const [purchaseOrder, setPurchaseOrder] = useState<RestorationPartsOrderDTO | null>(null);
  const [deliveryDate, setDeliveryDate] = useState(isoDatePlusDays(7));
  const [etaOrder, setEtaOrder] = useState<RestorationPartsOrderDTO | null>(null);
  const [etaDate, setEtaDate] = useState(isoDatePlusDays(7));
  const [cancelOrder, setCancelOrder] = useState<RestorationPartsOrderDTO | null>(null);
  const [refunded, setRefunded] = useState(false);

  const liveQuery = useRestorationPartsOrders({
    bucket: 'live',
    refetchInterval: tab === 'live' ? 15_000 : false,
  });
  const historySince = sinceForWindow(historyWindow);
  const historyQuery = useRestorationPartsOrders({
    bucket: 'history',
    since: historySince,
    enabled: tab === 'history',
  });

  const approve = useApproveRestorationPartsOrder();
  const deny = useDenyRestorationPartsOrder();
  const purchase = usePurchaseRestorationPartsOrder();
  const receive = useReceiveRestorationPartsOrder();
  const reviseEta = useReviseRestorationPartsOrderEta();
  const inspect = useInspectRestorationPartsOrder();
  const resolveCancel = useResolveCancelRestorationPartsOrder();
  const cancel = useCancelRestorationPartsOrder();

  const liveOrders = liveQuery.data ?? [];
  const visibleLive = useMemo(
    () => filterByAttention(liveOrders, attention),
    [liveOrders, attention],
  );
  const counts = useMemo(() => attentionCounts(liveOrders), [liveOrders]);
  const historyGroups = useMemo(
    () => groupHistoryByItem(historyQuery.data ?? []),
    [historyQuery.data],
  );

  const busy =
    approve.isPending ||
    deny.isPending ||
    purchase.isPending ||
    receive.isPending ||
    reviseEta.isPending ||
    inspect.isPending ||
    resolveCancel.isPending ||
    cancel.isPending;

  const fail = (fallback: string) => (err: unknown) =>
    enqueueSnackbar(actionError(err, fallback), { variant: 'error' });

  return (
    <Box
      sx={{
        px: { xs: 1.5, md: 2.5 },
        py: { xs: 1.5, md: 2 },
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: studio.canvas,
      }}
    >
      <PageHeader compact title="Parts Requests" subtitle="Pipeline" />

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          border: `1.5px solid ${studio.panelBorder}`,
          borderRadius: `${studio.radius.xl}px`,
          overflow: 'hidden',
          bgcolor: studio.canvas,
          boxShadow: studio.panelShadow,
        }}
      >
        <Stack
          direction="row"
          spacing={0.25}
          sx={{
            flexShrink: 0,
            px: 1.5,
            pt: 0.85,
            bgcolor: studio.panel,
            borderBottom: `1px solid ${studio.panelBorder}`,
          }}
        >
          {([
            { id: 'live' as const, label: 'Live', accent: studio.accent },
            { id: 'history' as const, label: 'History', accent: studio.inkMuted },
          ]).map((entry) => {
            const selected = tab === entry.id;
            return (
              <Box
                key={entry.id}
                component="button"
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setTab(entry.id)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                  px: 1.6,
                  pt: 0.7,
                  pb: 0.8,
                  mb: '-1px',
                  cursor: 'pointer',
                  fontWeight: 900,
                  borderRadius: '8px 8px 0 0',
                  border: '1px solid',
                  borderColor: selected ? studio.panelBorder : 'transparent',
                  borderBottomColor: selected ? studio.canvas : 'transparent',
                  bgcolor: selected ? studio.canvas : 'transparent',
                  color: selected ? entry.accent : studio.inkMuted,
                  '&:hover': { color: selected ? entry.accent : studio.ink },
                }}
              >
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: entry.accent,
                    opacity: selected ? 1 : 0.72,
                    flexShrink: 0,
                  }}
                />
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 900 }}>{entry.label}</Typography>
              </Box>
            );
          })}
        </Stack>

        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            p: { xs: 1.25, md: 1.5 },
          }}
        >
          {tab === 'live' ? (
            <>
              <PartsAttentionStrip
                counts={counts}
                active={attention}
                onToggle={(key) => setAttention((current) => (current === key ? '' : key))}
              />
              {liveQuery.isLoading ? (
                <Box sx={{ display: 'grid', placeItems: 'center', flex: 1, minHeight: 160 }}>
                  <CircularProgress size={28} />
                </Box>
              ) : (
                <Box
                  sx={{
                    flex: 1,
                    minHeight: 0,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, minmax(200px, 1fr))',
                    gap: 1,
                    overflowX: 'auto',
                  }}
                >
                  {PARTS_LANES.map((lane) => (
                    <PartsLane
                      key={lane.id}
                      lane={lane.id}
                      label={lane.label}
                      orders={ordersForLane(visibleLive, lane.id)}
                      canAct={canAct}
                      busy={busy}
                      onOpen={setOpenOrder}
                      onAccept={(order) => approve.mutate(order.id, { onError: fail('Could not accept') })}
                      onDeny={(order) => {
                        setDenyOrder(order);
                        setDenyReason('');
                      }}
                      onMarkOrdered={(order) => {
                        setPurchaseOrder(order);
                        setDeliveryDate(isoDatePlusDays(7));
                      }}
                      onMarkDelivered={(order) =>
                        receive.mutate(order.id, { onError: fail('Could not mark delivered') })
                      }
                      onReviseEta={(order) => {
                        setEtaOrder(order);
                        setEtaDate(order.expected_delivery_on || isoDatePlusDays(7));
                      }}
                      onCancel={(order) => {
                        setCancelOrder(order);
                        setRefunded(false);
                      }}
                      onKeep={(order) =>
                        resolveCancel.mutate({ id: order.id, confirmed: false }, { onError: fail('Could not keep it') })
                      }
                      onInspect={(order, lines) =>
                        inspect.mutate({ id: order.id, lines }, { onError: fail('Could not inspect') })
                      }
                    />
                  ))}
                </Box>
              )}
            </>
          ) : historyQuery.isLoading ? (
            <Box sx={{ display: 'grid', placeItems: 'center', flex: 1, minHeight: 160 }}>
              <CircularProgress size={28} />
            </Box>
          ) : (
            <PartsHistoryPanel
              groups={historyGroups}
              window={historyWindow}
              status={historyStatus}
              search={search}
              onWindow={setHistoryWindow}
              onStatus={setHistoryStatus}
              onSearch={setSearch}
              onOpen={setOpenGroup}
            />
          )}
        </Box>
      </Box>

      <PartsOrderDrawer
        order={openOrder}
        group={openGroup}
        canAct={canAct}
        onClose={() => {
          setOpenOrder(null);
          setOpenGroup(null);
        }}
        onOpenBench={(jobId) => navigate(restorationBenchPath(jobId))}
        onCancel={(order) => {
          setOpenOrder(null);
          setCancelOrder(order);
          setRefunded(false);
        }}
      />

      <Dialog open={denyOrder != null} onClose={() => setDenyOrder(null)} maxWidth="xs" fullWidth PaperProps={{ sx: PAPER }}>
        <DialogTitle>Deny order</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            required
            multiline
            minRows={3}
            label="Reason"
            value={denyReason}
            onChange={(event) => setDenyReason(event.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDenyOrder(null)}>Back</Button>
          <Button
            color="error"
            variant="contained"
            disabled={!denyReason.trim() || deny.isPending}
            onClick={() => {
              if (!denyOrder) return;
              deny.mutate(
                { id: denyOrder.id, reason: denyReason.trim() },
                { onSuccess: () => setDenyOrder(null), onError: fail('Could not deny') },
              );
            }}
          >
            Deny
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={purchaseOrder != null} onClose={() => setPurchaseOrder(null)} maxWidth="xs" fullWidth PaperProps={{ sx: PAPER }}>
        <DialogTitle>Mark as ordered</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            required
            type="date"
            label="Estimated date of delivery"
            value={deliveryDate}
            onChange={(event) => setDeliveryDate(event.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPurchaseOrder(null)}>Back</Button>
          <Button
            variant="contained"
            disabled={purchase.isPending || !deliveryDate}
            onClick={() => {
              if (!purchaseOrder) return;
              purchase.mutate(
                { id: purchaseOrder.id, expected_delivery_on: deliveryDate },
                { onSuccess: () => setPurchaseOrder(null), onError: fail('Could not mark as ordered') },
              );
            }}
          >
            Mark as ordered
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={etaOrder != null} onClose={() => setEtaOrder(null)} maxWidth="xs" fullWidth PaperProps={{ sx: PAPER }}>
        <DialogTitle>Revise delivery date</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            required
            type="date"
            label="Estimated date of delivery"
            value={etaDate}
            onChange={(event) => setEtaDate(event.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEtaOrder(null)}>Back</Button>
          <Button
            variant="contained"
            disabled={reviseEta.isPending || !etaDate}
            onClick={() => {
              if (!etaOrder) return;
              reviseEta.mutate(
                { id: etaOrder.id, expected_delivery_on: etaDate },
                { onSuccess: () => setEtaOrder(null), onError: fail('Could not revise the date') },
              );
            }}
          >
            Save date
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={cancelOrder != null} onClose={() => setCancelOrder(null)} maxWidth="xs" fullWidth PaperProps={{ sx: PAPER }}>
        <DialogTitle>Cancel this order?</DialogTitle>
        <DialogContent>
          <Typography sx={{ mt: 1, minHeight: 40, color: studio.ink }}>
            {cancelOrder
              ? cancelOrder.replacement_name
                ? `${cancelOrder.name} will be cancelled and ${cancelOrder.replacement_name} will be requested.`
                : `${cancelOrder.name} will be cancelled.`
              : ' '}
          </Typography>
          <Box sx={{ minHeight: 42 }}>
            {cancelOrder?.status === 'purchased' ? (
              <FormControlLabel
                control={<Checkbox checked={refunded} onChange={(event) => setRefunded(event.target.checked)} />}
                label="Refunded - do not count this spend"
              />
            ) : null}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelOrder(null)}>Back</Button>
          <Button
            color="error"
            variant="contained"
            disabled={resolveCancel.isPending || cancel.isPending}
            onClick={() => {
              if (!cancelOrder) return;
              const onError = fail('Could not cancel');
              if (cancelOrder.cancel_requested) {
                resolveCancel.mutate(
                  { id: cancelOrder.id, confirmed: true, refunded },
                  { onSuccess: () => setCancelOrder(null), onError },
                );
                return;
              }
              cancel.mutate({ id: cancelOrder.id, refunded }, { onSuccess: () => setCancelOrder(null), onError });
            }}
          >
            Cancel it
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

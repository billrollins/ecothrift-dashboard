import Add from '@mui/icons-material/Add';
import Edit from '@mui/icons-material/Edit';
import ShoppingCartCheckout from '@mui/icons-material/ShoppingCartCheckout';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { fmtUsd } from './tarsProfit';
import { TarsPartsOrderDialog } from './TarsPartsOrderDialog';
import {
  addSessionParts,
  attachGradeOrder,
  collectSessionParts,
  gradePlanFor,
  listSessionOrders,
  orderGrandTotal,
  setGradePlanHours,
  toggleGradeOrder,
  updateSessionPart,
  upsertSessionOrder,
} from './tarsPartsListSession';
import type { TarsProcurementGroup, TarsWorkSession } from './tarsWorkTypes';

interface TarsGradeEvalDialogProps {
  open: boolean;
  grade: string | null;
  processorValue: number;
  session: TarsWorkSession | undefined;
  readOnly?: boolean;
  requesting?: boolean;
  onClose: () => void;
  onSessionChange: (session: TarsWorkSession) => void;
  onRequestParts?: (grade: string) => void;
}

function parseHours(raw: string): number {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function TarsGradeEvalDialog({
  open,
  grade,
  processorValue,
  session,
  readOnly = false,
  requesting = false,
  onClose,
  onSessionChange,
  onRequestParts,
}: TarsGradeEvalDialogProps) {
  const [hoursInput, setHoursInput] = useState('');
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<TarsProcurementGroup | null>(null);

  useEffect(() => {
    if (!open || !session || !grade) return;
    const plan = gradePlanFor(session, grade);
    setHoursInput(plan.estimateHours > 0 ? String(plan.estimateHours) : '');
  }, [open, grade, session]);

  if (!session || !grade) return null;

  const plan = gradePlanFor(session, grade);
  const orders = listSessionOrders(session);
  const attachedIds = new Set(plan.orderIds);
  const partLines = collectSessionParts(session).map((row) => row.part);
  const canEdit = !readOnly;

  const commit = (next: TarsWorkSession) => onSessionChange(next);

  const handleHoursChange = (raw: string) => {
    setHoursInput(raw);
    commit(setGradePlanHours(session, grade, parseHours(raw)));
  };

  const openNewOrder = () => {
    setEditingOrder(null);
    setOrderDialogOpen(true);
  };

  const openEditOrder = (order: TarsProcurementGroup) => {
    setEditingOrder(order);
    setOrderDialogOpen(true);
  };

  const attachedOrders = orders.filter((o) => attachedIds.has(o.id));
  const attachedTotal = attachedOrders.reduce((sum, o) => sum + orderGrandTotal(session, o), 0);

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ pb: 0.5 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
            <Stack direction="row" alignItems="center" spacing={1} minWidth={0}>
              <Typography variant="h6" fontWeight={900} noWrap title={grade}>
                {grade}
              </Typography>
              <Chip size="small" label={`Price ${fmtUsd(processorValue)}`} sx={{ fontWeight: 700 }} />
            </Stack>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="Estimated hours"
              type="number"
              size="small"
              value={hoursInput}
              onChange={(e) => handleHoursChange(e.target.value)}
              disabled={!canEdit}
              inputProps={{ min: 0, step: 0.25 }}
              helperText="Time you expect to spend reaching this grade"
              sx={{ maxWidth: 220 }}
            />

            <Box>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.75 }}>
                <Typography variant="overline" fontWeight={800} color="text.secondary">
                  Orders for this grade
                </Typography>
                {canEdit ?
                  <Button size="small" startIcon={<Add />} onClick={openNewOrder} sx={{ fontWeight: 700 }}>
                    New order
                  </Button>
                : null}
              </Stack>

              {orders.length === 0 ?
                <Typography variant="body2" color="text.secondary">
                  No orders yet. Create one to estimate parts cost for this grade.
                </Typography>
              : <Stack spacing={0.75}>
                  {orders.map((order, index) => {
                    const attached = attachedIds.has(order.id);
                    const name = order.supplierName.trim() || `Order ${index + 1}`;
                    return (
                      <Box
                        key={order.id}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          px: 1,
                          py: 0.5,
                          borderRadius: 1.5,
                          border: '1px solid',
                          borderColor: attached ? 'success.main' : '#e2e8f0',
                          bgcolor: attached ? '#f0fdf4' : '#fff',
                        }}
                      >
                        <Checkbox
                          size="small"
                          checked={attached}
                          disabled={!canEdit}
                          onChange={() => commit(toggleGradeOrder(session, grade, order.id))}
                          sx={{ p: 0.25 }}
                        />
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography variant="body2" fontWeight={700} noWrap title={name}>
                            {name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {order.partIds.length} item{order.partIds.length === 1 ? '' : 's'}
                          </Typography>
                        </Box>
                        <Typography variant="subtitle2" fontFamily="monospace" fontWeight={800} sx={{ flexShrink: 0 }}>
                          {fmtUsd(orderGrandTotal(session, order))}
                        </Typography>
                        {canEdit ?
                          <Button
                            size="small"
                            startIcon={<Edit sx={{ fontSize: 16 }} />}
                            onClick={() => openEditOrder(order)}
                            sx={{ flexShrink: 0, minWidth: 0 }}
                          >
                            Edit
                          </Button>
                        : null}
                      </Box>
                    );
                  })}
                </Stack>
              }
            </Box>

            <Divider />

            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="body2" fontWeight={700} color="text.secondary">
                Attached orders cost
              </Typography>
              <Typography variant="subtitle1" fontFamily="monospace" fontWeight={900}>
                {fmtUsd(attachedTotal)}
              </Typography>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 1.5, justifyContent: 'space-between' }}>
          {onRequestParts ?
            <Button
              variant="outlined"
              color="warning"
              startIcon={<ShoppingCartCheckout />}
              disabled={!canEdit || requesting || attachedOrders.length === 0}
              onClick={() => onRequestParts(grade)}
            >
              {requesting ? 'Requesting…' : 'Request parts'}
            </Button>
          : <span />}
          <Button variant="contained" onClick={onClose}>
            Done
          </Button>
        </DialogActions>
      </Dialog>

      <TarsPartsOrderDialog
        open={orderDialogOpen}
        parts={partLines}
        existing={editingOrder}
        orderIndex={editingOrder ? orders.findIndex((o) => o.id === editingOrder.id) : orders.length}
        onClose={() => {
          setOrderDialogOpen(false);
          setEditingOrder(null);
        }}
        onSave={({ order, partUpdates, newParts }) => {
          let next = session;
          if (newParts.length > 0) next = addSessionParts(next, newParts);
          for (const update of partUpdates) {
            const { id, ...patch } = update;
            next = updateSessionPart(next, id, patch);
          }
          next = upsertSessionOrder(next, order);
          next = attachGradeOrder(next, grade, order.id);
          commit(next);
          setOrderDialogOpen(false);
          setEditingOrder(null);
        }}
      />
    </>
  );
}

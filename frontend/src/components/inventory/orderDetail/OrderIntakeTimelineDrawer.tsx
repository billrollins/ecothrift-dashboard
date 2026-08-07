import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  Link,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  TextField,
  Typography,
} from '@mui/material';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import RadioButtonUnchecked from '@mui/icons-material/RadioButtonUnchecked';
import WarningAmber from '@mui/icons-material/WarningAmber';
import { format } from 'date-fns';
import { useSnackbar } from 'notistack';
import type { IntakeUndoStage, IntakeUndoPreview } from '../../../api/inventory.api';
import type { PurchaseOrderDetailSurface } from '../../../types/inventory.types';
import { useIntakeUndo, useIntakeUndoPreview, useOrderDeletePreview, usePurgeDeleteOrder } from '../../../hooks/useInventory';

const DRAWER_WIDTH = 480;

const UNDO_LABEL: Record<IntakeUndoStage, string> = {
  manifest_upload: 'Before manifest upload',
  standardize: 'Before standardize',
  ai_cleanup: 'Before AI cleanup',
  finalize: 'Before finalize (bookmarks)',
};

function parseUndo(raw: string | null): IntakeUndoStage | null {
  if (
    raw === 'manifest_upload' ||
    raw === 'standardize' ||
    raw === 'ai_cleanup' ||
    raw === 'finalize'
  ) {
    return raw;
  }
  return null;
}

function headlineStatus(order: PurchaseOrderDetailSurface): string {
  const prep = order.preprocess_status ?? 'not_started';
  const parts = [`Intake: ${prep}`];
  if (order.receiving_status && order.receiving_status !== 'not_started') {
    parts.push(`Receiving: ${order.receiving_status}`);
  }
  if (order.processing_status && order.processing_status !== 'not_started') {
    parts.push(`Processing: ${order.processing_status}`);
  }
  parts.push(`Order: ${order.status}`);
  return parts.join(' · ');
}

export type OrderIntakeTimelineDrawerProps = {
  orderId: number;
  order: PurchaseOrderDetailSurface;
  open: boolean;
  undoParam: string | null;
  dangerPurge: boolean;
  onClose: () => void;
};

export default function OrderIntakeTimelineDrawer({
  orderId,
  order,
  open,
  undoParam,
  dangerPurge,
  onClose,
}: OrderIntakeTimelineDrawerProps) {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const undoStage = parseUndo(undoParam);
  const previewQuery = useIntakeUndoPreview(open ? orderId : null, open ? undoStage : null);
  const intakeUndo = useIntakeUndo();
  const orderDeletePreview = useOrderDeletePreview();
  const purgeDeleteOrder = usePurgeDeleteOrder();

  const [typedConfirm, setTypedConfirm] = useState('');
  const [deletePreviewLoaded, setDeletePreviewLoaded] = useState(false);

  useEffect(() => {
    if (!open || !dangerPurge) {
      setDeletePreviewLoaded(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await orderDeletePreview.mutateAsync(orderId);
        if (!cancelled) setDeletePreviewLoaded(true);
      } catch {
        if (!cancelled) enqueueSnackbar('Failed to load deletion preview', { variant: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, dangerPurge, orderId, enqueueSnackbar, orderDeletePreview]);

  useEffect(() => {
    setTypedConfirm('');
  }, [open, undoParam, dangerPurge]);

  const preview: IntakeUndoPreview | undefined = previewQuery.data;

  const timelineRows = useMemo(
    () => [
      {
        key: 'manifest',
        label: 'Manifest upload',
        done: order.has_manifest,
        meta: order.manifest_uploaded_at
          ? format(new Date(order.manifest_uploaded_at), 'MMM d, yyyy')
          : '-',
        future: false,
        href: null as string | null,
      },
      {
        key: 'standardize',
        label: 'Standardize',
        done: Boolean(order.standardized_at),
        meta: order.standardized_at
          ? format(new Date(order.standardized_at), 'MMM d, yyyy')
          : '-',
        future: false,
        href: null,
      },
      {
        key: 'ai_cleanup',
        label: 'AI cleanup',
        done: Boolean(order.ai_cleaned_at),
        meta: order.ai_cleaned_at ? format(new Date(order.ai_cleaned_at), 'MMM d, yyyy') : '-',
        future: false,
        href: null,
      },
      {
        key: 'review',
        label: 'Manual review',
        done: Boolean(order.review_saved_at),
        meta: order.review_saved_at ? format(new Date(order.review_saved_at), 'MMM d, yyyy') : '-',
        future: false,
        href: null,
      },
      {
        key: 'finalize',
        label: 'Finalize (bookmarks)',
        done: Boolean(order.finalized_at),
        meta: order.finalized_at ? format(new Date(order.finalized_at), 'MMM d, yyyy') : '-',
        future: false,
        href: null,
      },
      {
        key: 'receiving',
        label: 'Receiving',
        done: order.receiving_status === 'done',
        meta: order.receiving_done_at
          ? format(new Date(order.receiving_done_at), 'MMM d, yyyy')
          : (order.receiving_status ?? 'not_started'),
        future: false,
        href: `/inventory/receiving/${orderId}`,
      },
      {
        key: 'processing',
        label: 'Processing',
        done: order.processing_status === 'done',
        meta: order.processing_done_at
          ? format(new Date(order.processing_done_at), 'MMM d, yyyy')
          : (order.processing_status ?? 'not_started'),
        future: false,
        href: `/inventory/processing/${orderId}`,
      },
      {
        key: 'disputes',
        label: 'Disputes',
        done:
          (order.intake_dispute_status ?? 'none') !== 'active' &&
          (order.processing_dispute_status ?? 'none') !== 'active',
        meta: `Intake: ${order.intake_dispute_status ?? 'none'} · Processing: ${order.processing_dispute_status ?? 'none'}`,
        future: false,
        href: null,
      },
      {
        key: 'closeout',
        label: 'Closeout',
        done: order.closeout_status !== 'open',
        meta: order.closeout_status ?? 'open',
        future: true,
        href: null,
      },
    ],
    [order, orderId],
  );

  const handleConfirmUndo = async () => {
    if (!undoStage) return;
    if (undoStage === 'manifest_upload') {
      if (typedConfirm.trim() !== order.order_number) {
        enqueueSnackbar(`Type the order number (${order.order_number}) to confirm.`, { variant: 'warning' });
        return;
      }
    }
    try {
      await intakeUndo.mutateAsync({ orderId, to_stage: undoStage });
      enqueueSnackbar(`Reverted to: ${UNDO_LABEL[undoStage]}`, { variant: 'success' });
      onClose();
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { detail?: unknown } } };
      const d = ax.response?.data?.detail;
      enqueueSnackbar(typeof d === 'string' ? d : 'Undo failed', { variant: 'error' });
    }
  };

  const handlePurge = async () => {
    if (typedConfirm.trim() !== order.order_number) {
      enqueueSnackbar(`Type the order number (${order.order_number}) to confirm.`, { variant: 'warning' });
      return;
    }
    try {
      const result = await purgeDeleteOrder.mutateAsync({
        orderId,
        data: { confirm_order_number: typedConfirm.trim() },
      });
      enqueueSnackbar(`Deleted order ${result.order_number}`, { variant: 'success' });
      onClose();
      navigate('/inventory/orders');
    } catch {
      enqueueSnackbar('Purge failed', { variant: 'error' });
    }
  };

  const showTypedGuard = dangerPurge || undoStage === 'manifest_upload';

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: DRAWER_WIDTH } }}>
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5, height: '100%' }}>
        <Box>
          <Typography variant="overline" color="text.secondary">
            Intake timeline
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            #{order.order_number}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {order.vendor_name}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
            {headlineStatus(order)}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            Created {format(new Date(order.created_at), 'MMM d, yyyy')}
          </Typography>
        </Box>

        <Divider />

        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Stages
        </Typography>
        <List dense disablePadding sx={{ flex: 0 }}>
          {timelineRows.map((row) => (
            <ListItem key={row.key} disableGutters sx={{ py: 0.25 }}>
              <ListItemIcon sx={{ minWidth: 32 }}>
                {row.done ? (
                  <CheckCircleOutline color="success" fontSize="small" />
                ) : (
                  <RadioButtonUnchecked color="disabled" fontSize="small" />
                )}
              </ListItemIcon>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Typography variant="body2">{row.label}</Typography>
                    {row.future ? <Chip label="Coming soon" size="small" variant="outlined" /> : null}
                  </Box>
                }
                secondary={
                  <Box component="span" sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                    <Typography variant="caption" color="text.secondary" component="span">
                      {row.meta}
                    </Typography>
                    {row.href ? (
                      <Link
                        component="button"
                        type="button"
                        variant="caption"
                        onClick={() => navigate(row.href!)}
                        sx={{ alignSelf: 'flex-start', cursor: 'pointer' }}
                      >
                        Open
                      </Link>
                    ) : null}
                  </Box>
                }
              />
            </ListItem>
          ))}
        </List>

        <Divider />

        {undoStage && !dangerPurge ? (
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              Undo: {UNDO_LABEL[undoStage]}
            </Typography>
            {previewQuery.isLoading && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={18} />
                <Typography variant="body2">Loading preview…</Typography>
              </Box>
            )}
            {previewQuery.isError && (
              <Typography color="error" variant="body2">
                Could not load preview.
              </Typography>
            )}
            {preview && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {!preview.safe && (
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', bgcolor: '#fff7ed', p: 1, borderRadius: 1 }}>
                    <WarningAmber color="warning" fontSize="small" />
                    <Typography variant="body2">{preview.blocked_reason}</Typography>
                  </Box>
                )}
                {preview.safe && (
                  <>
                    {preview.fields_to_null.length > 0 && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          PO fields cleared
                        </Typography>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                          {preview.fields_to_null.join(', ')}
                        </Typography>
                      </Box>
                    )}
                    {Object.keys(preview.status_resets).length > 0 && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Status
                        </Typography>
                        <Typography variant="body2">
                          {Object.entries(preview.status_resets)
                            .map(([k, v]) => `${k} → ${v}`)
                            .join('; ')}
                        </Typography>
                      </Box>
                    )}
                    {Object.keys(preview.rows_to_delete).length > 0 && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Rows deleted
                        </Typography>
                        {Object.entries(preview.rows_to_delete).map(([k, v]) => (
                          <Typography key={k} variant="body2">
                            {k}: {v}
                          </Typography>
                        ))}
                      </Box>
                    )}
                    {Object.keys(preview.rows_to_update).length > 0 && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Rows updated
                        </Typography>
                        {Object.entries(preview.rows_to_update).map(([k, v]) => (
                          <Typography key={k} variant="body2">
                            {k}: {v}
                          </Typography>
                        ))}
                      </Box>
                    )}
                    {preview.files_to_delete.length > 0 && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Storage
                        </Typography>
                        {preview.files_to_delete.map((f) => (
                          <Typography key={f} variant="body2">
                            {f}
                          </Typography>
                        ))}
                      </Box>
                    )}
                    {preview.cascade_warnings.map((w) => (
                      <Typography key={w} variant="body2" color="warning.main">
                        {w}
                      </Typography>
                    ))}
                  </>
                )}
              </Box>
            )}
            {showTypedGuard && preview?.safe ? (
              <TextField
                fullWidth
                size="small"
                label={`Type ${order.order_number} to confirm`}
                value={typedConfirm}
                onChange={(e) => setTypedConfirm(e.target.value)}
                sx={{ mt: 2 }}
              />
            ) : null}
            {undoStage ? (
              <Button
                variant="contained"
                color="warning"
                fullWidth
                sx={{ mt: 2 }}
                disabled={
                  !preview?.safe ||
                  intakeUndo.isPending ||
                  (showTypedGuard && typedConfirm.trim() !== order.order_number)
                }
                onClick={() => void handleConfirmUndo()}
              >
                {intakeUndo.isPending ? 'Applying…' : 'Confirm undo'}
              </Button>
            ) : null}
          </Box>
        ) : null}

        {dangerPurge ? (
          <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'error.main' }}>
              Danger zone
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Permanently delete this purchase order and related artifacts (reverse sequence).
            </Typography>
            {!orderDeletePreview.isPending && deletePreviewLoaded ? (
              <Typography variant="caption" display="block" sx={{ mb: 1 }}>
                Preview loaded - confirm with the order number below.
              </Typography>
            ) : dangerPurge ? (
              <Typography variant="body2" sx={{ mb: 1 }}>
                Loading preview…
              </Typography>
            ) : null}
            <TextField
              fullWidth
              size="small"
              label={`Type ${order.order_number} to purge`}
              value={typedConfirm}
              onChange={(e) => setTypedConfirm(e.target.value)}
              sx={{ mb: 1 }}
            />
            <Button
              variant="contained"
              color="error"
              fullWidth
              disabled={
                purgeDeleteOrder.isPending || typedConfirm.trim() !== order.order_number
              }
              onClick={() => void handlePurge()}
            >
              {purgeDeleteOrder.isPending ? 'Deleting…' : 'Delete order'}
            </Button>
          </Box>
        ) : null}

        <Box sx={{ mt: 'auto', pt: 1 }}>
          <Button variant="outlined" fullWidth onClick={onClose}>
            Close
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
}

import { useState, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  Paper,
  Stack,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';
import Close from '@mui/icons-material/Close';
import OpenInNew from '@mui/icons-material/OpenInNew';
import { useSnackbar } from 'notistack';
import { useNavigate } from 'react-router-dom';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import {
  useAddReservationNote,
  useReservationAction,
  useReservationDetail,
} from '../../hooks/useWebStore';
import type { ReservationActionName, ReservationEvent } from '../../api/webstore.api';
import { formatCurrency } from '../../utils/format';
import { fmtWhen, HOLD_EVENT_LABELS, HoldStatusChip, messagesHrefForHold } from './presentation';
import { useOnlineSalesMobile } from './useOnlineSalesMobile';

const DRAWER_WIDTH = 480;

type ReasonAction = 'decline' | 'cancel' | 'expire' | 'reopen';

function messageAuthor(kind: string): string {
  if (kind === 'customer') return 'Customer';
  if (kind === 'staff') return 'Eco-Thrift';
  if (kind === 'system') return 'System';
  return kind;
}

function eventLabel(ev: ReservationEvent): string {
  return HOLD_EVENT_LABELS[ev.kind] || ev.kind_display || ev.kind;
}

/** Who to credit when the event has no actor row (customer / auto jobs). */
function eventActor(ev: ReservationEvent): string {
  if (ev.actor_name?.trim()) return ev.actor_name.trim();
  if (ev.kind === 'requested' || ev.kind === 'verified') return 'Customer';
  return 'System';
}

type Props = {
  reservationId: number | null;
  open: boolean;
  onClose: () => void;
  /** After cancel / decline / expire - switch the Holds page to Released. */
  onReleased?: () => void;
  /** After reopen - switch back to Needs action. */
  onReopened?: () => void;
};

function mutationErrorDetail(err: unknown): string {
  if (
    err &&
    typeof err === 'object' &&
    'response' in err &&
    err.response &&
    typeof err.response === 'object' &&
    'data' in err.response &&
    err.response.data &&
    typeof err.response.data === 'object' &&
    'detail' in err.response.data
  ) {
    return String((err.response.data as { detail?: unknown }).detail || '');
  }
  return '';
}

const REASON_COPY: Record<ReasonAction, { title: string; help: string; label: string }> = {
  decline: {
    title: 'Decline hold',
    help: 'A reason is required and will be shown to the customer.',
    label: 'Reason',
  },
  cancel: {
    title: 'Cancel hold',
    help: 'A reason is required and will be shown to the customer.',
    label: 'Reason',
  },
  expire: {
    title: 'Mark no-show',
    help: 'Optional reason shown to the customer.',
    label: 'Reason',
  },
  reopen: {
    title: 'Reopen hold',
    help:
      'Internal note - required, and never shown to the customer. Availability is '
      + 're-checked first; the hold comes back active, so pull the item or Complete '
      + 'at the counter when they arrive.',
    label: 'Internal note',
  },
};

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Box>
      <Typography
        variant="overline"
        color="text.secondary"
        sx={{ display: 'block', letterSpacing: '0.08em', mb: 1 }}
      >
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function ActionGroup({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
        {label}
      </Typography>
      {hint ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          {hint}
        </Typography>
      ) : (
        <Box sx={{ mb: 1 }} />
      )}
      <Stack spacing={1} sx={{ '& > .MuiButton-root': { width: '100%' } }}>
        {children}
      </Stack>
    </Box>
  );
}

export default function HoldDetailDrawer({
  reservationId,
  open,
  onClose,
  onReleased,
  onReopened,
}: Props) {
  const isMobile = useOnlineSalesMobile();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { data, isLoading, isError } = useReservationDetail(open ? reservationId : null);
  const action = useReservationAction();
  const addNote = useAddReservationNote();
  const reservation = data?.reservation;
  const events = data?.events || [];
  const thread = data?.thread;

  const openMessages = () => {
    if (!thread?.id) return;
    const href = messagesHrefForHold({ conversation_id: thread.id });
    if (!href) return;
    onClose();
    navigate(href);
  };

  const [noteText, setNoteText] = useState('');
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reasonAction, setReasonAction] = useState<ReasonAction>('decline');
  const [reasonText, setReasonText] = useState('');

  const run = async (act: ReservationActionName, reason?: string) => {
    if (!reservation) return;
    try {
      await action.mutateAsync({ id: reservation.id, action: act, reason });
      if (act === 'cancel' || act === 'decline' || act === 'expire') {
        enqueueSnackbar('Moved to Released', { variant: 'success' });
        onReleased?.();
      } else if (act === 'reopen') {
        enqueueSnackbar('Hold reopened - back on Needs action', { variant: 'success' });
        onReopened?.();
      } else if (act === 'archive') {
        enqueueSnackbar('Archived - hidden from the queues, still searchable', {
          variant: 'success',
        });
      } else if (act === 'unarchive') {
        enqueueSnackbar('Back in the queues', { variant: 'success' });
      } else if (act === 'confirm') {
        enqueueSnackbar('Marked for pull', { variant: 'success' });
      } else if (act === 'stage') {
        enqueueSnackbar('Marked ready for pickup', { variant: 'success' });
      } else if (act === 'complete') {
        enqueueSnackbar('Hold completed', { variant: 'success' });
      } else if (act === 'extend') {
        enqueueSnackbar('Hold extended', { variant: 'success' });
      } else {
        enqueueSnackbar(`${act} ok`, { variant: 'success' });
      }
    } catch (err) {
      // Reopen fails when the item sold or the listing was unpublished - the
      // server reason is the whole point of the guard, so surface it verbatim.
      enqueueSnackbar(mutationErrorDetail(err) || `Could not ${act}`, {
        variant: 'error',
        style: { whiteSpace: 'pre-line' },
      });
    }
  };

  const openReason = (act: ReasonAction) => {
    setReasonAction(act);
    setReasonText('');
    setReasonOpen(true);
  };

  const submitReason = async () => {
    const trimmed = reasonText.trim();
    if (!trimmed && reasonAction !== 'expire') {
      enqueueSnackbar('A reason is required.', { variant: 'warning' });
      return;
    }
    setReasonOpen(false);
    await run(reasonAction, trimmed || 'No-show / expired by staff');
  };

  const submitNote = async () => {
    if (!reservation || !noteText.trim()) return;
    try {
      await addNote.mutateAsync({ id: reservation.id, note: noteText.trim() });
      setNoteText('');
      enqueueSnackbar('Note added', { variant: 'success' });
    } catch {
      enqueueSnackbar('Could not add note', { variant: 'error' });
    }
  };

  const status = reservation?.status || '';
  const awaitingEmail = status === 'pending_verification';
  const busy = action.isPending;

  // Prepare - once done, hide. Decline only before we have started pulling.
  const canDecline = status === 'pending_verification' || status === 'requested';
  const canPull = status === 'requested';
  const canMarkReady = status === 'requested' || status === 'confirmed';
  const showPrepare = canDecline || canPull || canMarkReady;

  // Disposition - what happens at / after the counter.
  const canComplete = status === 'requested' || status === 'confirmed' || status === 'ready_for_pickup';
  const canExtend = status === 'confirmed' || status === 'ready_for_pickup';
  const canCancel = ['pending_verification', 'requested', 'confirmed', 'ready_for_pickup'].includes(
    status,
  );
  // No-show only once the customer was expected (pulling or ready).
  const canNoShow = status === 'confirmed' || status === 'ready_for_pickup';
  const showDisposition = canComplete || canExtend || canCancel || canNoShow;

  const isTerminal = ['completed', 'declined', 'expired', 'cancelled'].includes(status);
  const canReopen = ['declined', 'expired', 'cancelled'].includes(status);

  return (
    <>
      <Drawer
        anchor={isMobile ? 'bottom' : 'right'}
        open={open}
        onClose={onClose}
        PaperProps={{
          sx: isMobile
            ? {
                maxWidth: 480,
                width: '100%',
                mx: 'auto',
                borderRadius: '22px 22px 0 0',
                maxHeight: '92dvh',
                display: 'flex',
                flexDirection: 'column',
                pb: 'env(safe-area-inset-bottom)',
              }
            : {
                width: DRAWER_WIDTH,
                display: 'flex',
                flexDirection: 'column',
              },
        }}
      >
        {isMobile && (
          <Box
            sx={{
              width: 40,
              height: 4,
              borderRadius: 99,
              bgcolor: 'divider',
              mx: 'auto',
              mt: 1,
              mb: 0.5,
              flexShrink: 0,
            }}
          />
        )}
        <Toolbar
          disableGutters
          sx={{
            px: 2,
            minHeight: 56,
            gap: 1,
            justifyContent: 'space-between',
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {reservation ? `Hold #${reservation.id}` : 'Hold'}
          </Typography>
          <IconButton onClick={onClose} aria-label="close" size="small">
            <Close />
          </IconButton>
        </Toolbar>
        <Box
          sx={{
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            // Keep primary actions from sitting under home indicators.
            pb: isMobile ? 3 : 2,
          }}
        >
          {isLoading && <LoadingScreen />}
          {isError && (
            <Typography color="error" variant="body2">
              Could not load hold detail.
            </Typography>
          )}
          {!isLoading && !isError && reservation && (
            <>
              <Box>
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="flex-start"
                  justifyContent="space-between"
                >
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    {reservation.listing_title}
                  </Typography>
                  <HoldStatusChip status={status} />
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {reservation.item_sku ? `${reservation.item_sku} · ` : ''}
                  {`Qty ${reservation.quantity}`}
                </Typography>
                {reservation.pickup_code && (
                  <Box
                    sx={{
                      mt: 1.5,
                      px: 1.5,
                      py: 1,
                      borderRadius: 2,
                      bgcolor: 'action.hover',
                      display: 'inline-block',
                    }}
                  >
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      Pickup code
                    </Typography>
                    <Typography
                      variant="h5"
                      sx={{
                        fontWeight: 800,
                        letterSpacing: '0.22em',
                        fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
                      }}
                    >
                      {reservation.pickup_code}
                    </Typography>
                  </Box>
                )}
              </Box>

              {awaitingEmail && (
                <Alert severity="warning">
                  Customer has not confirmed their email yet. Stock is reserved.
                  Pull and Mark ready unlock after they click the link. Cancel
                  frees the item now.
                </Alert>
              )}
              {!awaitingEmail && status === 'requested' && (
                <Alert severity="info">
                  Customer can walk in with their code. Pull and Mark ready help
                  the floor stay organized - Complete still works without them.
                </Alert>
              )}
              {thread && (thread.messages || []).length > 0 && (
                <Alert
                  severity={(reservation.unread || 0) > 0 ? 'warning' : 'info'}
                  action={
                    <Button
                      color="inherit"
                      size="small"
                      endIcon={<OpenInNew fontSize="small" />}
                      onClick={openMessages}
                    >
                      Messages
                    </Button>
                  }
                >
                  {(reservation.unread || 0) > 0
                    ? `${reservation.unread} unread message${reservation.unread === 1 ? '' : 's'} on this hold.`
                    : 'This hold has a customer message thread.'}
                </Alert>
              )}

              {isTerminal && (
                <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                      {reservation.archived_at
                        ? `Archived ${fmtWhen(reservation.archived_at)}`
                        : 'Showing in the staff queues'}
                    </Typography>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={busy}
                      onClick={() => run(reservation.archived_at ? 'unarchive' : 'archive')}
                    >
                      {reservation.archived_at ? 'Unarchive' : 'Archive'}
                    </Button>
                  </Stack>
                </Paper>
              )}

              {canReopen && (
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                  <ActionGroup
                    label="Bring it back"
                    hint="Reopens only if the item is still available."
                  >
                    <Button
                      variant="contained"
                      size="large"
                      disabled={busy}
                      onClick={() => openReason('reopen')}
                    >
                      Reopen hold
                    </Button>
                  </ActionGroup>
                </Paper>
              )}

              {(showPrepare || showDisposition) && (
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                  <Typography
                    variant="overline"
                    color="text.secondary"
                    sx={{ display: 'block', letterSpacing: '0.08em', mb: 1.5 }}
                  >
                    Actions
                  </Typography>
                  <Stack spacing={2.5}>
                    {showPrepare && (
                      <ActionGroup
                        label="Prepare"
                        hint="Floor work before the customer arrives. Each step disappears once done."
                      >
                        {canPull && (
                          <Button
                            variant="contained"
                            size="large"
                            disabled={busy}
                            onClick={() => run('confirm')}
                          >
                            Pull item
                          </Button>
                        )}
                        {canMarkReady && (
                          <Button
                            variant="contained"
                            color="success"
                            size="large"
                            disabled={busy}
                            onClick={() => run('stage')}
                          >
                            Mark ready
                          </Button>
                        )}
                        {canDecline && (
                          <Button
                            variant="outlined"
                            color="error"
                            size="large"
                            disabled={busy}
                            onClick={() => openReason('decline')}
                          >
                            Decline
                          </Button>
                        )}
                      </ActionGroup>
                    )}

                    {showPrepare && showDisposition && <Divider />}

                    {showDisposition && (
                      <ActionGroup
                        label="At pickup"
                        hint="Finish the sale, give more time, or release the hold."
                      >
                        {canComplete && (
                          <Button
                            variant="contained"
                            color="success"
                            size="large"
                            disabled={busy}
                            onClick={() => run('complete')}
                          >
                            Complete
                          </Button>
                        )}
                        {canExtend && (
                          <Button
                            variant="outlined"
                            size="large"
                            disabled={busy}
                            onClick={() => run('extend')}
                          >
                            Extend
                          </Button>
                        )}
                        {(canCancel || canNoShow) && (
                          <Stack direction="row" spacing={1}>
                            {canCancel && (
                              <Button
                                variant="outlined"
                                color="inherit"
                                size="large"
                                disabled={busy}
                                sx={{ flex: 1 }}
                                onClick={() => openReason('cancel')}
                              >
                                Cancel
                              </Button>
                            )}
                            {canNoShow && (
                              <Button
                                variant="outlined"
                                color="warning"
                                size="large"
                                disabled={busy}
                                sx={{ flex: 1 }}
                                onClick={() => openReason('expire')}
                              >
                                No-show
                              </Button>
                            )}
                          </Stack>
                        )}
                      </ActionGroup>
                    )}
                  </Stack>
                </Paper>
              )}

              <Section title="Customer">
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {reservation.customer_name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {reservation.email}
                  {reservation.phone ? ` · ${reservation.phone}` : ''}
                </Typography>
                {reservation.customer_note?.trim() && (
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 0.75 }}>
                    Customer note: {reservation.customer_note}
                  </Typography>
                )}
                {reservation.release_reason?.trim() && (
                  <Typography variant="body2" color="error" sx={{ mt: 0.75 }}>
                    Release reason: {reservation.release_reason}
                  </Typography>
                )}
              </Section>

              {status === 'completed' && (
                <Section title="Money">
                  <Stack spacing={0.5}>
                    <Typography variant="body2">
                      {formatCurrency(reservation.unit_price_snapshot)} × {reservation.quantity} ={' '}
                      <strong>{formatCurrency(reservation.line_total)}</strong>
                    </Typography>
                    <Typography variant="body2">
                      Contribution <strong>{formatCurrency(reservation.contribution)}</strong>
                    </Typography>
                    {reservation.pos_cart ? (
                      <Chip
                        size="small"
                        color="success"
                        variant="outlined"
                        label={`POS cart #${reservation.pos_cart}`}
                        sx={{ alignSelf: 'flex-start' }}
                      />
                    ) : (
                      <Chip
                        size="small"
                        variant="outlined"
                        label="POS not linked"
                        sx={{ alignSelf: 'flex-start' }}
                      />
                    )}
                  </Stack>
                </Section>
              )}

              <Section title="Timeline">
                {events.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No events recorded.
                  </Typography>
                ) : (
                  <Stack spacing={0} sx={{ borderTop: 1, borderColor: 'divider' }}>
                    {events.map((ev) => (
                      <Box
                        key={ev.id}
                        sx={{
                          py: 1.25,
                          borderBottom: 1,
                          borderColor: 'divider',
                        }}
                      >
                        <Stack
                          direction="row"
                          spacing={1}
                          justifyContent="space-between"
                          alignItems="baseline"
                          gap={1}
                        >
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {eventLabel(ev)}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                          >
                            {fmtWhen(ev.created_at)}
                          </Typography>
                        </Stack>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          {eventActor(ev)}
                        </Typography>
                        {ev.note?.trim() ? (
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}
                          >
                            {ev.note}
                          </Typography>
                        ) : null}
                      </Box>
                    ))}
                  </Stack>
                )}
              </Section>

              <Section title="Staff note">
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Internal only - customers never see these. They land on the Timeline.
                </Typography>
                <TextField
                  multiline
                  minRows={2}
                  size="small"
                  placeholder="Internal note…"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  fullWidth
                />
                <Button
                  size="small"
                  variant="outlined"
                  sx={{ mt: 1 }}
                  onClick={submitNote}
                  disabled={!noteText.trim() || addNote.isPending}
                >
                  Add note
                </Button>
              </Section>

              {thread && (
                <Section title="Messages">
                  {(thread.messages || []).length > 0 ? (
                    <Button
                      size="small"
                      variant="outlined"
                      endIcon={<OpenInNew fontSize="small" />}
                      onClick={openMessages}
                      sx={{ mb: 1.5, alignSelf: 'flex-start' }}
                    >
                      Open in Messages
                    </Button>
                  ) : null}
                  <Box sx={{ maxHeight: 200, overflowY: 'auto' }}>
                    {(thread.messages || []).length === 0 && (
                      <Typography variant="body2" color="text.secondary">
                        No messages on this hold.
                      </Typography>
                    )}
                    {(thread.messages || []).map((m) => (
                      <Box key={m.id} sx={{ mb: 1.25 }}>
                        <Stack direction="row" spacing={1} alignItems="baseline">
                          <Typography variant="caption" sx={{ fontWeight: 700 }}>
                            {messageAuthor(m.author_kind)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {fmtWhen(m.created_at)}
                          </Typography>
                        </Stack>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                          {m.body}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Section>
              )}
            </>
          )}
        </Box>
      </Drawer>

      <Dialog open={reasonOpen} onClose={() => setReasonOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{REASON_COPY[reasonAction].title}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {REASON_COPY[reasonAction].help}
          </Typography>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={2}
            label={REASON_COPY[reasonAction].label}
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReasonOpen(false)}>Back</Button>
          <Button
            variant="contained"
            color={reasonAction === 'decline' ? 'error' : 'primary'}
            onClick={submitReason}
            disabled={reasonAction !== 'expire' && !reasonText.trim()}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

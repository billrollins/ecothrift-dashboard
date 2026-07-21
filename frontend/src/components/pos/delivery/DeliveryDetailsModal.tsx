import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import CheckCircle from '@mui/icons-material/CheckCircle';
import Close from '@mui/icons-material/Close';
import EditLocationAlt from '@mui/icons-material/EditLocationAlt';
import LocalPhone from '@mui/icons-material/LocalPhone';
import QrCodeScanner from '@mui/icons-material/QrCodeScanner';
import ReceiptLong from '@mui/icons-material/ReceiptLong';
import { useSnackbar } from 'notistack';
import { getCart } from '../../../api/pos.api';
import type { Cart, DeliveryAvailability, DeliveryJob, DeliveryRun } from '../../../types/pos.types';
import { formatPhone, maskPhoneInput } from '../../../utils/formatPhone';
import { TransactionDetailDialog } from '../TransactionDetailDialog';
import type { DeliveryDayCardModel } from './dayBoardUtils';
import { formatMoney } from './dayBoardUtils';
import { telHref } from './driverWizardUtils';

type Props = {
  open: boolean;
  card: DeliveryDayCardModel | null;
  run: DeliveryRun | null;
  canManage?: boolean;
  daySlots: DeliveryAvailability[];
  onClose: () => void;
  onSaveNotes: (jobId: number, notes: string) => Promise<void>;
  onReschedule?: (jobId: number, availabilityId: number, notes: string) => Promise<void>;
  onCancel?: (jobId: number) => Promise<void>;
  onAppendAddress?: (
    jobId: number,
    data: { address: string; is_apt?: boolean; unit?: string; reason?: string },
  ) => Promise<void>;
  onUpdateContact?: (
    jobId: number,
    data: { customer_name?: string; phone?: string },
  ) => Promise<void>;
  onScanVerify?: (stopId: number, sku: string) => Promise<void>;
};

type PendingAddress = {
  address: string;
  is_apt: boolean;
  unit: string;
  reason: string;
};

const fieldSx = { '& .MuiInputBase-root': { minHeight: 40 } };

function formatDraftAddress(p: PendingAddress): string {
  const base = p.address.trim();
  if (p.is_apt && p.unit.trim()) return `${base}, Unit ${p.unit.trim()}`;
  return base;
}

export function DeliveryDetailsModal({
  open,
  card,
  run,
  canManage,
  daySlots,
  onClose,
  onSaveNotes,
  onReschedule,
  onCancel,
  onAppendAddress,
  onUpdateContact,
  onScanVerify,
}: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [notes, setNotes] = useState('');
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [availId, setAvailId] = useState<number | ''>('');
  const [pendingAddress, setPendingAddress] = useState<PendingAddress | null>(null);
  const [addressEditorOpen, setAddressEditorOpen] = useState(false);
  const [draftAddress, setDraftAddress] = useState('');
  const [draftUnit, setDraftUnit] = useState('');
  const [draftIsApt, setDraftIsApt] = useState(false);
  const [draftReason, setDraftReason] = useState('');
  const [showOriginalAddress, setShowOriginalAddress] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scanSku, setScanSku] = useState('');
  const [scanBusy, setScanBusy] = useState(false);
  const [txnCart, setTxnCart] = useState<Cart | null>(null);
  const [txnLoading, setTxnLoading] = useState(false);

  useEffect(() => {
    if (!card) return;
    setNotes(card.notes || '');
    setNotesExpanded(false);
    setName(card.customer_name);
    setPhone(formatPhone(card.phone) || card.phone);
    setAvailId(card.job.availability ?? daySlots[0]?.id ?? '');
    setPendingAddress(null);
    setAddressEditorOpen(false);
    setShowOriginalAddress(false);
    setShowHistory(false);
    setScanSku('');
    setTxnCart(null);
  }, [card, daySlots]);

  const initial = useMemo(() => {
    if (!card) return null;
    return {
      notes: card.notes || '',
      name: card.customer_name,
      phone: formatPhone(card.phone) || card.phone,
      availId: card.job.availability ?? daySlots[0]?.id ?? '',
    };
  }, [card, daySlots]);

  if (!card || !initial) return null;
  const job: DeliveryJob = card.job;
  const stop = card.stop;
  const events = (run?.events || []).filter((e) => !e.stop_id || e.stop_id === stop?.id).slice(0, 12);
  const displayPhone = formatPhone(phone) || phone;
  const receiptNumber = job.receipt_number || null;
  const hasTransaction = Boolean(job.cart);
  const currentAddress = pendingAddress
    ? formatDraftAddress(pendingAddress)
    : card.address;
  const addressCorrected = Boolean(pendingAddress) || card.address_corrected;
  const canEdit = Boolean(canManage || stop);

  const dirty =
    notes.trim() !== initial.notes.trim() ||
    (canManage &&
      (name.trim() !== initial.name.trim() ||
        (formatPhone(phone) || phone) !== initial.phone ||
        availId !== initial.availId)) ||
    Boolean(pendingAddress);

  const openTransaction = async () => {
    if (!job.cart) return;
    setTxnLoading(true);
    try {
      const { data } = await getCart(job.cart);
      setTxnCart(data as unknown as Cart);
    } catch {
      enqueueSnackbar('Could not load transaction', { variant: 'error' });
    } finally {
      setTxnLoading(false);
    }
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      if (notes.trim() !== initial.notes.trim()) {
        await onSaveNotes(job.id, notes.trim());
      }
      if (
        canManage &&
        onUpdateContact &&
        (name.trim() !== initial.name.trim() ||
          (formatPhone(phone) || phone) !== initial.phone)
      ) {
        await onUpdateContact(job.id, {
          customer_name: name.trim(),
          phone: (formatPhone(phone) || phone).trim(),
        });
      }
      if (pendingAddress && onAppendAddress) {
        await onAppendAddress(job.id, pendingAddress);
        setPendingAddress(null);
      }
      if (
        canManage &&
        onReschedule &&
        availId !== '' &&
        availId !== initial.availId &&
        Number(availId) !== job.availability
      ) {
        await onReschedule(job.id, Number(availId), notes.trim());
        enqueueSnackbar('Saved', { variant: 'success' });
        onClose();
        return;
      }
      enqueueSnackbar('Saved', { variant: 'success' });
    } catch (err: unknown) {
      const detail =
        err && typeof err === 'object' && 'response' in err
          ? String(
              (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ||
                'Save failed',
            )
          : 'Save failed';
      enqueueSnackbar(detail, { variant: 'error' });
    } finally {
      setBusy(false);
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
      aria-labelledby="delivery-details-title"
      PaperProps={{
        sx: isMobile
          ? undefined
          : { maxHeight: 'min(900px, calc(100vh - 48px))' },
      }}
    >
      <DialogTitle
        id="delivery-details-title"
        sx={{
          py: { xs: 1, md: 1.5 },
          px: { xs: 1.5, md: 2.5 },
          pr: { xs: 1, md: 1.5 },
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontWeight: 800,
        }}
      >
        Delivery
        <IconButton aria-label="Close" onClick={onClose} edge="end">
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ px: { xs: 1.5, md: 2.5 }, py: { xs: 1.25, md: 2 } }}>
        <Stack spacing={{ xs: 1.1, md: 1.5 }}>
          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
            <Chip size="small" label={card.job_status} />
            {card.stop_state && <Chip size="small" variant="outlined" label={card.stop_state} />}
            <Chip size="small" variant="outlined" label={formatMoney(card.fee)} />
            {receiptNumber && (
              <Chip size="small" variant="outlined" icon={<ReceiptLong />} label={receiptNumber} />
            )}
          </Stack>

          {canManage ? (
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              alignItems={{ sm: 'flex-start' }}
            >
              <TextField
                size="small"
                label="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                sx={{ ...fieldSx, flex: 1, minWidth: 0, width: '100%' }}
              />
              <TextField
                size="small"
                label="Phone"
                value={phone}
                onChange={(e) => setPhone(maskPhoneInput(e.target.value))}
                inputProps={{ inputMode: 'tel' }}
                sx={{
                  ...fieldSx,
                  width: { xs: '100%', sm: 188 },
                  flexShrink: 0,
                }}
              />
            </Stack>
          ) : (
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={{ xs: 0.25, sm: 1.5 }}
              alignItems={{ sm: 'baseline' }}
            >
              <Typography variant="subtitle1" fontWeight={800}>
                {card.customer_name}
              </Typography>
              <Typography
                variant="subtitle1"
                fontWeight={700}
                color="primary.main"
                sx={{ whiteSpace: 'nowrap', letterSpacing: '0.01em' }}
              >
                {displayPhone}
              </Typography>
            </Stack>
          )}

          <Box>
            <Stack direction="row" spacing={0.75} alignItems="flex-start">
              <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
                {currentAddress || '—'}
                {pendingAddress ? ' (pending)' : ''}
              </Typography>
              {addressCorrected && (
                <Chip
                  size="small"
                  color="warning"
                  variant="outlined"
                  label={showOriginalAddress ? 'Hide original' : 'Corrected'}
                  onClick={() => setShowOriginalAddress((v) => !v)}
                  sx={{ flexShrink: 0 }}
                />
              )}
            </Stack>
            <Collapse in={showOriginalAddress && Boolean(card.original_address)}>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>
                Original: {card.original_address}
              </Typography>
            </Collapse>
            {canManage && onAppendAddress && (
              <Button
                size="small"
                startIcon={<EditLocationAlt />}
                onClick={() => {
                  const base = pendingAddress || {
                    address: card.job.address,
                    is_apt: card.job.is_apt,
                    unit: card.job.unit || '',
                    reason: '',
                  };
                  setDraftAddress(pendingAddress?.address || card.address || card.job.address);
                  setDraftIsApt(base.is_apt);
                  setDraftUnit(base.unit);
                  setDraftReason(base.reason);
                  setAddressEditorOpen(true);
                }}
                sx={{ mt: 0.25, minHeight: 34, px: 0.5 }}
              >
                Correct address
              </Button>
            )}
          </Box>

          <Box>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.35 }}>
              <Typography variant="caption" fontWeight={800} color="text.secondary">
                ITEMS ({card.line_items.length || 1})
              </Typography>
              {stop && (
                <Typography variant="caption" color="text.secondary">
                  {(card.line_items.filter((i) => i.scan_verified).length || 0)}/
                  {(card.line_items.filter((i) => i.scannable).length ||
                    card.line_items.filter((i) => i.sku).length ||
                    0)}{' '}
                  scanned
                </Typography>
              )}
            </Stack>
            <Stack spacing={0.5}>
              {(card.line_items.length > 0
                ? card.line_items
                : [
                    {
                      line_id: null,
                      description: card.items_delivered,
                      sku: '',
                      quantity: 1,
                      scannable: false,
                      scan_verified: false,
                    },
                  ]
              ).map((it, idx) => (
                <Box
                  key={`${it.line_id ?? 'd'}-${idx}`}
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 0.75,
                    px: 1,
                    py: 0.65,
                    borderRadius: 1,
                    border: 1,
                    borderColor: it.scan_verified ? 'success.light' : 'divider',
                    bgcolor: it.scan_verified ? 'action.selected' : 'background.paper',
                  }}
                >
                  {it.scan_verified ? (
                    <CheckCircle color="success" sx={{ fontSize: 18, mt: 0.15 }} />
                  ) : (
                    <Box
                      sx={{
                        width: 18,
                        height: 18,
                        mt: 0.15,
                        borderRadius: '50%',
                        border: 1,
                        borderColor: 'divider',
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="body2" fontWeight={700}>
                      {it.quantity > 1 ? `${it.quantity}× ` : ''}
                      {it.description}
                    </Typography>
                    {it.sku ? (
                      <Typography variant="caption" color="text.secondary">
                        SKU {it.sku}
                        {it.scannable === false ? '' : it.scan_verified ? ' · verified' : ' · scan to verify'}
                      </Typography>
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        No SKU
                      </Typography>
                    )}
                  </Box>
                </Box>
              ))}
            </Stack>
            {stop && onScanVerify && (
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <TextField
                  size="small"
                  label="Scan SKU to verify"
                  value={scanSku}
                  onChange={(e) => setScanSku(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && scanSku.trim()) {
                      e.preventDefault();
                      void (async () => {
                        setScanBusy(true);
                        try {
                          await onScanVerify(stop.id, scanSku.trim());
                          setScanSku('');
                        } finally {
                          setScanBusy(false);
                        }
                      })();
                    }
                  }}
                  fullWidth
                  autoFocus={Boolean(run && (run.phase === 'load' || run.phase === 'truck'))}
                  inputProps={{ inputMode: 'text', autoCapitalize: 'characters' }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <QrCodeScanner fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                  sx={fieldSx}
                />
                <Button
                  variant="contained"
                  disabled={!scanSku.trim() || scanBusy}
                  onClick={() => {
                    void (async () => {
                      setScanBusy(true);
                      try {
                        await onScanVerify(stop.id, scanSku.trim());
                        setScanSku('');
                      } finally {
                        setScanBusy(false);
                      }
                    })();
                  }}
                  sx={{ minHeight: 40, flexShrink: 0 }}
                >
                  Verify
                </Button>
              </Stack>
            )}
          </Box>

          <Box>
            <Typography variant="caption" fontWeight={800} color="text.secondary">
              NOTES
            </Typography>
            <Box
              onClick={() => {
                if (!notesExpanded && notes.trim().length > 120) setNotesExpanded(true);
              }}
              sx={{
                mt: 0.35,
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                px: 1.25,
                py: 1,
                minHeight: 88,
                cursor: notes.trim().length > 120 && !notesExpanded ? 'pointer' : 'default',
              }}
            >
              {canEdit ? (
                <TextField
                  fullWidth
                  multiline
                  minRows={notesExpanded ? 5 : 3}
                  maxRows={notesExpanded ? 12 : 3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onFocus={() => setNotesExpanded(true)}
                  placeholder="Gate code, stairs, call first…"
                  variant="standard"
                  InputProps={{ disableUnderline: true }}
                  sx={{
                    '& .MuiInputBase-root': { alignItems: 'flex-start' },
                    '& textarea': {
                      overflow: notesExpanded ? 'auto' : 'hidden',
                    },
                  }}
                />
              ) : (
                <Typography
                  variant="body2"
                  sx={
                    notesExpanded
                      ? undefined
                      : {
                          display: '-webkit-box',
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }
                  }
                >
                  {notes.trim() || '—'}
                </Typography>
              )}
              {!notesExpanded && notes.trim().length > 120 && (
                <Typography variant="caption" color="primary" sx={{ mt: 0.5, display: 'block' }}>
                  Tap to show full note
                </Typography>
              )}
              {notesExpanded && notes.trim().length > 120 && (
                <Button size="small" onClick={() => setNotesExpanded(false)} sx={{ mt: 0.5, minHeight: 32 }}>
                  Collapse
                </Button>
              )}
            </Box>
          </Box>

          {canManage && daySlots.length > 0 && (
            <FormControl size="small" fullWidth>
              <InputLabel>Delivery date</InputLabel>
              <Select
                label="Delivery date"
                value={availId}
                onChange={(e) => setAvailId(e.target.value as number)}
              >
                {daySlots.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.date.slice(5)} · {String(s.time_start).slice(0, 5)}–{String(s.time_end).slice(0, 5)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {(stop || events.length > 0) && (
            <Box>
              <Button
                size="small"
                onClick={() => setShowHistory((v) => !v)}
                sx={{ minHeight: 32, px: 0.5 }}
              >
                {showHistory ? 'Hide history' : 'Evidence & history'}
              </Button>
              <Collapse in={showHistory}>
                <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                  {stop && (
                    <Typography variant="caption" display="block">
                      Proof: {stop.has_proof_photo ? 'Yes' : 'No'} · Signature:{' '}
                      {stop.has_signature ? 'Yes' : 'No'}
                    </Typography>
                  )}
                  {(stop?.attachments || []).map((a) => (
                    <Button
                      key={a.id}
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      size="small"
                      sx={{ justifyContent: 'flex-start', minHeight: 32 }}
                    >
                      {a.kind}: {a.filename}
                    </Button>
                  ))}
                  {events.map((e) => (
                    <Typography key={e.id} variant="caption" display="block">
                      {e.created_at.slice(0, 16)} · {e.event_type}
                      {e.actor ? ` · ${e.actor}` : ''}
                    </Typography>
                  ))}
                </Stack>
              </Collapse>
            </Box>
          )}
        </Stack>
      </DialogContent>

      <DialogActions
        sx={{
          px: { xs: 1.5, md: 2.5 },
          py: 1.25,
          pb: 'calc(10px + env(safe-area-inset-bottom))',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: 1,
        }}
      >
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button
            href={telHref(phone || card.phone)}
            variant="outlined"
            startIcon={<LocalPhone />}
            sx={{ minHeight: 48, flex: 1 }}
          >
            Call
          </Button>
          {hasTransaction && (
            <Button
              variant="outlined"
              startIcon={<ReceiptLong />}
              disabled={txnLoading}
              onClick={() => void openTransaction()}
              sx={{ minHeight: 48, flex: 1 }}
            >
              {receiptNumber || 'Sale'}
            </Button>
          )}
        </Stack>
        {canManage && onCancel && job.status === 'scheduled' && (
          <Button
            color="error"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onCancel(job.id);
                onClose();
              } finally {
                setBusy(false);
              }
            }}
            sx={{ minHeight: 44 }}
          >
            Cancel delivery
          </Button>
        )}
        <Stack direction="row" spacing={1}>
          <Button onClick={onClose} sx={{ minHeight: 48, flex: 1 }}>
            Close
          </Button>
          <Button
            variant="contained"
            disabled={busy || !dirty || !canEdit}
            onClick={() => void handleSave()}
            sx={{ minHeight: 48, flex: 1.3 }}
          >
            Save
          </Button>
        </Stack>
      </DialogActions>

      <TransactionDetailDialog
        open={Boolean(txnCart)}
        cart={txnCart}
        onClose={() => setTxnCart(null)}
      />

      <Dialog
        open={addressEditorOpen}
        onClose={() => setAddressEditorOpen(false)}
        fullScreen={isMobile}
        fullWidth
        maxWidth="sm"
        scroll="paper"
      >
        <DialogTitle
          sx={{
            py: 1,
            pr: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontWeight: 800,
          }}
        >
          Correct address
          <IconButton aria-label="Close" onClick={() => setAddressEditorOpen(false)} edge="end">
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ px: 1.5, py: 1.25 }}>
          <Stack spacing={1.25}>
            <Alert severity="info" sx={{ py: 0.5 }}>
              Sale address stays. Tap Save on the delivery to apply.
            </Alert>
            <Typography variant="body2" color="text.secondary">
              Original: {card.original_address}
            </Typography>
            <TextField
              size="small"
              label="New address"
              value={draftAddress}
              onChange={(e) => setDraftAddress(e.target.value)}
              fullWidth
              autoFocus
              sx={fieldSx}
            />
            <Stack direction="row" spacing={1}>
              <TextField
                size="small"
                select
                label="Apt"
                value={draftIsApt ? 'yes' : 'no'}
                onChange={(e) => setDraftIsApt(e.target.value === 'yes')}
                sx={{ ...fieldSx, width: 90 }}
              >
                <MenuItem value="no">No</MenuItem>
                <MenuItem value="yes">Yes</MenuItem>
              </TextField>
              <TextField
                size="small"
                label="Unit"
                value={draftUnit}
                onChange={(e) => setDraftUnit(e.target.value)}
                disabled={!draftIsApt}
                fullWidth
                sx={fieldSx}
              />
            </Stack>
            <TextField
              size="small"
              label="Reason (optional)"
              value={draftReason}
              onChange={(e) => setDraftReason(e.target.value)}
              fullWidth
              sx={fieldSx}
            />
          </Stack>
        </DialogContent>
        <DialogActions
          sx={{
            px: 1.5,
            py: 1.25,
            pb: 'calc(10px + env(safe-area-inset-bottom))',
            gap: 1,
          }}
        >
          <Button onClick={() => setAddressEditorOpen(false)} sx={{ minHeight: 48, flex: 1 }}>
            Back
          </Button>
          <Button
            variant="contained"
            disabled={!draftAddress.trim()}
            onClick={() => {
              setPendingAddress({
                address: draftAddress.trim(),
                is_apt: draftIsApt,
                unit: draftUnit,
                reason: draftReason,
              });
              setAddressEditorOpen(false);
            }}
            sx={{ minHeight: 48, flex: 1.3 }}
          >
            Use address
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}

/** @deprecated Use DeliveryDetailsModal — kept as alias during rename. */
export const DeliveryDetailsDrawer = DeliveryDetailsModal;

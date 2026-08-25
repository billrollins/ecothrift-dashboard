import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useMemo, useState } from 'react';
import { NOTE_COMPOSER_DENSE_HEIGHT } from '../../../components/notes/ItemNoteComposer';
import { JobNotesSlot } from '../../../components/notes/JobNotesSlot';
import { useRestorationPartsOrders } from '../../../hooks/useRestorationBench';
import type { RestorationPartsOrderDTO } from '../../../types/inventory.types';
import { studio } from './studio/tarsStudioTheme';
import {
  emptyWaitFor,
  holdHasSubstance,
  normalizePending,
  WAIT_PIECE_KEYS,
  type WaitPieceKey,
} from './tarsHold';
import { isOpenPartsOrder } from './tarsPartsOrders';
import { PURCHASE_SECTION_LABELS, type PurchaseSection } from './tarsPurchase';
import type { TarsPendingInfo, TarsWaitFor } from './tarsWorkTypes';

const HOLDING_RACK = 'Holding Rack';
const BODY_HEIGHT = 540;
const FOOTER_SLOT = NOTE_COMPOSER_DENSE_HEIGHT;
const WAIT_PIECES: Array<{ key: WaitPieceKey; label: string; placeholder: string }> = [
  { key: 'time', label: 'Time', placeholder: 'How long / until when' },
  { key: 'space', label: 'Space', placeholder: 'Where it needs to sit' },
  { key: 'help', label: 'Help', placeholder: 'Who or what' },
  { key: 'other', label: 'Other', placeholder: 'What else' },
];

export interface TarsHoldSubmit {
  waitFor: TarsWaitFor;
  storageLocation: string;
}

export interface TarsHoldDialogProps {
  open: boolean;
  title?: string;
  itemLabel?: string;
  initial?: Partial<TarsPendingInfo>;
  requesting?: boolean;
  jobId?: number | null;
  itemId?: number | null;
  onClose: () => void;
  onSubmit: (info: TarsHoldSubmit) => void;
}

export function TarsHoldDialog({
  open,
  title = 'Place on hold',
  itemLabel,
  initial,
  requesting = false,
  jobId,
  itemId,
  onClose,
  onSubmit,
}: TarsHoldDialogProps) {
  const [added, setAdded] = useState<WaitPieceKey[]>([]);
  const [waitFor, setWaitFor] = useState<TarsWaitFor>(emptyWaitFor());
  const [storageLocation, setStorageLocation] = useState('');

  const orders = useRestorationPartsOrders({
    job: jobId ?? null,
    open: true,
    enabled: open && jobId != null,
  });
  const buyOrders = useMemo(
    () => (orders.data ?? []).filter(isOpenPartsOrder),
    [orders.data],
  );
  const buySections = useMemo(() => sectionsFromOrders(buyOrders), [buyOrders]);

  useEffect(() => {
    if (!open) return;
    const next = normalizePending(initial ?? {});
    setWaitFor({
      time: next.waitFor?.time ?? '',
      space: next.waitFor?.space ?? '',
      help: next.waitFor?.help ?? '',
      other: next.waitFor?.other ?? '',
    });
    setAdded(WAIT_PIECE_KEYS.filter((key) => Boolean(next.waitFor?.[key]?.trim())));
    setStorageLocation(next.storageLocation || initial?.storageLocation || '');
    // Snapshot on open only. `initial` is often a fresh object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const waitPayload: TarsWaitFor = {
    time: added.includes('time') ? waitFor.time?.trim() ?? '' : '',
    space: added.includes('space') ? waitFor.space?.trim() ?? '' : '',
    help: added.includes('help') ? waitFor.help?.trim() ?? '' : '',
    other: added.includes('other') ? waitFor.other?.trim() ?? '' : '',
  };
  const incomplete = added.some((key) => !waitPayload[key]);
  const substance = holdHasSubstance({
    needsPurchased: buySections,
    waitFor: waitPayload,
    withOtherItems: null,
  });
  const canSubmit = substance && !incomplete && !requesting;
  const rackSelected = storageLocation.trim() === HOLDING_RACK;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      waitFor: waitPayload,
      storageLocation: storageLocation.trim(),
    });
  };

  return (
    <Dialog
      open={open}
      onClose={requesting ? undefined : onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { borderRadius: '12px', maxHeight: '92vh' } }}
    >
      <DialogTitle component="div" sx={{ px: 3, pt: 2.5, pb: 0.75 }}>
        <Typography sx={{ fontWeight: 950, fontSize: '1.15rem', color: studio.ink, lineHeight: 1.25 }}>
          {title}
        </Typography>
        <Typography
          sx={{
            mt: 0.4,
            minHeight: 18,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontWeight: 800,
            fontSize: '0.8rem',
            color: studio.inkMuted,
          }}
        >
          {itemLabel || ' '}
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ px: 3, pb: 0.5, overflow: 'hidden', '&&': { pt: 1.25 } }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
            gap: 0,
            alignItems: 'stretch',
            height: { xs: 'auto', sm: BODY_HEIGHT },
            minHeight: { sm: BODY_HEIGHT },
          }}
        >
          <Stack
            sx={{
              height: '100%',
              minHeight: 0,
              pr: { sm: 2 },
              borderRight: { sm: `1px solid ${studio.rule}` },
            }}
          >
            <FieldLabel>Why it waits</FieldLabel>
            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                border: `1px solid ${studio.panelBorder}`,
                borderRadius: `${studio.radius.lg}px`,
                bgcolor: studio.panel,
                overflow: 'hidden',
              }}
            >
              <Box
                sx={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  px: 1.25,
                  py: 1,
                }}
              >
                <Stack spacing={1}>
                  {buyOrders.length === 0 ? (
                    <Typography sx={{ fontSize: '0.8rem', color: studio.inkMuted, minHeight: 22, lineHeight: 1.4 }}>
                      No live request. Add Time, Space, Help, or Other.
                    </Typography>
                  ) : (
                    buyOrders.map((order) => (
                      <BuyPiece key={order.id} order={order} />
                    ))
                  )}
                  {added.map((key) => {
                    const piece = WAIT_PIECES.find((entry) => entry.key === key);
                    if (!piece) return null;
                    return (
                      <WaitPiece
                        key={key}
                        label={piece.label}
                        placeholder={piece.placeholder}
                        value={waitFor[key] ?? ''}
                        disabled={requesting}
                        onChange={(value) => setWaitFor((prev) => ({ ...prev, [key]: value }))}
                        onRemove={() => {
                          setAdded((prev) => prev.filter((entry) => entry !== key));
                          setWaitFor((prev) => ({ ...prev, [key]: '' }));
                        }}
                      />
                    );
                  })}
                </Stack>
              </Box>
              <Stack
                direction="row"
                spacing={0.75}
                flexWrap="wrap"
                useFlexGap
                sx={{
                  px: 1.25,
                  py: 1,
                  borderTop: `1px solid ${studio.rule}`,
                  minHeight: 52,
                  bgcolor: studio.canvas,
                }}
              >
                {WAIT_PIECES.map((piece) => {
                  const used = added.includes(piece.key);
                  return (
                    <HoldChip
                      key={piece.key}
                      label={piece.label}
                      selected={used}
                      disabled={requesting || used}
                      onClick={() => {
                        if (used) return;
                        setAdded((prev) => [...prev, piece.key]);
                      }}
                    />
                  );
                })}
              </Stack>
            </Box>

            <Box sx={{ flexShrink: 0, pt: 1 }}>
              <Stack
                direction="row"
                spacing={1}
                alignItems="flex-end"
                sx={{ minHeight: FOOTER_SLOT }}
              >
                <HoldChip
                  label={HOLDING_RACK}
                  selected={rackSelected}
                  disabled={requesting}
                  fit
                  onClick={() => setStorageLocation(rackSelected ? '' : HOLDING_RACK)}
                />
                <TextField
                  size="small"
                  fullWidth
                  disabled={requesting}
                  label="Where it sits"
                  value={rackSelected ? '' : storageLocation}
                  onChange={(e) => setStorageLocation(e.target.value)}
                />
              </Stack>
            </Box>
          </Stack>

          <Stack
            sx={{
              height: '100%',
              minHeight: 0,
              flex: 1,
              pl: { sm: 2 },
              pt: { xs: 1.5, sm: 0 },
            }}
          >
            <FieldLabel>Notes</FieldLabel>
            <JobNotesSlot
              jobId={open ? jobId ?? null : null}
              itemId={open ? itemId ?? null : null}
              compose
              fill
            />
          </Stack>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, pt: 1 }}>
        <Button
          variant="outlined"
          disabled={requesting}
          onClick={onClose}
          sx={{ minWidth: 110, fontWeight: 800, textTransform: 'none' }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={!canSubmit}
          onClick={handleSubmit}
          sx={{
            minWidth: 150,
            fontWeight: 950,
            textTransform: 'none',
            bgcolor: studio.accentDark,
            '&:hover': { bgcolor: studio.accentDark },
          }}
        >
          Place on hold
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function sectionsFromOrders(orders: RestorationPartsOrderDTO[]): PurchaseSection[] {
  const seen: PurchaseSection[] = [];
  for (const order of orders) {
    for (const section of orderSections(order)) {
      if (!seen.includes(section)) seen.push(section);
    }
  }
  return seen;
}

function orderSections(order: RestorationPartsOrderDTO): PurchaseSection[] {
  const seen: PurchaseSection[] = [];
  for (const line of order.lines ?? []) {
    const section: PurchaseSection =
      line.category === 'supplies' || line.category === 'ffe' ? line.category : 'parts';
    if (!seen.includes(section)) seen.push(section);
  }
  return seen.length > 0 ? seen : ['parts'];
}

function statusLabel(status: string): string {
  const text = status.trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

function BuyPiece({ order }: { order: RestorationPartsOrderDTO }) {
  const sections = orderSections(order)
    .map((section) => PURCHASE_SECTION_LABELS[section])
    .join(' · ');
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        columnGap: 1.25,
        alignItems: 'center',
        minHeight: 52,
        borderRadius: `${studio.radius.md}px`,
        border: `1px solid ${studio.accentSoftBorder}`,
        bgcolor: studio.accentSoft,
        overflow: 'hidden',
      }}
    >
      <KindRail>{sections || 'Parts'}</KindRail>
      <Typography
        noWrap
        title={order.name || 'Order'}
        sx={{ fontSize: '0.88rem', fontWeight: 700, color: studio.ink, minWidth: 0, lineHeight: 1.3 }}
      >
        {order.name || 'Order'}
      </Typography>
      <Typography
        sx={{
          pr: 1.25,
          fontSize: '0.72rem',
          fontWeight: 700,
          color: studio.inkMuted,
          flexShrink: 0,
          letterSpacing: 0.2,
        }}
      >
        {statusLabel(order.status)}
      </Typography>
    </Box>
  );
}

function WaitPiece({
  label,
  placeholder,
  value,
  disabled,
  onChange,
  onRemove,
}: {
  label: string;
  placeholder: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onRemove: () => void;
}) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr 32px',
        columnGap: 1,
        alignItems: 'center',
        minHeight: 52,
        borderRadius: `${studio.radius.md}px`,
        border: `1px solid ${studio.panelBorder}`,
        bgcolor: studio.panel,
        overflow: 'hidden',
      }}
    >
      <KindRail>{label}</KindRail>
      <TextField
        size="small"
        fullWidth
        required
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        sx={{
          '& .MuiOutlinedInput-root': {
            bgcolor: studio.canvas,
          },
        }}
      />
      <Button
        size="small"
        disabled={disabled}
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        sx={{
          minWidth: 32,
          width: 32,
          px: 0,
          mr: 0.5,
          textTransform: 'none',
          fontWeight: 800,
          fontSize: '1.1rem',
          lineHeight: 1,
          color: studio.inkMuted,
        }}
      >
        ×
      </Button>
    </Box>
  );
}

function KindRail({ children }: { children: string }) {
  return (
    <Box
      sx={{
        alignSelf: 'stretch',
        display: 'flex',
        alignItems: 'center',
        minWidth: 76,
        px: 1.25,
        bgcolor: studio.panelMuted,
        borderRight: `1px solid ${studio.rule}`,
      }}
    >
      <Typography
        sx={{
          fontSize: '0.78rem',
          fontWeight: 800,
          color: studio.ink,
          lineHeight: 1.2,
        }}
      >
        {children}
      </Typography>
    </Box>
  );
}

function FieldLabel({ children }: { children: string }) {
  return (
    <Typography
      sx={{
        mb: 0.75,
        minHeight: 16,
        fontSize: '0.68rem',
        fontWeight: 800,
        letterSpacing: 0.7,
        textTransform: 'uppercase',
        color: studio.inkLabel,
      }}
    >
      {children}
    </Typography>
  );
}

function HoldChip({
  label,
  selected,
  disabled,
  fit,
  onClick,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  fit?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      disabled={disabled}
      onClick={onClick}
      sx={{
        height: fit ? 40 : 32,
        minHeight: fit ? 40 : 32,
        minWidth: fit ? 'max-content' : undefined,
        px: fit ? 2 : 1.25,
        flexShrink: 0,
        whiteSpace: 'nowrap',
        lineHeight: 1,
        textTransform: 'none',
        fontWeight: 800,
        fontSize: fit ? '0.8rem' : '0.78rem',
        borderRadius: '8px',
        border: '1px solid',
        borderColor: selected ? studio.accentDark : studio.panelBorder,
        bgcolor: selected ? studio.accentDark : studio.panel,
        color: selected ? '#ffffff' : studio.ink,
        '&:hover': {
          bgcolor: selected ? studio.accentDark : studio.canvas,
          borderColor: selected ? studio.accentDark : studio.accent,
        },
      }}
    >
      {label}
    </Button>
  );
}

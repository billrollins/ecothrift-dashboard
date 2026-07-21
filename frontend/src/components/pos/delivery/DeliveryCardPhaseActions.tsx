import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CheckCircle from '@mui/icons-material/CheckCircle';
import DragIndicator from '@mui/icons-material/DragIndicator';
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUp from '@mui/icons-material/KeyboardArrowUp';
import LocalPhone from '@mui/icons-material/LocalPhone';
import MapOutlined from '@mui/icons-material/MapOutlined';
import PhotoCamera from '@mui/icons-material/PhotoCamera';
import type { DeliveryCallResult, DeliveryRun } from '../../../types/pos.types';
import type { DayBoardStage, DeliveryDayCardModel } from './dayBoardUtils';
import { CALL_RESULT_OPTIONS, canCompleteStopNormally, telHref } from './driverWizardUtils';
import { SignaturePad } from './SignaturePad';

type Props = {
  card: DeliveryDayCardModel;
  stage: DayBoardStage;
  run: DeliveryRun | null;
  dragHandleProps?: Record<string, unknown>;
  onSaveCall?: (result: DeliveryCallResult, note: string) => void | Promise<void>;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onMarkLoaded?: (loaded: boolean) => void | Promise<void>;
  onMarkSecured?: (secured: boolean) => void | Promise<void>;
  onScanVerify?: (sku: string) => void | Promise<void>;
  onContactPresent?: () => void | Promise<void>;
  onMarkDelivered?: () => void | Promise<void>;
  onProofPhoto?: () => void;
  onSaveSignature?: (blob: Blob) => void | Promise<void>;
  onComplete?: () => void | Promise<void>;
  onCompleteOverride?: (reason: string) => void | Promise<void>;
  onHold?: (reason?: string) => void | Promise<void>;
  onReportIssue?: (code: string, note: string) => void | Promise<void>;
  onRelease?: () => void | Promise<void>;
  onReconcile?: (body: {
    unloaded?: boolean;
    items_stored?: boolean;
    issue_code?: string;
    issue_notes?: string;
    reconcile?: boolean;
  }) => void | Promise<void>;
  busy?: boolean;
};

export function DeliveryCardPhaseActions(props: Props) {
  const { card, stage, run } = props;
  if (!card.stop || stage === 'initial' || stage === 'completed') return null;

  if (stage === 'calls') return <CallsActions {...props} />;
  if (stage === 'route') return <RouteActions {...props} />;
  if (stage === 'load' && card.is_confirmed) return <LoadActions {...props} />;
  if (stage === 'active' && card.is_next_up) return <DriveActions {...props} />;
  if (stage === 'active' && card.stop_state === 'on_hold') {
    return (
      <Button
        size="small"
        onClick={() => void props.onRelease?.()}
        disabled={props.busy}
        sx={{ minHeight: 44, mt: 1 }}
      >
        Release hold
      </Button>
    );
  }
  if (stage === 'return' && card.needs_reconcile) {
    return <ReturnActions {...props} issueCodes={run?.return_issue_codes ?? []} />;
  }
  return null;
}

function CallsActions({ card, onSaveCall, busy }: Props) {
  const [result, setResult] = useState<DeliveryCallResult>(
    card.stop?.latest_call_result ?? 'answered_will_be_there',
  );
  const [note, setNote] = useState(card.stop?.latest_call_note || '');

  return (
    <Stack spacing={1} sx={{ pt: 1.25 }}>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        <Button
          size="small"
          variant="outlined"
          startIcon={<LocalPhone />}
          href={telHref(card.phone)}
          sx={{ minHeight: 44 }}
        >
          Call
        </Button>
        <TextField
          select
          size="small"
          label="Result"
          value={result}
          onChange={(e) => setResult(e.target.value as DeliveryCallResult)}
          sx={{ minWidth: 160, flex: 1 }}
        >
          {CALL_RESULT_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>
        {(result === 'other' || note) && (
          <TextField
            size="small"
            label="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            sx={{ minWidth: 140, flex: 1 }}
          />
        )}
        <Button
          variant="contained"
          size="small"
          disabled={busy || (result === 'other' && !note.trim())}
          onClick={() => void onSaveCall?.(result, note)}
          sx={{ minHeight: 44 }}
        >
          Save
        </Button>
      </Stack>
    </Stack>
  );
}

function RouteActions({ card, dragHandleProps, onMoveUp, onMoveDown }: Props) {
  if (!card.is_confirmed) {
    return (
      <Alert severity="warning" sx={{ mt: 1.25, py: 0 }}>
        Not routed — call again
      </Alert>
    );
  }
  return (
    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ pt: 1.25 }}>
      <Box
        {...(dragHandleProps || {})}
        sx={{
          display: 'flex',
          alignItems: 'center',
          minHeight: 44,
          minWidth: 44,
          cursor: 'grab',
          color: 'text.secondary',
        }}
        aria-label="Drag to reorder"
      >
        <DragIndicator />
      </Box>
      <Button size="small" onClick={onMoveUp} sx={{ minHeight: 44, minWidth: 44 }}>
        <KeyboardArrowUp />
      </Button>
      <Button size="small" onClick={onMoveDown} sx={{ minHeight: 44, minWidth: 44 }}>
        <KeyboardArrowDown />
      </Button>
      <Typography variant="caption" color="text.secondary">
        Drag or use arrows · ETAs update after reorder
      </Typography>
    </Stack>
  );
}

function LoadActions({ card, onMarkLoaded, onMarkSecured, onScanVerify, busy }: Props) {
  const [sku, setSku] = useState('');
  return (
    <Stack spacing={1} sx={{ pt: 1.25 }}>
      <Stack spacing={0.5}>
        {card.line_items.map((it, idx) => (
          <Box
            key={`${it.line_id}-${idx}`}
            sx={{
              display: 'flex',
              gap: 1,
              alignItems: 'center',
              px: 1,
              py: 0.5,
              borderRadius: 1,
              bgcolor: it.scan_verified ? 'success.light' : 'background.paper',
            }}
          >
            {it.scan_verified ? <CheckCircle color="success" fontSize="small" /> : null}
            <Typography variant="body2" fontWeight={700}>
              {it.quantity > 1 ? `${it.quantity}× ` : ''}
              {it.description}
              {it.sku ? ` · ${it.sku}` : ''}
            </Typography>
          </Box>
        ))}
      </Stack>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
        <FormControlLabel
          sx={{ minHeight: 44, mr: 1 }}
          control={
            <Checkbox
              checked={card.loaded}
              onChange={(_, v) => void onMarkLoaded?.(v)}
              disabled={busy}
            />
          }
          label="Loaded"
        />
        <FormControlLabel
          sx={{ minHeight: 44 }}
          control={
            <Checkbox
              checked={card.secured}
              onChange={(_, v) => void onMarkSecured?.(v)}
              disabled={busy}
            />
          }
          label="Secured"
        />
        <TextField
          size="small"
          label="Scan SKU to verify"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && sku.trim()) {
              e.preventDefault();
              void onScanVerify?.(sku.trim());
              setSku('');
            }
          }}
          fullWidth
          inputProps={{ inputMode: 'text', autoCapitalize: 'characters' }}
          sx={{ flex: 1, minWidth: 160 }}
        />
        <Button
          size="small"
          variant="contained"
          disabled={!sku.trim() || busy}
          onClick={() => {
            void onScanVerify?.(sku.trim());
            setSku('');
          }}
          sx={{ minHeight: 44 }}
        >
          Verify
        </Button>
      </Stack>
    </Stack>
  );
}

function DriveActions(props: Props) {
  const { card, onContactPresent, onMarkDelivered, onProofPhoto, onSaveSignature, onComplete, onCompleteOverride, onHold, onReportIssue, busy } = props;
  const stop = card.stop!;
  const canComplete = canCompleteStopNormally(stop);
  const [overrideReason, setOverrideReason] = useState('');
  const [showOverride, setShowOverride] = useState(false);
  const [issueCode, setIssueCode] = useState('no_customer');
  const [issueNote, setIssueNote] = useState('');
  const [showIssue, setShowIssue] = useState(false);
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(card.address)}&travelmode=driving`;

  return (
    <Stack spacing={1} sx={{ pt: 1.25 }}>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        <Button
          variant="contained"
          startIcon={<LocalPhone />}
          href={telHref(card.phone)}
          sx={{ minHeight: 48, flex: 1 }}
        >
          Call
        </Button>
        <Button
          variant="outlined"
          startIcon={<MapOutlined />}
          href={mapsUrl}
          target="_blank"
          rel="noreferrer"
          sx={{ minHeight: 48, flex: 1 }}
        >
          Navigate
        </Button>
      </Stack>

      <FormControlLabel
        sx={{ minHeight: 48, mx: 0 }}
        control={
          <Checkbox
            checked={Boolean(stop.contact_present_at)}
            onChange={() => void onContactPresent?.()}
            disabled={busy}
          />
        }
        label={<Typography fontWeight={700}>Contact is here</Typography>}
      />
      <FormControlLabel
        sx={{ minHeight: 48, mx: 0 }}
        control={
          <Checkbox
            checked={Boolean(stop.delivered_at)}
            disabled={!stop.contact_present_at || busy}
            onChange={() => void onMarkDelivered?.()}
          />
        }
        label={<Typography fontWeight={700}>Items delivered</Typography>}
      />
      <Button
        variant={stop.has_proof_photo ? 'contained' : 'outlined'}
        color={stop.has_proof_photo ? 'success' : 'primary'}
        startIcon={stop.has_proof_photo ? <CheckCircle /> : <PhotoCamera />}
        disabled={!stop.delivered_at || busy}
        onClick={() => onProofPhoto?.()}
        sx={{ minHeight: 48 }}
      >
        {stop.has_proof_photo ? 'Proof photo saved' : 'Take proof photo'}
      </Button>
      {stop.has_signature ? (
        <Alert severity="success">Signature on file</Alert>
      ) : (
        <Box sx={{ opacity: stop.delivered_at ? 1 : 0.5, pointerEvents: stop.delivered_at ? 'auto' : 'none' }}>
          <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5 }}>
            Customer signature
          </Typography>
          <SignaturePad onCapture={(blob) => onSaveSignature?.(blob)} disabled={busy || !stop.delivered_at} />
        </Box>
      )}

      <Stack direction="row" spacing={1}>
        <Button
          variant="contained"
          color="success"
          fullWidth
          disabled={!canComplete || busy}
          onClick={() => void onComplete?.()}
          sx={{ minHeight: 52 }}
        >
          Complete stop
        </Button>
        <Button color="warning" onClick={() => setShowOverride((v) => !v)} sx={{ minHeight: 52 }}>
          Override
        </Button>
      </Stack>

      {showOverride && (
        <Stack spacing={1}>
          <TextField
            label="Override reason"
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            multiline
            minRows={2}
            size="small"
          />
          <Button
            color="warning"
            variant="contained"
            disabled={!overrideReason.trim() || busy}
            onClick={() => void onCompleteOverride?.(overrideReason.trim())}
            sx={{ minHeight: 44 }}
          >
            Override & complete
          </Button>
        </Stack>
      )}

      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        <Button color="warning" onClick={() => void onHold?.('Call again')} sx={{ minHeight: 44 }}>
          Hold / call again
        </Button>
        <Button color="error" onClick={() => setShowIssue((v) => !v)} sx={{ minHeight: 44 }}>
          Report issue
        </Button>
      </Stack>

      {showIssue && (
        <Stack spacing={1}>
          <TextField
            select
            size="small"
            label="Issue"
            value={issueCode}
            onChange={(e) => setIssueCode(e.target.value)}
          >
            {(props.run?.return_issue_codes?.length
              ? props.run.return_issue_codes
              : [
                  { value: 'no_customer', label: 'No customer' },
                  { value: 'customer_refused', label: 'Customer refused' },
                  { value: 'could_not_access', label: 'Could not access' },
                  { value: 'item_issue', label: 'Item issue' },
                  { value: 'other', label: 'Other' },
                ]
            ).map((c) => (
              <MenuItem key={c.value} value={c.value}>
                {c.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label="Notes (required)"
            value={issueNote}
            onChange={(e) => setIssueNote(e.target.value)}
            multiline
            minRows={2}
          />
          <Button
            color="error"
            variant="contained"
            disabled={!issueNote.trim() || busy}
            onClick={() => void onReportIssue?.(issueCode, issueNote.trim())}
            sx={{ minHeight: 44 }}
          >
            Report & hold
          </Button>
        </Stack>
      )}
    </Stack>
  );
}

function ReturnActions({
  card,
  onReconcile,
  busy,
  issueCodes,
}: Props & { issueCodes: DeliveryRun['return_issue_codes'] }) {
  const stop = card.stop!;
  const [unloaded, setUnloaded] = useState(Boolean(stop.returned_unloaded_at));
  const [stored, setStored] = useState(Boolean(stop.returned_items_stored_at));
  const [issueCode, setIssueCode] = useState(stop.return_issue_code || 'no_customer');
  const [issueNotes, setIssueNotes] = useState(stop.return_issue_notes || '');

  if (stop.return_reconciled_at) {
    return <Alert severity="success" sx={{ mt: 1.25 }}>Reconciled</Alert>;
  }

  return (
    <Stack spacing={1} sx={{ pt: 1.25 }}>
      <FormControlLabel
        sx={{ minHeight: 44, mx: 0 }}
        control={<Checkbox checked={unloaded} onChange={(_, v) => setUnloaded(v)} />}
        label="Unloaded from truck"
      />
      <FormControlLabel
        sx={{ minHeight: 44, mx: 0 }}
        control={<Checkbox checked={stored} onChange={(_, v) => setStored(v)} />}
        label="Items put back"
      />
      <TextField
        select
        size="small"
        label="Issue"
        value={issueCode}
        onChange={(e) => setIssueCode(e.target.value)}
      >
        {issueCodes.map((c) => (
          <MenuItem key={c.value} value={c.value}>
            {c.label}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        size="small"
        label="Notes"
        value={issueNotes}
        onChange={(e) => setIssueNotes(e.target.value)}
        multiline
        minRows={2}
      />
      <Button
        variant="contained"
        disabled={busy || !unloaded || !stored || !issueNotes.trim()}
        onClick={() =>
          void onReconcile?.({
            unloaded,
            items_stored: stored,
            issue_code: issueCode,
            issue_notes: issueNotes,
            reconcile: true,
          })
        }
        sx={{ minHeight: 48 }}
      >
        Mark reconciled
      </Button>
    </Stack>
  );
}

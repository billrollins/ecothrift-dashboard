import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  MobileStepper,
  Paper,
  Select,
  Switch,
  TextField,
  Typography,
  useTheme,
  alpha,
} from '@mui/material';
import Mic from '@mui/icons-material/Mic';
import type { ChangeEvent } from 'react';

import type { PalletSideId, ReceivingDetailDTO } from '../../../types/inventory.types';
import type { PendingPhotoKind } from '../../../services/receiving/receivingClient';
import { PALLET_SIDES } from '../../../services/receiving/receivingClient';
import { rcvSurface } from './receivingTheme';

interface Props {
  receiving: ReceivingDetailDTO;
  orderLabel: string;
  step: number;
  palletCountInput: number;
  issuesDraft: string;
  uploadingKey: string | null;
  onStepChange: (n: number) => void;
  onReceivedDateChange: (iso: string | null) => void;
  onPalletCountChange: (v: number) => void;
  onQuickFill: () => void;
  onConditionChange: (v: NonNullable<ReceivingDetailDTO['condition']>) => void;
  onIssuesDraftChange: (v: string) => void;
  onIssuesBlur: () => void;
  onBolTruckPick: (kind: Exclude<PendingPhotoKind, 'pallet_side'>, fileList: FileList | null) => void;
  onPalletPick: (pallet: number, side: PalletSideId, fileList: FileList | null) => void;
  onDamaged: (palletNumber: number, damaged: boolean) => void;
  onRequestComplete: () => void;
  disabled?: boolean;
}

const STEPS = ['Details', 'BOL / truck', 'Pallets', 'Finish'];

function hasBol(m: ReceivingDetailDTO) {
  return m.attachments.some((a) => a.kind === 'bol');
}
function hasTruck(m: ReceivingDetailDTO) {
  return m.attachments.some((a) => a.kind === 'truck');
}
function palletSideFilled(m: ReceivingDetailDTO, palletNumber: number, side: string) {
  return m.attachments.some(
    (a) => a.kind === 'pallet_side' && a.pallet_number === palletNumber && a.side === side,
  );
}

export default function ReceivingMobileWizard(props: Props) {
  const {
    receiving: m,
    orderLabel,
    step,
    palletCountInput,
    issuesDraft,
    uploadingKey,
    onStepChange,
    onReceivedDateChange,
    onPalletCountChange,
    onQuickFill,
    onConditionChange,
    onIssuesDraftChange,
    onIssuesBlur,
    onBolTruckPick,
    onPalletPick,
    onDamaged,
    onRequestComplete,
    disabled,
  } = props;

  const theme = useTheme();
  const warnBg = alpha(theme.palette.warning.main, 0.14);
  const bolOk = hasBol(m);
  const truckOk = hasTruck(m);
  const cond = (m.condition || '').trim();

  function tryDictate() {
    interface Constructable {
      new (): { start(): void; onresult: ((e: { results: Array<Array<{ transcript: string }>> }) => void) | null };
    }
    const W = typeof window !== 'undefined' ? (window as unknown as { SpeechRecognition?: Constructable }) : null;
    const SR =
      W?.SpeechRecognition ??
      ((window as unknown as { webkitSpeechRecognition?: Constructable }).webkitSpeechRecognition);
    if (!SR) return;
    const rec = new SR();
    rec.onresult = (ev: { results: Array<Array<{ transcript: string }>> }) => {
      const text = ev.results?.[0]?.[0]?.transcript ?? '';
      if (!text.trim()) return;
      onIssuesDraftChange((issuesDraft ? `${issuesDraft} ` : '') + text.trim());
    };
    rec.start();
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: rcvSurface.page }}>
      <Paper square elevation={0} sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="subtitle1" fontWeight={600}>
          {orderLabel}
        </Typography>
        {m.completed_at ? (
          <Chip sx={{ mt: 0.5 }} size="small" label="Receiving complete" color="success" />
        ) : (
          <Chip sx={{ mt: 0.5 }} size="small" label="Draft" color="warning" />
        )}
      </Paper>
      <MobileStepper
        variant="dots"
        steps={STEPS.length}
        position="static"
        activeStep={step}
        sx={{ flexGrow: 0 }}
        nextButton={
          <Button size="small" disabled={step >= STEPS.length - 1} onClick={() => onStepChange(step + 1)}>
            Next
          </Button>
        }
        backButton={
          <Button size="small" disabled={step <= 0} onClick={() => onStepChange(step - 1)}>
            Back
          </Button>
        }
      />
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {step === 0 && (
          <Box>
            <TextField
              label="Received date"
              type="date"
              size="small"
              fullWidth
              value={m.received_date ?? ''}
              disabled={disabled || !!m.completed_at}
              InputLabelProps={{ shrink: true }}
              onChange={(e) => onReceivedDateChange(e.target.value || null)}
            />
            <FormControl fullWidth size="small" sx={{ mt: 2 }} disabled={disabled || !!m.completed_at}>
              <InputLabel id="mb-cond-l">Load condition</InputLabel>
              <Select<string>
                labelId="mb-cond-l"
                label="Load condition"
                value={cond || ''}
                onChange={(e) =>
                  onConditionChange(
                    (e.target.value === ''
                      ? ''
                      : e.target.value) as NonNullable<ReceivingDetailDTO['condition']>,
                  )
                }
              >
                <MenuItem value="">
                  <em>Unset</em>
                </MenuItem>
                <MenuItem value="good">Good</MenuItem>
                <MenuItem value="mixed">Mixed</MenuItem>
                <MenuItem value="damaged">Damaged</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Issues / notes"
              fullWidth
              multiline
              minRows={3}
              sx={{ mt: 2 }}
              value={issuesDraft}
              disabled={disabled || !!m.completed_at}
              onChange={(e) => onIssuesDraftChange(e.target.value)}
              onBlur={onIssuesBlur}
            />
            <Button
              sx={{ mt: 1 }}
              size="small"
              startIcon={<Mic />}
              onClick={tryDictate}
              disabled={disabled || !!m.completed_at}
            >
              Dictate issues (when supported)
            </Button>
          </Box>
        )}
        {step === 1 && (
          <Box>
            <Card variant="outlined" sx={{ mb: 2, bgcolor: bolOk ? undefined : warnBg }}>
              <CardContent>
                <Typography fontWeight={600}>BOL {bolOk ? '✓' : ''}</Typography>
                <Button component="label" variant="text" disabled={disabled || !!m.completed_at}>
                  Upload
                  <input
                    hidden
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => onBolTruckPick('bol', e.target.files)}
                  />
                </Button>
              </CardContent>
            </Card>
            <Card variant="outlined" sx={{ bgcolor: truckOk ? undefined : warnBg }}>
              <CardContent>
                <Typography fontWeight={600}>Truck / trailer {truckOk ? '✓' : ''}</Typography>
                <Button component="label" variant="text" disabled={disabled || !!m.completed_at}>
                  Upload
                  <input
                    hidden
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => onBolTruckPick('truck', e.target.files)}
                  />
                </Button>
              </CardContent>
            </Card>
          </Box>
        )}
        {step === 2 && (
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              <Button variant="outlined" size="small" disabled={disabled || !!m.completed_at} onClick={onQuickFill}>
                Quick fill 1 pallet
              </Button>
              <TextField
                size="small"
                type="number"
                label="# pallets"
                sx={{ width: 120 }}
                value={palletCountInput || ''}
                disabled={disabled || !!m.completed_at}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10);
                  onPalletCountChange(Number.isFinite(n) ? n : 0);
                }}
              />
            </Box>
            {Array.from({ length: palletCountInput || 0 }).map((_, i) => {
              const palletNumber = i + 1;
              const dmg = m.pallets.find((p) => p.pallet_number === palletNumber)?.damaged ?? false;
              return (
                <Card key={palletNumber} variant="outlined" sx={{ mb: 2 }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <Typography fontWeight={600}>Pallet {palletNumber}</Typography>
                      <Switch
                        size="small"
                        checked={dmg}
                        disabled={disabled || !!m.completed_at}
                        onChange={(_, chk) => onDamaged(palletNumber, chk)}
                      />
                    </Box>
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 1 }}>
                      {PALLET_SIDES.map((side) => {
                        const pk = `${palletNumber}-${side}`;
                        const filled = palletSideFilled(m, palletNumber, side);
                        const uploading = uploadingKey === pk;
                        return (
                          <Box key={pk}>
                            <Typography variant="caption">{side}</Typography>
                            <Button
                              fullWidth
                              size="small"
                              variant={filled ? 'contained' : 'outlined'}
                              component="label"
                              disabled={disabled || uploading || !!m.completed_at}
                            >
                              Photo
                              <input
                                hidden
                                type="file"
                                accept="image/*"
                                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                  void onPalletPick(palletNumber, side as PalletSideId, e.target.files)
                                }
                              />
                            </Button>
                          </Box>
                        );
                      })}
                    </Box>
                  </CardContent>
                </Card>
              );
            })}
          </Box>
        )}
        {step === 3 && (
          <Box>
            <Typography variant="body2" gutterBottom>
              Complete records receiving and marks the order delivered with your received-on date (or today).
            </Typography>
            <Button
              variant="contained"
              fullWidth
              disabled={disabled || !!m.completed_at || !(palletCountInput > 0) || !cond}
              onClick={onRequestComplete}
            >
              Complete & deliver
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  );
}

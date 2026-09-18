/**
 * Kiosk card block on the employee drawer. The token is shown exactly once,
 * right after issue or reprint, as a Code 128 barcode ready to print. It is
 * never fetched again; the server keeps only the hash.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import BadgeOutlined from '@mui/icons-material/BadgeOutlined';
import Print from '@mui/icons-material/Print';
import JsBarcode from 'jsbarcode';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { issueBadge, reprintBadge, revokeBadge } from '../../api/kiosk.api';
import { localPrintService } from '../../services/localPrintService';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { DrawerSection, Fact, formatDay } from './userChrome';

type BadgeStatus = 'none' | 'active' | 'revoked';

const CARD_W = 1050; // 3.5in at 300dpi
const CARD_H = 600; // 2in at 300dpi

function drawCard(canvas: HTMLCanvasElement, token: string, name: string, number: string) {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.fillStyle = '#111';
  ctx.font = '700 64px system-ui, sans-serif';
  ctx.fillText(name, 60, 110);
  ctx.font = '500 40px system-ui, sans-serif';
  ctx.fillStyle = '#555';
  ctx.fillText(`Eco-Thrift  ·  ${number}`, 60, 170);
  const bar = document.createElement('canvas');
  JsBarcode(bar, token, { format: 'CODE128', width: 4, height: 220, displayValue: false, margin: 0 });
  ctx.drawImage(bar, (CARD_W - bar.width) / 2, 230);
  ctx.fillStyle = '#111';
  ctx.font = '600 44px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(token, CARD_W / 2, 530);
}

function TokenDialog({ token, name, number, onClose }: { token: string; name: string; number: string; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { enqueueSnackbar } = useSnackbar();
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (canvasRef.current) drawCard(canvasRef.current, token, name, number);
  }, [token, name, number]);

  async function print() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setPrinting(true);
    try {
      const image_base64 = canvas.toDataURL('image/png').split(',')[1];
      await localPrintService.printImageCopies({ image_base64, copies: 1, dpi: 300, doc_name: `Card ${number}` });
      enqueueSnackbar('Card sent to the printer.', { variant: 'success' });
    } catch (err) {
      enqueueSnackbar((err as Error)?.message || 'Print server not reachable.', { variant: 'error' });
    } finally {
      setPrinting(false);
    }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>Kiosk card</DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          This code is shown once. Print it now. Closing this window hides it for good; reprint rotates the card.
        </Alert>
        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden', bgcolor: '#fff' }}>
          <canvas ref={canvasRef} data-testid="badge-canvas" style={{ width: '100%', display: 'block' }} />
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, fontFamily: 'monospace', textAlign: 'center', letterSpacing: '0.1em' }}>
          {token}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Done</Button>
        <Button variant="contained" startIcon={<Print />} onClick={() => void print()} disabled={printing}>
          Print card
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function BadgeBlock({
  userId,
  fullName,
  employeeNumber,
  status,
  issuedAt,
  revokedAt,
  canEdit,
}: {
  userId: number;
  fullName: string;
  employeeNumber: string;
  status: BadgeStatus;
  issuedAt: string | null | undefined;
  revokedAt: string | null | undefined;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [token, setToken] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [confirmReprint, setConfirmReprint] = useState(false);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['users', userId] });
    void queryClient.invalidateQueries({ queryKey: ['users'] });
  };
  const fail = (err: unknown) => {
    const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
    enqueueSnackbar(detail || 'Could not update the card.', { variant: 'error' });
  };

  const issue = useMutation({
    mutationFn: async () => (await issueBadge(userId)).data,
    onSuccess: (data) => {
      setToken(data.token);
      refresh();
    },
    onError: fail,
  });
  const reprint = useMutation({
    mutationFn: async () => (await reprintBadge(userId)).data,
    onSuccess: (data) => {
      setToken(data.token);
      refresh();
    },
    onError: fail,
  });
  const revoke = useMutation({
    mutationFn: async () => (await revokeBadge(userId)).data,
    onSuccess: () => {
      enqueueSnackbar('Card revoked.', { variant: 'success' });
      refresh();
    },
    onError: fail,
  });
  const busy = issue.isPending || reprint.isPending || revoke.isPending;

  const chip =
    status === 'active' ? (
      <Chip size="small" color="success" variant="outlined" label="Card active" />
    ) : status === 'revoked' ? (
      <Chip size="small" color="warning" variant="outlined" label="Card revoked" />
    ) : (
      <Chip size="small" variant="outlined" label="No card" />
    );

  return (
    <DrawerSection title="Kiosk card">
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <BadgeOutlined fontSize="small" color="action" />
        {chip}
      </Stack>
      <Fact label="Issued" value={formatDay(issuedAt) || 'Never'} tone={issuedAt ? 'neutral' : 'muted'} />
      {revokedAt ? <Fact label="Revoked" value={formatDay(revokedAt)} tone="warn" /> : null}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        A Code 128 card for the time kiosk. Reprint rotates the code; the old card stops working at once.
      </Typography>
      {canEdit ? (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
          {status !== 'active' ? (
            <Button size="small" variant="contained" onClick={() => issue.mutate()} disabled={busy}>
              Issue card
            </Button>
          ) : null}
          {status === 'active' ? (
            <Button size="small" variant="outlined" onClick={() => setConfirmReprint(true)} disabled={busy}>
              Reprint
            </Button>
          ) : null}
          {status === 'active' ? (
            <Button size="small" variant="outlined" color="warning" onClick={() => setConfirmRevoke(true)} disabled={busy}>
              Revoke
            </Button>
          ) : null}
        </Stack>
      ) : null}

      {token ? <TokenDialog token={token} name={fullName} number={employeeNumber} onClose={() => setToken(null)} /> : null}

      <ConfirmDialog
        open={confirmReprint}
        title="Reprint card?"
        message="A new code is minted and the card in their wallet stops working right away."
        confirmLabel="Reprint"
        onConfirm={() => {
          setConfirmReprint(false);
          reprint.mutate();
        }}
        onCancel={() => setConfirmReprint(false)}
      />
      <ConfirmDialog
        open={confirmRevoke}
        title="Revoke card?"
        message="The kiosk will stop recognizing this card. You can issue a new one later."
        confirmLabel="Revoke"
        onConfirm={() => {
          setConfirmRevoke(false);
          revoke.mutate();
        }}
        onCancel={() => setConfirmRevoke(false)}
      />
    </DrawerSection>
  );
}

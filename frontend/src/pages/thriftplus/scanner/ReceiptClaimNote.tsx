/**
 * A non-member receipt's QR, claimed (owner 2026-11-20, Dash Update #204): once the new member has finished joining,
 * the kept token (receiptClaim.ts) is sent and "12.60 ThriftBucks from today's trip are in your account." shows over
 * the screen (an overlay: nothing below it moves). A refusal shows its words the same way.
 */
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Box, ButtonBase } from '@mui/material';
import { claimReceipt, ThriftPlusError, type ThriftPlusSession } from '../../../api/thriftPlusScanner.api';
import { canClaimNow, forgetReceiptClaim, keepAfterRefusal, pendingReceiptClaim } from './receiptClaim';
import { sc } from './scannerTheme';
import { thriftPlusKeys } from './useThriftPlus';

export interface ClaimNote {
  ok: boolean;
  text: string;
}

export function useReceiptClaim(session: ThriftPlusSession | undefined): [ClaimNote | null, () => void] {
  const qc = useQueryClient();
  const [note, setNote] = useState<ClaimNote | null>(null);
  const busy = useRef(false);
  const ready = canClaimNow(session);
  useEffect(() => {
    if (!ready || busy.current) return;
    const token = pendingReceiptClaim();
    if (!token) return;
    busy.current = true;
    claimReceipt(token)
      .then((r) => {
        forgetReceiptClaim();
        setNote({ ok: true, text: r.message });
        void qc.invalidateQueries({ queryKey: thriftPlusKeys.all });
      })
      .catch((e: unknown) => {
        const code = e instanceof ThriftPlusError ? e.code : undefined;
        if (keepAfterRefusal(code)) return;
        forgetReceiptClaim();
        setNote({ ok: false, text: e instanceof Error ? e.message : 'Your ThriftBucks could not be added. Ask at the register.' });
      })
      .finally(() => {
        busy.current = false;
      });
  }, [ready, qc]);
  return [note, () => setNote(null)];
}

export function ReceiptClaimNote({ note, onClose }: { note: ClaimNote; onClose: () => void }) {
  return (
    <Box
      role="status"
      sx={{
        position: 'absolute',
        top: 12,
        left: 12,
        right: 12,
        zIndex: 30,
        p: 2,
        borderRadius: 2,
        bgcolor: note.ok ? sc.greenDeep : sc.card,
        color: note.ok ? '#fff' : sc.ink,
        border: note.ok ? 'none' : `1px solid ${sc.line}`,
        boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
      }}
    >
      <Box sx={{ flex: 1 }}>
        <Box sx={{ fontSize: 17, fontWeight: 800, lineHeight: 1.25 }}>{note.text}</Box>
        {note.ok && <Box sx={{ fontSize: 14, opacity: 0.9, mt: 0.5 }}>Use them from tomorrow.</Box>}
      </Box>
      <ButtonBase
        onClick={onClose}
        sx={{ px: 1.5, py: 1, borderRadius: 1.5, fontWeight: 800, fontSize: 15, bgcolor: note.ok ? 'rgba(255,255,255,0.18)' : sc.greenTint }}
      >
        OK
      </ButtonBase>
    </Box>
  );
}

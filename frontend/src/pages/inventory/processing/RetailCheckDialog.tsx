import { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';

/** What the server sends (409, code `retail_check`) when a check-in's retail looks wrong. */
export interface RetailCheckPayload {
  code: 'retail_check';
  detail?: string;
  retail: string | null;
  price: string | null;
  reasons: string[];
  typical: string | null;
  typical_from: number;
  source: string;
}

export interface RetailCheckAnswer {
  retail_check: 'confirm' | 'fix' | 'none';
  retail?: string;
}

/** The retail check payload inside an axios error, or null. */
export function retailCheckFrom(err: unknown): RetailCheckPayload | null {
  const res = (err as { response?: { status?: number; data?: unknown } } | null)?.response;
  const data = res?.data as Partial<RetailCheckPayload> | undefined;
  if (res?.status === 409 && data?.code === 'retail_check') return data as RetailCheckPayload;
  return null;
}

function money(value: string | null | undefined): string {
  const n = value == null ? Number.NaN : Number.parseFloat(value);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : 'none';
}

/**
 * Retail check before the tag prints (retail_tags_and_social Phase 1). `ask` opens the dialog and resolves with
 * the processor's answer, or null when they back out (nothing is checked in).
 */
export function useRetailCheckPrompt() {
  const [check, setCheck] = useState<RetailCheckPayload | null>(null);
  const resolver = useRef<((answer: RetailCheckAnswer | null) => void) | null>(null);

  const ask = useCallback((payload: RetailCheckPayload) => {
    setCheck(payload);
    return new Promise<RetailCheckAnswer | null>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const finish = useCallback((answer: RetailCheckAnswer | null) => {
    resolver.current?.(answer);
    resolver.current = null;
    setCheck(null);
  }, []);

  const dialog = <RetailCheckDialog check={check} onAnswer={finish} />;
  return { ask, dialog };
}

/**
 * Re-send a check-in until the retail check is answered. Returns the response, or null when the processor
 * cancelled. Other errors are thrown as they were.
 */
export async function withRetailCheck<B extends object, R>(
  body: B,
  send: (body: B) => Promise<R>,
  ask: (payload: RetailCheckPayload) => Promise<RetailCheckAnswer | null>,
): Promise<R | null> {
  let current = body;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await send(current);
    } catch (err) {
      const check = retailCheckFrom(err);
      if (!check) throw err;
      const answer = await ask(check);
      if (!answer) return null;
      current = { ...current, ...answer } as B;
    }
  }
  return send(current);
}

export default function RetailCheckDialog({
  check,
  onAnswer,
}: {
  check: RetailCheckPayload | null;
  onAnswer: (answer: RetailCheckAnswer | null) => void;
}) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const [fixing, setFixing] = useState(false);
  const [value, setValue] = useState('');

  const close = (answer: RetailCheckAnswer | null) => {
    setFixing(false);
    setValue('');
    onAnswer(answer);
  };
  const fixValue = Number.parseFloat(value);
  const fixOk = Number.isFinite(fixValue) && fixValue > 0;

  return (
    <Dialog open={check != null} onClose={() => close(null)} fullScreen={phone} maxWidth="xs" fullWidth>
      <DialogTitle>Check the retail</DialogTitle>
      <DialogContent>
        {check && (
          <Stack spacing={2}>
            <Box sx={{ display: 'flex', gap: 3 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">Retail</Typography>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>{money(check.retail)}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Tag price</Typography>
                <Typography variant="h5">{money(check.price)}</Typography>
              </Box>
              {check.typical && (
                <Box>
                  <Typography variant="caption" color="text.secondary">Usually</Typography>
                  <Typography variant="h5">{money(check.typical)}</Typography>
                </Box>
              )}
            </Box>
            <Alert severity="warning" sx={{ '& ul': { m: 0, pl: 2 } }}>
              <ul>
                {check.reasons.map((r) => <li key={r}>{r}</li>)}
              </ul>
            </Alert>
            <Typography variant="body2" color="text.secondary">
              The tag shows retail only when it is right. Look it up if you are not sure.
            </Typography>
            {fixing && (
              <TextField
                autoFocus
                label="Right retail"
                value={value}
                onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ''))}
                inputProps={{ inputMode: 'decimal' }}
                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && fixOk) close({ retail_check: 'fix', retail: fixValue.toFixed(2) });
                }}
              />
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1, px: 3, pb: 2 }}>
        <Button onClick={() => close(null)}>Cancel</Button>
        <Box sx={{ flex: 1 }} />
        {fixing ? (
          <Button
            variant="contained"
            disabled={!fixOk}
            onClick={() => close({ retail_check: 'fix', retail: fixValue.toFixed(2) })}
          >
            Save retail
          </Button>
        ) : (
          <>
            <Button onClick={() => close({ retail_check: 'none' })}>No retail on tag</Button>
            <Button variant="outlined" onClick={() => setFixing(true)}>Fix it</Button>
            <Button variant="contained" onClick={() => close({ retail_check: 'confirm' })}>It is right</Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

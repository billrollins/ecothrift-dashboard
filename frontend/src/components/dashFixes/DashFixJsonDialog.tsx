import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { checkDashFixDoc, saveDashFixDoc, type DashFixCheck } from '../../api/dashFixes.api';
import { parseDashFixText } from './dashFixesFile';

function errorText(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return typeof detail === 'string' && detail ? detail : fallback;
}

/**
 * Upload or paste the Dash Updates JSON an AI returned. The server checks it and lists every change;
 * Save is the only moment anything is written.
 */
export function DashFixJsonDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState('');
  const [parseError, setParseError] = useState('');
  const [check, setCheck] = useState<DashFixCheck | null>(null);
  const [allowBlocked, setAllowBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const doc = useRef<unknown>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setText('');
    setParseError('');
    setCheck(null);
    setAllowBlocked(false);
    setError('');
    doc.current = null;
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    setCheck(null);
    doc.current = null;
    if (!text.trim()) {
      setParseError('');
      return undefined;
    }
    const parsed = parseDashFixText(text);
    if (!parsed.ok) {
      setParseError(parsed.error);
      return undefined;
    }
    setParseError('');
    const timer = setTimeout(async () => {
      try {
        const { data } = await checkDashFixDoc(parsed.doc, allowBlocked);
        doc.current = parsed.doc;
        setCheck(data);
      } catch (err) {
        setError(errorText(err, 'Could not check the file.'));
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [text, open, allowBlocked]);

  async function save() {
    if (!doc.current) return;
    setBusy(true);
    setError('');
    try {
      await saveDashFixDoc(doc.current, allowBlocked);
      onSaved();
    } catch (err) {
      setError(errorText(err, 'Could not save.'));
    } finally {
      setBusy(false);
    }
  }

  const onlyBlocked = Boolean(check && !check.ok && check.errors.length === 0 && check.blocked.length > 0);

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="md" fullWidth data-testid="fix-json-dialog">
      <DialogTitle>
        Upload or paste JSON
        <Typography variant="body2" color="text.secondary">
          Upload the .json your AI returned, or paste it (chat text around it is fine). Nothing changes until Save.
        </Typography>
      </DialogTitle>
      <DialogContent>
        <TextField
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={'{\n  "format": "ecothrift.dash-fixes/1",\n  "tasks": [ … ]\n}'}
          multiline
          minRows={10}
          maxRows={20}
          fullWidth
          autoFocus
          slotProps={{ htmlInput: { spellCheck: false, 'data-testid': 'fix-json-text', style: { fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12.5 } } }}
        />
        <Box sx={{ mt: 1 }}>
          <Button size="small" onClick={() => fileInput.current?.click()}>Upload a .json file</Button>
          <input
            ref={fileInput}
            type="file"
            hidden
            accept=".json,.txt"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) setText(await file.text());
            }}
          />
        </Box>
        {parseError ? <Alert severity="warning" sx={{ mt: 1.5 }}>{parseError}</Alert> : null}
        {check ? (
          <Alert severity={check.ok ? (check.changes.length ? 'success' : 'info') : 'error'} sx={{ mt: 2 }} data-testid="fix-json-check">
            <b>
              {check.ok
                ? (check.changes.length ? `Ready: ${check.changes.length} change${check.changes.length === 1 ? '' : 's'}` : 'Valid, but nothing would change')
                : 'Cannot save this yet'}
            </b>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {check.errors.map((line) => <li key={line}>{line}</li>)}
              {check.blocked.map((line) => <li key={line}>{line}</li>)}
              {check.ok ? check.changes.map((line) => <li key={line}>{line}</li>) : null}
              {check.warnings.map((line) => <li key={line}>Note: {line}</li>)}
            </ul>
          </Alert>
        ) : null}
        {onlyBlocked ? (
          <FormControlLabel
            control={<Checkbox checked={allowBlocked} onChange={(event) => setAllowBlocked(event.target.checked)} slotProps={{ input: { 'data-testid': 'fix-json-allow' } as React.InputHTMLAttributes<HTMLInputElement> }} />}
            label="Apply anyway (I know these wait on unfinished tasks)"
          />
        ) : null}
        {error ? <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert> : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={busy || !check?.ok || !check.changes.length} data-testid="fix-json-save">
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

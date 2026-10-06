import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { checkCareers, runAi, saveCareers, type AiChoices, type CheckResponse } from '../../api/hiring.api';
import { ccTokens } from '../../theme';
import { downloadJson, parseCareersText } from './careersFile';
import { errorText } from './peopleUi';

function CheckSummary({ check }: { check: CheckResponse }) {
  if (!check.ok) {
    return (
      <Alert severity="error">
        <b>Cannot save this yet</b>
        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          {check.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </Alert>
    );
  }
  return (
    <Alert severity={check.changes.length ? 'success' : 'info'}>
      <b>{check.changes.length ? `Ready: ${check.changes.length} change${check.changes.length === 1 ? '' : 's'}` : 'Valid, but nothing would change'}</b>
      {(check.changes.length > 0 || check.warnings.length > 0) && (
        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          {check.changes.map((c) => (
            <li key={c}>{c}</li>
          ))}
          {check.warnings.map((w) => (
            <li key={w} style={{ color: ccTokens.warnText }}>
              Note: {w}
            </li>
          ))}
        </ul>
      )}
    </Alert>
  );
}

/**
 * Paste YAML or JSON (offline AI), or ask the AI directly. The server checks it and lists what
 * would change; Save is the only moment anything is written.
 */
export function CareersFileDialog({
  open,
  mode,
  ai,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: 'paste' | 'ai';
  /** Models in Settings > AI and the hiring defaults (Ask AI only). */
  ai?: AiChoices;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState('');
  const [ask, setAsk] = useState('');
  const [model, setModel] = useState('');
  const [effort, setEffort] = useState('');
  const [parseError, setParseError] = useState('');
  const [check, setCheck] = useState<CheckResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const checkedDoc = useRef<unknown>(null);

  useEffect(() => {
    if (open) {
      setText('');
      setAsk('');
      setModel('');
      setEffort('');
      setParseError('');
      setCheck(null);
      setError('');
      checkedDoc.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (mode !== 'paste' || !open) return;
    setCheck(null);
    if (!text.trim()) {
      setParseError('');
      return;
    }
    const parsed = parseCareersText(text);
    if (!parsed.ok) {
      setParseError(parsed.error);
      return;
    }
    setParseError('');
    const t = setTimeout(async () => {
      try {
        const { data } = await checkCareers(parsed.doc);
        checkedDoc.current = parsed.doc;
        setCheck(data);
      } catch (err) {
        setError(errorText(err, 'Could not check the file.'));
      }
    }, 400);
    return () => clearTimeout(t);
  }, [text, mode, open]);

  async function askAi() {
    setBusy(true);
    setError('');
    setCheck(null);
    try {
      const job = await runAi<CheckResponse & { raw: unknown }>({ kind: 'careers', request: ask, model, effort });
      const data = job.result;
      checkedDoc.current = data.raw;
      setCheck(data);
    } catch (err) {
      setError((err as Error).message && !(err as { response?: unknown }).response ? (err as Error).message : errorText(err, 'The AI did not answer. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!checkedDoc.current) return;
    setBusy(true);
    setError('');
    try {
      await saveCareers(checkedDoc.current);
      onSaved();
    } catch (err) {
      setError(errorText(err, 'Could not save.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {mode === 'paste' ? 'Upload or paste JSON' : 'Ask AI in Dash'}
        <Typography variant="body2" color="text.secondary">
          {mode === 'paste'
            ? 'Upload the .json your AI returned, or paste it (chat text around it is fine; YAML works too). Nothing changes until Save.'
            : 'Say what to write or change: roles, screener questions, emails, hiring managers, interviewers. The AI returns the whole careers file; you see every change before Save.'}
        </Typography>
      </DialogTitle>
      <DialogContent>
        {mode === 'paste' ? (
          <>
            <TextField
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'{\n  "format": "ecothrift.careers-bundle/1",\n  "careers": { … }\n}'}
              multiline
              minRows={12}
              maxRows={22}
              fullWidth
              autoFocus
              inputProps={{ spellCheck: false, style: { fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12.5 } }}
            />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
              <Button size="small" onClick={() => fileInput.current?.click()}>
                Upload a .json file
              </Button>
              <input
                ref={fileInput}
                type="file"
                hidden
                accept=".yaml,.yml,.json,.txt"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) setText(await file.text());
                }}
              />
            </Box>
            {parseError && (
              <Alert severity="warning" sx={{ mt: 1.5 }}>
                {parseError}
              </Alert>
            )}
          </>
        ) : (
          <>
            <TextField
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              placeholder="e.g. Add a part-time Cashier role for Saturdays, $15 to start. Make the processing role sound more hands-on."
              multiline
              minRows={4}
              fullWidth
              autoFocus
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 1.5 }}>
              <TextField
                select
                size="small"
                label="Model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                sx={{ minWidth: 260 }}
                SelectProps={{ displayEmpty: true }}
                InputLabelProps={{ shrink: true }}
              >
                <MenuItem value="">Default: {ai?.default_model || 'Settings > AI'}</MenuItem>
                {(ai?.models ?? []).map((m) => (
                  <MenuItem key={m.slug} value={m.slug}>
                    {m.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label="Effort"
                value={effort}
                onChange={(e) => setEffort(e.target.value)}
                sx={{ minWidth: 170 }}
                SelectProps={{ displayEmpty: true }}
                InputLabelProps={{ shrink: true }}
              >
                <MenuItem value="">Default: {ai?.default_effort || 'off'}</MenuItem>
                {(ai?.efforts ?? []).map((value) => (
                  <MenuItem key={value} value={value}>
                    {value}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
              The defaults come from Settings &gt; AI (Hiring). Higher effort is slower and costs more.
            </Typography>
            <Button variant="contained" sx={{ mt: 1.5 }} disabled={busy || !ask.trim()} onClick={askAi}>
              {busy ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Ask the AI'}
            </Button>
            {busy && (
              <Typography variant="caption" color="text.secondary" sx={{ ml: 1.5 }}>
                This can take a minute.
              </Typography>
            )}
          </>
        )}
        {check && (
          <Box sx={{ mt: 2 }}>
            <CheckSummary check={check} />
          </Box>
        )}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        {mode === 'ai' && check?.ok && checkedDoc.current != null && (
          <Button
            sx={{ mr: 'auto' }}
            onClick={() => downloadJson(checkedDoc.current, `ecothrift-careers-ai-${new Date().toISOString().slice(0, 10)}.json`)}
          >
            Download this JSON
          </Button>
        )}
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="contained" onClick={save} disabled={busy || !check?.ok || !check.changes.length}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

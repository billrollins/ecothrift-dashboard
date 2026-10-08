import { Alert, Box, Button, Chip, CircularProgress, Collapse, MenuItem, Stack, TextField, Typography } from '@mui/material';
import Tune from '@mui/icons-material/Tune';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { AI_ACTIONS, getCareers, runAi, type AiAction, type AiJob } from '../../api/hiring.api';
import { ccTokens } from '../../theme';
import { IconAiAssist as AutoAwesome } from '../../icons/ecoIcons';

/**
 * AI help on one thing (a role, an email): pick what you want (Polish, Shorter…), optionally add a note,
 * and the answer fills the editor. Not a chat. Nothing is saved until the editor's Save.
 */
export function AiHelpBar<R>({
  what,
  payload,
  onResult,
  disabled,
}: {
  /** "this role", "this email": used in the button text. */
  what: string;
  /** Everything the run needs except action / instruction / model / effort. */
  payload: () => Record<string, unknown>;
  onResult: (job: AiJob<R>) => void;
  disabled?: boolean;
}) {
  const careers = useQuery({ queryKey: ['hiring', 'careers'], queryFn: async () => (await getCareers()).data });
  const ai = careers.data?.ai;
  const [action, setAction] = useState<AiAction>('polish');
  const [instruction, setInstruction] = useState('');
  const [model, setModel] = useState('');
  const [effort, setEffort] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');

  async function go() {
    setBusy(true);
    setError('');
    setSeconds(0);
    try {
      const job = await runAi<R>(
        {
          ...payload(),
          action,
          instruction: instruction.trim(),
          model,
          effort,
        },
        setSeconds,
      );
      onResult(job);
    } catch (err) {
      const message =
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ||
        (err as Error).message ||
        'The AI run failed.';
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: ccTokens.r,
        bgcolor: '#f6f3fb',
        border: '1px solid #e2dcf0',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <AutoAwesome sx={{ fontSize: 18, color: '#6d4fc2' }} />
        <Typography variant="body2" fontWeight={700} sx={{ mr: 0.5 }}>
          AI help
        </Typography>
        {[...AI_ACTIONS, { key: 'custom' as AiAction, label: 'Just my note' }].map((a) => (
          <Chip
            key={a.key}
            size="small"
            label={a.label}
            color={action === a.key ? 'secondary' : 'default'}
            variant={action === a.key ? 'filled' : 'outlined'}
            onClick={() => setAction(a.key)}
            disabled={busy}
          />
        ))}
        <Box sx={{ flex: 1 }} />
        <Button size="small" startIcon={<Tune fontSize="small" />} onClick={() => setShowSettings((s) => !s)} disabled={busy}>
          Model
        </Button>
      </Box>
      <Collapse in={showSettings}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }}>
          <TextField select size="small" label="Model" value={model} onChange={(e) => setModel(e.target.value)}
            SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }} sx={{ minWidth: 240 }}>
            <MenuItem value="">Default: {ai?.default_model || 'Settings > AI'}</MenuItem>
            {(ai?.models ?? []).map((m) => (
              <MenuItem key={m.slug} value={m.slug}>
                {m.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField select size="small" label="Effort" value={effort} onChange={(e) => setEffort(e.target.value)}
            SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }} sx={{ minWidth: 150 }}>
            <MenuItem value="">Default: {ai?.default_effort || 'off'}</MenuItem>
            {(ai?.efforts ?? []).map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </Collapse>
      <Box sx={{ display: 'flex', gap: 1, mt: 1, alignItems: 'flex-start' }}>
        <TextField
          size="small"
          placeholder={action === 'custom' ? 'What should change? (required)' : 'Anything else? (optional, e.g. "mention Saturdays")'}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          fullWidth
          disabled={busy}
          sx={{ bgcolor: '#fff' }}
        />
        <Button
          variant="contained"
          color="secondary"
          onClick={go}
          disabled={busy || disabled || (action === 'custom' && !instruction.trim())}
          sx={{ whiteSpace: 'nowrap', minWidth: 132 }}
        >
          {busy ? (
            <>
              <CircularProgress size={16} sx={{ color: '#fff', mr: 1 }} /> {seconds}s
            </>
          ) : (
            `Improve ${what}`
          )}
        </Button>
      </Box>
      {busy && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          Working in the background. This can take up to a minute; you can keep reading.
        </Typography>
      )}
      {error && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {error}
        </Alert>
      )}
    </Box>
  );
}

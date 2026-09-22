import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { useSnackbar } from 'notistack';
import { adjustPlan, type AdjustPlanResult } from '../../api/floorplanAi.api';
import { formatApiError } from '../../pages/admin/labelStudio/labelStudioUtils';
import type { PlanDocument } from '../../types/floorplan.types';
import AiModelEffortFields, { EMPTY_AI_CHOICE, type AiRunChoice } from './AiModelEffortFields';
import { adjustChangeCount } from './aiHelpers';
import { aiAdjustDocument, replaceActiveLayers } from './editorState';

interface Props {
  open: boolean;
  planId: number;
  getDoc: () => PlanDocument;
  onApply: (next: PlanDocument) => void;
  onClose: () => void;
}

export default function AdjustPlanDialog({ open, planId, getDoc, onApply, onClose }: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const [instruction, setInstruction] = useState('');
  const [choice, setChoice] = useState<AiRunChoice>(EMPTY_AI_CHOICE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AdjustPlanResult | null>(null);
  const [baseDoc, setBaseDoc] = useState<PlanDocument | null>(null);

  useEffect(() => {
    if (open) {
      setInstruction('');
      setChoice(EMPTY_AI_CHOICE);
      setError(null);
      setResult(null);
      setBaseDoc(null);
    }
  }, [open]);

  const handleClose = () => {
    if (!busy) onClose();
  };

  const generate = async () => {
    const text = instruction.trim();
    if (!text) return;
    const doc = getDoc();
    setBusy(true);
    setError(null);
    setResult(null);
    setBaseDoc(doc);
    try {
      const { data } = await adjustPlan(planId, {
        instruction: text,
        document: aiAdjustDocument(doc),
        model: choice.model,
        effort: choice.effort,
      });
      setResult(data);
    } catch (err) {
      setError(formatApiError(err, 'Could not adjust the plan.'));
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    if (!result || !baseDoc) return;
    const current = getDoc();
    if (current !== baseDoc) {
      setError('The plan changed after this suggestion was made. Generate again.');
      return;
    }
    onApply(replaceActiveLayers(current, result.layers, result.settings_patch));
    enqueueSnackbar('Plan adjusted - Save when ready.', { variant: 'success' });
    onClose();
  };

  const changeCount = result ? adjustChangeCount(result) : 0;

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <AutoAwesomeIcon fontSize="small" /> Adjust this floorplan
      </DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 0.5 }}>
          <TextField
            label="What should change?"
            placeholder="Move the checkout counter 4 feet toward the door"
            value={instruction}
            onChange={(e) => {
              setInstruction(e.target.value);
              setResult(null);
            }}
            multiline
            minRows={3}
            disabled={busy}
            inputProps={{ maxLength: 2000 }}
          />
          <AiModelEffortFields purpose="FLOORPLAN_ADJUST" open={open} value={choice} onChange={setChoice} disabled={busy} />
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
          <Box sx={{ minHeight: 160, maxHeight: 280, overflowY: 'auto', border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
            {result ? (
              <Stack spacing={0.5}>
                {result.notes && <Typography variant="body2" sx={{ fontWeight: 600 }}>{result.notes}</Typography>}
                {changeCount === 0 ? (
                  <Typography variant="body2" color="text.secondary">No changes suggested.</Typography>
                ) : (
                  <>
                    {result.summary.lines.map((line, idx) => (
                      <Typography key={idx} variant="body2">{line}</Typography>
                    ))}
                    {Object.entries(result.settings_patch).map(([key, value]) => (
                      <Typography key={key} variant="body2">{`Plan ${key} becomes ${value}`}</Typography>
                    ))}
                    {result.summary.more > 0 && (
                      <Typography variant="body2" color="text.secondary">{`and ${result.summary.more} more`}</Typography>
                    )}
                  </>
                )}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {busy ? 'Working...' : 'The suggested changes show here.'}
              </Typography>
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={busy}>
          Cancel
        </Button>
        <Box flex={1} />
        {busy && <CircularProgress size={22} sx={{ mr: 1 }} />}
        <Button variant="outlined" onClick={() => void generate()} disabled={busy || !instruction.trim() || !choice.model}>
          {result ? 'Try again' : 'Generate'}
        </Button>
        <Button variant="contained" onClick={apply} disabled={busy || !result || changeCount === 0}>
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  );
}

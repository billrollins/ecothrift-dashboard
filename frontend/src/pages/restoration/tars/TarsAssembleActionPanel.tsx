import {
  Box,
  Button,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import Delete from '@mui/icons-material/Delete';
import PlayArrow from '@mui/icons-material/PlayArrow';
import Stop from '@mui/icons-material/Stop';
import type { TarsAssembleAction, TarsAssemblyStep, TarsAssemblyStepStatus } from './tarsWorkTypes';
import { newId } from './tarsWorkRollup';

const STATUSES: TarsAssemblyStepStatus[] = ['todo', 'in_progress', 'done', 'blocked'];

interface TarsAssembleActionPanelProps {
  action: TarsAssembleAction;
  onChange: (action: TarsAssembleAction) => void;
  onRemove?: () => void;
  readOnly?: boolean;
}

export function TarsAssembleActionPanel({ action, onChange, onRemove, readOnly = false }: TarsAssembleActionPanelProps) {
  const updateStep = (id: string, patch: Partial<TarsAssemblyStep>) => {
    onChange({
      ...action,
      steps: action.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  };

  const addStep = () => {
    const n = action.steps.length + 1;
    onChange({
      ...action,
      steps: [
        ...action.steps,
        { id: newId(), stepNumber: n, instruction: '', status: 'todo', notes: '' },
      ],
    });
  };

  const toggleTimer = () => {
    if (action.status === 'in_progress') {
      onChange({
        ...action,
        status: 'complete',
        stoppedAt: new Date().toISOString(),
        timeActualHours: action.timeActualHours || action.timeEstimateHours || 0.5,
      });
    } else {
      onChange({
        ...action,
        status: 'in_progress',
        startedAt: new Date().toISOString(),
      });
    }
  };

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="subtitle2" fontWeight={800}>
          Assemble action
        </Typography>
        <Stack direction="row" spacing={0.5}>
          {!readOnly ?
            <>
              <IconButton size="small" onClick={toggleTimer} color={action.status === 'in_progress' ? 'error' : 'primary'}>
                {action.status === 'in_progress' ? <Stop fontSize="small" /> : <PlayArrow fontSize="small" />}
              </IconButton>
              {onRemove ?
                <Button size="small" color="error" onClick={onRemove}>
                  Remove
                </Button>
              : null}
            </>
          : null}
        </Stack>
      </Stack>

      <Stack direction="row" spacing={1}>
        <TextField
          size="small"
          label="Est. hours"
          type="number"
          value={action.timeEstimateHours || ''}
          onChange={(e) => onChange({ ...action, timeEstimateHours: Number.parseFloat(e.target.value) || 0 })}
          sx={{ width: 120 }}
          disabled={readOnly}
        />
        <TextField
          size="small"
          label="Actual hours"
          type="number"
          value={action.timeActualHours || ''}
          onChange={(e) => onChange({ ...action, timeActualHours: Number.parseFloat(e.target.value) || 0 })}
          sx={{ width: 120 }}
          disabled={readOnly}
        />
      </Stack>

      {!readOnly ?
        <Button size="small" startIcon={<Add />} onClick={addStep} sx={{ alignSelf: 'flex-start' }}>
          Add step
        </Button>
      : null}

      {action.steps.map((step) => (
        <Box key={step.id} sx={{ p: 1.25, borderRadius: 1.5, border: '1px solid #e2e8f0', bgcolor: '#fff' }}>
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <Typography variant="body2" fontWeight={800} sx={{ pt: 1, minWidth: 28 }}>
              {step.stepNumber}.
            </Typography>
            <TextField
              size="small"
              label="Instruction"
              value={step.instruction}
              onChange={(e) => updateStep(step.id, { instruction: e.target.value })}
              fullWidth
              disabled={readOnly}
            />
            <TextField
              select
              size="small"
              label="Status"
              value={step.status}
              onChange={(e) => updateStep(step.id, { status: e.target.value as TarsAssemblyStepStatus })}
              sx={{ minWidth: 120 }}
              disabled={readOnly}
            >
              {STATUSES.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </TextField>
            {!readOnly ?
              <IconButton size="small" onClick={() => onChange({ ...action, steps: action.steps.filter((s) => s.id !== step.id) })}>
                <Delete fontSize="small" />
              </IconButton>
            : null}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

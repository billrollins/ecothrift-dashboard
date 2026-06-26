import {
  Box,
  Button,
  Chip,
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
import type { TarsTestAction, TarsTestOutcome, TarsTestRecord } from './tarsWorkTypes';
import { newId } from './tarsWorkRollup';

const OUTCOMES: TarsTestOutcome[] = ['pass', 'fail', 'partial', 'not_tested'];

const TEST_TEMPLATES = [
  'Power on',
  'Functional test',
  'Safety check',
  'Cosmetic inspection',
  'Connectivity',
];

interface TarsTestActionPanelProps {
  action: TarsTestAction;
  onChange: (action: TarsTestAction) => void;
  onRemove?: () => void;
  readOnly?: boolean;
}

export function TarsTestActionPanel({ action, onChange, onRemove, readOnly = false }: TarsTestActionPanelProps) {
  const updateTest = (id: string, patch: Partial<TarsTestRecord>) => {
    onChange({
      ...action,
      tests: action.tests.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    });
  };

  const addTest = (name?: string) => {
    onChange({
      ...action,
      tests: [
        ...action.tests,
        {
          id: newId(),
          testName: name ?? '',
          outcome: 'not_tested',
          notes: '',
          timeEstimateHours: 0.1,
          timeActualHours: 0,
        },
      ],
    });
  };

  const toggleTimer = () => {
    if (action.status === 'in_progress') {
      onChange({
        ...action,
        status: 'complete',
        stoppedAt: new Date().toISOString(),
        timeActualHours: action.timeActualHours || action.timeEstimateHours || 0.25,
      });
    } else {
      onChange({
        ...action,
        status: 'in_progress',
        startedAt: new Date().toISOString(),
        stoppedAt: undefined,
      });
    }
  };

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="subtitle2" fontWeight={800}>
          Test action
        </Typography>
        <Stack direction="row" spacing={0.5}>
          {!readOnly ?
            <>
              <IconButton size="small" color={action.status === 'in_progress' ? 'error' : 'primary'} onClick={toggleTimer}>
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

      {!readOnly ?
        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
          {TEST_TEMPLATES.map((name) => (
            <Chip key={name} label={name} size="small" variant="outlined" onClick={() => addTest(name)} sx={{ cursor: 'pointer' }} />
          ))}
          <Chip label="+ Custom" size="small" icon={<Add />} onClick={() => addTest()} sx={{ cursor: 'pointer' }} />
        </Stack>
      : null}

      {action.tests.map((test) => (
        <Box key={test.id} sx={{ p: 1.25, borderRadius: 1.5, border: '1px solid #e2e8f0', bgcolor: '#fff' }}>
          <Stack spacing={1}>
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField
                size="small"
                label="Test"
                value={test.testName}
                onChange={(e) => updateTest(test.id, { testName: e.target.value })}
                fullWidth
                disabled={readOnly}
              />
              <TextField
                select
                size="small"
                label="Outcome"
                value={test.outcome}
                onChange={(e) => updateTest(test.id, { outcome: e.target.value as TarsTestOutcome })}
                sx={{ minWidth: 120 }}
                disabled={readOnly}
              >
                {OUTCOMES.map((o) => (
                  <MenuItem key={o} value={o}>
                    {o}
                  </MenuItem>
                ))}
              </TextField>
              {!readOnly ?
                <IconButton size="small" onClick={() => onChange({ ...action, tests: action.tests.filter((t) => t.id !== test.id) })}>
                  <Delete fontSize="small" />
                </IconButton>
              : null}
            </Stack>
            <Stack direction="row" spacing={1}>
              <TextField
                size="small"
                label="Est. h"
                type="number"
                value={test.timeEstimateHours || ''}
                onChange={(e) => updateTest(test.id, { timeEstimateHours: Number.parseFloat(e.target.value) || 0 })}
                sx={{ width: 100 }}
                disabled={readOnly}
              />
              <TextField
                size="small"
                label="Actual h"
                type="number"
                value={test.timeActualHours || ''}
                onChange={(e) => updateTest(test.id, { timeActualHours: Number.parseFloat(e.target.value) || 0 })}
                sx={{ width: 100 }}
                disabled={readOnly}
              />
              <TextField
                size="small"
                label="Notes"
                value={test.notes}
                onChange={(e) => updateTest(test.id, { notes: e.target.value })}
                fullWidth
                disabled={readOnly}
              />
            </Stack>
          </Stack>
        </Box>
      ))}

      {action.tests.length === 0 ?
        <Typography variant="body2" color="text.secondary">
          Add tests performed or planned for this item.
        </Typography>
      : null}
    </Stack>
  );
}

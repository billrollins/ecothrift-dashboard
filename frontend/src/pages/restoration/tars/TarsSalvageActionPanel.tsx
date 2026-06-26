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
import type { TarsSalvageAction, TarsSalvageDestination, TarsSalvageLine } from './tarsWorkTypes';
import { SALVAGE_DESTINATION_LABELS } from './tarsWorkTypes';
import { newId } from './tarsWorkRollup';

const DESTINATIONS = Object.keys(SALVAGE_DESTINATION_LABELS) as TarsSalvageDestination[];

interface TarsSalvageActionPanelProps {
  action: TarsSalvageAction;
  onChange: (action: TarsSalvageAction) => void;
  onRemove?: () => void;
  readOnly?: boolean;
}

export function TarsSalvageActionPanel({ action, onChange, onRemove, readOnly = false }: TarsSalvageActionPanelProps) {
  const updateLine = (id: string, patch: Partial<TarsSalvageLine>) => {
    onChange({
      ...action,
      lines: action.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    });
  };

  const addLine = () => {
    onChange({
      ...action,
      lines: [
        ...action.lines,
        {
          id: newId(),
          destination: 'trash',
          description: '',
          qty: 1,
          weightLbs: null,
          valueRecovery: 0,
          notes: '',
        },
      ],
    });
  };

  const isMetal = (d: TarsSalvageDestination) => d.startsWith('metals_');

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="subtitle2" fontWeight={800}>
          Salvage action
        </Typography>
        {readOnly || !onRemove ? null : (
          <Button size="small" color="error" onClick={onRemove}>
            Remove
          </Button>
        )}
      </Stack>

      <Typography variant="body2" color="text.secondary">
        Record what was sent where — trash, metal piles, sellable parts, or parts kept for shop use.
      </Typography>

      {!readOnly ?
        <Button size="small" startIcon={<Add />} onClick={addLine} sx={{ alignSelf: 'flex-start' }}>
          Add line
        </Button>
      : null}

      {action.lines.map((line) => (
        <Box key={line.id} sx={{ p: 1.25, borderRadius: 1.5, border: '1px solid #e2e8f0', bgcolor: '#fff' }}>
          <Stack spacing={1}>
            <Stack direction="row" spacing={1} alignItems="flex-start">
              <TextField
                select
                size="small"
                label="Destination"
                value={line.destination}
                onChange={(e) => updateLine(line.id, { destination: e.target.value as TarsSalvageDestination })}
                sx={{ minWidth: 180 }}
                disabled={readOnly}
              >
                {DESTINATIONS.map((d) => (
                  <MenuItem key={d} value={d}>
                    {SALVAGE_DESTINATION_LABELS[d]}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                size="small"
                label="Description"
                value={line.description}
                onChange={(e) => updateLine(line.id, { description: e.target.value })}
                fullWidth
                disabled={readOnly}
              />
              {!readOnly ?
                <IconButton size="small" onClick={() => onChange({ ...action, lines: action.lines.filter((l) => l.id !== line.id) })}>
                  <Delete fontSize="small" />
                </IconButton>
              : null}
            </Stack>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <TextField
                size="small"
                label="Qty"
                type="number"
                value={line.qty}
                onChange={(e) => updateLine(line.id, { qty: Number.parseInt(e.target.value, 10) || 1 })}
                sx={{ width: 80 }}
                disabled={readOnly}
              />
              {isMetal(line.destination) ?
                <TextField
                  size="small"
                  label="Weight (lb est.)"
                  type="number"
                  value={line.weightLbs ?? ''}
                  onChange={(e) => updateLine(line.id, { weightLbs: Number.parseFloat(e.target.value) || null })}
                  sx={{ width: 130 }}
                  disabled={readOnly}
                />
              : null}
              <TextField
                size="small"
                label="Value recovery $"
                type="number"
                value={line.valueRecovery || ''}
                onChange={(e) => updateLine(line.id, { valueRecovery: Number.parseFloat(e.target.value) || 0 })}
                sx={{ width: 130 }}
                disabled={readOnly}
              />
              <TextField
                size="small"
                label="Notes"
                value={line.notes}
                onChange={(e) => updateLine(line.id, { notes: e.target.value })}
                sx={{ flex: 1, minWidth: 140 }}
                disabled={readOnly}
              />
            </Stack>
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

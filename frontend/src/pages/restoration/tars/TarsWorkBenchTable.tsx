import Add from '@mui/icons-material/Add';
import Delete from '@mui/icons-material/Delete';
import {
  Box,
  Button,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { newId } from './tarsWorkRollup';
import {
  TARS_ACTION_TYPE_LABELS,
  type TarsActionType,
  type TarsWorkBenchRow,
  type TarsWorkSession,
} from './tarsWorkTypes';

interface TarsWorkBenchTableProps {
  session: TarsWorkSession;
  readOnly?: boolean;
  onSessionChange: (session: TarsWorkSession) => void;
}

const CATEGORY_OPTIONS = Object.keys(TARS_ACTION_TYPE_LABELS) as TarsActionType[];

const GRID_EDIT = '36px 112px minmax(0, 1.1fr) 82px minmax(0, 1.45fr) minmax(0, 1.45fr) 36px';
const GRID_READONLY = '36px 112px minmax(0, 1.1fr) 82px minmax(0, 1.45fr) minmax(0, 1.45fr)';

// Shared compact field styling so every column (select, single-line, multiline)
// renders at the same height and packs vertical space tightly.
const FIELD_SX = {
  '& .MuiInputBase-root': { fontSize: 13, py: 0.4, minHeight: 32 },
  '& .MuiInputBase-input': { py: 0 },
  '& .MuiSelect-select': { py: 0 },
} as const;

function HeaderCell({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <Typography
      variant="caption"
      fontWeight={800}
      color="text.secondary"
      sx={{ textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: align }}
    >
      {children}
    </Typography>
  );
}

export function TarsWorkBenchTable({ session, readOnly = false, onSessionChange }: TarsWorkBenchTableProps) {
  const rows = session.benchRows ?? [];
  const grid = readOnly ? GRID_READONLY : GRID_EDIT;

  const addRow = () => {
    const row: TarsWorkBenchRow = {
      id: newId(),
      category: 'test',
      name: '',
      notes: '',
      result: '',
      durationMinutes: 0,
      performedAt: new Date().toISOString(),
    };
    onSessionChange({ ...session, benchRows: [...rows, row] });
  };

  const updateRow = (id: string, patch: Partial<TarsWorkBenchRow>) => {
    onSessionChange({
      ...session,
      benchRows: rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    });
  };

  const removeRow = (id: string) => {
    onSessionChange({ ...session, benchRows: rows.filter((row) => row.id !== id) });
  };

  return (
    <Stack spacing={0.75} sx={{ minWidth: 0 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="subtitle2" fontWeight={900}>
          WorkBench log
        </Typography>
        {!readOnly ?
          <Button
            size="small"
            variant="contained"
            startIcon={<Add />}
            onClick={addRow}
            sx={{ minHeight: 28, fontSize: 12, fontWeight: 700 }}
          >
            Action
          </Button>
        : null}
      </Stack>

      {rows.length > 0 ?
        <Box sx={{ display: 'grid', gridTemplateColumns: grid, gap: 0.6, px: 0.6, alignItems: 'center' }}>
          <HeaderCell align="right">#</HeaderCell>
          <HeaderCell>Category</HeaderCell>
          <HeaderCell>Name</HeaderCell>
          <HeaderCell>Minutes</HeaderCell>
          <HeaderCell>Notes</HeaderCell>
          <HeaderCell>Result</HeaderCell>
          {!readOnly ? <span /> : null}
        </Box>
      : null}

      {rows.length === 0 ?
        <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
          {readOnly ? 'No actions logged.' : 'No actions yet. Use “Action” to log test, assemble, repair, or salvage work.'}
        </Typography>
      : rows.map((row, index) => (
          <Box
            key={row.id}
            sx={{
              display: 'grid',
              gridTemplateColumns: grid,
              gap: 0.6,
              alignItems: 'center',
              px: 0.6,
              py: 0.4,
              borderRadius: 1,
              border: '1px solid #e2e8f0',
              bgcolor: '#fff',
            }}
          >
            <Typography
              variant="caption"
              fontWeight={800}
              fontFamily="monospace"
              color="text.secondary"
              sx={{ textAlign: 'right', pr: 0.25 }}
            >
              {index + 1}
            </Typography>
            <TextField
              select
              size="small"
              value={row.category}
              onChange={(e) => updateRow(row.id, { category: e.target.value as TarsActionType })}
              disabled={readOnly}
              sx={FIELD_SX}
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <MenuItem key={opt} value={opt}>
                  {TARS_ACTION_TYPE_LABELS[opt]}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              placeholder="Name"
              value={row.name}
              onChange={(e) => updateRow(row.id, { name: e.target.value })}
              disabled={readOnly}
              sx={FIELD_SX}
            />
            <TextField
              size="small"
              type="number"
              value={row.durationMinutes ?? 0}
              onChange={(e) => updateRow(row.id, {
                durationMinutes: Math.max(Number(e.target.value) || 0, 0),
              })}
              disabled={readOnly}
              inputProps={{ min: 0, step: 1, 'aria-label': 'Labor minutes' }}
              sx={FIELD_SX}
            />
            <TextField
              size="small"
              placeholder="Notes"
              value={row.notes}
              onChange={(e) => updateRow(row.id, { notes: e.target.value })}
              disabled={readOnly}
              multiline
              maxRows={4}
              sx={FIELD_SX}
            />
            <TextField
              size="small"
              placeholder="Result"
              value={row.result}
              onChange={(e) => updateRow(row.id, { result: e.target.value })}
              disabled={readOnly}
              multiline
              maxRows={4}
              sx={FIELD_SX}
            />
            {!readOnly ?
              <IconButton size="small" aria-label="Delete action" onClick={() => removeRow(row.id)} sx={{ p: 0.25 }}>
                <Delete sx={{ fontSize: 16 }} />
              </IconButton>
            : null}
          </Box>
        ))
      }
    </Stack>
  );
}

import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import { useSnackbar } from 'notistack';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import {
  useCreateHoursOverride,
  useDeleteHoursOverride,
  useHoursOverrides,
  useUpdateHoursOverride,
} from '../../../hooks/useHoursOverrides';
import type { StoreHoursOverride, StoreHoursOverrideWrite } from '../../../api/webstore.api';
import { holidayHoursLine } from './storeHours';

function iso(date: Date | null): string {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fromIso(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const EMPTY: StoreHoursOverrideWrite = {
  label: '',
  date_start: '',
  date_end: '',
  closed: true,
  open: '09:00',
  close: '18:00',
  note: '',
  is_active: true,
};

export function HolidayHoursCard() {
  const { enqueueSnackbar } = useSnackbar();
  const { data = [] } = useHoursOverrides();
  const create = useCreateHoursOverride();
  const update = useUpdateHoursOverride();
  const remove = useDeleteHoursOverride();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StoreHoursOverride | null>(null);
  const [draft, setDraft] = useState<StoreHoursOverrideWrite>(EMPTY);
  const [showPast, setShowPast] = useState(false);
  const [toDelete, setToDelete] = useState<StoreHoursOverride | null>(null);

  const today = iso(new Date());
  const upcoming = useMemo(() => data.filter((row) => row.date_end >= today), [data, today]);
  const past = useMemo(() => data.filter((row) => row.date_end < today), [data, today]);

  function startAdd() {
    setEditing(null);
    setDraft({ ...EMPTY, date_start: today, date_end: today });
    setOpen(true);
  }

  function startEdit(row: StoreHoursOverride) {
    setEditing(row);
    setDraft({
      label: row.label,
      date_start: row.date_start,
      date_end: row.date_end,
      closed: row.closed,
      open: row.open || '09:00',
      close: row.close || '18:00',
      note: row.note,
      is_active: row.is_active,
    });
    setOpen(true);
  }

  async function handleSave() {
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, data: draft });
      } else {
        await create.mutateAsync(draft);
      }
      setOpen(false);
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { date_start?: string[] | string } } })?.response?.data
          ?.date_start;
      enqueueSnackbar(Array.isArray(detail) ? detail[0] : detail || 'Could not save holiday hours', {
        variant: 'error',
      });
    }
  }

  const preview = holidayHoursLine({
    label: draft.label || 'Holiday',
    date_start: draft.date_start || today,
    date_end: draft.date_end || draft.date_start || today,
    closed: Boolean(draft.closed),
    open: draft.open,
    close: draft.close,
  });

  function rowsTable(rows: StoreHoursOverride[]) {
    return (
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Label</TableCell>
            <TableCell>Dates</TableCell>
            <TableCell>Hours</TableCell>
            <TableCell>On</TableCell>
            <TableCell align="right"> </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.label}</TableCell>
              <TableCell>
                {row.date_start}
                {row.date_end !== row.date_start ? ` → ${row.date_end}` : ''}
              </TableCell>
              <TableCell>{row.sentence || holidayHoursLine(row)}</TableCell>
              <TableCell>
                <Switch
                  checked={row.is_active}
                  onChange={(_, checked) => update.mutate({ id: row.id, data: { is_active: checked } })}
                />
              </TableCell>
              <TableCell align="right">
                <IconButton size="small" onClick={() => startEdit(row)}>
                  <EditIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" onClick={() => setToDelete(row)}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5}>
                <Typography color="text.secondary">None yet.</Typography>
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    );
  }

  return (
    <Card>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Box>
            <Typography variant="subtitle1">Holiday & special hours</Typography>
            <Typography variant="body2" color="text.secondary">
              Dated exceptions. The weekly schedule stays the same. Customers see a Holiday hours
              line with the explicit date, then regular hours resume.
            </Typography>
          </Box>
          <Button variant="contained" onClick={startAdd}>
            Add
          </Button>
        </Stack>
        {rowsTable(upcoming)}
        {past.length > 0 ? (
          <Box sx={{ mt: 2 }}>
            <Button size="small" onClick={() => setShowPast((v) => !v)}>
              {showPast ? 'Hide past' : `Show past (${past.length})`}
            </Button>
            <Collapse in={showPast}>{rowsTable(past)}</Collapse>
          </Box>
        ) : null}
      </CardContent>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? 'Edit holiday hours' : 'Add holiday hours'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Label"
              value={draft.label || ''}
              onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
              placeholder="Labor Day"
              fullWidth
            />
            <Stack direction="row" spacing={2}>
              <DatePicker
                label="Start"
                value={fromIso(draft.date_start || '')}
                onChange={(value) =>
                  setDraft((d) => {
                    const start = iso(value);
                    const end = !d.date_end || d.date_end === d.date_start ? start : d.date_end;
                    return { ...d, date_start: start, date_end: end };
                  })
                }
              />
              <DatePicker
                label="End"
                value={fromIso(draft.date_end || draft.date_start || '')}
                onChange={(value) => setDraft((d) => ({ ...d, date_end: iso(value) }))}
              />
            </Stack>
            <FormControlLabel
              control={
                <Switch
                  checked={Boolean(draft.closed)}
                  onChange={(_, checked) => setDraft((d) => ({ ...d, closed: checked }))}
                />
              }
              label="Closed"
            />
            {!draft.closed ? (
              <Stack direction="row" spacing={2}>
                <TextField
                  type="time"
                  label="Open"
                  value={draft.open || '09:00'}
                  onChange={(e) => setDraft((d) => ({ ...d, open: e.target.value }))}
                />
                <TextField
                  type="time"
                  label="Close"
                  value={draft.close || '18:00'}
                  onChange={(e) => setDraft((d) => ({ ...d, close: e.target.value }))}
                />
              </Stack>
            ) : null}
            <TextField
              label="Note"
              value={draft.note || ''}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              placeholder="Optional customer-facing note"
              fullWidth
            />
            <FormControlLabel
              control={
                <Switch
                  checked={Boolean(draft.is_active)}
                  onChange={(_, checked) => setDraft((d) => ({ ...d, is_active: checked }))}
                />
              }
              label="Active"
            />
            <Typography variant="body2" color="text.secondary">
              Customer line: {preview}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={create.isPending || update.isPending}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete holiday hours?"
        message={toDelete ? `Delete “${toDelete.label}”?` : ''}
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          await remove.mutateAsync(toDelete.id);
          setToDelete(null);
        }}
      />
    </Card>
  );
}
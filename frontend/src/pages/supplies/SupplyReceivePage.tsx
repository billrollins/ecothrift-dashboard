/**
 * Receive supplies (owner, 2026-10-28): anyone on the team ticks ordered lines off as they arrive. "All here" takes
 * the rest; the number box takes part of it (packs in so far, 0 to the packs ordered). Who and when are kept, and a
 * change is kept too. No prices here. Phone-first; desk: two columns.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Chip, LinearProgress, Paper, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { getReceiveLines, setReceived, type ReceiveLine } from '../../api/supplies.api';
import { PageHeader } from '../../components/common/PageHeader';
import { apiError, dayText, OutLink, whenText } from './supplyBits';

function packsText(n: number, line: ReceiveLine): string {
  const u = line.unit || 'each';
  return line.pack_size > 1 ? `${n} pack${n === 1 ? '' : 's'} of ${line.pack_size} ${u}` : `${n} ${u}`;
}

function ReceiveRow({ line }: { line: ReceiveLine }) {
  const [value, setValue] = useState(String(line.received_qty));
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const save = useMutation({
    mutationFn: (qty: number) => setReceived(line.id, qty),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['supplies'] });
      enqueueSnackbar(r.status === 'in' ? `${line.name}: all here` : `${line.name}: ${r.received_qty} of ${line.packs} in`, { variant: 'success' });
    },
    onError: (err) => enqueueSnackbar(apiError(err, 'Could not save it.'), { variant: 'error' }),
  });
  const n = Number(value);
  const valid = value !== '' && Number.isInteger(n) && n >= 0 && n <= line.packs;
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600 }}><OutLink href={line.url}>{line.name}</OutLink></Typography>
          <Typography variant="body2" color="text.secondary">
            {line.list_name} · ordered {packsText(line.packs, line)} · order of {dayText(line.week_start)}
          </Typography>
          {line.received_qty > 0 && (
            <Typography variant="caption" color="text.secondary">
              {line.received_qty} in so far{line.received_at ? ` (${line.received_by}, ${whenText(line.received_at)})` : ''}
            </Typography>
          )}
        </Box>
        {line.status === 'partial' && <Chip size="small" color="warning" label="Part in" />}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mt: 1.25, alignItems: 'center' }}>
        <Button variant="contained" size="large" sx={{ flex: 1 }} disabled={save.isPending}
          onClick={() => save.mutate(line.packs)}>
          All here
        </Button>
        <TextField
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ''))}
          slotProps={{
            htmlInput: {
              inputMode: 'numeric', pattern: '[0-9]*', 'aria-label': `${line.name} packs in`,
              style: { fontSize: '1.25rem', textAlign: 'center', padding: '8px 6px' },
            },
          }}
          sx={{ width: 76 }}
        />
        <Button variant="outlined" size="large" disabled={!valid || n === line.received_qty || save.isPending}
          onClick={() => save.mutate(n)}>
          Save
        </Button>
      </Stack>
      <Typography variant="caption" color="text.secondary">Part of it? Type the packs in so far (0 to {line.packs}).</Typography>
    </Paper>
  );
}

export default function SupplyReceivePage() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({ queryKey: ['supplies', 'receive'], queryFn: getReceiveLines });
  const vendors = new Map<string, ReceiveLine[]>();
  (data ?? []).forEach((ln) => vendors.set(ln.vendor || 'No vendor', [...(vendors.get(ln.vendor || 'No vendor') ?? []), ln]));
  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
      <PageHeader title="Receive supplies" subtitle="Tick what came in." action={<Button onClick={() => navigate('/supplies')}>Lists</Button>} />
      {isLoading && <LinearProgress />}
      {error && <Alert severity="error">{apiError(error, 'Could not load what is on its way.')}</Alert>}
      {data && data.length === 0 && <Alert severity="success">Nothing on its way: everything ordered is in.</Alert>}
      <Stack spacing={2.5}>
        {[...vendors.entries()].map(([vendor, lines]) => (
          <Box key={vendor}>
            <Typography variant="h6" sx={{ fontSize: '1.05rem', mb: 1 }}>
              {vendor}
            </Typography>
            <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
              {lines.map((ln) => <ReceiveRow key={`${ln.id}-${ln.received_qty}`} line={ln} />)}
            </Box>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

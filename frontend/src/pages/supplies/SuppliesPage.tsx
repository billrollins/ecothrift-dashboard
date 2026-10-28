/**
 * Supplies (owner, 2026-10-26): one supply list per department (or a named list), the weekly count, and the owner's
 * order. Everyone sees the lists and counts; managers and the owner make and edit lists; the order is the owner's.
 * Desk: a grid of list cards. Phone: the same cards, one column, with Count as the big button.
 */
import { useState } from 'react';
import {
  Alert, Box, Button, Card, CardActionArea, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  LinearProgress, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { createSupplyList, getSupplyLists, type SupplyListSummary } from '../../api/supplies.api';
import { getDepartments } from '../../api/hr.api';
import { PageHeader } from '../../components/common/PageHeader';
import { apiError, deadlineText, whenText } from './supplyBits';
import { RequestCard } from './SupplyRequestsPage';
import { WeNeedDialog } from './WeNeedDialog';

function NewListDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [department, setDepartment] = useState<number | ''>('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => getDepartments().then((r) => r.data),
    enabled: open,
  });
  const create = useMutation({
    mutationFn: () => createSupplyList({ name: name.trim(), department: department || null }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ['supplies'] });
      onClose();
      navigate(`/supplies/lists/${row.id}`);
    },
    onError: (err) => enqueueSnackbar(apiError(err, 'Could not make the list.'), { variant: 'error' }),
  });
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>New supply list</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            select
            label="Department"
            value={department}
            onChange={(e) => {
              const id = Number(e.target.value) || '';
              setDepartment(id);
              const dept = departments.find((d) => d.id === id);
              if (dept && !name.trim()) setName(dept.name);
            }}
            helperText="Or leave it blank for a named list."
          >
            <MenuItem value="">No department</MenuItem>
            {departments.map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
          </TextField>
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
          Make list
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ListCard({ row, onOpen, onCount }: { row: SupplyListSummary; onOpen: () => void; onCount: () => void }) {
  return (
    <Card variant="outlined" sx={{ display: 'flex', flexDirection: 'column' }}>
      <CardActionArea onClick={onOpen} sx={{ flex: 1 }}>
        <CardContent>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h6" sx={{ fontSize: '1.05rem' }}>{row.name}</Typography>
            {row.count
              ? <Chip size="small" color="success" label="Counted" />
              : <Chip size="small" color="warning" label="Not counted" />}
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {row.department_name || 'Named list'} · {row.item_count ?? 0} items
          </Typography>
          {row.count && (
            <Typography variant="caption" color="text.secondary">
              {row.count.counted_by}, {whenText(row.count.submitted_at)}
            </Typography>
          )}
        </CardContent>
      </CardActionArea>
      <Box sx={{ px: 2, pb: 2 }}>
        <Button fullWidth variant={row.count ? 'outlined' : 'contained'} size="large" onClick={onCount}
          disabled={!row.item_count}>
          {row.count ? 'Count again' : 'Count'}
        </Button>
      </Box>
    </Card>
  );
}

export default function SuppliesPage() {
  const navigate = useNavigate();
  const [newOpen, setNewOpen] = useState(false);
  const [needOpen, setNeedOpen] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ['supplies', 'lists'], queryFn: () => getSupplyLists() });

  const waiting = data?.lists.filter((l) => !l.count && l.item_count).length ?? 0;
  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <PageHeader
        title="Supplies"
        subtitle={data ? `Weekly count due ${deadlineText(data.cycle.deadline)}` : undefined}
        action={(
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
            <Button variant="contained" onClick={() => setNeedOpen(true)}>We need…</Button>
            <Button variant="outlined" onClick={() => navigate('/supplies/receive')}>
              Receive{data?.receive_waiting ? ` (${data.receive_waiting})` : ''}
            </Button>
            {data?.can_edit && (
              <Button variant="outlined" onClick={() => navigate('/supplies/requests')}>
                Requests{data.pending_requests ? ` (${data.pending_requests})` : ''}
              </Button>
            )}
            {data?.is_owner && <Button variant="outlined" onClick={() => navigate('/supplies/order')}>Order</Button>}
            {data?.can_edit && <Button onClick={() => setNewOpen(true)}>New list</Button>}
          </Stack>
        )}
      />
      {isLoading && <LinearProgress />}
      {error && <Alert severity="error">{apiError(error, 'Could not load the supply lists.')}</Alert>}
      {data && waiting > 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {waiting} {waiting === 1 ? 'list needs' : 'lists need'} this week&apos;s count. Type a number for every item, 0 if none.
        </Alert>
      )}
      {data && data.lists.length === 0 && (
        <Typography color="text.secondary">
          No supply lists yet.{data.can_edit ? ' Make one with New list.' : ' A manager makes them.'}
        </Typography>
      )}
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' } }}>
        {data?.lists.map((row) => (
          <ListCard
            key={row.id}
            row={row}
            onOpen={() => navigate(`/supplies/lists/${row.id}`)}
            onCount={() => navigate(`/supplies/count/${row.id}`)}
          />
        ))}
      </Box>
      {data && data.my_requests.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="h6" sx={{ fontSize: '1.05rem', mb: 1 }}>My requests</Typography>
          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
            {data.my_requests.map((req) => <RequestCard key={req.id} req={req} canDecide={false} />)}
          </Box>
        </Box>
      )}
      <NewListDialog open={newOpen} onClose={() => setNewOpen(false)} />
      {needOpen && data && <WeNeedDialog open lists={data.lists} onClose={() => setNeedOpen(false)} />}
    </Box>
  );
}

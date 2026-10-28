/**
 * Supply requests (owner, 2026-10-28): every "We need ___" from the team. Managers and the owner approve one onto a
 * list (it becomes an item with a min and max; the rest can be filled now or later) or decline it with a reason the
 * requester sees. Others see only their own. Waiting first. Desk: two columns of cards. Phone: one.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress,
  MenuItem, Stack, Tab, Tabs, TextField, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  approveSupplyRequest, declineSupplyRequest, getSupplyLists, getSupplyRequests, type SupplyRequest,
  type SupplyRequestStatus,
} from '../../api/supplies.api';
import { PageHeader } from '../../components/common/PageHeader';
import { apiError, OutLink, whenText } from './supplyBits';

export const STATUS_CHIP: Record<SupplyRequestStatus, { label: string; color: 'warning' | 'success' | 'default' }> = {
  pending: { label: 'Waiting', color: 'warning' },
  approved: { label: 'Approved', color: 'success' },
  declined: { label: 'Declined', color: 'default' },
};

function ApproveDialog({ req, onClose }: { req: SupplyRequest; onClose: () => void }) {
  const lists = useQuery({ queryKey: ['supplies', 'lists'], queryFn: () => getSupplyLists() });
  const [list, setList] = useState<number | ''>(req.list ?? '');
  const [name, setName] = useState(req.name);
  const [vendor, setVendor] = useState('');
  const [url, setUrl] = useState(req.url);
  const [unit, setUnit] = useState('each');
  const [pack, setPack] = useState('1');
  const [price, setPrice] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const fullScreen = useMediaQuery(useTheme().breakpoints.down('sm'));
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const save = useMutation({
    mutationFn: () => approveSupplyRequest(req.id, {
      list: Number(list), name: name.trim(), vendor: vendor.trim(), url: url.trim(), unit: unit.trim() || 'each',
      pack_size: Number(pack) || 1, price: price.trim() ? price.trim().replace('$', '') : null,
      min_qty: Number(min), max_qty: Number(max),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplies'] });
      enqueueSnackbar(`${name.trim()} is on the list`, { variant: 'success' });
      onClose();
    },
    onError: (err) => enqueueSnackbar(apiError(err, 'Could not approve it.'), { variant: 'error' }),
  });
  const bad = !list || !name.trim() || min === '' || max === '' || Number(max) < Number(min);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" fullScreen={fullScreen}>
      <DialogTitle>Approve onto a list</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gap: 2, mt: 1, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
          <TextField select label="List" value={list} onChange={(e) => setList(Number(e.target.value) || '')} required>
            {(lists.data?.lists ?? []).map((l) => <MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>)}
          </TextField>
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <TextField label="Min" type="number" value={min} onChange={(e) => setMin(e.target.value)} required
            helperText="At or under this, order" slotProps={{ htmlInput: { min: 0 } }} />
          <TextField label="Max" type="number" value={max} onChange={(e) => setMax(e.target.value)} required
            error={min !== '' && max !== '' && Number(max) < Number(min)} helperText="Order back up to this"
            slotProps={{ htmlInput: { min: 0 } }} />
          <TextField label="Vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} />
          <TextField label="Item link" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
          <TextField label="Unit (what staff count)" value={unit} onChange={(e) => setUnit(e.target.value)} />
          <TextField label="Pack size" type="number" value={pack} onChange={(e) => setPack(e.target.value)} slotProps={{ htmlInput: { min: 1 } }} />
          <TextField label="Price of one pack" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
          The rest can be filled in later on the list (Edit, or Fill with AI from the link).
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={bad || save.isPending} onClick={() => save.mutate()}>Approve</Button>
      </DialogActions>
    </Dialog>
  );
}

function DeclineDialog({ req, onClose }: { req: SupplyRequest; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const save = useMutation({
    mutationFn: () => declineSupplyRequest(req.id, reason.trim()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['supplies'] }); onClose(); },
    onError: (err) => enqueueSnackbar(apiError(err, 'Could not decline it.'), { variant: 'error' }),
  });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Decline: {req.name}</DialogTitle>
      <DialogContent>
        <TextField fullWidth multiline minRows={2} sx={{ mt: 1 }} label="Why (they will see this)" value={reason}
          onChange={(e) => setReason(e.target.value)} autoFocus />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="warning" disabled={!reason.trim() || save.isPending} onClick={() => save.mutate()}>Decline</Button>
      </DialogActions>
    </Dialog>
  );
}

export function RequestCard({ req, canDecide, onApprove, onDecline }: {
  req: SupplyRequest; canDecide: boolean; onApprove?: () => void; onDecline?: () => void;
}) {
  const chip = STATUS_CHIP[req.status];
  return (
    <Card variant="outlined">
      <CardContent sx={{ display: 'flex', gap: 1.5, pb: '12px !important' }}>
        {req.photo_url && (
          <Box component="a" href={req.photo_url} target="_blank" rel="noopener noreferrer" sx={{ flexShrink: 0 }}>
            <Box component="img" src={req.photo_url} alt={req.name} sx={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 1 }} />
          </Box>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Typography sx={{ fontWeight: 600 }}><OutLink href={req.url}>{req.name}</OutLink></Typography>
            <Chip size="small" color={chip.color} label={chip.label} />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {req.list_name || 'No list picked'} · {req.requested_by}, {whenText(req.created_at)}
          </Typography>
          {req.note && <Typography variant="body2">{req.note}</Typography>}
          {req.status === 'declined' && (
            <Typography variant="body2" sx={{ mt: 0.5 }}>Declined by {req.decided_by}: {req.decline_reason}</Typography>
          )}
          {req.status === 'approved' && (
            <Typography variant="body2" sx={{ mt: 0.5 }}>On {req.list_name} ({req.decided_by})</Typography>
          )}
          {canDecide && req.status === 'pending' && (
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Button size="small" variant="contained" onClick={onApprove}>Approve</Button>
              <Button size="small" color="warning" onClick={onDecline}>Decline</Button>
            </Stack>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

export default function SupplyRequestsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<SupplyRequestStatus>('pending');
  const [approving, setApproving] = useState<SupplyRequest | null>(null);
  const [declining, setDeclining] = useState<SupplyRequest | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ['supplies', 'requests', tab],
    queryFn: () => getSupplyRequests(tab),
  });
  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
      <PageHeader title="Supply requests" subtitle="What the team says we need." action={<Button onClick={() => navigate('/supplies')}>Lists</Button>} />
      <Tabs value={tab} onChange={(_, v: SupplyRequestStatus) => setTab(v)} sx={{ mb: 2 }}>
        <Tab value="pending" label="Waiting" />
        <Tab value="approved" label="Approved" />
        <Tab value="declined" label="Declined" />
      </Tabs>
      {isLoading && <LinearProgress />}
      {error && <Alert severity="error">{apiError(error, 'Could not load the requests.')}</Alert>}
      {data && data.requests.length === 0 && <Typography color="text.secondary">None here.</Typography>}
      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        {data?.requests.map((req) => (
          <RequestCard key={req.id} req={req} canDecide={data.can_decide}
            onApprove={() => setApproving(req)} onDecline={() => setDeclining(req)} />
        ))}
      </Box>
      {approving && <ApproveDialog req={approving} onClose={() => setApproving(null)} />}
      {declining && <DeclineDialog req={declining} onClose={() => setDeclining(null)} />}
    </Box>
  );
}

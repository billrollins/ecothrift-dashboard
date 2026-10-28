/** "We need ___" (owner, 2026-10-28): anyone on the team asks for a supply: what, which list, an optional link or
 * photo. A manager or the owner answers on Supplies → Requests; the answer shows under My requests. */
import { useState } from 'react';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography,
  useMediaQuery, useTheme,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { createSupplyRequest, type SupplyListSummary } from '../../api/supplies.api';
import { apiError } from './supplyBits';

export function WeNeedDialog({ open, onClose, lists }: { open: boolean; onClose: () => void; lists: SupplyListSummary[] }) {
  const [name, setName] = useState('');
  const [list, setList] = useState<number | ''>('');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const fullScreen = useMediaQuery(useTheme().breakpoints.down('sm'));
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const send = useMutation({
    mutationFn: () => createSupplyRequest({ name: name.trim(), list: list || null, url: url.trim(), note: note.trim(), photo }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplies'] });
      enqueueSnackbar('Sent. You will see the answer under My requests.', { variant: 'success' });
      onClose();
    },
    onError: (err) => enqueueSnackbar(apiError(err, 'Could not send it.'), { variant: 'error' }),
  });
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" fullScreen={fullScreen}>
      <DialogTitle>We need…</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="What do we need?" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
          <TextField select label="Which list" value={list} onChange={(e) => setList(Number(e.target.value) || '')}>
            <MenuItem value="">Not sure</MenuItem>
            {lists.map((l) => <MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>)}
          </TextField>
          <TextField label="Link (optional)" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
          <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2} />
          <Box>
            <Button component="label" variant="outlined">
              {photo ? 'Change photo' : 'Add a photo'}
              <input hidden type="file" accept="image/*" capture="environment"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
            </Button>
            {photo && <Typography variant="caption" sx={{ ml: 1 }}>{photo.name}</Typography>}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!name.trim() || send.isPending} onClick={() => send.mutate()}>Send</Button>
      </DialogActions>
    </Dialog>
  );
}

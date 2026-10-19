import { Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { addSecondAdult } from '../../api/thriftplus.api';
import { IdCheckFields, PhotoField } from './PersonFields';

/**
 * Add a second adult to a membership (owner 2026-10-19: Finalize offers "Add a person" after Done). Both are here: their
 * first and last name, their photo ID checked, a photo, and the main member approves. Phone and email stay the main
 * member's. The same rules as the member drawer's Add a person (server: accounts/<id>/second-adult/).
 */
export default function AddPersonPanel({ accountId, mainFirstName, onAdded, onCancel }: {
  accountId: number;
  mainFirstName: string;
  onAdded: (name: string) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState({ first_name: '', last_name: '', id_checked: false, verified_18: false });
  const [photo, setPhoto] = useState<File | null>(null);
  const [approves, setApproves] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const main = mainFirstName || 'the main member';
  const ready = Boolean(v.first_name.trim() && v.last_name.trim() && v.id_checked && photo && approves);

  async function add() {
    if (!ready) return;
    setBusy(true);
    setError('');
    try {
      await addSecondAdult(accountId, {
        first_name: v.first_name.trim(), last_name: v.last_name.trim(), id_checked: v.id_checked, verified_18: v.verified_18,
        photo, both_present: true, primary_approves: approves,
      });
      onAdded(`${v.first_name.trim()} ${v.last_name.trim()}`);
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || 'Could not add them. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack spacing={1.5} data-testid="add-person">
      <Typography variant="h6" fontWeight={800}>Add a person</Typography>
      <Typography variant="body2" color="text.secondary">
        Both are here. A name, their photo ID and a photo. Phone and email stay {main}&apos;s.
      </Typography>
      <Stack direction="row" spacing={1}>
        <TextField label="First name" required fullWidth value={v.first_name} onChange={(e) => setV({ ...v, first_name: e.target.value })} />
        <TextField label="Last name" required fullWidth value={v.last_name} onChange={(e) => setV({ ...v, last_name: e.target.value })} />
      </Stack>
      <IdCheckFields value={v} onChange={(next) => setV({ ...v, ...next })} />
      <PhotoField photo={photo} onChange={setPhoto} />
      <FormControlLabel
        control={<Checkbox checked={approves} onChange={(e) => setApproves(e.target.checked)} />}
        label={`Both are here, and ${main} approves`}
      />
      {error ? <Alert severity="error">{error}</Alert> : null}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button size="large" onClick={onCancel} disabled={busy} sx={{ minHeight: 56 }}>Cancel</Button>
        <Button variant="contained" size="large" disabled={!ready || busy} onClick={() => void add()} sx={{ flex: 1, minHeight: 56, fontWeight: 700 }}>
          {busy ? <CircularProgress size={22} color="inherit" /> : 'Add them'}
        </Button>
      </Box>
      {!ready ? (
        <Typography variant="caption" color="text.secondary">Needs a first and last name, the ID checked, a photo, and the approval.</Typography>
      ) : null}
    </Stack>
  );
}

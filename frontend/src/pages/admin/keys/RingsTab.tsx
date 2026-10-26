import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardActionArea,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  List,
  ListItem,
  ListItemText,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import {
  type KeyRow,
  type Person,
  type RingRow,
  archiveRing,
  createRing,
  fetchKeyPeople,
  fetchRing,
  fetchRings,
  moveRing,
  updateRing,
} from '../../../api/keys.api';
import { KeyDialog } from './KeyDialog';
import { KeyThumb, WhereChip, errorText, metricsText, when } from './keysShared';

/** A person picked from staff, or a typed name (someone without a login). */
type Who = Person | string | null;

function PersonField({ label, value, onChange, people }: { label: string; value: Who; onChange: (v: Who) => void; people: Person[] }) {
  return (
    <Autocomplete
      freeSolo
      options={people}
      value={value}
      getOptionLabel={(o) => (typeof o === 'string' ? o : o.name)}
      isOptionEqualToValue={(a, b) => typeof a !== 'string' && typeof b !== 'string' && a.id === b.id}
      onChange={(_e, v) => onChange(v)}
      onInputChange={(_e, v, reason) => {
        if (reason === 'input') onChange(v || null);
      }}
      renderInput={(params) => <TextField {...params} label={label} />}
    />
  );
}

/** Check a ring out to someone or somewhere, or back in to its home. */
function MoveDialog({ ring, onClose }: { ring: RingRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [who, setWho] = useState<Who>(null);
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const { data: people = [] } = useQuery({ queryKey: ['keys', 'people'], queryFn: fetchKeyPeople, enabled: !!ring });
  const out = ring?.where.status !== 'out';

  useEffect(() => {
    setWho(null);
    setLocation('');
    setNote('');
    setError('');
  }, [ring]);

  const move = useMutation({
    mutationFn: () =>
      moveRing(ring!.id, {
        kind: out ? 'out' : 'in',
        person: who && typeof who !== 'string' ? who.id : null,
        person_name: typeof who === 'string' ? who : '',
        location,
        note,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['keys'] });
      enqueueSnackbar(out ? 'Checked out.' : 'Checked in.', { variant: 'success' });
      onClose();
    },
    onError: (err) => setError(errorText(err, 'Could not save that.')),
  });

  return (
    <Dialog open={!!ring} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{out ? `Check out ${ring?.name ?? ''}` : `Check in ${ring?.name ?? ''}`}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {out ? (
            <>
              <PersonField label="Who has it" value={who} onChange={setWho} people={people} />
              <TextField label="Or where it went" value={location} onChange={(e) => setLocation(e.target.value)} />
            </>
          ) : (
            <Typography>
              Back home{ring?.home_location || ring?.home_person_name ? `: ${[ring?.home_person_name, ring?.home_location].filter(Boolean).join(', ')}` : ''}.
            </Typography>
          )}
          <TextField label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
          {error ? <Alert severity="error">{error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => move.mutate()}
          disabled={move.isPending || (out && !who && !location.trim())}
        >
          {out ? 'Check out' : 'Check in'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** A new ring, or one ring's name, home, keys and log. */
function RingDialog({ ringId, open, onClose, onOpenKey }: { ringId: number | null; open: boolean; onClose: () => void; onOpenKey: (k: KeyRow | null, ring?: number) => void }) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { data: ring } = useQuery({ queryKey: ['keys', 'ring', ringId], queryFn: () => fetchRing(ringId!), enabled: open && !!ringId });
  const { data: people = [] } = useQuery({ queryKey: ['keys', 'people'], queryFn: fetchKeyPeople, enabled: open });
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [homeLocation, setHomeLocation] = useState('');
  const [homePerson, setHomePerson] = useState<Person | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(ring?.name ?? '');
    setNotes(ring?.notes ?? '');
    setHomeLocation(ring?.home_location ?? '');
    setHomePerson(ring?.home_person_id ? { id: ring.home_person_id, name: ring.home_person_name } : null);
    setError('');
  }, [open, ring]);

  const save = useMutation({
    mutationFn: () => {
      const input = { name, notes, home_location: homeLocation, home_person: homePerson?.id ?? null };
      return ringId ? updateRing(ringId, input) : createRing(input);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['keys'] });
      enqueueSnackbar('Saved.', { variant: 'success' });
      onClose();
    },
    onError: (err) => setError(errorText(err, 'Could not save the ring.')),
  });

  const archive = useMutation({
    mutationFn: () => archiveRing(ringId!),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['keys'] });
      enqueueSnackbar('Ring removed; its keys are on no ring now.', { variant: 'success' });
      onClose();
    },
    onError: (err) => setError(errorText(err, 'Could not remove the ring.')),
  });

  return (
    <Dialog open={open} onClose={onClose} fullScreen={phone} fullWidth maxWidth="md">
      <DialogTitle>{ringId ? ring?.name ?? 'Key ring' : 'Add a key ring'}</DialogTitle>
      <DialogContent>
        <Grid container spacing={3} sx={{ pt: 1 }}>
          <Grid size={{ xs: 12, md: ringId ? 5 : 12 }}>
            <Stack spacing={2}>
              <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus={!ringId} />
              <TextField label="Home: where it lives" value={homeLocation} onChange={(e) => setHomeLocation(e.target.value)} placeholder="Office drawer" />
              <Autocomplete
                options={people}
                value={homePerson}
                getOptionLabel={(o) => o.name}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                onChange={(_e, v) => setHomePerson(v)}
                renderInput={(params) => <TextField {...params} label="Home: whose ring it is" />}
              />
              <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} multiline minRows={2} />
              {ring ? <WhereChip where={ring.where} /> : null}
            </Stack>
          </Grid>
          {ringId && ring ? (
            <Grid size={{ xs: 12, md: 7 }}>
              <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="subtitle2" sx={{ flex: 1 }}>
                  Keys on it ({ring.keys.length})
                </Typography>
                <Button size="small" onClick={() => onOpenKey(null, ring.id)}>
                  Add a key
                </Button>
              </Stack>
              <Stack spacing={1}>
                {ring.keys.map((k) => (
                  <Card key={k.id} variant="outlined">
                    <CardActionArea onClick={() => onOpenKey(k)} sx={{ p: 1, display: 'flex', justifyContent: 'flex-start', gap: 1.5 }}>
                      <KeyThumb url={k.thumbnail_url} size={40} />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography noWrap>{k.name}</Typography>
                        <Typography variant="caption" color="text.secondary" noWrap component="div">
                          {metricsText(k)}
                        </Typography>
                      </Box>
                    </CardActionArea>
                  </Card>
                ))}
                {!ring.keys.length ? <Typography color="text.secondary">No keys on this ring yet.</Typography> : null}
              </Stack>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2">Log</Typography>
              <List dense disablePadding>
                {ring.moves.map((m) => (
                  <ListItem key={m.id} disableGutters>
                    <ListItemText
                      primary={`${m.kind === 'out' ? 'Out' : 'In'}${m.kind === 'out' ? `: ${[m.person, m.location].filter(Boolean).join(', ')}` : ''}${m.note ? ` (${m.note})` : ''}`}
                      secondary={`${when(m.moved_at)}${m.moved_by ? ` by ${m.moved_by}` : ''}`}
                    />
                  </ListItem>
                ))}
                {!ring.moves.length ? <Typography color="text.secondary">Never checked out.</Typography> : null}
              </List>
            </Grid>
          ) : null}
        </Grid>
        {error ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {ringId ? (
          <Button color="error" onClick={() => archive.mutate()} disabled={archive.isPending}>
            Remove
          </Button>
        ) : null}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Every key ring: how many keys, its home, and where it is now, with check out / in. */
export function RingsTab() {
  const { data: rings = [], isLoading } = useQuery({ queryKey: ['keys', 'rings'], queryFn: fetchRings });
  const [openRing, setOpenRing] = useState<{ id: number | null } | null>(null);
  const [moving, setMoving] = useState<RingRow | null>(null);
  const [keyDialog, setKeyDialog] = useState<{ key: KeyRow | null; ring?: number } | null>(null);

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center">
        <Typography color="text.secondary" sx={{ flex: 1 }}>
          {isLoading ? 'Loading...' : `${rings.length} key ring${rings.length === 1 ? '' : 's'}`}
        </Typography>
        <Button variant="contained" onClick={() => setOpenRing({ id: null })}>
          Add ring
        </Button>
      </Stack>
      <Grid container spacing={2}>
        {rings.map((r) => (
          <Grid key={r.id} size={{ xs: 12, sm: 6, lg: 4 }}>
            <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <CardActionArea onClick={() => setOpenRing({ id: r.id })} sx={{ p: 2, flex: 1, alignItems: 'flex-start' }}>
                <Typography variant="h6" noWrap>
                  {r.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {r.key_count} key{r.key_count === 1 ? '' : 's'}
                  {r.where.status === 'out' && (r.home_location || r.home_person_name)
                    ? ` · home: ${[r.home_person_name, r.home_location].filter(Boolean).join(', ')}`
                    : ''}
                </Typography>
                <Box sx={{ mt: 1 }}>
                  <WhereChip where={r.where} />
                </Box>
              </CardActionArea>
              <Box sx={{ px: 2, pb: 1.5 }}>
                <Button size="small" variant={r.where.status === 'out' ? 'contained' : 'outlined'} onClick={() => setMoving(r)}>
                  {r.where.status === 'out' ? 'Check in' : 'Check out'}
                </Button>
              </Box>
            </Card>
          </Grid>
        ))}
      </Grid>
      {!isLoading && !rings.length ? <Alert severity="info">No key rings yet. Add one, then put keys on it.</Alert> : null}
      <RingDialog
        open={!!openRing}
        ringId={openRing?.id ?? null}
        onClose={() => setOpenRing(null)}
        onOpenKey={(key, ring) => setKeyDialog({ key, ring })}
      />
      <MoveDialog ring={moving} onClose={() => setMoving(null)} />
      <KeyDialog open={!!keyDialog} keyRow={keyDialog?.key ?? null} defaultRing={keyDialog?.ring} onClose={() => setKeyDialog(null)} />
    </Stack>
  );
}

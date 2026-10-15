import { Box, Button, List, ListItemButton, ListItemText, Stack, TextField, Typography } from '@mui/material';
import { format, parseISO } from 'date-fns';
import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import { findPendingJoins, thriftErrorMessage, type ThriftPendingPerson } from '../../api/thriftplusRegister.api';

interface Props {
  /** The cashier picked the person who joined online: open Finish joining for them. */
  onPick: (person: ThriftPendingPerson) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}

/** "Cara Joyner" from a pending join. */
export function pendingName(person: ThriftPendingPerson): string {
  return `${person.first_name} ${person.last_name}`.trim();
}

function joinedOn(iso: string): string {
  try {
    return format(parseISO(iso), 'MMM d, h:mm a');
  } catch {
    return '';
  }
}

/**
 * "Joined online?" at the register (owner 2026-10-15, J8): find the person who started on their phone by name or
 * email (or scan the QR in their Thrift+ app into the scan box). The newest joins show first, before anything is
 * typed. Picking one opens Finish joining.
 */
export default function ThriftPlusPendingFind({ onPick, disabled = false, autoFocus = false }: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<ThriftPendingPerson[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function find(query: string) {
    setBusy(true);
    try {
      setPeople(await findPendingJoins(query.trim()));
    } catch (err) {
      enqueueSnackbar(thriftErrorMessage(err), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void find('');
    // The newest joins once, when the search opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center">
        <TextField
          size="small"
          label="Name or email"
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void find(q);
            }
          }}
          sx={{ flex: 1 }}
        />
        <Button size="small" variant="outlined" disabled={disabled || busy} onClick={() => void find(q)}>
          Find
        </Button>
      </Stack>
      {people && people.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {q.trim() ? 'No one who joined online by that name or email.' : 'No one is waiting to finish joining.'}
        </Typography>
      ) : null}
      {people && people.length > 0 ? (
        <List dense disablePadding data-testid="thrift-pending-people">
          {people.map((p) => (
            <ListItemButton key={p.person_id} disabled={disabled} onClick={() => onPick(p)}>
              <ListItemText
                primary={pendingName(p)}
                secondary={[p.email, p.joined_at ? `joined ${joinedOn(p.joined_at)}` : ''].filter(Boolean).join(' · ')}
              />
            </ListItemButton>
          ))}
        </List>
      ) : null}
    </Box>
  );
}

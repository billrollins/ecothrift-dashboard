import {
  Avatar,
  Box,
  Button,
  Chip,
  List,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { findThriftMembers, thriftErrorMessage, type ThriftFoundPerson } from '../../api/thriftplusRegister.api';

interface Props {
  /** The cashier picked the person, after matching their face to the photo. */
  onPick: (person: ThriftFoundPerson) => void | Promise<unknown>;
  /** An attach or lookup is running: no picking. */
  disabled?: boolean;
  autoFocus?: boolean;
}

/** "Ana D." from a person found by phone. */
export function foundName(person: ThriftFoundPerson): string {
  return `${person.first_name}${person.last_initial ? ` ${person.last_initial}.` : ''}`;
}

/**
 * Find a Thrift+ member by phone at the register (owner 2026-10-14: there is no Thrift+ card; a member shows the QR in
 * the Thrift+ app or gives their phone number). Any format; at least 7 digits. Every adult on the membership is listed
 * with their photo, so the cashier picks the person standing there.
 */
export default function ThriftPlusPhoneFind({ onPick, disabled = false, autoFocus = false }: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const [phone, setPhone] = useState('');
  const [people, setPeople] = useState<ThriftFoundPerson[] | null>(null);
  const [busy, setBusy] = useState(false);
  const digits = phone.replace(/\D/g, '');

  async function find() {
    if (digits.length < 7 || busy) return;
    setBusy(true);
    try {
      setPeople(await findThriftMembers(phone));
    } catch (err) {
      enqueueSnackbar(thriftErrorMessage(err), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center">
        <TextField
          size="small"
          label="Phone number"
          value={phone}
          autoFocus={autoFocus}
          onChange={(e) => {
            setPhone(e.target.value);
            setPeople(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void find();
            }
          }}
          slotProps={{ htmlInput: { inputMode: 'tel' } }}
          sx={{ flex: 1 }}
        />
        <Button size="small" variant="outlined" disabled={disabled || busy || digits.length < 7} onClick={() => void find()}>
          Find
        </Button>
      </Stack>
      {people && people.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          No member with that phone number.
        </Typography>
      ) : null}
      {people && people.length > 0 ? (
        <>
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
            Pick the person: check their face against the photo.
          </Typography>
          <List dense disablePadding data-testid="thrift-phone-people">
            {people.map((p) => {
              const active = p.account_status === 'active';
              return (
                <ListItemButton key={p.person_id} disabled={disabled || !active} onClick={() => void onPick(p)}>
                  <ListItemAvatar>
                    <Avatar src={p.photo_url ?? undefined} alt={foundName(p)} sx={{ width: 56, height: 56, mr: 1 }}>
                      {p.first_name.slice(0, 1)}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={foundName(p)}
                    secondary={
                      <Stack direction="row" spacing={0.5} component="span" sx={{ flexWrap: 'wrap', rowGap: 0.5, mt: 0.25 }}>
                        {!active ? <Chip size="small" color="error" label="Membership not active" component="span" /> : null}
                        <Chip
                          size="small"
                          component="span"
                          color={p.verified_18 ? 'success' : 'default'}
                          label={p.verified_18 ? '18+ verified' : 'Not ID-checked'}
                        />
                        {p.role === 'secondary' ? <Chip size="small" component="span" label="Second adult" /> : null}
                        {p.practice ? <Chip size="small" component="span" color="warning" label="Practice member" /> : null}
                      </Stack>
                    }
                    slotProps={{ secondary: { component: 'span' } }}
                  />
                </ListItemButton>
              );
            })}
          </List>
        </>
      ) : null}
    </Box>
  );
}

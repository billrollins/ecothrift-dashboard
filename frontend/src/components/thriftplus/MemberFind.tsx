import SearchRounded from '@mui/icons-material/SearchRounded';
import { Alert, Box, Button, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import {
  findPendingOrMember,
  thriftErrorMessage,
  type ThriftCodeMember,
  type ThriftPendingPerson,
} from '../../api/thriftplusRegister.api';
import { PersonCard } from '../../pages/thriftplus/finalize/finalizePeople';
import { thriftCardCode } from '../../utils/thriftPlusCard';

/** What the cashier hears when a scanned QR is no pending join. */
export function codeMemberMessage(member: ThriftCodeMember | undefined): string {
  if (!member || member.status === 'unknown') return "That QR isn't a Thrift+ member code we know. Search by name or email.";
  const name = member.first_name || 'They';
  if (member.status === 'active') return `${name} is already a Thrift+ member. Nothing to finalize: they can shop as a member now.`;
  return `${name}'s membership is not active. Ask a manager.`;
}

/**
 * Find (owner 2026-10-20): one search box for a member QR (scanned, `TP` + the code), a name, a phone, an email or a
 * member # (the 12-digit code). The same search as the Thrift+ Staff app's Find. A scanned QR that matches one person
 * picks them at once; anything else lists the matches, each a tap. The register's "Thrift+ member" button and the
 * Members page both use it.
 */
export default function MemberFind({
  onPick, disabled = false, autoFocus = false, label = 'Scan a member QR, or type a name, phone, email or member #',
}: {
  /** ``scannedCode``: their member QR was scanned (proof they are here), not a search pick. */
  onPick: (person: ThriftPendingPerson, scannedCode?: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  label?: string;
}) {
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<ThriftPendingPerson[] | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function search(raw = q) {
    const query = raw.trim();
    if (!query || busy) return;
    setBusy(true);
    setNote('');
    try {
      const found = await findPendingOrMember(query, { recent: true });
      const code = thriftCardCode(query, true);
      const scanned = code !== null;
      if (scanned && found.people.length === 1) {
        setQ('');
        setPeople(null);
        onPick(found.people[0], code);
      } else {
        setPeople(found.people);
        if (found.people.length === 0) {
          setNote(scanned ? codeMemberMessage(found.member) : 'No one by that name, phone, email or member number.');
        }
      }
    } catch (err) {
      setNote(thriftErrorMessage(err, 'Could not search. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack spacing={1.5} data-testid="member-find">
      <Stack direction="row" spacing={1}>
        <TextField
          label={label}
          value={q}
          autoFocus={autoFocus}
          disabled={disabled}
          onChange={(e) => {
            setQ(e.target.value);
            setNote('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void search();
            }
          }}
          fullWidth
          slotProps={{ htmlInput: { enterKeyHint: 'search', autoCapitalize: 'none', autoComplete: 'off' } }}
        />
        <Button
          variant="contained"
          onClick={() => void search()}
          disabled={disabled || busy || !q.trim()}
          aria-label="Find"
          sx={{ minWidth: 72 }}
        >
          {busy ? <CircularProgress size={22} color="inherit" /> : <SearchRounded />}
        </Button>
      </Stack>
      {note ? <Alert severity="info" data-testid="member-find-note">{note}</Alert> : null}
      {people && people.length > 0 ? (
        <Box>
          <Typography variant="overline" color="text.secondary" component="div">
            {people.length === 1 ? '1 match' : `${people.length} matches`}
          </Typography>
          <Stack spacing={0.75} data-testid="member-find-people" sx={{ maxHeight: '50dvh', overflowY: 'auto', pr: 0.5, py: 0.5 }}>
            {people.map((p) => (
              <PersonCard key={p.person_id} person={p} onOpen={() => (disabled ? undefined : onPick(p))} />
            ))}
          </Stack>
        </Box>
      ) : null}
    </Stack>
  );
}

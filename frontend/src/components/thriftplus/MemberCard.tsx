import DescriptionRounded from '@mui/icons-material/DescriptionRounded';
import PersonAddAlt1Rounded from '@mui/icons-material/PersonAddAlt1Rounded';
import { Alert, Avatar, Box, Button, ButtonBase, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { useEffect, useRef, useState } from 'react';
import {
  finishThriftJoin,
  getMemberCard,
  thriftErrorMessage,
  type ThriftFinishResult,
} from '../../api/thriftplusRegister.api';
import { SIGNATURE_WORDS, TermsDialog } from '../../pages/thriftplus/finalize/finalizeParts';
import ThriftSignaturePad, { type ThriftSignaturePadHandle } from '../../pages/thriftplus/finalize/ThriftSignaturePad';
import { compressImageToJpeg } from '../../services/receiving/receivingClient';
import type { Cart } from '../../types/pos.types';
import { formatCurrency } from '../../utils/format';
import { useByText } from '../../utils/thriftPlusRegister';
import AddPersonPanel from './AddPersonPanel';
import SelfieCheck, { NO_CHECKS, checksDone, type FaceChecks } from './SelfieCheck';
import { tbNumber } from './ThriftBucks';

const big = { minHeight: 56, fontSize: '1.1rem', fontWeight: 700, borderRadius: 2 } as const;

function day(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return format(parseISO(iso), 'EEE MMM d');
  } catch {
    return '';
  }
}

function Tile({ label, children, note, testId }: { label: string; children: React.ReactNode; note?: string; testId?: string }) {
  return (
    <Box data-testid={testId} sx={{ flex: '1 1 140px', p: 1.25, borderRadius: 2, border: 1, borderColor: 'divider', minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" component="div">{label}</Typography>
      <Typography variant="h5" fontWeight={800} sx={{ lineHeight: 1.15 }}>{children}</Typography>
      {note ? <Typography variant="caption" color="text.secondary" component="div">{note}</Typography> : null}
    </Box>
  );
}

const STANDING = {
  member: { label: 'Member', color: 'success' },
  pending: { label: 'Needs ID check', color: 'warning' },
  off: { label: 'Off', color: 'error' },
} as const;

/**
 * The member card (owner 2026-10-20): one person's Thrift+ standing on a screen. Their photo, name and status
 * (pending / member / off); ThriftBucks collected, used and left (with the use-by date) and Thrift+ credit; recent trips
 * (day, ticket number, total); the people on the membership. Two things can be done here, with the customer in front of
 * you: Add a 2nd person to a member, and, for someone who joined online, Finalize: only the ID check (Name matches,
 * Photo matches, 18 or older), then Match. The Members page (/pos/members) and the register's Thrift+ member button
 * show this same card; the Returns page can too.
 *
 * ``cartId`` is the open sale at the register: Finalize puts the member on it (``onCart`` gets the sale). ``onFinalized``
 * hears every Match. Tapping another person on the membership shows their card.
 */
export default function MemberCard({
  personId, cartId = null, onCart, onFinalized, onChanged,
}: {
  personId: number;
  cartId?: number | null;
  onCart?: (cart: Cart) => void;
  onFinalized?: (result: ThriftFinishResult) => void;
  /** The membership changed (Matched, a person added): lists that show it can reload. */
  onChanged?: () => void;
}) {
  const client = useQueryClient();
  const [activeId, setActiveId] = useState(personId);
  const [checks, setChecks] = useState<FaceChecks>(NO_CHECKS);
  const [newSelfie, setNewSelfie] = useState<Blob | null>(null);
  const [signed, setSigned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [terms, setTerms] = useState(false);
  const pad = useRef<ThriftSignaturePadHandle | null>(null);

  const key = ['thriftplus', 'member-card', activeId];
  const { data, isLoading, error: loadError } = useQuery({
    queryKey: key,
    queryFn: () => getMemberCard(activeId),
    staleTime: 0,
    retry: false,
  });

  function reset() {
    setChecks(NO_CHECKS);
    setNewSelfie(null);
    setSigned(false);
    setError('');
    setNote('');
    setAdding(false);
  }

  useEffect(() => {
    setActiveId(personId);
    reset();
  }, [personId]);

  async function reload() {
    await client.invalidateQueries({ queryKey: ['thriftplus', 'member-card'] });
    onChanged?.();
  }

  async function retake(file: File) {
    try {
      setNewSelfie(await compressImageToJpeg(file, 1280, 0.85));
    } catch {
      setNewSelfie(file);
    }
  }

  async function match() {
    const p = data?.person;
    if (!p || !checksDone(checks) || !(p.photo_url || newSelfie)) return;
    let signature: Blob | null | undefined = null;
    if (!p.signed) {
      signature = await pad.current?.toBlob();
      if (!signature) {
        setError('The signature did not save. Clear it and sign again.');
        return;
      }
    }
    setBusy(true);
    setError('');
    try {
      const result = await finishThriftJoin({
        person: p.person_id, id_checked: true, face_matches: true, verified_18: checks.over18, finalize: true,
        cart: cartId, ...(newSelfie ? { photo: newSelfie } : {}), ...(signature ? { signature } : {}),
      });
      if (result.cart) onCart?.(result.cart);
      setNote(
        result.attach_error
          ? `${p.first_name} is a Thrift+ member, but not on this sale: ${result.attach_error.detail}`
          : result.cart
            ? `${p.first_name} is a Thrift+ member and on this sale.`
            : `${p.first_name} is a Thrift+ member.`,
      );
      setChecks(NO_CHECKS);
      setNewSelfie(null);
      await reload();
      onFinalized?.(result);
    } catch (err) {
      setError(thriftErrorMessage(err, 'Could not finish. Check the connection and try again.'));
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) return <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress /></Box>;
  if (loadError || !data) {
    return <Alert severity="error">{thriftErrorMessage(loadError, 'Could not open that member. Try again.')}</Alert>;
  }

  const { person, rewards, trips, people } = data;
  const standing = STANDING[person.standing] ?? STANDING.off;
  const useBy = useByText(rewards.use_by);
  const canAdd = person.standing === 'member' && people.length < 2;
  const signatureNeeded = !person.signed;
  const matchReady = checksDone(checks) && Boolean(person.photo_url || newSelfie) && (!signatureNeeded || signed);

  return (
    <Stack spacing={2} data-testid="member-card">
      <Stack direction="row" spacing={1.75} alignItems="center">
        <Avatar src={person.photo_url ?? undefined} alt={person.name} sx={{ width: 88, height: 88, fontSize: '2rem' }}>
          {person.name.slice(0, 1)}
        </Avatar>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="h5" fontWeight={800} sx={{ overflowWrap: 'anywhere', lineHeight: 1.15 }} data-testid="member-card-name">
            {person.name}
          </Typography>
          <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.5, mt: 0.5 }}>
            <Chip size="small" color={standing.color} label={standing.label} data-testid="member-card-status" sx={{ fontWeight: 700 }} />
            <Chip size="small" color={person.verified_18 ? 'success' : 'default'} variant="outlined"
              label={person.verified_18 ? '18+ verified' : 'Not ID-checked'} />
            {person.role === 'secondary' ? <Chip size="small" variant="outlined" label="Second adult" /> : null}
            {person.practice ? <Chip size="small" color="warning" label="Practice member" /> : null}
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {[person.code_display ? `Member # ${person.code_display}` : '', person.phone_last4 ? `••${person.phone_last4}` : person.contact]
              .filter(Boolean).join(' · ')}
          </Typography>
        </Box>
      </Stack>

      {person.standing === 'pending' ? (
        <Alert severity="warning">Joined online. Check their photo ID to finish joining: they collect and use nothing until then.</Alert>
      ) : null}
      {person.standing === 'off' ? (
        <Alert severity="error">This membership is not active. Ask a manager.</Alert>
      ) : null}
      {note ? <Alert severity="success" data-testid="member-card-note">{note}</Alert> : null}

      <Box>
        <Typography variant="overline" color="text.secondary" component="div">ThriftBucks and credit</Typography>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          <Tile label="ThriftBucks collected" testId="member-card-collected">{tbNumber(rewards.collected)}</Tile>
          <Tile label="ThriftBucks used" testId="member-card-used">{tbNumber(rewards.used)}</Tile>
          <Tile label="ThriftBucks balance" note={useBy ? `use by ${useBy}` : undefined} testId="member-card-balance">
            {tbNumber(rewards.balance)}
          </Tile>
          <Tile label="Thrift+ credit" testId="member-card-credit">{formatCurrency(rewards.credit)}</Tile>
        </Stack>
      </Box>

      {data.returns ? (
        <Alert severity={data.returns.warning ? 'warning' : 'info'} icon={false} data-testid="member-card-returns">
          {`Returns: ${data.returns.trips} ${data.returns.trips === 1 ? 'trip' : 'trips'} (${data.returns.items} ${data.returns.items === 1 ? 'item' : 'items'}) in the last ${data.returns.days} days.`}
          {data.returns.warning ? ' That is a lot of returns: check with a manager before taking another.' : ''}
        </Alert>
      ) : null}

      <Box>
        <Typography variant="overline" color="text.secondary" component="div">Recent trips</Typography>
        {trips.length === 0 ? (
          <Typography color="text.secondary">No trips yet.</Typography>
        ) : (
          <Box data-testid="member-card-trips">
            {trips.map((t) => (
              <Box key={t.cart_id} sx={{ display: 'flex', gap: 1.5, py: 0.75, borderBottom: 1, borderColor: 'divider', alignItems: 'baseline' }}>
                <Typography sx={{ width: 96, flexShrink: 0, fontWeight: 600 }}>{day(t.date)}</Typography>
                <Typography sx={{ flex: 1, minWidth: 0 }} noWrap>{`Ticket ${t.ticket}`}</Typography>
                <Typography color="text.secondary" sx={{ flexShrink: 0 }}>{`${t.items} ${t.items === 1 ? 'item' : 'items'}`}</Typography>
                <Typography fontWeight={700} sx={{ width: 84, flexShrink: 0, textAlign: 'right' }}>{formatCurrency(t.total)}</Typography>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      <Box>
        <Typography variant="overline" color="text.secondary" component="div">On this membership</Typography>
        <Stack spacing={0.75} data-testid="member-card-people">
          {people.map((p) => (
            <ButtonBase
              key={p.person_id}
              onClick={() => {
                if (p.person_id !== activeId) {
                  setActiveId(p.person_id);
                  reset();
                }
              }}
              aria-current={p.person_id === activeId}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1.25, width: '100%', textAlign: 'left', px: 1.25, py: 0.75, borderRadius: 2,
                border: 1, borderColor: p.person_id === activeId ? 'primary.main' : 'divider',
              }}
            >
              <Avatar src={p.photo_url ?? undefined} alt={p.name} sx={{ width: 44, height: 44 }}>{p.name.slice(0, 1)}</Avatar>
              <Typography fontWeight={700} sx={{ flex: 1 }}>{p.name}</Typography>
              <Typography variant="body2" color="text.secondary">{p.role === 'secondary' ? 'Second adult' : 'Main member'}</Typography>
            </ButtonBase>
          ))}
        </Stack>
      </Box>

      {person.standing === 'pending' ? (
        <Box data-testid="member-card-finalize">
          <Typography variant="h6" fontWeight={800} sx={{ mb: 1 }}>Finalize</Typography>
          <SelfieCheck
            person={person}
            checks={checks}
            onChecks={setChecks}
            retake={newSelfie}
            onRetake={(f) => void retake(f)}
            disabled={busy}
            capture="user"
            imageMaxHeight={280}
            faceLabel="Photo matches"
          >
            {signatureNeeded ? (
              <Stack spacing={1.5} data-testid="member-card-sign">
                <Typography fontWeight={700} color="text.secondary">They have not signed yet. Hand them the screen to sign.</Typography>
                <Typography fontWeight={800}>{SIGNATURE_WORDS}</Typography>
                <Button variant="outlined" size="large" startIcon={<DescriptionRounded />} onClick={() => setTerms(true)} disabled={busy} sx={big}>
                  Read the terms
                </Button>
                <ThriftSignaturePad ref={pad} onInk={setSigned} disabled={busy} />
              </Stack>
            ) : (
              <Alert severity="success">Signed the terms in the app.</Alert>
            )}
            {error ? <Alert severity="error" data-testid="member-card-error">{error}</Alert> : null}
            <Button
              variant="contained"
              color="success"
              size="large"
              disabled={!matchReady || busy}
              onClick={() => void match()}
              sx={{ ...big, minHeight: 72, fontSize: '1.3rem' }}
              data-testid="member-card-match"
            >
              {busy ? <CircularProgress size={26} color="inherit" /> : 'Match'}
            </Button>
            {!(person.photo_url || newSelfie) ? (
              <Typography variant="body2" color="text.secondary" textAlign="center">Take their photo first.</Typography>
            ) : signatureNeeded && !signed ? (
              <Typography variant="body2" color="text.secondary" textAlign="center">They sign first.</Typography>
            ) : null}
          </SelfieCheck>
          <TermsDialog open={terms} onClose={() => setTerms(false)} />
        </Box>
      ) : null}

      {canAdd && !adding ? (
        <Button variant="outlined" size="large" startIcon={<PersonAddAlt1Rounded />} onClick={() => setAdding(true)} sx={big} data-testid="member-card-add-person">
          Add a 2nd person
        </Button>
      ) : null}
      {canAdd && adding ? (
        <AddPersonPanel
          accountId={person.account_id}
          mainFirstName={people.find((p) => p.role === 'primary')?.first_name ?? person.first_name}
          onAdded={(name) => {
            setAdding(false);
            setNote(`${name} is on the membership.`);
            void reload();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : null}
    </Stack>
  );
}

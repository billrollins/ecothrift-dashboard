/**
 * The Thrift+ Member window (Retail 2, Dash Updates #16): one member, the same wherever they open
 * (`openObject({ type: 'member', id: personId })`): a sale, the Transactions window, the people on a membership.
 * Built like the Item window: header (photo, name, member number with copy, standing), ThriftBucks, credit and trips;
 * trips (each opens its sale), returns, the people on the membership (each opens their own window) and what changed
 * their standing. Read-only; "Open the card" swaps in the member card with its actions (finish joining, add a second
 * adult), as the Item window's Edit does. Nothing new about the person: no phone, email or ID details.
 */
import { useState } from 'react';
import {
  Avatar, Box, Button, ButtonBase, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getMemberWindow } from '../../../api/thriftplusRegister.api';
import { canAccess } from '../../../auth/access';
import { useAuth } from '../../../hooks/useAuth';
import MemberMoney from '../../../pages/thriftplus/MemberMoney';
import MemberCard from '../../thriftplus/MemberCard';
import { tbNumber } from '../../thriftplus/ThriftBucks';
import { useObjectModal } from '../../objects/ObjectModal';
import { CopyId, Section, Stat, Timeline, type TimelineRow } from '../../objects/windowParts';
import { IconBack } from '../../../icons/ecoIcons';
import { historyKey } from './historyScope';
import { money, useRetailCopy, type CopyKey } from './retailCopy';

const STANDING: Record<string, { key: CopyKey; color: 'success' | 'warning' | 'error' }> = {
  member: { key: 'sd_member', color: 'success' },
  pending: { key: 'sd_pending', color: 'warning' },
  off: { key: 'sd_off', color: 'error' },
};

const HISTORY_DOT: Record<string, string> = {
  joined_online: '#0277bd', joined_website: '#0277bd', signup: '#0277bd', finished_joining: '#2e7d32',
  staff_membership: '#6a1b9a', second_added: '#00838f', phone_added: '#757575', return: '#ef6c00',
  return_late_ok: '#ef6c00', deactivated: '#c62828',
};

function Row({ onClick, left, right }: { onClick: () => void; left: string; right: string }) {
  return (
    <ButtonBase onClick={onClick} sx={{ display: 'flex', width: '100%', gap: 1.5, py: 0.75, px: 0.5, textAlign: 'left', borderRadius: 1, justifyContent: 'flex-start' }}>
      <Typography sx={{ flex: 1, minWidth: 0, fontSize: 14 }} noWrap>{left}</Typography>
      <Typography sx={{ fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{right}</Typography>
    </ButtonBase>
  );
}

export function MemberWindow({ personId }: { personId: number }) {
  const { tr, when } = useRetailCopy();
  const { openObject } = useObjectModal();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [fixing, setFixing] = useState(false);
  const { user } = useAuth();
  // Make it right (Bill 11-09): managers give or take credit and ThriftBucks; the owner also sets use-by and undoes.
  const canFix = canAccess(user, ['thriftplus:manage', 'cashier:manage', 'thriftplus:owner']);
  const query = useQuery({ queryKey: ['member-window', personId], queryFn: () => getMemberWindow(personId) });

  if (editing) {
    return (
      <Box sx={{ p: { xs: 1.5, md: 2.5 } }}>
        <Button
          size="small"
          startIcon={<IconBack fontSize="small" />}
          onClick={() => {
            setEditing(false);
            void qc.invalidateQueries({ queryKey: ['member-window', personId] });
          }}
          sx={{ mb: 1 }}
        >
          {tr('backToWindow')}
        </Button>
        <MemberCard personId={personId} />
      </Box>
    );
  }
  if (query.isLoading) return <CircularProgress size={28} sx={{ m: 4 }} />;
  if (query.isError || !query.data) return <Typography sx={{ p: 3 }}>{tr('couldNotLoad')}</Typography>;

  const { person, rewards, trips, people, window: w } = query.data;
  const standing = STANDING[person.standing] ?? STANDING.off;
  const history: TimelineRow[] = w.history.map((h, i) => {
    const key = `ev_${h.action}` as CopyKey;
    return {
      key: `${h.action}-${h.at}-${i}`,
      label: key in COPY_KEYS ? tr(key) : h.action,
      detail: h.person && people.length > 1 ? h.person : null,
      when: `${when(h.at, 'MMM d, yyyy')}${h.by ? ` · ${h.by}` : ''}`,
      dot: HISTORY_DOT[h.action] ?? '#999',
    };
  });

  return (
    <Stack spacing={2} sx={{ p: { xs: 1.5, md: 2.5 } }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'flex-start' }}>
        <Stack direction="row" spacing={{ xs: 1.5, md: 2.5 }} alignItems="flex-start" sx={{ flex: 1, minWidth: 0 }}>
          <Avatar src={person.photo_url ?? undefined} alt={person.name} sx={{ width: { xs: 72, md: 96 }, height: { xs: 72, md: 96 }, fontSize: '2rem' }}>
            {person.name.slice(0, 1)}
          </Avatar>
          <Stack spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
            <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
              {person.code_display ? <CopyId value={person.code_display} label={tr('memberNo')} copied={tr('copied')} /> : null}
              <Chip size="small" label={tr(standing.key)} color={standing.color} variant="outlined" sx={{ fontWeight: 700 }} />
              {person.role === 'secondary' ? <Chip size="small" label={tr('secondAdult')} variant="outlined" /> : null}
              {person.practice ? <Chip size="small" label={tr('practiceMember')} color="warning" /> : null}
            </Stack>
            <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: 18, md: 22 }, lineHeight: 1.2, overflowWrap: 'anywhere' }}>
              {person.name}
            </Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: 14 }}>{tr('joined')} {when(w.joined_at, 'MMM d, yyyy')}</Typography>
            <Stack direction="row" spacing={{ xs: 2, md: 3 }} sx={{ pt: 0.5 }} flexWrap="wrap" useFlexGap>
              <Stat
                label={`${tr('bucks')}${rewards.use_by ? ` (${tr('useBy')} ${when(`${rewards.use_by}T12:00:00`, 'MMM d')})` : ''}`}
                value={tbNumber(rewards.balance)}
              />
              <Stat label={tr('creditStat')} value={money(rewards.credit)} muted />
              <Stat label={tr('trips')} value={w.trip_count} muted />
            </Stack>
            <Typography sx={{ color: 'text.secondary', fontSize: 12 }}>
              {tr('collectedUsed').replace('{c}', tbNumber(rewards.collected)).replace('{u}', tbNumber(rewards.used))}
            </Typography>
          </Stack>
        </Stack>
        <Stack spacing={1} sx={{ flexShrink: 0 }}>
          <Button variant="contained" onClick={() => setEditing(true)}>{tr('memberEdit')}</Button>
          <Button variant="outlined" color="warning" disabled={!canFix} onClick={() => setFixing(true)}>
            {canFix ? 'Make it right' : 'Make it right: ask a manager'}
          </Button>
        </Stack>
      </Stack>

      <Dialog open={fixing} onClose={() => setFixing(false)} maxWidth="md" fullWidth>
        <DialogTitle>Make it right: {person.name}</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 1.5 }}>
            Rang at the wrong price? Open the trip below and use <b>Fix a price</b> (owner): it gives back the difference
            and its tax, and keeps the sales and tax reports right. For anything else, give or take here.
          </Typography>
          <MemberMoney accountId={person.account_id} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFixing(false)}>Done</Button>
        </DialogActions>
      </Dialog>

      <Box sx={{ display: 'grid', gap: 2, alignItems: 'start', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.15fr) minmax(0, 1fr)' } }}>
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <Section
            title={tr('trips')}
            action={trips.length ? (
              <Button size="small" onClick={() => openObject({ type: 'history', id: historyKey({ member: personId, title: person.name }) })}>
                {tr('seeAll')}
              </Button>
            ) : undefined}
          >
            {trips.length === 0 ? (
              <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{tr('noTrips')}</Typography>
            ) : (
              <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
                {trips.map((t) => (
                  <Row
                    key={t.cart_id}
                    onClick={() => openObject({ type: 'sale', id: t.cart_id })}
                    left={`${t.date ? when(`${t.date}T12:00:00`, 'EEE MMM d') : ''} · ${t.ticket} · ${t.items} ${tr('itemsWord')}`}
                    right={money(t.total)}
                  />
                ))}
              </Stack>
            )}
          </Section>
          {w.returns.length ? (
            <Section title={tr('returnsSection')}>
              <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
                {w.returns.map((r, i) => (
                  <Row
                    key={`${r.cart_id}-${i}`}
                    onClick={() => openObject({ type: 'sale', id: r.cart_id })}
                    left={`${when(r.at, 'MMM d')} · ${people.length > 1 ? `${r.person} · ` : ''}${r.item} · ${tr(r.status === 'done' ? 'handled' : 'waiting')}`}
                    right={`${money(r.credit)} ${tr('credit')}`}
                  />
                ))}
              </Stack>
            </Section>
          ) : null}
        </Stack>
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <Section title={tr('onMembership')}>
            <Stack spacing={0.75}>
              {people.map((p) => (
                <ButtonBase
                  key={p.person_id}
                  disabled={p.person_id === personId}
                  onClick={() => openObject({ type: 'member', id: p.person_id })}
                  sx={{ display: 'flex', gap: 1.25, justifyContent: 'flex-start', textAlign: 'left', px: 1, py: 0.75, borderRadius: 2, border: 1, borderColor: p.person_id === personId ? 'primary.main' : 'divider' }}
                >
                  <Avatar src={p.photo_url ?? undefined} alt={p.name} sx={{ width: 32, height: 32 }}>{p.name.slice(0, 1)}</Avatar>
                  <Typography sx={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{p.name}</Typography>
                  {p.role === 'secondary' ? <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{tr('secondAdult')}</Typography> : null}
                </ButtonBase>
              ))}
            </Stack>
          </Section>
          <Section title={tr('historySection')}>
            <Timeline rows={history} empty={tr('nothingYet')} />
          </Section>
        </Stack>
      </Box>
    </Stack>
  );
}

/** The history actions that have words (any other shows its code, which the server never sends). */
const COPY_KEYS: Record<string, true> = Object.fromEntries(
  ['joined_online', 'joined_website', 'signup', 'finished_joining', 'staff_membership', 'second_added', 'phone_added',
    'return', 'return_late_ok', 'deactivated'].map((a) => [`ev_${a}`, true]),
);

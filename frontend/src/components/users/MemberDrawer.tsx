/**
 * One member, whole (owner 2026-10-16). Top: the guest service actions. Then what we know, then the profile. Very
 * bottom: Deactivate or Reactivate, and Delete account (superuser only: the counts first, then the full name typed).
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Checkbox, Chip, Divider, Drawer, FormControlLabel, IconButton, Stack, TextField, Typography } from '@mui/material';
import PersonAddAlt1Outlined from '@mui/icons-material/PersonAddAlt1Outlined';
import QrCode2Rounded from '@mui/icons-material/QrCode2Rounded';
import ForumOutlined from '@mui/icons-material/ForumOutlined';
import MailOutline from '@mui/icons-material/MailOutline';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useSnackbar } from 'notistack';
import {
  STAGE_LABEL,
  deactivateMemberRow,
  deleteMemberRow,
  fetchMemberRowDeletePreview,
  reactivateMemberRow,
  sendMemberLink,
  shortBucks,
  updateMember,
  type MemberRow,
} from '../../api/memberDirectory.api';
import { useAuth } from '../../contexts/AuthContext';
import { useIsMobileLayout } from '../../hooks/useIsMobileLayout';
import { maskPhoneInput, stripPhone } from '../../utils/formatPhone';
import { addSecondAdult } from '../../api/thriftplus.api';
import DeleteForGoodDialog from '../thriftplus/DeleteForGoodDialog';
import { IdCheckFields, PhotoField } from '../thriftplus/PersonFields';
import QrSvg from '../thriftplus/QrSvg';
import { DrawerSection, Fact, PersonAvatar, formatDay, relativeDay } from './userChrome';
import { IconClose as Close } from '../../icons/ecoIcons';

function detail(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const d = (err.response?.data as { detail?: string } | undefined)?.detail;
    if (d) return d;
  }
  return fallback;
}

function money(raw: string): string {
  return (Number.parseFloat(raw) || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

const EMPTY_ADD = { name: '', id_checked: false, verified_18: false, photo: null as File | null, approves: false };

function splitName(name: string): { first_name: string; last_name: string } {
  const parts = name.trim().split(/\s+/);
  return { first_name: parts[0] ?? '', last_name: parts.slice(1).join(' ') };
}

export default function MemberDrawer({ row, onClose }: { row: MemberRow | null; onClose: () => void }) {
  const isMobile = useIsMobileLayout();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', notes: '' });
  const [showQr, setShowQr] = useState(false);
  const [adding, setAdding] = useState(false);
  const [add, setAdd] = useState(EMPTY_ADD);

  useEffect(() => {
    if (row) setForm({ name: row.name, email: row.email, phone: row.phone, notes: row.notes });
    setShowQr(false);
    setAdding(false);
    setAdd(EMPTY_ADD);
  }, [row]);

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['members'] });
  const run = async (fn: () => Promise<unknown>, done: string, fallback: string, close = false) => {
    setBusy(true);
    try {
      await fn();
      enqueueSnackbar(done, { variant: 'success' });
      refresh();
      if (close) onClose();
    } catch (err) {
      enqueueSnackbar(detail(err, fallback), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const off = row?.stage === 'off';
  // Owner 2026-10-16: a name, the photo ID checked and a photo; phone and email stay the main member's.
  const addReady = Boolean(add.name.trim() && add.id_checked && add.photo && add.approves);
  const addPerson = (r: MemberRow) => void run(
    () => addSecondAdult(r.account_id!, {
      ...splitName(add.name), id_checked: add.id_checked, verified_18: add.verified_18, photo: add.photo,
      both_present: true, primary_approves: add.approves,
    }).then(() => { setAdding(false); setAdd(EMPTY_ADD); }),
    `${add.name.trim()} added to the membership`, 'Could not add them',
  );
  return (
    <>
      <Drawer
        anchor={isMobile ? 'bottom' : 'right'}
        open={!!row}
        onClose={onClose}
        PaperProps={{ sx: isMobile ? { maxHeight: '92dvh', borderTopLeftRadius: 16, borderTopRightRadius: 16, width: '100%' } : { width: { xs: '100%', sm: 480 }, maxWidth: '100%' } }}
      >
        {row ? (
          <>
            <Stack direction="row" alignItems="flex-start" spacing={1.25} sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
              <PersonAvatar name={row.name || '?'} seed={row.email || row.key} muted={off} size={44} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }} noWrap>{row.name}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {row.number}{row.second ? ` · with ${row.second}` : ''}
                </Typography>
                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
                  <Chip size="small" data-testid="member-stage" color={row.stage === 'member' ? 'success' : row.stage === 'needs_finalize' ? 'warning' : 'default'} label={STAGE_LABEL[row.stage]} />
                  {row.staff ? <Chip size="small" variant="outlined" label={`Staff: ${row.staff}`} /> : null}
                  {row.legacy ? <Chip size="small" variant="outlined" label="Old account" /> : null}
                </Stack>
              </Box>
              <IconButton aria-label="Close" onClick={onClose} edge="end"><Close /></IconButton>
            </Stack>
            {/* See QR first (owner 2026-10-16): the main member's QR, for a scan at the register or on Finalize. */}
            {row.qr ? (
              <Box sx={{ px: 2, pt: 1.5 }}>
                <Button fullWidth variant={showQr ? 'contained' : 'outlined'} startIcon={<QrCode2Rounded />} data-testid="member-see-qr"
                  onClick={() => setShowQr((v) => !v)} sx={{ minHeight: 44 }}>
                  {showQr ? 'Hide QR' : 'See QR'}
                </Button>
                {showQr ? (
                  <Box data-testid="member-qr" sx={{ textAlign: 'center', pt: 1.5 }}>
                    <QrSvg text={row.qr} label={`${row.name}'s member QR`} sx={{ width: 'min(70vw, 240px)' }} />
                    <Typography sx={{ fontWeight: 800, letterSpacing: '0.04em', mt: 0.5 }}>{row.code_display}</Typography>
                  </Box>
                ) : null}
              </Box>
            ) : null}

            <Box sx={{ p: 2, pb: 4, overflow: 'auto' }}>
              {/* Guest service first (owner 2026-10-16). */}
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }} data-testid="member-actions">
                <Button size="small" variant="contained" startIcon={<MailOutline />} disabled={!row.email || off || busy}
                  onClick={() => void run(() => sendMemberLink(row.key), 'Sign-in link emailed', 'Could not send the link')}>
                  Send sign-in link
                </Button>
                <Button size="small" variant="outlined" startIcon={<ForumOutlined />} disabled={!row.email}
                  onClick={() => navigate(`/online-sales/messages?q=${encodeURIComponent(row.email)}`)}>
                  Open messages
                </Button>
                <Button size="small" variant="outlined" startIcon={<Inventory2Outlined />} disabled={!row.holds_total}
                  onClick={() => navigate('/online-sales/holds')}>
                  Holds
                </Button>
              </Stack>
              {row.stage === 'needs_finalize' ? (
                <Alert severity="info" sx={{ mb: 2 }}>
                  Needs Finalize: at any register, look them up by name or their QR, then phone, ID and photo.
                </Alert>
              ) : null}

              {row.can_add_person && row.account_id ? (
                <Box sx={{ mb: 2 }} data-testid="member-add-person">
                  {!adding ? (
                    <Button variant="outlined" startIcon={<PersonAddAlt1Outlined />} onClick={() => setAdding(true)}>
                      Add a person
                    </Button>
                  ) : (
                    <Box sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 2 }}>
                      <Typography sx={{ fontWeight: 700 }}>Add a person to this membership</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25 }}>
                        A name, their photo ID and a photo. Phone and email stay {row.name.split(' ')[0] || 'the main member'}&apos;s.
                      </Typography>
                      <Stack spacing={1}>
                        <TextField label="Their name" size="small" value={add.name} autoFocus
                          onChange={(e) => setAdd({ ...add, name: e.target.value })} />
                        <IdCheckFields value={add} onChange={(v) => setAdd({ ...add, ...v })} />
                        <PhotoField photo={add.photo} onChange={(photo) => setAdd({ ...add, photo })} />
                        <FormControlLabel
                          control={<Checkbox checked={add.approves} onChange={(e) => setAdd({ ...add, approves: e.target.checked })} />}
                          label={`Both are here, and ${row.name.split(' ')[0] || 'the main member'} approves`}
                        />
                        <Stack direction="row" spacing={1}>
                          <Button onClick={() => { setAdding(false); setAdd(EMPTY_ADD); }}>Cancel</Button>
                          <Button variant="contained" disabled={!addReady || busy} onClick={() => addPerson(row)}>Add them</Button>
                        </Stack>
                        {!addReady ? (
                          <Typography variant="caption" color="text.secondary">Needs a name, the ID checked, a photo, and the approval.</Typography>
                        ) : null}
                      </Stack>
                    </Box>
                  )}
                </Box>
              ) : null}

              <DrawerSection title="At a glance">
                <Fact label="ThriftBucks" value={`${shortBucks(row.bucks)} now · ${shortBucks(row.bucks_lifetime)} collected`} tone="good" />
                <Fact label="Thrift+ credit" value={money(row.credit)} />
                <Fact label="Returns" value={`${row.returns}`} tone={row.returns ? 'warn' : 'neutral'} />
                <Fact label="Sales" value={row.sales ? `${row.sales} · ${money(row.spent)}` : 'None yet'} />
                <Fact label="Last visit" value={row.last_visit ? relativeDay(row.last_visit) : 'Not yet'} />
                <Fact label="Holds" value={row.holds_total ? `${row.holds_active} active · ${row.holds_total} total` : 'None'} />
                <Fact label="Messages" value={row.needs_reply ? 'Waiting on us' : 'Clear'} tone={row.needs_reply ? 'warn' : 'neutral'} />
                <Fact label="Since" value={formatDay(row.since)} />
              </DrawerSection>

              <DrawerSection title="Profile">
                <Stack spacing={1.5} sx={{ mt: 1 }}>
                  <TextField label="Name" size="small" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  <TextField label="Email" size="small" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  <TextField label="Phone" size="small" value={maskPhoneInput(form.phone)} placeholder="(555) 123-4567"
                    onChange={(e) => setForm({ ...form, phone: stripPhone(e.target.value) })} />
                  <TextField label="Notes" size="small" multiline minRows={2} value={form.notes} helperText="Internal only."
                    onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                  <Button variant="outlined" disabled={busy} sx={{ alignSelf: 'flex-start' }}
                    onClick={() => void run(() => updateMember(row.key, { ...splitName(form.name), email: form.email, phone: form.phone, notes: form.notes }), 'Saved', 'Could not save')}>
                    Save profile
                  </Button>
                </Stack>
              </DrawerSection>

              <Divider sx={{ my: 2.5 }} />
              {/* Very bottom: Deactivate, and Delete for the superuser only. */}
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap data-testid="member-danger">
                <Button size="small" variant="outlined" color={off ? 'success' : 'warning'} disabled={busy}
                  onClick={() => void (off
                    ? run(() => reactivateMemberRow(row.key), 'Reactivated', 'Could not reactivate')
                    : run(() => deactivateMemberRow(row.key), 'Deactivated. Reactivate puts it back.', 'Could not deactivate'))}>
                  {off ? 'Reactivate' : 'Deactivate'}
                </Button>
                {user?.is_superuser ? (
                  <Button size="small" variant="outlined" color="error" onClick={() => setDeleting(true)}>Delete account</Button>
                ) : null}
              </Stack>
            </Box>
          </>
        ) : null}
      </Drawer>
      {deleting && row ? (
        <DeleteForGoodDialog
          queryKey={['members', 'delete-preview', row.key]}
          load={() => fetchMemberRowDeletePreview(row.key)}
          remove={(name) => deleteMemberRow(row.key, name)}
          onClose={() => setDeleting(false)}
          onDeleted={() => { setDeleting(false); refresh(); onClose(); }}
        />
      ) : null}
    </>
  );
}

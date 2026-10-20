/**
 * Thrift+ customer account screen, "My account" (balances, who is on the account, recent money). No passwords
 * (owner 2026-10-16: one account, an emailed link or code). The copy follows the
 * program's word rules (see copyRules.test.ts).
 */
import { useState } from 'react';
import { Box, ButtonBase, CircularProgress } from '@mui/material';
import type { ThriftPlusMember } from '../../../api/thriftPlusScanner.api';
import { Secondary } from './signInParts';
import { TbAmount } from '../../../components/thriftplus/ThriftBucks';
import { formatPhone } from '../../../utils/formatPhone';
import { HomeScreenCard } from './homeScreen';
import { TabScreen } from './memberTabs';
import { money } from './scannerLogic';
import { sc, u } from './scannerTheme';
import { useAccountActions, useMe } from './useThriftPlus';

function errorText(e: unknown, fallback = 'Try again.'): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

function Card({ children, sx }: { children: React.ReactNode; sx?: object }) {
  return (
    <Box sx={{ bgcolor: sc.card, borderRadius: u(30), boxShadow: sc.tileShadow, border: '1px solid #ecede8', p: u(36), ...sx }}>{children}</Box>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ fontFamily: sc.condensed, fontWeight: 700, fontSize: u(42), color: sc.titleGreen, mt: u(40), mb: u(16) }}>{children}</Box>
  );
}


function ConfirmRow({
  prompt,
  action,
  keep = 'Keep it',
  busy,
  onYes,
  onNo,
}: {
  prompt: string;
  action: string;
  keep?: string;
  busy: boolean;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <Box sx={{ mt: u(16), p: u(24), borderRadius: u(20), bgcolor: '#fdf3ef', border: '1px solid #f1cfc4' }}>
      <Box sx={{ fontSize: u(29), color: sc.ink, lineHeight: 1.35 }}>{prompt}</Box>
      <Box sx={{ display: 'flex', gap: u(16), mt: u(18) }}>
        <ButtonBase onClick={onYes} disabled={busy} sx={{ px: u(30), py: u(16), borderRadius: 99, bgcolor: sc.badText, color: '#fff', fontWeight: 700, fontSize: u(29) }}>
          {busy ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : action}
        </ButtonBase>
        <ButtonBase onClick={onNo} disabled={busy} sx={{ px: u(30), py: u(16), borderRadius: 99, color: sc.ink2, fontSize: u(29) }}>
          {keep}
        </ButtonBase>
      </Box>
    </Box>
  );
}

/**
 * Account, a tab of the bottom bar (owner 2026-10-20): your name, phone and photo (no retake: ask at the register), the
 * home-screen card, who is on the account, emails, recent activity, and Sign out. No passwords (owner 2026-10-16).
 */
export function AccountPage({ member, onSignOut }: {
  member: ThriftPlusMember;
  onSignOut: () => void;
}) {
  const me = useMe();
  const actions = useAccountActions();
  const [confirm, setConfirm] = useState<{ kind: 'person'; id: number } | null>(null);
  const [err, setErr] = useState('');
  const data = me.data;
  // ThriftBucks and Thrift+ credit only (rows of retired kinds from before 10-12 are left out).
  const activity = (data?.money ?? []).filter((m) => m.kind === 'bank' || m.kind === 'credit');

  const run = async (fn: () => Promise<unknown>) => {
    setErr('');
    try {
      await fn();
      setConfirm(null);
    } catch (e) {
      setErr(errorText(e, 'Could not do that. Ask at the register.'));
    }
  };

  return (
    <TabScreen testId="account-page" title="Account">
      <Card>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: u(30) }}>
          {data?.you?.photo_url ? (
            <Box component="img" src={data.you.photo_url} alt="Your photo" data-testid="account-photo"
              sx={{ width: u(190), height: u(190), borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: `${u(4)} solid ${sc.cardEdge}` }} />
          ) : (
            <Box aria-hidden data-testid="account-photo-none"
              sx={{ width: u(190), height: u(190), borderRadius: '50%', flexShrink: 0, bgcolor: sc.greenTint, color: sc.greenDeep, display: 'grid', placeItems: 'center',
                fontFamily: sc.condensed, fontWeight: 700, fontSize: u(90) }}>
              {member.first_name.slice(0, 1).toUpperCase()}
            </Box>
          )}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box data-testid="account-name" sx={{ fontFamily: sc.condensed, fontWeight: 700, fontSize: u(56), lineHeight: 1.1, color: sc.ink, overflowWrap: 'anywhere' }}>
              {data?.you?.name || member.first_name}
            </Box>
            {data?.you?.phone ? (
              <Box data-testid="account-phone" sx={{ mt: u(8), fontSize: u(36), color: sc.ink2 }}>{formatPhone(data.you.phone)}</Box>
            ) : null}
          </Box>
        </Box>
        {/* No retake in the app (owner 2026-10-20): the photo is the register's check of who you are. */}
        <Box data-testid="account-photo-note" sx={{ mt: u(22), fontSize: u(29), color: sc.ink2, lineHeight: 1.35 }}>Ask at the register to change your photo.</Box>
      </Card>

      <Box sx={{ mt: u(24) }}>
        <HomeScreenCard variant="account" />
      </Box>

      {me.isLoading && (
        <Box sx={{ display: 'grid', placeItems: 'center', py: u(60) }}>
          <CircularProgress sx={{ color: sc.green }} />
        </Box>
      )}
      {me.isError && (
        <Box role="alert" sx={{ color: sc.badText, fontSize: u(30), mt: u(30) }}>
          Could not load your account. Check your signal and try again.
        </Box>
      )}

      {data && (
        <>
          <SectionTitle>Who is on the account</SectionTitle>
          {data.people.map((p) => (
            <Card key={p.id} sx={{ mb: u(16) }}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: u(14) }}>
                <Box sx={{ fontSize: u(36), fontWeight: 700, color: sc.ink }}>{p.first_name}</Box>
                <Box sx={{ fontSize: u(26), color: sc.ink3 }}>
                  {p.role === 'primary' ? 'Main member' : 'Second adult'}
                  {p.is_you ? ' (you)' : ''}
                </Box>
              </Box>
              {data.can_change && ((p.role === 'secondary' && (p.is_you || data.people.some((x) => x.is_you && x.role === 'primary')))) && (
                <Box sx={{ mt: u(18) }}>
                  <ButtonBase onClick={() => setConfirm({ kind: 'person', id: p.id })} sx={{ px: u(22), py: u(10), borderRadius: 99, border: `${u(2)} solid ${sc.cardEdge}`, fontSize: u(26), color: sc.ink2 }}>
                    {p.is_you ? 'Leave this account' : `Remove ${p.first_name}`}
                  </ButtonBase>
                  {confirm?.kind === 'person' && confirm.id === p.id && (
                    <ConfirmRow
                      prompt={p.is_you ? 'Leave this account? You will be signed out.' : `Take ${p.first_name} off the account? Their member QR stops working.`}
                      action={p.is_you ? 'Leave' : 'Remove'}
                      keep="Never mind"
                      busy={actions.removePerson.isPending}
                      onYes={() => void run(() => actions.removePerson.mutateAsync(p.id))}
                      onNo={() => setConfirm(null)}
                    />
                  )}
                </Box>
              )}
            </Card>
          ))}
          {data.emails && (
            <>
              <SectionTitle>Emails</SectionTitle>
              {!data.emails.has_email ? (
                <Box sx={{ fontSize: u(29), color: sc.ink2, lineHeight: 1.35 }}>
                  Add an email to your membership at the register to get your receipts and Thrift+ updates by email.
                </Box>
              ) : (
                <Card sx={{ p: u(10) }}>
                  {data.emails.note && (
                    <Box sx={{ px: u(26), py: u(20), fontSize: u(28), color: sc.ink2, lineHeight: 1.35 }}>{data.emails.note}</Box>
                  )}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: u(16), px: u(26), py: u(20), borderTop: data.emails.note ? `1px solid ${sc.line}` : 'none' }}>
                    <Box sx={{ flex: 1, fontSize: u(31), fontWeight: 700, color: sc.ink }}>
                      Store news
                      <Box component="span" sx={{ color: data.emails.news ? sc.green : sc.ink3, ml: u(12), fontSize: u(26), fontWeight: 400 }}>
                        {data.emails.news ? 'On' : 'Off'}
                      </Box>
                    </Box>
                    {(data.emails.news || data.can_change) && (
                      <ButtonBase
                        disabled={actions.news.isPending}
                        onClick={() => void run(() => actions.news.mutateAsync(!data.emails?.news))}
                        sx={{ px: u(22), py: u(10), borderRadius: 99, border: `${u(2)} solid ${sc.cardEdge}`, fontSize: u(26), color: sc.ink2 }}
                      >
                        {data.emails.news ? 'Turn off' : 'Turn on'}
                      </ButtonBase>
                    )}
                  </Box>
                </Card>
              )}
            </>
          )}
          {err && (
            <Box role="alert" sx={{ color: sc.badText, fontSize: u(29), mt: u(14), lineHeight: 1.35 }}>
              {err}
            </Box>
          )}

          <SectionTitle>Recent activity</SectionTitle>
          {activity.length === 0 ? (
            <Box sx={{ fontSize: u(30), color: sc.ink2 }}>Nothing yet. ThriftBucks show up here after your first purchase.</Box>
          ) : (
            <Card sx={{ p: u(10) }}>
              {activity.slice(0, 12).map((m, i) => (
                <Box key={`${m.created_at}-${i}`} sx={{ display: 'flex', alignItems: 'center', gap: u(16), px: u(26), py: u(20), borderTop: i ? `1px solid ${sc.line}` : 'none' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ fontSize: u(29), color: sc.ink }}>{m.reason || (m.kind === 'bank' ? 'ThriftBucks' : 'Thrift+ credit')}</Box>
                    <Box sx={{ fontSize: u(25), color: sc.ink3 }}>{new Date(m.created_at).toLocaleDateString()}</Box>
                  </Box>
                  <Box sx={{ fontFamily: sc.condensed, fontWeight: 700, fontSize: u(38), color: Number(m.amount) < 0 ? sc.ink2 : sc.priceGreen, whiteSpace: 'nowrap' }}>
                    {Number(m.amount) < 0 ? '-' : '+'}
                    {m.kind === 'bank' ? <TbAmount value={m.amount} bare /> : money(String(Math.abs(Number(m.amount)).toFixed(2)))}
                  </Box>
                </Box>
              ))}
            </Card>
          )}
        </>
      )}

      <Box sx={{ mt: u(44) }}>
        <Secondary label="Sign out" onClick={onSignOut} outlined />
      </Box>
    </TabScreen>
  );
}

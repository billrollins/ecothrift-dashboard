/**
 * Thrift+ customer account screen, "My account" (balances, who is on the account, recent money). No passwords
 * (owner 2026-10-16: one account, an emailed link or code). The copy follows the
 * program's word rules (see copyRules.test.ts).
 */
import { useState } from 'react';
import { Box, ButtonBase, CircularProgress } from '@mui/material';
import type { ThriftPlusMember } from '../../../api/thriftPlusScanner.api';
import { Secondary } from './signInParts';
import { TbAmount, tbNumber } from '../../../components/thriftplus/ThriftBucks';
import { bucksReady, money } from './scannerLogic';
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

/** My account. A member signs in by an emailed link or code (no passwords, owner 2026-10-16). */
export function AccountPage({ member, onBack, onSignOut }: {
  member: ThriftPlusMember;
  onBack: () => void;
  onSignOut: () => void;
}) {
  const me = useMe();
  const actions = useAccountActions();
  const [confirm, setConfirm] = useState<{ kind: 'person'; id: number } | null>(null);
  const [err, setErr] = useState('');
  const data = me.data;
  const ready = bucksReady(data?.banked ?? member.banked_rewards, data ? data.available : member.bucks_available);
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
    <Box
      data-testid="account-page"
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 10,
        background: `radial-gradient(ellipse at 50% 30%, ${sc.pageLight} 0%, ${sc.page} 70%)`,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: sc.font,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: u(12),
          px: u(24),
          pt: `calc(env(safe-area-inset-top, 0px) + ${u(20)})`,
          pb: u(20),
          bgcolor: sc.card,
          boxShadow: '0 1px 0 #e7e8e3',
          flexShrink: 0,
        }}
      >
        <ButtonBase onClick={onBack} aria-label="Back to scanner" sx={{ borderRadius: 99, p: u(14) }}>
          <Box component="svg" viewBox="0 0 24 24" aria-hidden sx={{ width: u(52), height: u(52) }}>
            <path d="M15.5 4 L7.5 12 L15.5 20" fill="none" stroke={sc.ink2} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </Box>
        </ButtonBase>
        <Box sx={{ flex: 1, fontFamily: sc.condensed, fontWeight: 700, fontSize: u(50), color: sc.titleGreen }}>My account</Box>
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto', px: u(30), pb: `calc(env(safe-area-inset-bottom, 0px) + ${u(60)})` }}>
        <Card sx={{ mt: u(30) }}>
          <Box sx={{ fontSize: u(30), color: sc.ink2 }}>Hi, {member.first_name}</Box>
          <Box sx={{ display: 'flex', gap: u(30), mt: u(16) }}>
            <Box sx={{ flex: 1 }}>
              <Box sx={{ fontSize: u(27), color: sc.ink2 }}>Your ThriftBucks</Box>
              <Box data-testid="account-bucks" sx={{ fontFamily: sc.condensed, fontWeight: 700, fontSize: u(68), color: sc.priceGreen, lineHeight: 1.05 }}><TbAmount value={ready.now} bare /></Box>
              {/* Today's wait for the morning (B5). */}
              {ready.tomorrow > 0 && (
                <Box data-testid="account-bucks-tomorrow" sx={{ fontSize: u(25), color: sc.ink2, mt: u(4) }}>
                  {`+${tbNumber(ready.tomorrow)} ready tomorrow morning`}
                </Box>
              )}
            </Box>
            <Box sx={{ flex: 1 }}>
              <Box sx={{ fontSize: u(27), color: sc.ink2 }}>Thrift+ credit</Box>
              <Box sx={{ fontFamily: sc.condensed, fontWeight: 700, fontSize: u(68), color: sc.ink, lineHeight: 1.05 }}>{money(data?.credit ?? member.credit_balance)}</Box>
            </Box>
          </Box>
        </Card>

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

        <Secondary label="Sign out" onClick={onSignOut} />
      </Box>
    </Box>
  );
}

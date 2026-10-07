/**
 * Thrift+ customer account screens: choose a new password (the email link), and "My account"
 * (balances, cards, who is on the account, recent money, set up a login). The copy follows the
 * program's word rules (see copyRules.test.ts).
 */
import { useState } from 'react';
import { Box, ButtonBase, CircularProgress, InputBase } from '@mui/material';
import type { ThriftPlusMember } from '../../../api/thriftPlusScanner.api';
import { FieldBanner } from './ScannerTop';
import { Field, Primary, Secondary, Sub, Title } from './SignInScreen';
import { money } from './scannerLogic';
import { ThriftPlusLogo, sc, u } from './scannerTheme';
import { useAccountActions, useMe, useConfirmReset } from './useThriftPlus';

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

function PasswordField({ value, onChange, label, autoFocus = false }: { value: string; onChange: (v: string) => void; label: string; autoFocus?: boolean }) {
  return (
    <Field sx={{ mt: u(20) }}>
      <InputBase
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label}
        type="password"
        inputProps={{ 'aria-label': label, autoComplete: 'new-password' }}
        sx={{ flex: 1, fontSize: 18 }}
      />
    </Field>
  );
}

/** `/scan?reset=<token>`: the page the reset email opens. */
export function ResetPasswordScreen({ token, onDone }: { token: string; onDone: () => void }) {
  const confirm = useConfirmReset();
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [err, setErr] = useState('');
  const [finished, setFinished] = useState(false);

  const submit = async () => {
    setErr('');
    if (password !== again) {
      setErr("Those two passwords don't match.");
      return;
    }
    try {
      await confirm.mutateAsync({ token, password });
      setFinished(true);
    } catch (e) {
      setErr(errorText(e, 'That reset link has expired. Ask for a new one.'));
    }
  };

  return (
    <Box sx={{ minHeight: '100%', display: 'flex', flexDirection: 'column', fontFamily: sc.font }}>
      <FieldBanner tall>
        <Box sx={{ position: 'absolute', left: u(56), bottom: u(96) }}>
          <ThriftPlusLogo width={u(420)} />
        </Box>
      </FieldBanner>
      <Box sx={{ px: u(36), mt: u(-60), position: 'relative', zIndex: 1, pb: u(60) }}>
        <Card sx={{ p: u(48) }}>
          {finished ? (
            <Box>
              <Title>You're all set</Title>
              <Sub>Your new password is saved and you're signed in.</Sub>
              <Box
                component="button"
                type="button"
                onClick={onDone}
                sx={{ mt: u(10), width: '100%', minHeight: u(104), border: 0, borderRadius: 99, bgcolor: sc.green, color: '#fff', fontSize: u(36), fontWeight: 700, fontFamily: 'inherit' }}
              >
                Start scanning
              </Box>
            </Box>
          ) : (
            <Box
              component="form"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <Title>Choose a new password</Title>
              <Sub>Pick a password you don't use anywhere else.</Sub>
              <PasswordField autoFocus value={password} onChange={setPassword} label="New password" />
              <PasswordField value={again} onChange={setAgain} label="New password again" />
              {err && (
                <Box role="alert" sx={{ color: sc.badText, fontSize: u(30), mt: u(24), lineHeight: 1.35 }}>
                  {err}
                </Box>
              )}
              <Primary busy={confirm.isPending} label="Save password" />
              <Secondary label="Back to sign in" onClick={onDone} />
            </Box>
          )}
        </Card>
      </Box>
    </Box>
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

function SetUpLoginForm() {
  const actions = useAccountActions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  return (
    <Card>
      <Box sx={{ fontSize: u(34), fontWeight: 700, color: sc.ink }}>Set up your sign-in</Box>
      <Box sx={{ fontSize: u(29), color: sc.ink2, mt: u(8), lineHeight: 1.4 }}>
        You signed in with your card. Add an email and password so you can sign in without the card and make changes here.
      </Box>
      <Box
        component="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr('');
          try {
            await actions.setUpLogin.mutateAsync({ email, password });
          } catch (x) {
            setErr(errorText(x, 'Could not set up your sign-in.'));
          }
        }}
      >
        <Field sx={{ mt: u(24) }}>
          <InputBase
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            type="email"
            inputProps={{ 'aria-label': 'Email for sign-in', autoComplete: 'email' }}
            sx={{ flex: 1, fontSize: 18 }}
          />
        </Field>
        <PasswordField value={password} onChange={setPassword} label="Choose a password" />
        {err && (
          <Box role="alert" sx={{ color: sc.badText, fontSize: u(29), mt: u(18), lineHeight: 1.35 }}>
            {err}
          </Box>
        )}
        <Primary busy={actions.setUpLogin.isPending} label="Save sign-in" />
      </Box>
    </Card>
  );
}

/** My account. Changes (stopping a card, changing who is on the account) need an email and password sign-in. */
export function AccountPage({ member, onBack, onSignOut, onSignInWithPassword }: {
  member: ThriftPlusMember;
  onBack: () => void;
  onSignOut: () => void;
  onSignInWithPassword: () => void;
}) {
  const me = useMe();
  const actions = useAccountActions();
  const [confirm, setConfirm] = useState<{ kind: 'card' | 'person'; id: number } | null>(null);
  const [err, setErr] = useState('');
  const data = me.data;

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
              <Box sx={{ fontSize: u(27), color: sc.ink2 }}>Banked rewards</Box>
              <Box sx={{ fontFamily: sc.condensed, fontWeight: 700, fontSize: u(68), color: sc.priceGreen, lineHeight: 1.05 }}>{money(data?.banked ?? member.banked_rewards)}</Box>
            </Box>
            <Box sx={{ flex: 1 }}>
              <Box sx={{ fontSize: u(27), color: sc.ink2 }}>Store credit</Box>
              <Box sx={{ fontFamily: sc.condensed, fontWeight: 700, fontSize: u(68), color: sc.ink, lineHeight: 1.05 }}>{money(data?.credit ?? member.credit_balance)}</Box>
            </Box>
          </Box>
          <Box sx={{ fontSize: u(28), color: sc.ink2, mt: u(18) }}>
            This month's cover: {money(member.cover.covered)} of {money(member.cover.amount)}
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

        {member.has_login === false && (
          <Box sx={{ mt: u(30) }}>
            <SetUpLoginForm />
          </Box>
        )}

        {data && !data.can_change && member.has_login !== false && (
          <Card sx={{ mt: u(30) }}>
            <Box sx={{ fontSize: u(29), color: sc.ink2, lineHeight: 1.4 }}>
              You signed in with your card. To stop a card or change who is on the account, sign in with your email and password.
            </Box>
            <Secondary label="Sign in with email and password" onClick={onSignInWithPassword} />
          </Card>
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
                {p.cards.length === 0 && <Box sx={{ fontSize: u(28), color: sc.ink2, mt: u(10) }}>No card yet. Ask at the register.</Box>}
                {p.cards.map((c) => (
                  <Box key={c.id} sx={{ mt: u(14) }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: u(16) }}>
                      <Box sx={{ flex: 1, fontSize: u(30), color: sc.ink }}>
                        Card ending {c.last4}
                        <Box component="span" sx={{ color: c.status === 'active' ? sc.green : sc.ink3, ml: u(12), fontSize: u(26) }}>
                          {c.status === 'active' ? 'Active' : 'Stopped'}
                        </Box>
                      </Box>
                      {c.status === 'active' && data.can_change && (
                        <ButtonBase onClick={() => setConfirm({ kind: 'card', id: c.id })} sx={{ px: u(22), py: u(10), borderRadius: 99, border: `${u(2)} solid ${sc.cardEdge}`, fontSize: u(26), color: sc.ink2 }}>
                          Lost it?
                        </ButtonBase>
                      )}
                    </Box>
                    {confirm?.kind === 'card' && confirm.id === c.id && (
                      <ConfirmRow
                        prompt={`Stop the card ending ${c.last4}? It won't work at the register anymore. You can get a new one at the front.`}
                        action="Stop this card"
                        busy={actions.cardLost.isPending}
                        onYes={() => void run(() => actions.cardLost.mutateAsync(c.id))}
                        onNo={() => setConfirm(null)}
                      />
                    )}
                  </Box>
                ))}
                {data.can_change && ((p.role === 'secondary' && (p.is_you || data.people.some((x) => x.is_you && x.role === 'primary')))) && (
                  <Box sx={{ mt: u(18) }}>
                    <ButtonBase onClick={() => setConfirm({ kind: 'person', id: p.id })} sx={{ px: u(22), py: u(10), borderRadius: 99, border: `${u(2)} solid ${sc.cardEdge}`, fontSize: u(26), color: sc.ink2 }}>
                      {p.is_you ? 'Leave this account' : `Remove ${p.first_name}`}
                    </ButtonBase>
                    {confirm?.kind === 'person' && confirm.id === p.id && (
                      <ConfirmRow
                        prompt={p.is_you ? 'Leave this account? You will be signed out.' : `Take ${p.first_name} off the account? Their card stops working.`}
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
            {err && (
              <Box role="alert" sx={{ color: sc.badText, fontSize: u(29), mt: u(14), lineHeight: 1.35 }}>
                {err}
              </Box>
            )}

            <SectionTitle>Recent activity</SectionTitle>
            {data.money.length === 0 ? (
              <Box sx={{ fontSize: u(30), color: sc.ink2 }}>Nothing yet. Rewards show up here after your first purchase.</Box>
            ) : (
              <Card sx={{ p: u(10) }}>
                {data.money.slice(0, 12).map((m, i) => (
                  <Box key={`${m.created_at}-${i}`} sx={{ display: 'flex', alignItems: 'center', gap: u(16), px: u(26), py: u(20), borderTop: i ? `1px solid ${sc.line}` : 'none' }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ fontSize: u(29), color: sc.ink }}>{m.reason || (m.kind === 'bank' ? 'Banked rewards' : m.kind === 'credit' ? 'Store credit' : 'Cover')}</Box>
                      <Box sx={{ fontSize: u(25), color: sc.ink3 }}>{new Date(m.created_at).toLocaleDateString()}</Box>
                    </Box>
                    <Box sx={{ fontFamily: sc.condensed, fontWeight: 700, fontSize: u(38), color: Number(m.amount) < 0 ? sc.ink2 : sc.priceGreen, whiteSpace: 'nowrap' }}>
                      {Number(m.amount) < 0 ? '-' : '+'}
                      {money(String(Math.abs(Number(m.amount)).toFixed(2)))}
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

/**
 * Join Thrift+ (owner 2026-10-15, APP D9; rulebook J8): online a shopper gives only a name and an email. One email
 * confirms it and signs them in; they finish joining at any register (the phone number read back, the ID, the photo).
 * Opened from "Join Thrift+" on the sign-in screen, or straight from ecothrift.us/join (`/scan?view=join`).
 *
 * Owner 2026-10-16: spell it out, super simple, the same on a phone and a computer. Two boxes in the customer's order
 * (now, then at the store), each thing asked with the reason next to it, and one closing line: that is all it takes
 * (in the program's words, V2: "collect").
 */
import { Box, InputBase } from '@mui/material';
import { EmailField, Field, Primary, Secondary, TERMS_URL, Title } from './signInParts';
import { sc, u } from './scannerTheme';

/** One thing we ask, and why. */
function Ask({ what, why }: { what: string; why: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: u(16), mt: u(18) }}>
      <Box sx={{ flex: `0 0 ${u(130)}`, fontWeight: 700, fontSize: u(32), color: sc.ink }}>{what}</Box>
      <Box sx={{ fontSize: u(29), color: sc.ink2, lineHeight: 1.35 }}>{why}</Box>
    </Box>
  );
}

/** A numbered box: step 1 (now) and step 2 (at the store) look alike. */
function Step({ n, title, testId, children }: { n: number; title: string; testId: string; children: React.ReactNode }) {
  return (
    <Box
      data-testid={testId}
      sx={{ mt: u(26), p: u(30), borderRadius: u(28), border: `${u(3)} solid ${sc.cardEdge}`, bgcolor: sc.card, boxShadow: sc.tileShadow }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: u(16) }}>
        <Box
          aria-hidden
          sx={{
            width: u(54), height: u(54), borderRadius: '50%', bgcolor: sc.green, color: '#fff', fontWeight: 700,
            fontSize: u(32), display: 'grid', placeItems: 'center', flex: 'none',
          }}
        >
          {n}
        </Box>
        <Box component="h2" sx={{ m: 0, fontFamily: sc.condensed, fontWeight: 700, fontSize: u(40), color: sc.titleGreen }}>
          {title}
        </Box>
      </Box>
      {children}
    </Box>
  );
}

export function JoinForm({ name, email, onName, onEmail, busy, onSend, onSignIn }: {
  name: string;
  email: string;
  onName: (v: string) => void;
  onEmail: (v: string) => void;
  busy: boolean;
  onSend: () => void;
  onSignIn: () => void;
}) {
  return (
    <Box
      component="form"
      data-testid="join-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
    >
      <Title>Join Thrift+</Title>
      <Box sx={{ fontSize: u(31), color: sc.ink2, mt: u(10), lineHeight: 1.4 }}>Free. Two quick steps.</Box>

      <Step n={1} title="Now, from anywhere" testId="join-step-now">
        <Ask what="Name" why="So we know who you are" />
        <Field sx={{ mt: u(12) }}>
          <InputBase
            value={name}
            onChange={(e) => onName(e.target.value)}
            placeholder="First and last name"
            inputProps={{ 'aria-label': 'Your name', autoComplete: 'name', autoCapitalize: 'words' }}
            sx={{ flex: 1, fontSize: 18 }}
          />
        </Field>
        <Ask what="Email" why="To sign in. No password." />
        <EmailField value={email} onChange={onEmail} sx={{ mt: u(12) }} />
        <Primary busy={busy} label="Email me a link" />
      </Step>

      <Step n={2} title="At the store" testId="join-step-store">
        <Ask what="Phone" why="To look up your account" />
        <Ask what="ID" why="To check your name and that you're 18+" />
        <Ask what="Photo" why="A quick check at the register, so you don't need your ID every time" />
      </Step>

      <Box sx={{ mt: u(30), textAlign: 'center', fontWeight: 700, fontSize: u(33), color: sc.greenDeep, lineHeight: 1.35 }}>
        That's all it takes to collect ThriftBucks and get 3-day returns.
      </Box>
      <Box sx={{ mt: u(16), fontSize: u(24), color: sc.ink2, lineHeight: 1.45, textAlign: 'center' }}>
        We email your sign-in links, receipts and Thrift+ news; you can turn news off anytime. Terms:{' '}
        <Box component="a" href={TERMS_URL} target="_blank" rel="noopener" data-testid="join-terms" sx={{ color: 'inherit' }}>
          ecothrift.us/terms
        </Box>
      </Box>
      <Secondary label="Already a member? Sign in" onClick={onSignIn} />
    </Box>
  );
}

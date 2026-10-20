/**
 * Join Thrift+ (Join v2, owner 2026-10-19: "SMOOTH and CLEAR and SIMPLE"): Google, or a name and a phone or an email.
 * The code signs them in; then a selfie and a signature in the app (FinishJoining.tsx), and at the register only the
 * QR and a photo ID. Opened from "Join Thrift+" on the sign-in screen, or straight from ecothrift.us/join
 * (`/scan?view=join`).
 *
 * Owner 2026-10-16: spell it out, the same on a phone and a computer: the two steps in the customer's order (now, then
 * at the store), and one closing line: that is all it takes (in the program's words, V2: "collect").
 */
import { Box, InputBase } from '@mui/material';
import { GoogleButton } from './GoogleButton';
import { ContactField, Field, Primary, Secondary, TERMS_URL, TextConsent, Title } from './signInParts';
import { sc, u } from './scannerTheme';

/** One numbered line: step 1 (now) and step 2 (at the store) look alike. */
function Step({ n, lead, text, testId }: { n: number; lead: string; text: string; testId: string }) {
  return (
    <Box data-testid={testId} sx={{ display: 'flex', alignItems: 'flex-start', gap: u(18), mt: u(18) }}>
      <Box
        aria-hidden
        sx={{
          width: u(54), height: u(54), borderRadius: '50%', bgcolor: sc.green, color: '#fff', fontWeight: 700,
          fontSize: u(32), display: 'grid', placeItems: 'center', flex: 'none',
        }}
      >
        {n}
      </Box>
      <Box sx={{ fontSize: u(31), color: sc.ink, lineHeight: 1.4, pt: u(4) }}>
        <Box component="span" sx={{ fontWeight: 700 }}>{lead}</Box> {text}
      </Box>
    </Box>
  );
}

/** "Google or your phone" (owner 2026-10-20: phone or Google, no email); email only while texts are off. */
function ways(google: boolean, phone: boolean): string {
  const list = [...(google ? ['Google'] : []), phone ? 'your phone' : 'your email'];
  return list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} or ${list[list.length - 1]}`;
}

export function JoinForm({ first, last, contact, onFirst, onLast, onContact, phone, googleClientId, onGoogle, busy, onSend, onSignIn }: {
  first: string;
  last: string;
  contact: string;
  onFirst: (v: string) => void;
  onLast: (v: string) => void;
  onContact: (v: string) => void;
  /** Texts are on: the box takes a phone number too. */
  phone: boolean;
  /** Null: no Google button. */
  googleClientId: string | null;
  onGoogle: (credential: string) => void;
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
      <Box sx={{ mt: u(10), mb: u(34) }}>
        <Step n={1} lead="Now:" text={`your name, then ${ways(!!googleClientId, phone)}.`} testId="join-step-now" />
        <Step n={2} lead="At the store:" text="show your QR and your photo ID. That's it." testId="join-step-store" />
      </Box>

      {googleClientId && <GoogleButton clientId={googleClientId} joining onCredential={onGoogle} />}
      {/* Owner 2026-10-16: first and last name, both required, the same for every way in. */}
      <Field>
        <InputBase
          value={first}
          onChange={(e) => onFirst(e.target.value)}
          placeholder="First name"
          required
          inputProps={{ 'aria-label': 'First name', autoComplete: 'given-name', autoCapitalize: 'words' }}
          sx={{ flex: 1, fontSize: 18 }}
        />
      </Field>
      <Field sx={{ mt: u(16) }}>
        <InputBase
          value={last}
          onChange={(e) => onLast(e.target.value)}
          placeholder="Last name"
          required
          inputProps={{ 'aria-label': 'Last name', autoComplete: 'family-name', autoCapitalize: 'words' }}
          sx={{ flex: 1, fontSize: 18 }}
        />
      </Field>
      <ContactField value={contact} onChange={onContact} phone={phone} sx={{ mt: u(16) }} />
      <Primary busy={busy} label="Send my code" />
      {phone && <TextConsent />}

      <Box sx={{ mt: u(30), textAlign: 'center', fontWeight: 700, fontSize: u(33), color: sc.greenDeep, lineHeight: 1.35 }}>
        That's all it takes to collect ThriftBucks and get 3-day returns.
      </Box>
      <Box sx={{ mt: u(16), fontSize: u(24), color: sc.ink2, lineHeight: 1.45, textAlign: 'center' }}>
        Thrift+ terms:{' '}
        <Box component="a" href={TERMS_URL} target="_blank" rel="noopener" data-testid="join-terms" sx={{ color: 'inherit' }}>
          ecothrift.us/terms
        </Box>
      </Box>
      <Secondary label="Already a member? Sign in" onClick={onSignIn} />
    </Box>
  );
}

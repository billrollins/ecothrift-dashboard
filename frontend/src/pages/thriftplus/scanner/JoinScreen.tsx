/**
 * Join Thrift+ (owner 2026-10-15, APP D9; rulebook J8): online a shopper gives only a name and an email. One email
 * confirms it and signs them in; they finish joining at any register (the phone number read back, the ID, the photo).
 * Opened from "Join Thrift+" on the sign-in screen, or straight from ecothrift.us/join (`/scan?view=join`).
 */
import { Box, InputBase } from '@mui/material';
import { EmailField, Field, Primary, Secondary, Sub, TERMS_URL, Title } from './signInParts';
import { sc, u } from './scannerTheme';

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
      <Sub>Free to join. Nothing owed. Just your name and email.</Sub>
      <Field>
        <InputBase
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder="First and last name"
          inputProps={{ 'aria-label': 'Your name', autoComplete: 'name', autoCapitalize: 'words' }}
          sx={{ flex: 1, fontSize: 18 }}
        />
      </Field>
      <EmailField value={email} onChange={onEmail} sx={{ mt: u(20) }} />
      <Box sx={{ mt: u(22), fontSize: u(26), color: sc.ink2, lineHeight: 1.45 }}>
        18+. You'll finish joining at any register with your ID and phone number. We email your sign-in links, receipts and
        Thrift+ news; you can turn news off anytime. Terms:{' '}
        <Box component="a" href={TERMS_URL} target="_blank" rel="noopener" data-testid="join-terms" sx={{ color: 'inherit' }}>
          ecothrift.us/terms
        </Box>
      </Box>
      <Primary busy={busy} label="Email me a link" />
      <Secondary label="Already a member? Sign in" onClick={onSignIn} />
    </Box>
  );
}

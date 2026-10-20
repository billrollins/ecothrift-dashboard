/**
 * Add your mobile number (Phase 3, owner 2026-10-20: "phone required for every member"). A member with no phone on file
 * (a Google joiner, or one of the email joins from before phone-first) sees only this, like Finish joining: no skip and
 * no close. Their number gets a 6-digit text, and the number is saved only once that code is right. "Sign out" is the one
 * way out. The server's member payload says when it's needed (`needs_phone`) and clears it when the phone is saved.
 */
import { useState } from 'react';
import { Box } from '@mui/material';
import { readContact } from '../../../api/thriftPlusScanner.api';
import { CheckCode, type SentCode } from './CheckEmailScreen';
import { ContactField, ErrorLine, Primary, SmallLink, Sub, TextConsent, Title } from './signInParts';
import { sc, u } from './scannerTheme';
import { useAddPhone } from './useThriftPlus';

const WAIT_SECONDS = 30;

export function AddPhone({ firstName, onSignOut }: { firstName: string; onSignOut: () => void }) {
  const add = useAddPhone();
  const [phone, setPhone] = useState('');
  const [sent, setSent] = useState<SentCode | null>(null);
  const [err, setErr] = useState('');

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (add.send.isPending) return;
    setErr('');
    const read = readContact(phone);
    if (!read || read.kind !== 'phone') {
      setErr('Enter a US mobile number.');
      return;
    }
    try {
      await add.send.mutateAsync(phone);
      setSent({ kind: 'sign_in', contact: phone.trim(), channel: 'sms', first: '', last: '', wait: WAIT_SECONDS });
    } catch (x) {
      const p = x as { code?: string; retryAfter?: number };
      // One went there moments ago: go and enter it.
      if (p.code === 'TOO_SOON') setSent({ kind: 'sign_in', contact: phone.trim(), channel: 'sms', first: '', last: '', wait: p.retryAfter ?? WAIT_SECONDS });
      else setErr(x instanceof Error && x.message ? x.message : 'Could not send the code. Try again.');
    }
  };

  return (
    <Box
      data-testid="add-phone"
      sx={{
        position: 'absolute', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', fontFamily: sc.font,
        background: `radial-gradient(ellipse at 50% 30%, ${sc.pageLight} 0%, ${sc.page} 70%)`,
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: u(30), pt: `calc(env(safe-area-inset-top, 0px) + ${u(24)})`, flexShrink: 0 }}>
        <SmallLink label="Sign out" onClick={onSignOut} />
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: u(48), pt: u(20), pb: `calc(${u(44)} + env(safe-area-inset-bottom, 0px))` }}>
        {sent ? (
          <CheckCode
            sent={sent}
            onChange={() => setSent(null)}
            onSignedIn={() => undefined}
            own={{
              label: 'Save my number',
              check: async (code) => {
                await add.save.mutateAsync({ phone: sent.contact, code });
              },
              send: async () => {
                await add.send.mutateAsync(sent.contact);
              },
            }}
          />
        ) : (
          <Box component="form" onSubmit={(e) => void send(e)}>
            <Title>Add your mobile number</Title>
            <Sub>{firstName ? `${firstName}, we` : 'We'} need a mobile number on your Thrift+ account.</Sub>
            <ContactField value={phone} onChange={setPhone} phone />
            {err && <ErrorLine>{err}</ErrorLine>}
            <Primary busy={add.send.isPending} label="Send my code" />
            <TextConsent />
          </Box>
        )}
      </Box>
    </Box>
  );
}

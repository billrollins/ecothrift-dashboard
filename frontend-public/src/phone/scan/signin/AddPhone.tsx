/**
 * Add your mobile number (Phase 3, owner 2026-10-20: "phone required for every member"), as live (`AddPhone.tsx`). A
 * member with no phone on file (a Google joiner, or one of the email joins from before phone-first) sees only this, like
 * Finish joining: no skip and no close. Their number gets a 6-digit text, and the number is saved only once that code
 * is right. "Sign out" is the one way out. The server's member payload says when it's needed (`needs_phone`) and clears
 * it when the phone is saved: the save's answer replaces the session (scan/api.ts), and the scanner shell moves on.
 */
import { useState, type FormEvent } from 'react'
import type { AddPhoneProps } from '../contracts'
import { readContact } from '../core'
import { actions, useAction } from '../store'
import { Button } from '../ui'
import { CheckCode, type SentCode } from './CheckCode'
import { ContactField, Head, Msg, SmallLink, TextConsent } from './parts'

const WAIT_SECONDS = 30

export function AddPhone({ firstName, onSignOut }: AddPhoneProps) {
  const sendAction = useAction(actions.sendPhoneCode)
  const saveAction = useAction(actions.savePhone)
  const [phone, setPhone] = useState('')
  const [sent, setSent] = useState<SentCode | null>(null)
  const [err, setErr] = useState('')

  const send = async (e: FormEvent) => {
    e.preventDefault()
    if (sendAction.pending) return
    setErr('')
    const read = readContact(phone)
    if (!read || read.kind !== 'phone') {
      setErr('Enter a US mobile number.')
      return
    }
    try {
      await sendAction.run(phone)
      setSent({ kind: 'sign_in', contact: phone.trim(), channel: 'sms', first: '', last: '', wait: WAIT_SECONDS })
    } catch (x) {
      const p = x as { code?: string; retryAfter?: number }
      // One went there moments ago: go and enter it.
      if (p.code === 'TOO_SOON') setSent({ kind: 'sign_in', contact: phone.trim(), channel: 'sms', first: '', last: '', wait: p.retryAfter ?? WAIT_SECONDS })
      else setErr(x instanceof Error && x.message ? x.message : 'Could not send the code. Try again.')
    }
  }

  const signOut = <SmallLink label="Sign out" onClick={onSignOut} className="si-out" />

  return (
    <div className="si" data-testid="add-phone">
      {sent ? (
        <CheckCode
          sent={sent}
          aside={signOut}
          onChange={() => setSent(null)}
          onSignedIn={() => undefined}
          own={{
            label: 'Save my number',
            check: async (code) => {
              await saveAction.run({ phone: sent.contact, code })
            },
            send: async () => {
              await sendAction.run(sent.contact)
            },
          }}
        />
      ) : (
        <form className="si-screen" onSubmit={(e) => void send(e)}>
          <Head
            long
            title="Add your mobile number"
            sub={`${firstName ? `${firstName}, we` : 'We'} need a mobile number on your Thrift+ account.`}
            aside={signOut}
          />
          <div className="si-body">
            <ContactField value={phone} onChange={setPhone} phone />
            <Msg>{err}</Msg>
            <Button type="submit" kind="ink" wide className="si-go" pending={sendAction.pending}>
              <span>Send my code</span>
            </Button>
            <TextConsent />
          </div>
        </form>
      )}
    </div>
  )
}

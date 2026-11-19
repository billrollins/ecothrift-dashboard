/**
 * The sign-in screens' parts (piece S1), on the kit and signin.css (prefix `si-`): the green header band of the mockup's
 * `pages/join.html`, the one contact box, the text-message line, the message slot, the "or" line and the quiet link.
 * Every customer line here is copied from the live `frontend/src/pages/thriftplus/scanner/signInParts.tsx`.
 */
import type { ReactNode } from 'react'
import { asset } from '../../shell/Tag'
import { Field } from '../ui'

export const TERMS_URL = 'https://ecothrift.us/terms'
export const PRIVACY_URL = 'https://ecothrift.us/privacy'

/**
 * The text-message line under "Send my code" (owner 2026-10-20, Twilio toll-free verification): asking for a code is
 * asking for that one text. Shown only while a phone can get a code. Word for word as live (PLAN-SCANNER.md section 2).
 */
export function TextConsent() {
  return (
    <div className="si-ok" data-testid="text-consent">
      A phone number gets one text with your code each time you ask. Msg &amp; data rates may apply. Reply STOP to
      cancel, HELP for help.{' '}
      <a href={TERMS_URL} target="_blank" rel="noopener">
        Terms
      </a>{' '}
      ·{' '}
      <a href={PRIVACY_URL} target="_blank" rel="noopener">
        Privacy
      </a>
    </div>
  )
}

/**
 * The green band at the top of every sign-in screen (the mockup's join header): the Thrift+ wordmark with the live
 * banner's line (or a "Sign out" on a required screen), the screen's title, and its short line.
 */
export function Head({ title, sub, aside, long = false }: { title: ReactNode; sub?: ReactNode; aside?: ReactNode; long?: boolean }) {
  return (
    <header className={`si-hd${long ? ' si-hd-long' : ''}`}>
      <div className="si-top">
        <img className="si-wm" src={asset('phone/thriftplus-wordmark-white.svg')} width={65} height={24} alt="Thrift+" />
        {aside ?? <span className="si-tagline">Scan any tag. See what you&apos;d collect.</span>}
      </div>
      <h1 className="disp">{title}</h1>
      {sub ? <div className="si-sub">{sub}</div> : null}
    </header>
  )
}

/**
 * The message slot under a field: its space is always there, so an error appearing never moves the button below it
 * (the owner's 11-19 night rule). The words are said at once (role="alert") only while there are some.
 */
export function Msg({ children }: { children?: ReactNode }) {
  return <div className="si-msg">{children ? <div role="alert">{children}</div> : null}</div>
}

/** The small underlined link ("Staff sign in", "Change", "Sign out"): a 44 px tap. */
export function SmallLink({ label, onClick, className }: { label: string; onClick: () => void; className?: string }) {
  return (
    <button type="button" className={`si-small${className ? ` ${className}` : ''}`} onClick={onClick}>
      {label}
    </button>
  )
}

/** A quiet "or" between Google and the box. */
export function OrLine() {
  return (
    <div className="si-or" aria-hidden="true">
      <span />
      or
      <span />
    </div>
  )
}

/**
 * The one box. Phone first (owner 2026-10-20: Continue with Google or a phone number): a mobile number with the phone's
 * number pad. `allowEmail` (the "Joined with an email?" link on sign-in only) takes an email too, for members who joined
 * by email before; with texts off the box is email only. 16 px or more, so an iPhone does not zoom in.
 */
export function ContactField({ value, onChange, phone, allowEmail = false }: {
  value: string
  onChange: (v: string) => void
  phone: boolean
  allowEmail?: boolean
}) {
  if (phone && !allowEmail) {
    return (
      <Field
        className="si-field"
        label="Mobile number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="(402) 555-0100"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        hint={<span data-testid="contact-hint">We&apos;ll text you a 6-digit code.</span>}
      />
    )
  }
  const hint = (
    <span data-testid="contact-hint">
      {phone ? "We'll send a 6-digit code. Email is free; a text works too." : "We'll send a 6-digit code to your email."}
    </span>
  )
  if (phone) {
    return (
      <Field
        className="si-field si-field-text"
        label="Email or phone"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="you@email.com or mobile number"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        hint={hint}
      />
    )
  }
  return (
    <Field
      className="si-field si-field-text"
      label="Email"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      type="email"
      inputMode="email"
      autoComplete="email"
      autoCapitalize="none"
      spellCheck={false}
      hint={hint}
    />
  )
}

/** The eye on the staff password box. */
export function IconEye({ off }: { off: boolean }) {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
      {off ? <path d="M4 4l16 16" /> : null}
    </svg>
  )
}

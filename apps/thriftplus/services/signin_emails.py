"""
The Thrift+ sign-in emails (owner 2026-10-15, rulebook J8 and J11; the words are APP's, design.md D9 "The email", word
for word). Two kinds, each with the link and the 6-digit code:
- **join:** "Confirm your email for Thrift+": the first one, which also confirms the email (a new online join, a pending
  join asking again, or staff adding an email for a register member, J12);
- **sign-in:** "Your Thrift+ sign-in link".

Sent from the store mailbox the same way as the password reset (``apps.webstore.emails._send``, Graph when it is on),
as HTML with one member-green button plus a plain-text part. Never "card", never a text message.
"""
from __future__ import annotations

import html

from apps.thriftplus.models import MemberEmailToken
from apps.webstore.emails import PICKUP_ADDRESS as STORE_ADDRESS

GREEN = '#3f9f35'  # member green (the button)
TEXT = '#1a1f1c'
QUIET = '#5d605a'
STORE = 'Eco-Thrift'

WORDS = {
    MemberEmailToken.PURPOSE_JOIN: {
        'subject': 'Confirm your email for Thrift+',
        'line': 'Tap to confirm your email and start your Thrift+ membership.',
        'button': 'Confirm and sign in',
    },
    MemberEmailToken.PURPOSE_SIGN_IN: {
        'subject': 'Your Thrift+ sign-in link',
        'line': 'Tap to sign in to Thrift+.',
        'button': 'Sign in',
    },
}
CODE_LINE = 'Or type this code in the app:'
SMALL_PRINT = "The link and code work once, for 15 minutes. Didn't ask for this? You can ignore this email."


def spaced(code: str) -> str:
    """"123456" → "123 456"."""
    digits = ''.join(ch for ch in str(code) if ch.isdigit())
    return f'{digits[:3]} {digits[3:]}' if len(digits) == 6 else digits


def render(purpose: str, *, link: str, code: str) -> tuple[str, str, str]:
    """(subject, text, html) for a join or sign-in email."""
    words = WORDS[purpose]
    shown = spaced(code)
    text = (
        f"{words['line']}\n\n"
        f"{words['button']}: {link}\n\n"
        f'{CODE_LINE} {shown}\n\n'
        f'{SMALL_PRINT}\n\n'
        f'{STORE}\n{STORE_ADDRESS}\n'
    )
    url = html.escape(link, quote=True)
    button = (f'display:inline-block;background:{GREEN};color:#ffffff;font-weight:bold;font-size:17px;'
              'text-decoration:none;padding:13px 28px;border-radius:8px;white-space:nowrap')
    body = (
        '<!doctype html><html><body style="margin:0;padding:16px;background:#ffffff">'
        f'<div style="max-width:560px;font:16px/1.5 Arial,Helvetica,sans-serif;color:{TEXT}">'
        f'<p style="margin:0 0 20px;font-size:18px">{html.escape(words["line"])}</p>'
        f'<p style="margin:0 0 26px"><a href="{url}" style="{button}">{html.escape(words["button"])}</a></p>'
        f'<p style="margin:0 0 4px">{html.escape(CODE_LINE)}</p>'
        f'<p style="margin:0 0 24px;font-size:32px;font-weight:bold;letter-spacing:0.15em">{html.escape(shown)}</p>'
        f'<p style="margin:0 0 24px;font-size:14px;color:{QUIET}">{html.escape(SMALL_PRINT)}</p>'
        f'<p style="margin:0;font-size:12px;color:{QUIET}">{STORE}<br>{html.escape(STORE_ADDRESS)}</p>'
        '</div></body></html>'
    )
    return words['subject'], text, body


def send(to: str, purpose: str, *, link: str, code: str) -> bool:
    """Send it from the store mailbox (like the password reset). True when the send reported success; never raises."""
    from apps.webstore.emails import _send

    subject, text, body = render(purpose, link=link, code=code)
    return _send(subject, text, to, html_body=body)

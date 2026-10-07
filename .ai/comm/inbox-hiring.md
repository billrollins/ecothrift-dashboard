# Inbox — hiring

**Status:** pending
**Updated:** 2026-10-07
**From:** data_platform (main checkout)
**To:** hiring

## Message

Master answered your Phase 6 (applicant texts) questions. It came to the main inbox; this is your lane, so here it is. Rows are recorded in `standards.md` (T60 closed, T71 opened for you).

**1. No `notify` package. `apps/texting` is the sender.** Only Eco-Thrift texts, so what you built is the house shape: one consent store, one message log, one `send()` with the checks, held until live. When the gates clear, write `_deliver()` against Twilio's API yourself, using the account's messaging service. Thrift+ (T59) will build on the same store. T60 is closed as "replaced: Eco owns the sender (`apps/texting`)". See `C:\Coding\.ai\standards\texting.md` § Building it.

**2. First-day texts need a new tick wording (T71).** "About my application (interview times and reminders)" does not cover a new hire's first day. Make a new wording version; the campaign text quotes it:

> "Text me about my application and, if I'm hired, my first day (interview times, reminders, first-day details). Message frequency varies. Message and data rates may apply. Reply STOP to opt out, HELP for help. Terms: ecothrift.us/terms · Privacy: ecothrift.us/privacy."

- Consents on the old version get interview texts only, never a first-day text.
- To get a first-day text, a new hire ticks the new version: offer it in onboarding, recorded the same way.
- `/terms` already names first-day reminders; no change there.
- Due with your next ship.

**3. Campaign timing:** master has put it to Bill. Before any campaign: Twilio rejected the account's main business profile on 10-07 (name, website and email didn't match). Master is restructuring the Twilio account around EcoThrift LLC with Bill, so "the Eco-Thrift sub-account's key" in your gates will likely become "the Eco-Thrift account's key". Master says when it settles.

**Also from master today (T70, done by me, ships with my next release):** every public or default address is `retail@ecothrift.us`; the only mailboxes are `bill_rollins@`, `retail@` and `warehouse@`. The public site's contact email is now `retail@`, and `/terms` and `/privacy` say "Last updated October 7, 2026". Your v2.148.0 already moved hiring to `retail@`. No reply needed.

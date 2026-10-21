<!-- Last updated: 2026-10-20 (handoff from the "Page improvement ideas" session, which the owner is deleting) -->
# Handoff 2026-10-20: Thrift+ revision (Twilio, phone or Google, Staff app Find)

The owner is deleting the session that did this work. Everything shipped is on `origin/main` and live. This note is the
background plus what is left. The rules themselves are in `.ai/extended/thrift-plus-decisions.md` (J18, J19); the
surfaces in `.ai/extended/thrift-plus-surfaces.md`.

## Releases from that session (all live)

| Version | Heroku | What |
|---|---|---|
| v2.183.0 | v487 | Transactions page: totals strip, date chips, Thrift+ columns (member, Earned, Used, Instant), one search for receipt or member name, table fills the screen |
| v2.184.0 | v488 | Sidebar Setup section (Cashier, People); "Text the offer" on an open offer (same dialog as the interview text) |
| v2.185.0 / .1 | v490 / v491 | Phone or Google sign-in and join (J18); /privacy and store terms carry the carriers' text wording; ecothrift.us/sms-opt-in.png |
| v2.186.0 | v493 | Phase 1: Staff app **Find · Scan · Join QR**; quick fixes (Sign-in QR, Retake photo, Edit name or phone); version bottom-right on member app, Staff app and the site footer; refresh token renews while used; surfaces list + ship rule (J19) |
| v2.186.2 | v495 | Opt-in screenshot retaken (shows "At the store? Scan the store's sign-in QR") |

## Why (owner, 10-19 and 10-20)

An older couple at the register couldn't sign in. They had joined by email last week, couldn't reach their email on their phones, and had never given a phone number. Staff couldn't find them by phone or in recent joins; only a name search found them, and the register could only send another email. The owner's direction:

- **No email**: Continue with Google or a phone number.
- **Text first**, but Twilio Verify is too costly (~5.8¢ a sign-in), so use our own number (~1.2¢ a text).
- **Everything self-serve except the ID check**: name, face and 18+ at the register.
- **The Staff app finds anyone and fixes things fast.**
- **A version on every app.**
- **One list of every surface**, all updated together.

## Twilio (main "Eco-Thrift" account, the one with the approved EcoThrift LLC profile)

- **Bought 10-20:** toll-free **(888) 812-7905**, $2.15/month.
- **Toll-free verification submitted by the owner 10-20; PENDING.**
  - Use case: Two Factor Authentication, 1,000/month, opt-in type Web form.
  - Proof: https://ecothrift.us/scan and https://ecothrift.us/sms-opt-in.png.
  - Terms: ecothrift.us/terms#store-terms. Privacy: ecothrift.us/privacy.
  - Samples: a 6-digit code text, and a one-use sign-in link (15 minutes).
  - HELP reply: "Eco-Thrift: These texts are Thrift+ sign-in codes and links you asked for. Help: call (402) 881-9861 or visit ecothrift.us/terms. Msg & data rates may apply. Reply STOP to opt out."
  - Status emails go to the owner's ecothrift.us address.
- **Until approval:**
  - Codes still go through Verify (service "Eco-Thrift", Fraud Guard on).
  - **Don't change the submitted wording**: the line under Send my code (`TextConsent` in `frontend/src/pages/thriftplus/scanner/signInParts.tsx`), `frontend-public/src/data/legal.ts`, and the store terms' Text messages list. Reviewers compare the live site with the submission.
- No A2P brand or campaign exists. The other "Eco-Thrift" in the account list is an empty subaccount.
- **Master was told** (outbox, 10-20) that `standards/texting.md` needs the second exception. Still pending on master's side.

## The revision plan the owner approved (decisions D1–D11)

**Phase 1 is done (v2.186.0).** Left:

- **Phase 2, member app:**
  - A bottom bar like the Staff app: **Scan · Bucks · My QR · Account**.
  - Account shows name, phone and photo, but **no photo retake** ("Ask at the register to change your photo"), and Sign out.
  - A **"Put Thrift+ on your home screen"** card on mobile web only (never inside the installed app). Plain words: "It stays signed in and opens faster." Then 3 picture steps on iPhone (Share → Add to Home Screen → Add), or the Install button on Android.
  - The card shows after sign-in and always in Account. Dismissing it hides it for 2 weeks. Older customers get confused, so keep it short.
  - Also fix the **bookmark bug**: the install manifest is only injected on /scan (`installApp.ts`), so "Add to Home Screen" from other ecothrift.us pages makes a Safari bookmark, not the app.
- **Phase 3, phone-first everywhere:**
  - **Phone required for every member**: Google joiners add a phone once, with a code.
  - The 43 email-only pending joins: the app asks for a phone the next time they're signed in, and staff can add one in Find (done).
  - Self-serve join: name, then phone code (or Google + phone), then selfie, then signature. The register only checks the ID.
  - **Website sign-in** (`frontend-public/src/pages/SignInPage.tsx`, surfaces row C10) is still email-link only. It should match the app.
  - Remove the email sign-in path once those members have moved.
- **Phase 4, after Twilio approves:**
  - Wire `apps/texting` `_deliver` to the toll-free number, with a messaging service and STOP/HELP replies matching the submission.
  - Move sign-in codes off Verify.
  - Add **"Text sign-in link"** to the Staff app's person sheet.
  - Turn Verify off.

## Loose ends

- The Thrift+ terms the members sign (§10.3) say "The only text messages we send are sign-in codes you ask for". Staff sign-in links by text (Phase 4) would need a terms update: a new version and a re-sign rule. The store terms already cover links.
- The old `session/card/` sign-in (member code + last 4 of the phone) is still routed. Two tests use it, and no screen does.
- The Dash Users → Members panel stays for managers. The Staff app no longer has a Members tab (it folded into Find).
- Production on 10-20: 49 active members, all with phone, photo and signature; **43 pending, all email-only** (no phone, photo or signature).
- Local dev DB was pulled from production on 10-19 (`scripts/db/pull_prod_to_local.bat`). There is a local-only test login for previews in `workspace/preview-login.txt` (dev DB only).
- The worktree `_worktrees/ecothrift-dashboard--txn-page` holds only merged `ship/*` branches and can be removed. The main checkout is behind `origin/main` and holds other sessions' uncommitted `.ai` edits.
- **Ship lesson:** a yes to "start Phase N" is not "ship" or "deploy". Ask at the end. v2.186.0 was pushed without the word and then deployed on the owner's "deploy".

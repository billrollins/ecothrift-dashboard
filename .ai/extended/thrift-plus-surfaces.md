<!-- Last updated: 2026-10-20 (first list: phone or Google, Staff app Find, sign-in QR) -->
# Thrift+ surfaces: every place someone joins, signs in or is finalized

**The rule (owner 2026-10-20):** a change to joining, signing in or finalizing ships only when **every row below** is
updated and checked, on a phone and a computer. Change a row's words here in the same release. Add a row for a new place;
take one out only when that place is gone. The ship protocol's project steps point here.

The rules themselves live in the one rulebook (`thrift-plus-decisions.md`: J8, J10–J19, X1). This file only says **where**.

## Customers

| # | Surface | Where (route · file) | Ways in | Backend |
|---|---|---|---|---|
| C1 | Member app, sign in | ecothrift.us/scan, signed out · `frontend/src/pages/thriftplus/scanner/SignInScreen.tsx` | Continue with Google · Mobile number → 6-digit text · "At the store? Scan the store's sign-in QR" · "Joined with an email? Use your email" (members from before 10-20 only) · Staff sign in (password) · Scan without signing in | `public/sign-in-options/`, `google/`, `code/send/`, `code/check/`, `session/link/`, `session/password/` |
| C2 | Member app, join | ecothrift.us/join → /scan?view=join · `scanner/JoinScreen.tsx` | First + last name, then Google or Mobile number | `google/`, `code/send/` (with names) |
| C3 | The text line under every "Send my code" | C1 and C2 · `scanner/signInParts.tsx` `TextConsent` | Exact words given to Twilio's toll-free review (J18): don't change them until approval | — |
| C4 | The code screen | after Send my code · `scanner/CheckEmailScreen.tsx` | 6-digit code; resend wait; "Ask at any register" | `code/check/` |
| C5 | Store sign-in QR, scanned in the app | C1 → "At the store?" · `scanner/StoreQrScan.tsx` | The cashier's QR (one use, 5 minutes) | `session/link/` (purpose `staff_qr`) |
| C6 | A sign-in link opened in a browser | ecothrift.us/scan?signin=… · `scanner/ThriftPlusScannerPage.tsx` | The staff QR via a phone camera, or an old email link | `session/link/` |
| C7 | Finish joining in the app | /scan?view=finish · `scanner/FinishJoining.tsx` | Selfie, then signature | `me/selfie/`, `me/signature/` |
| C8 | Member QR (wallet) | /qr → /scan?view=qr · `scanner/tripSheets.tsx` | Shows the member code; "Finish joining" while pending | `me/card/` |
| C9 | My account in the app | /scan?view=account · `scanner/AccountScreens.tsx` | Sign out (also ends the website session) | `me/`, `session/sign-out/` |
| C10 | Website sign-in | ecothrift.us/account/sign-in · `frontend-public/src/pages/SignInPage.tsx` | **Still email link only** (to bring in line: phone or Google, Phase 3) | `/api/auth/customer/lookup/`, `magic-link/request/` |
| C11 | Website verify link | ecothrift.us/verify?token= · `frontend-public/src/pages/VerifyPage.tsx` | Emailed link | `/api/auth/magic-link/consume/` |
| C12 | Website links into Thrift+ | home band, /thriftplus, /visit, header "Price check" · `frontend-public/src/components/Layout.tsx`, `ThriftPlusPromo.tsx`, `pages/ThriftPlusPage.tsx` | Links to /join and /scan | — |
| C13 | Privacy and terms | ecothrift.us/privacy, /terms#store-terms · `frontend-public/src/data/legal.ts`, `PrivacyPage.tsx`, `TermsPage.tsx` | Text-message wording (J18) | — |
| C14 | Text opt-in screenshot | ecothrift.us/sms-opt-in.png · `frontend-public/public/sms-opt-in.png` | Retake it if C1 changes | `ecothrift/urls.py` |

## Staff

| # | Surface | Where (route · file) | What it does | Backend |
|---|---|---|---|---|
| S1 | Thrift+ Staff app shell | dash.ecothrift.us/staff · `frontend/src/pages/thriftplus/staff/StaffApp.tsx` | Bar: Find · Scan · Join QR; version bottom-right | Dash login |
| S2 | Find | /staff/find · `pages/thriftplus/finalize/FinalizeThriftPlusPage.tsx` | One box: name, phone (any 3+ digits), email or member #; or scan their QR; newest online joins underneath | `register/pending/ {q, recent}` → `register.find_people`, `recent_joins` |
| S3 | A person's sheet | S2 → tap · `finalize/finalizePeople.tsx` | Check their ID now (pending) · Sign-in QR · Retake photo · Edit name or phone · Resend join email (email joins only) · Delete (owner) | `people/<id>/sign-in-qr/`, `photo-fix/`, `details/`, `email-link/`, `accounts/<id>/delete/` |
| S4 | The ID check | S2 → Check their ID · `FinalizeThriftPlusPage.tsx`, `components/thriftplus/SelfieCheck.tsx` | Name matches, Face matches, 18+; signature if not signed in the app; Add a person | `register/finish/` |
| S5 | Join QR | S1 bar · `finalize/finalizeParts.tsx` | ecothrift.us/join full screen | — |
| S6 | POS Terminal, Thrift+ panel | /pos/terminal · `pages/pos/TerminalPage.tsx`, `components/pos/ThriftPlusPanel.tsx`, `ThriftPlusPhoneFind.tsx`, `ThriftPlusPendingFind.tsx` | Scan the member QR, find by phone, "Joined online?" | `register/attach/`, `register/find/`, `register/pending/` |
| S7 | POS, Finish joining dialog | `components/pos/ThriftPlusFinishJoinDialog.tsx` | The member's QR big for the Staff phone; or finish at the register | `register/finish/` |
| S8 | POS, Thrift+ finish joining button | `components/pos/ThriftPlusSignupDialog.tsx` | Join QR; pending finder; practice sign-up on the training register | `accounts/ {practice}` |
| S9 | Dash Users → Members | /admin/users?tab=members · `pages/admin/users/MembersPanel.tsx`, `components/users/MemberDrawer.tsx` | Manager+: the whole list, See QR, Send sign-in link | `member-directory/` |
| S10 | Dash Thrift+ → Members | /thrift-plus?tab=members · `pages/thriftplus/MembersTab.tsx` | Superuser | `accounts/?q=` |

## Versions

| Surface | Where |
|---|---|
| Member app | bottom-right corner, every screen (`components/common/VersionTag.tsx`) |
| Thrift+ Staff app | bottom-right, above the bar |
| Dash | the sidebar footer |
| ecothrift.us | the footer bar, after the tagline (`frontend-public/src/appVersion.ts`) |

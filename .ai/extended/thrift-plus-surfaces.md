<!-- Last updated: 2026-10-21 (S6 Member is here, S7 returns count; earlier 2026-10-20: register: one Thrift+ member button, the member view, the Members page; member app bottom bar, Account, home-screen card; phone required; website sign-in phone or Google; Text sign-in link) -->
# Thrift+ surfaces: every place someone joins, signs in or is finalized

**The rule (owner 2026-10-20):** a change to joining, signing in or finalizing ships only when **every row below** is
updated and checked, on a phone and a computer. Change a row's words here in the same release. Add a row for a new place;
take one out only when that place is gone. The ship protocol's project steps point here.

The rules themselves live in the one rulebook (`thrift-plus-decisions.md`: J8, J10–J20, X1). This file only says **where**.

## Customers

| # | Surface | Where (route · file) | Ways in | Backend |
|---|---|---|---|---|
| C1 | Member app, sign in | ecothrift.us/scan, signed out · `frontend/src/pages/thriftplus/scanner/SignInScreen.tsx` | Continue with Google · Mobile number → 6-digit text · "At the store? Scan the store's sign-in QR" · "Joined with an email? Use your email" (members from before 10-20 only) · Staff sign in (password) · Scan without signing in | `public/sign-in-options/`, `google/`, `code/send/`, `code/check/`, `session/link/`, `session/password/` |
| C2 | Member app, join | ecothrift.us/join → /scan?view=join · `scanner/JoinScreen.tsx` | First + last name, then Google or Mobile number | `google/`, `code/send/` (with names) |
| C3 | The text line under every "Send my code" | C1 and C2 · `scanner/signInParts.tsx` `TextConsent` | Exact words given to Twilio's toll-free review (J18): don't change them until approval | — |
| C4 | The code screen | after Send my code · `scanner/CheckEmailScreen.tsx` | 6-digit code; resend wait; "Ask at any register" | `code/check/` |
| C5 | Store sign-in QR, scanned in the app | C1 → "At the store?" · `scanner/StoreQrScan.tsx` | The cashier's QR (one use, 5 minutes) | `session/link/` (purpose `staff_qr`) |
| C6 | A sign-in link opened in a browser | ecothrift.us/scan?signin=… · `scanner/ThriftPlusScannerPage.tsx` | The staff QR via a phone camera, **a link texted by staff (15 minutes, Phase 4)**, or an old email link | `session/link/` |
| C6a | Add your mobile number (required) | over everything in the app until a phone is saved · `scanner/AddPhone.tsx`, `TripScanner.tsx` | Mobile number → 6-digit text; Sign out. No skip. A Google joiner or an email-only member with no phone; then Finish joining | `me/phone/send/`, `me/phone/` (member payload `needs_phone`) |
| C7 | Finish joining in the app | /scan?view=finish · `scanner/FinishJoining.tsx` | Selfie, then signature | `me/selfie/`, `me/signature/` |
| C8 | My QR tab (wallet) | /qr → /scan?view=qr · `scanner/tripSheets.tsx` `WalletScreen` | Shows the member code; "Finish joining" while pending | `me/card/` |
| C9 | Account tab in the app | /scan?view=account · `scanner/AccountScreens.tsx` | Name, phone, photo (no retake: "Ask at the register to change your photo.") · the home-screen card · who is on the account · emails · Sign out (also ends the website session) | `me/` (`you`), `session/sign-out/` |
| C10 | Website sign-in | ecothrift.us/account/sign-in · `frontend-public/src/pages/SignInPage.tsx`, `lib/memberSignIn.ts`, `components/GoogleSignInButton.tsx` | Continue with Google · Mobile number → 6-digit text (same text line as C3) · small "Joined with an email? Use your email" (the old email link, and staff passwords) · "Join Thrift+" | `public/sign-in-options/`, `google/`, `code/send/`, `code/check/` (also signs in the site); `/api/auth/customer/lookup/`, `magic-link/request/` for email |
| C11 | Website verify link | ecothrift.us/verify?token= · `frontend-public/src/pages/VerifyPage.tsx` | Emailed link | `/api/auth/magic-link/consume/` |
| C12 | Website links into Thrift+ | home band, /thriftplus, /visit, header "Price check" · `frontend-public/src/components/Layout.tsx`, `ThriftPlusPromo.tsx`, `pages/ThriftPlusPage.tsx` | Links to /join and /scan | — |
| C13 | Privacy and terms | ecothrift.us/privacy, /terms#store-terms · `frontend-public/src/data/legal.ts`, `PrivacyPage.tsx`, `TermsPage.tsx` | Text-message wording (J18) | — |
| C14 | Text opt-in screenshot | ecothrift.us/sms-opt-in.png · `frontend-public/public/sms-opt-in.png` | Retake it if C1 changes | `ecothrift/urls.py` |
| C15 | Member app bottom bar | /scan, signed-in members · `scanner/memberTabs.tsx`, `TripScanner.tsx` | Scan · Bucks · My QR · Account; tabs replace the address (`?view=bucks|qr|account`); hidden during Finish joining (C7) and for non-members; the Bucks tab is `tripSheets.tsx` `BalanceScreen` | `me/`, `me/card/` |
| C16 | "Put Thrift+ on your home screen" | Scan banner (× = 2 weeks) and always in Account (C9) · `scanner/homeScreen.tsx`, `installApp.ts` | Mobile web only, never in the installed app; Android Install button, iPhone 3 picture steps | — |
| C17 | Install tags on the public site | every ecothrift.us page · `frontend-public/index.html`, `frontend/public/scan/manifest.webmanifest` | The member manifest (start_url /scan) and iPhone tags on every page, so Add to Home Screen installs the app, not a bookmark | — |

## Staff

| # | Surface | Where (route · file) | What it does | Backend |
|---|---|---|---|---|
| S1 | Thrift+ Staff app shell | dash.ecothrift.us/staff · `frontend/src/pages/thriftplus/staff/StaffApp.tsx` | Bar: Find · Scan · Join QR; version bottom-right | Dash login |
| S2 | Find | /staff/find · `pages/thriftplus/finalize/FinalizeThriftPlusPage.tsx` | One box: name, phone (any 3+ digits), email or member #; or scan their QR; newest online joins underneath | `register/pending/ {q, recent}` → `register.find_people`, `recent_joins` |
| S3 | A person's sheet | S2 → tap · `finalize/finalizePeople.tsx` | Check their ID now (pending) · Sign-in QR · **Text sign-in link (only with the own-number switch ON, a phone on file and no STOP; Phase 4)** · Retake photo · Edit name or phone · Resend join email (email joins only) · Delete (owner) | `people/<id>/sign-in-qr/`, `people/<id>/text-link/`, `photo-fix/`, `details/`, `email-link/`, `accounts/<id>/delete/` |
| S4 | The ID check | S2 → Check their ID · `FinalizeThriftPlusPage.tsx`, `components/thriftplus/SelfieCheck.tsx` | Name matches, Face matches, 18+; signature if not signed in the app; Add a person | `register/finish/` |
| S5 | Join QR | S1 bar · `finalize/finalizeParts.tsx` | ecothrift.us/join full screen | — |
| S6 | POS Terminal, the Thrift+ member button | /pos/terminal, in the cart's top bar · `pages/pos/TerminalPage.tsx`, `components/pos/ThriftMemberDialog.tsx`, `ThriftPlusPanel.tsx` | **One button** (10-20): Find (their QR scanned, name, phone, email or member #) → pick → on the sale. A member's QR scanned into the item box still attaches. Someone still to finish opens their card to Finalize. A QR attaches as here; a search pick waits for **Member is here** in the panel before ThriftBucks are used (10-21) | `register/pending/ {q, recent}`, `register/attach/`, `register/here/` |
| S7 | The member card | the S6 button when a member is on the sale, tapping them in the panel, and S11 · `components/thriftplus/MemberCard.tsx` | Status, ThriftBucks, credit, returns lately with the W14 warning (10-21), trips, people; **Finalize** (only the ID check: Name matches, Photo matches, 18 or older, then Match; a signature only if they never signed); **Add a 2nd person** | `register/member/`, `register/finish/` (with `cart`), `accounts/<id>/second-adult/` |
| S8 | POS, practice sign-up (training register only) | S6 → Practice sign-up · `components/pos/ThriftPlusSignupDialog.tsx` | Join QR; pending finder; practice sign-up. The "Thrift+ finish joining" and "Thrift+ 3-day return" buttons are gone (10-20) | `accounts/ {practice}` |
| S9 | Dash Users → Members | /admin/users?tab=members · `pages/admin/users/MembersPanel.tsx`, `components/users/MemberDrawer.tsx` | Manager+: the whole list, See QR, Send sign-in link | `member-directory/` |
| S10 | Dash Thrift+ → Members | /thrift-plus?tab=members · `pages/thriftplus/MembersTab.tsx` | Superuser | `accounts/?q=` |
| S11 | Thrift+ members (lookup) | /pos/members, Cashier menu · `pages/pos/MembersLookupPage.tsx` | Find, then the member card (S7). `?person=<person_id>` opens that card (the Returns page links here) | `register/pending/`, `register/member/` |

## Versions

| Surface | Where |
|---|---|
| Member app | bottom-right corner, every screen (`components/common/VersionTag.tsx`) |
| Thrift+ Staff app | bottom-right, above the bar |
| Dash | the sidebar footer |
| ecothrift.us | the footer bar, after the tagline (`frontend-public/src/appVersion.ts`) |

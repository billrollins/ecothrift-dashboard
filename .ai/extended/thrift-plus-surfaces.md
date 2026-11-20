<!-- Last updated: 2026-11-20 (Dash Update #197: table "The ThriftBucks example", every place that explains ThriftBucks; earlier 2026-11-19, Dash Update #185: the phone site's scanner, a second home for C1 to C17 on phones, behind two switches; table "The phone site" below; not yet checked on a real phone) -->
# Thrift+ surfaces: every place someone joins, signs in or is finalized

**Owner 2026-11-03 (J8, J22, Dash Update #58):** a join on the customer's own phone is finished in the app (a first and last
name, a verified phone, the selfie, I agree), with no staff step and no in-store ID check. Finalize, "Check their ID now" and
the ID check are for **Assisted join** only. There is no card anywhere (J10). Checked row by row on 11-03; "checked 11-03"
below means the row's words and behavior match that.

**The rule (owner 2026-10-20):** a change to joining, signing in or finalizing ships only when **every row below** is
updated and checked, on a phone and a computer. Change a row's words here in the same release. Add a row for a new place;
take one out only when that place is gone. The ship protocol's project steps point here.

The rules themselves live in the one rulebook (`thrift-plus-decisions.md`: J8, J10–J20, X1). This file only says **where**.

## Customers

| # | Surface | Where (route · file) | Ways in | Backend |
|---|---|---|---|---|
| C1 | Member app, sign in (checked 11-03, no change) | ecothrift.us/scan, signed out · `frontend/src/pages/thriftplus/scanner/SignInScreen.tsx` | Continue with Google · Mobile number → 6-digit text · "At the store? Scan the store's sign-in QR" · "Joined with an email? Use your email" (members from before 10-20 only) · Staff sign in (password) · Scan without signing in | `public/sign-in-options/`, `google/`, `code/send/`, `code/check/`, `session/link/`, `session/password/` |
| C2 | Member app, join (checked 11-03, no change: the join itself; finishing is C7) | ecothrift.us/join → /scan?view=join · `scanner/JoinScreen.tsx` | First + last name, then Google or Mobile number | `google/`, `code/send/` (with names) |
| C3 | The text line under every "Send my code" (checked 11-03, unchanged on purpose) | C1 and C2 · `scanner/signInParts.tsx` `TextConsent` | Exact words given to Twilio's toll-free review (J18): don't change them until approval | — |
| C4 | The code screen (checked 11-03, no change) | after Send my code · `scanner/CheckEmailScreen.tsx` | 6-digit code; resend wait; "Ask at any register" | `code/check/` |
| C5 | Store sign-in QR, scanned in the app (checked 11-03, no change) | C1 → "At the store?" · `scanner/StoreQrScan.tsx` | The cashier's QR (one use, 5 minutes) | `session/link/` (purpose `staff_qr`) |
| C6 | A sign-in link opened in a browser (checked 11-03, no change) | ecothrift.us/scan?signin=… · `scanner/ThriftPlusScannerPage.tsx` | The staff QR via a phone camera, **a link texted by staff (15 minutes, Phase 4)**, or an old email link | `session/link/` |
| C6a | Add your mobile number (required) | over everything in the app until a phone is saved · `scanner/AddPhone.tsx`, `TripScanner.tsx` | Mobile number → 6-digit text; Sign out. No skip. A Google joiner or an email-only member with no phone; then Finish joining (11-03: the saved phone counts toward finishing, J8) | `me/phone/send/`, `me/phone/` (member payload `needs_phone`) |
| C7 | Finish joining in the app | /scan?view=finish · `scanner/FinishJoining.tsx` | Selfie, then a tap on I agree (owner 11-03; was a signature). **11-03 (J8): the last step makes them a member** (with a name and a verified phone): "Two quick steps: 1. Selfie 2. Agree to the terms. Then you're a Thrift+ member." and "You're a Thrift+ member. Show your member QR at the register." (no photo ID line) | `me/selfie/`, `me/signature/` (`agree: true`); every member payload runs `members.finish_on_phone` |
| C8 | My QR tab (wallet) | /qr → /scan?view=qr · `scanner/tripSheets.tsx` `WalletScreen` | Shows the member code; while pending "Finish joining here in the app." (11-03: the "Finish joining at any register. Show them this code." and "with your photo ID" lines are gone), or "Not finished yet. Ask at the register." | `me/card/` |
| C9 | Account tab in the app (checked 11-03, no change) | /scan?view=account · `scanner/AccountScreens.tsx` | Name, phone, photo (no retake: "Ask at the register to change your photo.") · the home-screen card · who is on the account · emails · Sign out (also ends the website session) | `me/` (`you`), `session/sign-out/` |
| C10 | Website sign-in (checked 11-03, no change) | ecothrift.us/account/sign-in · `frontend-public/src/pages/SignInPage.tsx`, `lib/memberSignIn.ts`, `components/GoogleSignInButton.tsx` | Continue with Google · Mobile number → 6-digit text (same text line as C3) · small "Joined with an email? Use your email" (the old email link, and staff passwords) · "Join Thrift+" | `public/sign-in-options/`, `google/`, `code/send/`, `code/check/` (also signs in the site); `/api/auth/customer/lookup/`, `magic-link/request/` for email |
| C11 | Website verify link (checked 11-03, no change) | ecothrift.us/verify?token= · `frontend-public/src/pages/VerifyPage.tsx` | Emailed link | `/api/auth/magic-link/consume/` |
| C12 | Website links into Thrift+ | home band, /thriftplus, /visit, header "Price check" · `frontend-public/src/components/Layout.tsx`, `ThriftPlusPromo.tsx`, `pages/ThriftPlusPage.tsx`, `data/thriftPlusAbout.ts` | Links to /join and /scan. 11-03: "start on your phone, finish at any register" is now "join on your phone in a minute" | — |
| C13 | Privacy and terms | ecothrift.us/privacy, /terms#store-terms · `frontend-public/src/data/legal.ts`, `thriftPlusTerms.en.ts`, `thriftPlusTerms.es.ts`, `PrivacyPage.tsx`, `TermsPage.tsx` | Text-message wording (J18). 11-03 (English and Spanish): A.3, §1.3, §10.1, §10.2 and the ID FAQ say the membership is finished in the app (name, a checked mobile number, a selfie, I agree); the photo ID is looked at only when staff help you join or for an 18+ item. Same terms version (November 3, 2026) | — |
| C14 | Text opt-in screenshot (checked 11-03: C1 unchanged, no retake) | ecothrift.us/sms-opt-in.png · `frontend-public/public/sms-opt-in.png` | Retake it if C1 changes | `ecothrift/urls.py` |
| C15 | Member app bottom bar (checked 11-03, no change) | /scan, signed-in members · `scanner/memberTabs.tsx`, `TripScanner.tsx` | Scan · Bucks · My QR · Account; tabs replace the address (`?view=bucks|qr|account`); hidden during Finish joining (C7) and for non-members; the Bucks tab is `tripSheets.tsx` `BalanceScreen` | `me/`, `me/card/` |
| C17 | A price tag's QR (Thrift+ Perks tag) (checked 11-03, no change) | ECOTHRIFT.US/I/<SKU> → /scan?tag=<SKU> · `apps/core/views.py` `i_link`, `scanner/ThriftPlusScannerPage.tsx`, `TripScanner.tsx` | Phone camera. Members: the tag's card in the scanner. Signed out: the card as a guest with **Get Thrift+** (→ Join, C2). 7-character codes are still interview links. Android's installed app opens it (manifest `handle_links`); iPhone opens Safari | `public/tag/<sku>/` |
| C16 | "Put Thrift+ on your home screen" (checked 11-03, no change) | Scan banner (× = 2 weeks) and always in Account (C9) · `scanner/homeScreen.tsx`, `installApp.ts` | Mobile web only, never in the installed app; Android Install button, iPhone 3 picture steps | — |
| C17 | Install tags on the public site (checked 11-03, no change) | every ecothrift.us page · `frontend-public/index.html`, `frontend/public/scan/manifest.webmanifest` | The member manifest (start_url /scan) and iPhone tags on every page, so Add to Home Screen installs the app, not a bookmark | — |

## The phone site (Dash Update #185, since v2.317.0)

On a **phone**, with AppSettings `storefront.phone_site` and `storefront.phone_scan` both `on` (or the owner's signed preview
cookie), ecothrift.us serves the rebuilt phone site and **its own scanner**; desktops, and phones with a switch off, keep
every row above unchanged. The phone scanner uses the same addresses, calls, stored keys and **the same words** (C3 to the
letter); its logic files are imported unchanged from `frontend/src` (`frontend-public/src/phone/scan/core/index.ts`), so a
change there changes both. Map (`frontend-public/src/phone/...`):

| Row | Phone file | Difference on the phone (look only, unless said) | Checked on a phone |
|---|---|---|---|
| C1 | `scan/signin/index.tsx` | Same ways in and words; labels shown above the fields; messages in a reserved line under the field | not yet |
| C2 | `scan/signin/Join.tsx` | Same | not yet |
| C3 | `scan/signin/parts.tsx` | Same words, same place under every "Send my code" (pinned by `scan/signin/SignIn.test.tsx`) | not yet |
| C4 | `scan/signin/CheckCode.tsx` | Same; "Send my code" keeps its words with a spinner while sending | not yet |
| C5 | `scan/signin/StoreQrScan.tsx` | Window capped at 300 px | not yet |
| C6 | `scan/ScanApp.tsx`, `scan/route.ts` | Same | not yet |
| C6a | `scan/signin/AddPhone.tsx` | No longer a full-screen layer: the site's bottom bar stays; no skip; Sign out | not yet |
| C7 | `scan/finish/` | Same steps and words; `TERMS_VERSION` pinned to the live one by `finish/termsVersion.test.ts` | not yet |
| C8 | `pages/ThriftPlus.tsx` (`?show=qr`), `scan/member/Wallet.tsx` | **No My QR tab**: /qr and ?view=qr open the Thrift+ page's large QR (small on the page, full size on a tap, cached for no signal) | not yet |
| C9 | `pages/ThriftPlus.tsx` (`?show=account`), `scan/member/Account.tsx` | **No Account tab**: a view of the Thrift+ page; Sign out lands on the signed-out Thrift+ page and still ends the website session | not yet |
| C10, C11 | `pages/SignIn.tsx` (goes to /scan), `pages/Verify.tsx` | Website sign-in IS the scanner's sign-in on a phone; /verify works as before, then opens /thriftplus | not yet |
| C12 | `pages/home/ThriftPlusBand.tsx`, `pages/ThriftPlus.tsx`, `shell/` | Links to /scan?view=join and /scan; the bottom bar's Scan | not yet |
| C13 | `pages/Terms.tsx`, `pages/Privacy.tsx` | Same words from the same data files, one calm page | not yet |
| C15 | `shell/BottomBar.tsx` | **No scanner tabs**: the site's bar (Home, In store, Scan, Thrift+) everywhere; Bucks, My QR and Account are views of /thriftplus (`?show=bucks|qr|account`) | not yet |
| C16 | `scan/member/HomeScreenCard.tsx`, `shell/Prompts.tsx` | Owner 11-19: on **every** phone-site page, signed in or out (was Scan after sign-in), above the bottom bar; same two-week dismissal key; never in the installed app | not yet |
| C17 (tag) | `scan/trip/` | Same: the tag's answer; signed out with Get Thrift+ | not yet |
| C17 (install) | `frontend-public/phone.html` | The same manifest and iPhone tags as `index.html` | not yet |

**Before `storefront.phone_scan` goes on:** every row here checked on a real phone (iPhone Safari, the installed app,
Android Chrome), and C14 (the opt-in screenshot) still matches what a desktop shows (it does: desktops keep C1).

## Staff

| # | Surface | Where (route · file) | What it does | Backend |
|---|---|---|---|---|
| S1 | Thrift+ Staff app shell (checked 11-03, no change) | dash.ecothrift.us/staff · `frontend/src/pages/thriftplus/staff/StaffApp.tsx` | Bar: Find · Scan · Join QR; version bottom-right | Dash login |
| S2 | Find | /staff/find · `pages/thriftplus/finalize/FinalizeThriftPlusPage.tsx` | One box: name, phone (any 3+ digits), email or member #; or scan their QR; newest online joins underneath. 11-03: a scanned QR goes to the ID check only for an Assisted join still to finish; anyone else opens their sheet (S3). The list says "In their app" for a phone join still finishing, "To finish" for an Assisted join | `register/pending/ {q, recent}` → `register.find_people`, `recent_joins` |
| S3 | A person's sheet | S2 → tap · `finalize/finalizePeople.tsx` | Check their ID now (**an Assisted join still to finish only**, 11-03; a phone join's sheet says "They finish in the Thrift+ app on their phone: a selfie and I agree. No ID check here.") · Sign-in QR · **Text sign-in link (only with the own-number switch ON, a phone on file and no STOP; Phase 4)** · Retake photo · Edit name or phone (11-03: also finishes a phone join that has the selfie and I agree) · Resend join email (email joins only) · Delete (owner). "Signed" is now "Agreed". **11-05 (#79): Finish here: their selfie and I agree** for a stuck phone join with both names and a confirmed phone (S13); otherwise "Stuck? Edit name or phone first (read the number back), then Finish here." | `people/<id>/finish-in-store/`, `people/<id>/sign-in-qr/`, `people/<id>/text-link/`, `photo-fix/`, `details/`, `email-link/`, `accounts/<id>/delete/` |
| S4 | The ID check (**Assisted join only**, 11-03) | S2 → Check their ID · `FinalizeThriftPlusPage.tsx`, `components/thriftplus/SelfieCheck.tsx` | Name matches, Face matches, 18+; the customer taps I agree if they didn't in the app (owner 11-03); Add a person | `register/finish/` (`agree`) |
| S5 | Join QR (checked 11-03, no change) | S1 bar · `finalize/finalizeParts.tsx` | ecothrift.us/join full screen | — |
| S6 | POS Terminal, the Thrift+ member button | /pos/terminal, in the cart's top bar · `pages/pos/TerminalPage.tsx`, `components/pos/ThriftMemberDialog.tsx`, `ThriftPlusPanel.tsx` | **One button** (10-20): Find (their QR scanned, name, phone, email or member #) → pick → on the sale. A member's QR scanned into the item box still attaches. Someone still to finish opens their card (S7): Finalize for an Assisted join, "They finish in the Thrift+ app" for anyone else (11-03). A QR attaches as here; a search pick waits for **Member is here** in the panel before ThriftBucks are used (10-21) | `register/pending/ {q, recent}`, `register/attach/`, `register/here/` |
| S7 | The member card | the S6 button when a member is on the sale, tapping them in the panel, and S11 · `components/thriftplus/MemberCard.tsx` | Status, ThriftBucks, credit, returns lately with the W14 warning (10-21), trips, people; **Finalize** (**an Assisted join only**, 11-03; only the ID check: Name matches, Photo matches, 18 or older, then Match; I agree only if they never agreed or signed); a phone join not finished shows "Not finished" and "Not finished yet. They finish in the Thrift+ app on their phone (a selfie and I agree), then show their member QR. Stuck? Thrift+ Staff, Find: finish it on the store phone." (11-05); **Add a 2nd person** | `register/member/`, `register/finish/` (with `cart`), `accounts/<id>/second-adult/` |
| S8 | POS, practice sign-up (training register only) (checked 11-03, no change) | S6 → Practice sign-up · `components/pos/ThriftPlusSignupDialog.tsx` | Join QR; pending finder; practice sign-up. The "Thrift+ finish joining" and "Thrift+ 3-day return" buttons are gone (10-20) | `accounts/ {practice}` |
| S9 | Dash Users → Members | /admin/users?tab=members · `pages/admin/users/MembersPanel.tsx`, `components/users/MemberDrawer.tsx` | Manager+: the whole list, See QR, Send sign-in link. 11-03: stages **In the app** ("Finishing in the app", stage `joining`), **Needs Finalize** (Assisted joins only), Member, Off; the strip counts each; the drawer's note says which | `member-directory/` |
| S10 | Dash Thrift+ → Members | /thrift-plus?tab=members · `pages/thriftplus/MembersTab.tsx` | Superuser. 11-03: a pending membership is "Not finished" (they finish in the app; an Assisted join on Finalize); "the register asks the phone and reads it back" is gone | `accounts/?q=` |
| S11 | Thrift+ members (lookup) (checked 11-03: shows S7) | /pos/members, Cashier menu · `pages/pos/MembersLookupPage.tsx` | Find, then the member card (S7). `?person=<person_id>` opens that card | `register/pending/`, `register/member/` |
| S12 | Assisted join (owner 11-03, J22) | S2 → "No smartphone? Assisted join" · `finalize/AssistedJoin.tsx` | First + last name, then Text them a code (their mobile; staff type the 6 digits) or No phone: check their ID; then S4 with I agree. 11-03: the one join that still goes through Finalize and the ID check | `register/assist/send/`, `register/assist/check/`, `register/assist/no-phone/`, then `register/finish/` |
| S13 | Finish here (owner 11-05, J8, J13; Dash Update #79) | S3 → Finish here · `finalize/StoreFinish.tsx` | A stuck phone join: "Phone ending NNNN is confirmed. Hand this phone to <name>: they take their own selfie and tap I agree." Take my selfie, Read the terms, then the customer's own tap on I agree finishes it. No ID check; never an Assisted join | `people/<id>/finish-in-store/` → `members.finish_in_store` |

## The ThriftBucks example (rulebook V12)

Every place a customer reads how ThriftBucks work uses V12's one example: retail **$200.00**, our tag **$100.00**, **20.00
ThriftBucks**; keep them (pay $100.00, 20.00 ThriftBucks come off your next visit) or use them now (pay $90.00 today); a
non-member pays $100.00, all sales final. A number with the word, never "$"; "collect", never "earn". Change V12 first, then
every row here. Swept 11-20 (Dash Update #197).

| # | Surface | Where (file) | State |
|---|---|---|---|
| E1 | Phone site: the Example window (home card's Example button) | `frontend-public/src/phone/shell/ThriftBucksExample.tsx` `EXAMPLE` | The source (#185) |
| E2 | Phone site: How it works, the home Thrift+ band, the signed-out Thrift+ page | `phone/pages/home/HowItWorks.tsx`, `ThriftPlusBand.tsx`, `pages/ThriftPlus.tsx` | Same $100.00 / 20.00 numbers (#185) |
| E3 | Phone site: the scanner's What is Thrift+? and How we price sheets | `phone/scan/trip/Sheets.tsx` | **Owed (#185 owns it):** the same change as E4 (it still says "They grow as an item sits", "Kept for next time, the Default", "Or redeem them instantly", no example) |
| E4 | Live scanner (ecothrift.us/scan): What is Thrift+? sheet, How we price | `frontend/src/pages/thriftplus/scanner/tripSheets.tsx` `THRIFTBUCKS_EXAMPLE` | **11-20:** the example first, then "ThriftBucks on most items. After 7 days on our floor...", "Keep them.", "Or use them now." |
| E5 | ecothrift.us/thriftplus (desktop and phones with the phone site off) | `frontend-public/src/data/thriftPlusAbout.ts` `THRIFTBUCKS_EXAMPLE`, `pages/ThriftPlusPage.tsx` | **11-20:** the example in the Get ThriftBucks poster's place (English, Spanish draft); Meet Thrift+ text says "After 7 days on our floor..." |
| E6 | ecothrift.us home band, Visit "Bring your phone", header Price check | `data/thriftPlusAbout.ts`, `components/Layout.tsx` | No explanation, only "see its ThriftBucks": no change |
| E7 | Thrift+ terms, "All you need to know" and §3 to §4 | `frontend-public/src/data/thriftPlusTerms.en.ts`, `.es.ts` | Legal text (versioned): "They grow as an item sits, up to 95% of the tag" and "Redeemed instantly" agree with V12; no example in terms. Left as is |
| E8 | Register (POS), Thrift+ panel, member card, signup dialog; Thrift+ Staff app | `frontend/src/components/pos/ThriftPlus*.tsx`, `components/thriftplus/MemberCard.tsx`, `pages/thriftplus/staff/` | Staff screens: amounts and buttons only, no customer explanation. No change |
| E9 | Social: AI post ideas and the Weekend pick slot | `apps/marketing/services/ideas.py`, `settings.py`; `frontend/src/api/marketing.api.ts` | At most "Thrift+ members collect ThriftBucks", no amounts (V10). **11-20:** the slot hint said "how members earn": now "collect" |
| P1 | Print: Thrift+ poster 2, Get ThriftBucks (printed 10-15; also the web image `public/thriftplus/thriftplus-poster-2-thriftbucks*.webp`) | `workspace/posters2/`, `.ai/reference/thrift-plus-posters/` | **Proposed remake (not reprinted):** replace the $49.36 lamp / 13.69 ThriftBucks with the V12 example (Retail $200.00 struck, Our tag $100.00, 20.00 ThriftBucks; Keep them: pay $100.00 / Use them now: pay $90.00 today; Non-member pays $100.00, all sales final). "When do they start? After an item's first 7 days on the floor. Then they grow daily." stays (it matches) |
| P2 | Print: Thrift+ poster 1, Meet Thrift+ | the same | **Proposed:** its ThriftBucks-grow-as-items-sit line becomes "After 7 days on our floor, most items start to carry ThriftBucks. They grow every day." |
| P3 | Print: S2 Thrift+ explained (drafts, #113), the `bucks` and `one` signs | `design/signage/copy/thriftplus.json` | **Proposed:** sub "ThriftBucks grow as an item sits." becomes the V12 carry line; add the example block (the three numbers and the two choices) to `bucks`; "Or redeem instantly" becomes "Or use them now" (V12) |
| P4 | Print: S5 register Returns and AS IS sign, S12/S13 QR signs | `design/signage/copy/register-returns.json`, `signs.md` | No ThriftBucks explanation: no change |

## Not Thrift+

- The HR **kiosk** (`/kiosk`, `/clock`) and its **kiosk card** are the staff time clock's badge (`components/users/BadgeBlock.tsx`, `apps/accounts` badge), not a Thrift+ surface. Untouched by #58; see the note on #58.

## Versions

| Surface | Where |
|---|---|
| Member app | bottom-right corner, every screen (`components/common/VersionTag.tsx`) |
| Thrift+ Staff app | bottom-right, above the bar |
| Dash | the sidebar footer |
| ecothrift.us | the footer bar, after the tagline (`frontend-public/src/appVersion.ts`) |

<!-- Last updated: 2026-10-15 (D16 v2: sideways phones). The APP session's design notes for the Thrift+ scanner (ecothrift.us/scan). APP designs, Eco-Thrift builds (frontend/src/pages/thriftplus/scanner/). The rulebook and 10-design-language.md win on words and look. -->
# Thrift+ scanner: design notes (APP)

Built today: the trip scanner, v2.163.0 (live for staff). Screens as built, with a staged member: `workspace/scanner_art/app_review/now/` (tool: `.claude/worktrees/heuristic-pare-f0e172/workspace/scanner_art/tools/app_shots.mjs`, which stages the API in headless Edge, so it needs no backend and no preview code).

## Owner's answers (10-14)

- First: the member QR screen, clean up the words, simpler everywhere. "We were pretty close to done on the last run": no redesign.
- Card: "Card, plus app QR" (the card is optional, J2).
- Tag screen: stays as built (the price biggest, the ThriftBucks band under it).
- My card: "Yes, build it" (mockup: `workspace/scanner_art/mockups/my-card-mockups.png`).
- The header pill's stack of bills: "ThriftBucks is fine, but we are going away from the currency symbol, so if we do print a ThriftBuck we need a new center." The note art keeps its look with a new center (no TB symbol), from the master.
- Order (master v2.2): the app is finished first, then the master shoots the tag screen for all three posters.

## Decisions

### D1. My card (the member QR). New. (Renamed "Member QR" by D6.)
- **Doors:** a **My card** button in the bottom row, members only: scan mode `[See this trip][My card]` (both quiet, flex 1); trip mode `[My card]` (quiet, flex 1) `[Scan more]` (primary, flex 1.35). Tag mode stays `Pass / Add to trip`. Guests: unchanged. The **Your ThriftBucks pill opens the same sheet** (it replaces the WalletSheet).
- **Button:** BigButton as built; icon `QrCode2Rounded` u(44), colour #3f9f35; label "My card".
- **Sheet:** the Sheet component. Title h2 **"My card"** (as InfoSheet's h2: Roboto Condensed 700, u(52), #1d5424, pr u(90)).
- **Card face:** mt u(22); radius u(40); padding u(34) u(36); background `linear-gradient(165deg, #3f9f35 0%, #2e8a2c 55%, #237a26 100%)`; shadow `0 u(10) u(28) rgba(35,122,38,0.30)`; all text #ffffff.
  - Top row: ThriftPlusLogo width u(230) on the left; the person's first name on the right (Roboto 700, u(40)).
  - White panel: mt u(24), #ffffff, radius u(28), padding u(24) u(24) u(20), centred.
  - QR: u(560) square, black on white, error correction M, **a 4-module white border inside the image** (the quiet zone), crisp (SVG or pixelated).
  - Under the QR: the code in groups of four ("4021 5583 1907"), Roboto Condensed 700, u(34), letter-spacing 0.12em, #2a2d28, mt u(12), so a cashier can type it.
  - Then on the green: **"Show this at the register."** (Roboto 700, u(32), centred, mt u(24)).
  - Fine print (B12, the card's line): **"ThriftBucks are Thrift+ rewards: use within 30 days of collecting. No cash value. Terms: ecothrift.us/terms"** (Roboto 400, u(24), line-height 1.4, opacity 0.92, centred, mt u(10); the address is a link).
  - Before the account is ready at a register (J2 not done): the line reads **"Finish joining at any register. Show them this code."**
- **Under the card:** the WalletSheet body as built (Your ThriftBucks, ready to use, Thrift+ credit, "Used in this order at the register", the trip note, My account, Sign out). Its last B12 line goes (it's on the card now).
- **What the QR holds:** exactly what the register's card scan reads today (`TP` + the 12-digit code, `apps/thriftplus/services/cards.py`), so the register needs no change. Which code is Eco-Thrift's call; suggested: each person gets a card code of their own that lives in the app, so stopping a lost plastic card never stops the app, and a member with no plastic card still has one.
- **Behaviour:** keep the code on the phone so the card shows with no signal; keep the screen awake while the sheet is open (Screen Wake Lock, where the phone has it). The web can't raise brightness; the white panel and big QR are for that.

### D2. Words (exact). None is on the member's tag screen.
| Where | Now | New |
|---|---|---|
| `tripSheets.tsx` Thrift+ sheet, line 1 | "Free to join." "Nothing owed, ever." | "Free to join." "Nothing owed." |
| same, line 3 | "Kept for next time." "Your ThriftBucks are saved to your account automatically. Use them from the next day, for 30 days, at full value." | "Kept for next time, the Default." "Your ThriftBucks stay on your account. Use them from the next day, for 30 days, at full value." |
| same, new line 6 (icon `SellRounded`) | (none) | "Guests pay the tag." "Everything a guest buys is sold AS IS. All sales final." |
| WalletSheet, Thrift+ credit note | "From a return. Used first, automatically. Never expires." | "From a return. Always used first. Never expires." |
| Tag screen, guests only | "Cards are free at the register" | "Free to join at the register" |
| This trip bar, guests only (and its aria-label) | "ThriftBucks back" | "ThriftBucks for members" |
| `SignInScreen.tsx` | "No card yet? Get one free at the register." | "Not a member yet? Join free at the register." |
| `AccountScreens.tsx` | "Return $" (label and activity rows) | "Thrift+ credit" |
| same | "This month's cover: 10.00 of 10.00" | (remove; hide "cover" rows in Recent activity) |
| RETURNS_INFO.no | "(like clothing, parts and small items)" | "(like clothing, parts and low-priced items)" |
| PRICING_INFO | "We start at a discount from retail, and ThriftBucks grow as an item sits, so what it really costs you keeps coming down. That way every price gets to just right in time." | "We start well below retail, and ThriftBucks grow as an item sits. That way every price gets to just right in time." |
- `Explainers.tsx`: delete the scan, bank, cover and cart topics and IntroTour (unused; they carry cover, bank and InstantBucks words). Keep the camera help.
- `copyRules.test.ts`: add the 10-12 words (customer text): InstantBucks, Full reward, Instant reward, cover, warranty (except "not a warranty"), primary function, bank / banked, earn, store credit, gift card, Thrift+ Cash, Thrift Bucks, TBucks, automatic(ally), "Nothing owed, ever".
- The terms page should say the same six lines (line 1 "Nothing owed."; line 3 without "automatically"): master / terms owner.

### D3. Header pill picture (on the tag screen the posters crop)
- The stack of bills (`thriftbucks-brick.webp`) goes. The pill shows **one ThriftBuck note** at the same size, u(92), with the **new center** (no TB symbol) the master makes. The same file replaces the stack icon on the Thrift+ sheet's line 2 and the falling note (`thriftbucks-ticket.webp`, TicketRain).
- Until the new note lands, Eco-Thrift builds everything else; the swap is one file.

### D4. Type
- No font change before launch (it would change the tag screen the posters shoot). Tested 10-14: Manrope for the running text (titles and prices stay Roboto Condensed, ThriftBucks numbers Nunito 900) fits every screen with nothing breaking; a good first change after launch. Proposal to the master in the thread.

### D5. An easy way to open My card (renamed by D6: "Member QR", ecothrift.us/qr) (owner 10-14: "NOW we need the QR and an EASY way for customers to see it")
- **The My card button** (D1) is always in the bottom row for members, and the Your ThriftBucks pill opens the same sheet.
- **ecothrift.us/card** opens the scanner straight on My card (`/scan?view=card` opens the sheet on load; × closes it to the scanner). Signed out: sign in, then straight to the card. One short address for the cashier, receipts, emails and signs: "Forgot your card? Open ecothrift.us/card".
- **Stay signed in:** a member stays signed in on their phone (at least a year, renewed each visit), password or card sign-in, so the card opens without a password at the register.
- **Home-screen icon:** a web app manifest for the scanner, so a phone can add Thrift+ like an app that opens on the card.
  - `name` and `short_name` "Thrift+"; `start_url` ecothrift.us/card; `display` "standalone"; `background_color` "#f2f2ee"; `theme_color` "#237a26"; `apple-mobile-web-app-title` "Thrift+".
  - Icons in `workspace/scanner_art/icons/`: `icon-192.png` and `icon-512.png` (purpose "any"), `icon-maskable-512.png` (purpose "maskable"), `apple-touch-icon.png` (180, `<link rel="apple-touch-icon">`). The wordmark is Black Anemone outlines, like the header (the font is bought before launch, V8).
- **The link under the card:** "Add My card to your home screen" (Roboto 700, u(28), #237a26, underlined, centred, mt u(22)), between the card and Your ThriftBucks. Hidden when the app already runs from the home screen (`display-mode: standalone`) and in browsers that can't add it.
  - Android (the browser offers `beforeinstallprompt`): the tap opens the browser's own Install prompt.
  - iPhone Safari: the tap opens a sheet. h2 "Add My card to your home screen"; the icon (u(150), radius u(34)) beside "Then one tap opens your card at the register."; then "1. Tap Share at the bottom of Safari (the square with the arrow)." and "2. Tap Add to Home Screen, then Add."; a primary button "Got it".
  - On iPhone the home-screen app keeps its own sign-in, so the first open there asks to sign in once; after that it stays signed in.
- Mockup: `workspace/scanner_art/mockups/my-card-mockups.png` (frames 2 and 6: `2-my-card-sheet.png`, `6-home-screen-iphone.png`).
- **After launch, the easiest of all:** an Apple Wallet and Google Wallet pass (the card on the lock screen). It needs Apple and Google developer accounts, so it isn't for 10-20.

### D6. No card (owner 10-14, design language v2.6): "card" appears nowhere a customer reads
Members show the **member QR** in the app or give their phone number at the register. The QR screen is now the only way to show membership in the app, so D1 and D5 are renamed. The name is **"Member QR"**: the terms, posters and register say "the member QR in the app", so the button says the same words.

| Where (file) | Now | New |
|---|---|---|
| Bottom-row button (`TripScanner.tsx`, MyCardButton) | "My card" | "Member QR" |
| Sheet title (`tripSheets.tsx`) | "My card" | "Member QR" |
| QR aria-label | "Your Thrift+ code" | "Your member QR" |
| Link under the QR (D5) | "Add My card to your home screen" | "Add your member QR to your home screen" |
| How-to sheet title | "Add My card to your home screen" | "Add it to your home screen" |
| How-to line | "Then one tap opens your card at the register." | "Then one tap opens your member QR at the register." |
| Tag note, 18+ item, member not ID-checked (`TripScanner.tsx`) | "18+: needs an ID-verified card" | "18+: ID checked at the register" |
| Sign-in screen (`SignInScreen.tsx`) | the "Scan your Thrift+ card" button, its "or" divider and the whole card mode ("Card read", "Scan a different card", "Point your camera at the QR code on the back of your card.", "No camera here. Type the number on your card.", "Or type the card number", "Card number") | removed. The screen is the password form, "Forgot password?", then "Not a member yet? Join free at the register." and "Scan as a guest" |
| API messages (`thriftPlusScanner.api.ts`) | "That card and phone number don't match." / "Could not stop that card. Ask at the register." | removed with card sign-in and "Lost it?" |
| Account, Who is on the account (`AccountScreens.tsx`) | "Card ending 4821 Active", "Lost it?", "Stop the card ending …? It won't work at the register anymore. You can get a new one at the front.", "Stop this card", "No card yet. Ask at the register." | removed: each person shows only their name and "Main member" / "Second adult" |
| Account, card-session note | "You signed in with your card. To stop a card or change who is on the account, sign in with your email and password." | "To change who is on the account, sign in with your email and password." (only while an old card session exists) |
| Account, remove a person | "Take {name} off the account? Their card stops working." | "Take {name} off the account? Their member QR stops working." |
| Address (D5) and manifest `start_url` | ecothrift.us/card | **ecothrift.us/qr** (keep /card as a quiet redirect, never printed) |
| Explainers | "$10 covers your card", "Get a card", "Cards are free at the register." | gone with D2's deletion of those topics |
- Unchanged: "Show this at the register."; "Finish joining at any register. Show them this code."; the B12 line under the QR, "ThriftBucks are Thrift+ rewards: use within 30 days of collecting. No cash value. Terms: ecothrift.us/terms" (it has no card to live on now, so the QR screen carries it); the code under the QR (so a cashier can type it).
- `copyRules.test.ts`: add "card" / "cards" for customer text, checked in string literals and JSX text only, since code names like CameraCard and sc.card stay.
- **Open, for Eco-Thrift and the rulebook (not the app's look):** (1) a member who joined at the register with no email has no way to sign in once card sign-in goes; suggested: staff set a username and password at the register, or the register shows a one-time sign-in QR the member scans. (2) A lost phone: a staff action that gives the member a new QR code (the old one stops), in place of "Lost it?".

### D7. Member QR in the header, on every screen (the pill became two buttons in D11) (owner 10-14: "i more need a place on the scanner app to easily pop up your QR"; he picked "Top right, every screen")
- **The top-right pill becomes the Member QR button** on every screen: scanning, a scanned tag, the trip. One tap opens the Member QR sheet (D1: the QR, then the ThriftBucks balance and the order the register uses them). Mockup: `workspace/scanner_art/mockups/member-qr-header.png`.
- **Pill (members):** same place and shell as today: right u(30), top u(42), height u(116), radius 99, #ffffff, shadow `0 4px 14px rgba(0,0,0,0.16)`; padding left u(16), right u(34); gap u(16).
  - A circle u(84), #3f9f35, with a white `QrCode2Rounded` u(54) in it (replaces the stack of bills).
  - The words **"Member QR"**: Roboto 800, u(38), #1f6b27, one line.
  - aria-label "Member QR: show it at the register".
- **Pill (guests):** the same shell; the circle holds a white `PersonRounded`; the words stay "Sign in".
- **The ThriftBucks balance leaves the header.** It sits under the QR in the sheet, where a member looks at the register. One ThriftBucks number at the top now: This trip's.
- **The bottom row goes back to one button:** scan mode "See this trip", trip mode "Scan more", tag mode "Pass / Add to trip". The D1 Member QR button is removed (one door, always in the same place).
- **The stack of bills is gone from the app.** The Thrift+ sheet's line-2 icon (it was the stack) becomes `TrendingUpRounded` ("They grow as an item sits"). D3 shrinks to the falling note (TicketRain) only, which swaps to the master's new note if the owner approves the brand plan.
- **Poster shoot:** the header is on the tag screen, so the master shoots after D7 is built. It reads "Member QR", on message with v2.6.

### D8. Sign in with a phone number and a texted code (rulebook J11, owner 10-15). **Replaced by D9 the same day: no texts.**
The sign-in screen's first way in becomes the phone; email and password stay as the second way. Use the screen's own parts (`Title`, `Sub`, `Field`, `Primary`, `Secondary` in `SignInScreen.tsx`); the banner, the card and the two lines under it ("Not a member yet? Join free at the register." and "Scan as a guest") stay as they are.

**Step 1, the number (the screen's default):**
- Title "Sign in". Sub "Enter the phone number on your Thrift+ account."
- One Field: `type="tel"`, `inputMode="tel"`, `autoComplete="tel-national"`, placeholder "Phone number", font size at least 16 px (no iPhone zoom). It shows the number as typed, formatted "(402) 555-0123"; US numbers only.
- Under the field (u(26), #5d605a): **"We'll text you a 6-digit code. Msg & data rates may apply."**
- Primary "Text me a code" (off until the number has 10 digits).
- The screen's "or" divider, then a Secondary "Sign in with email and password", which opens today's password form. That form's sub keeps "Staff: your Dash email and password." and gains a Secondary "Sign in with your phone number" to come back.

**Step 2, the code:**
- Title "Enter your code".
- Sub, always the same whether or not the number is a member's: **"If that number is a member, we've sent a code."** Then the number as typed, "(402) 555-0123", with a link "Change" (back to step 1, number kept).
- One Field for the code: `inputMode="numeric"`, `autoComplete="one-time-code"` (the phone offers the texted code), 6 digits only; Roboto Condensed 700, u(56), letter-spacing 0.3em, centred. It signs in by itself when the sixth digit goes in.
- Primary "Sign in" (off until 6 digits).
- Resend, under the button (u(28), #5d605a): "Didn't get it? Send again in 0:30", counting down; at 0 it becomes a link "Send it again" (each send restarts the 30 seconds). After the third send it reads "Still nothing? Ask at any register." and stops offering more.
- Wrong code: "That code didn't work. Check it and try again." Expired: "That code has expired. Send a new one." (in the screen's error style).
- Signed in: straight into the scanner; from ecothrift.us/qr, straight to the Member QR.

**Never:** a message that says a number isn't a member; "card" anywhere; the full number in logs (J11).

### D9. Email online, phone at the register: no texts at all (owner 10-15, "Going with: Email online, phone at the register — no texts at all")
The owner's flow: join on the phone with a name and email; one email confirms the email and signs them in; at the register the cashier takes the phone number, checks the ID, takes the photo and reads the number back; from then on they give their number at the register and the app stays signed in (a year); a new phone or a signed-out phone gets "email me a sign-in link". No Twilio, no passwords for members. Passkeys (Face ID / fingerprint) are a later option. No email: join at the register with the phone number and collect everything there; the app comes when they add an email.

**Every email carries a link and a 6-digit code.** Tapping the link signs in the browser it opens in. On iPhone the Mail or Gmail app may open it somewhere else, and the home-screen app (D5) has its own sign-in, so the screen that asked also takes the code, and the member finishes where they started. Free, and it never strands anyone.

**The sign-in screen** (`SignInScreen.tsx`; the banner and its line "Scan any tag. See what you'd collect." stay):
- Title "Sign in". Sub "Enter your email and we'll send you a link. No password needed."
- One Field: `type="email"`, `inputMode="email"`, `autoComplete="email"`, placeholder "Email", at least 16 px.
- Primary "Email me a link".
- Then a small link **"Staff sign in"** (u(26), #5d605a, underlined): customers have no password (J11), so the password form is for staff only. It opens today's password form, which keeps "Staff: your Dash email and password." and "Forgot password?", and gains a Secondary "Back" to the email link.
- Under the card, in place of "Not a member yet? Join free at the register.": a Secondary button **"Join Thrift+"** with the line under it **"Free to join. Nothing owed."** (u(28), #5d605a). "Scan as a guest" stays below.

**The join screen** (new; from "Join Thrift+"):
- Title "Join Thrift+". Sub "Free to join. Nothing owed. Just your name and email."
- Field "Your name" (placeholder "First and last name", `autoComplete="name"`, `autoCapitalize="words"`), then the Email field as above.
- Small print (u(26), #5d605a): "18+. You'll finish joining at any register with your ID and phone number. We email your sign-in links, receipts and Thrift+ news; you can turn news off anytime. Terms: ecothrift.us/terms" (the address a link).
- Primary "Email me a link". Secondary "Already a member? Sign in" (back to the sign-in screen).

**ecothrift.us/join** (poster 1's join QR; terms §1.3) opens the join screen directly. Already signed in on that phone: straight to the Member QR instead. "Already a member? Sign in" and "Scan as a guest" work from there as usual.

**The "check your email" screen** (after either "Email me a link"):
- Title "Check your email".
- Sub, the same whether or not the email has an account: **"If that email belongs to a member, we've sent a link. Tap it on this phone, or type the code from the email."** (J11's words, plus the code) For a new join: **"We've sent a link to confirm your email. Tap it on this phone, or type the code from the email."** Then the email as typed and a "Change" link.
- The code Field: `inputMode="numeric"`, `autoComplete="one-time-code"`, 6 digits, Roboto Condensed 700, u(56), letter-spacing 0.3em, centred; it signs in by itself on the sixth digit. Primary "Sign in".
- Resend: "Didn't get it? Check spam, or send again in 0:30", counting down, then the link "Send it again"; after the third send, "Still nothing? Ask at any register." Errors: "That code didn't work. Check it and try again." / "That code has expired. Send a new one."
- If the link was tapped in another browser on this phone, this screen still waits for the code; nothing else to do.
- Signed in: after a join, straight to the Member QR (it shows "Finish joining at any register. Show them this code."); after a sign-in, straight to the scanner, or to the Member QR when they came from ecothrift.us/qr.

**The email** (strings for Eco-Thrift's template; text and one button, member green):
- Subject, join: "Confirm your email for Thrift+". Subject, sign-in: "Your Thrift+ sign-in link".
- Line: join "Tap to confirm your email and start your Thrift+ membership." / sign-in "Tap to sign in to Thrift+." (J8 quotes "Tap to finish joining Eco-Thrift Thrift+"; "finish joining" is the register step on the Member QR, so the email says "start", matching J8's "Start … on your phone, then finish at any register".)
- Button (#3f9f35, white text): join "Confirm and sign in" / sign-in "Sign in".
- "Or type this code in the app: 123 456" (the code large, spaced).
- "The link and code work once, for 15 minutes. Didn't ask for this? You can ignore this email."

**Guests:** the tag line under "ThriftBucks for members" changes from "Free to join at the register" to **"Free to join"** (joining starts in the app now; C3 lets it stand alone). The header pill still says "Sign in"; that screen has "Join Thrift+".

**Later, not for launch:** after a link sign-in, a sheet "Sign in faster next time? Use Face ID or your fingerprint on this phone." with Primary "Turn it on" and Secondary "Not now" (a passkey).

**Never:** a text message; "card"; a message that says whether an email has an account.

### D10. The brush logo, and "non-member" (owner 10-15, design language v2.8)
- **Logo:** the brush Thrift+ everywhere in the app: `wordmarkPath.ts` becomes the master's `workspace/scanner_art/brand/wordmarkPath.brush.ts` (same export names; `fill-rule="evenodd"` on both paths). Nothing to buy now (V8's Black Anemone is dropped).
- **Home-screen icons (D5):** replace the four files with the brush set in `workspace/scanner_art/icons/brush/` (`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`).
- **"Non-member" replaces "guest" in customer words:**
  - Thrift+ sheet line 6: "Guests pay the tag." / "Everything a guest buys is sold AS IS. All sales final." becomes **"Non-members pay the tag."** / **"Everything a non-member buys is sold AS IS. All sales final."**
  - Sign-in screen: "Scan as a guest" becomes **"Scan without signing in"**.
  - Code names (`isGuest`, `status: 'guest'`) stay.
- **The ThriftBuck note** (no TB symbol, no oval; the master's v4 A, B or C) waits for the owner's pick. In the app it's now only the falling note (TicketRain), since D7 took the stack out of the header.

### The final app, in one line per screen (D1 to D10)
1. **Sign in:** "Email me a link" (D9); "Staff sign in"; "Join Thrift+" / "Free to join. Nothing owed."; "Scan without signing in".
2. **Join:** name and email, then "Check your email" (link or 6-digit code).
3. **Scanner:** brush Thrift+ header with **Member QR** top right (D7); This trip bar; camera; "See this trip".
4. **A scanned tag:** as built (the price biggest, "+19.00 ThriftBucks back", 3-day returns or AS IS); Pass / Add to trip.
5. **The trip:** lines, "Scan more".
6. **Member QR sheet:** the QR, the B12 line, "Add your member QR to your home screen", then the ThriftBucks balance in the order the register uses it.
7. **Thrift+ sheet:** the six lines ("Free to join. Nothing owed." … "Non-members pay the tag.").
8. **My account:** name and role, Thrift+ credit, emails, activity; no card.

### D11. A two-part header pill: [ balance | QR ] (owner 10-15: "the top right pill does need to show balance ... a 2 point pill/button [BALANCE [ QR ] ] Click balance open balance drawer click QR QR opens ... ensure the QR button has enough space to be easy to click")
Replaces D7's single "Member QR" pill. Members only; non-members keep the single "[person] Sign in" pill.
- **Shell:** the same place and look as today: right u(30), top u(42), height u(116), radius 99, #ffffff, shadow `0 4px 14px rgba(0,0,0,0.16)`. It holds two buttons side by side, with no gap and no divider.
- **Left, the balance** (its own button, the full pill height): padding left u(30), right u(18). Two lines, left-aligned: the number (`tbNumber(member.banked_rewards)`, Roboto Condensed 700, u(46), #1f6b27, line-height 1.05), then "ThriftBucks" (Roboto 600, u(24), #5d605a). No picture. Tap: the **balance sheet**. aria-label "Your ThriftBucks: 12.40. See your balance".
- **Right, the QR** (its own button): a circle u(104), #3f9f35, with a white `QrCode2Rounded` u(60), set u(6) in from the pill's right end. The button's hit area is the whole right end of the pill, u(124) wide by u(116) tall (about 54 x 50 px on a 390 px phone), so it's easy to hit. Tap: the **Member QR sheet**. aria-label "Member QR: show it at the register".
- **Member QR sheet** (from the QR button and ecothrift.us/qr): h2 "Member QR", the green card with the QR (D1/D6 as built: the name, the code, "Show this at the register." or "Finish joining at any register. Show them this code.", the B12 line), then "Add your member QR to your home screen". Nothing else, so the QR is all there is.
- **Balance sheet** (from the balance): the old WalletSheet body as built. "YOUR THRIFTBUCKS", the number, "ready to use", "Plus $6.20 Thrift+ credit.", "Used in this order at the register" with its rows, the "When you buy this trip" note, the B12 line "ThriftBucks are Thrift+ rewards: use within 30 days of collecting. No cash value.", then My account and Sign out. Add a quiet Secondary at the end, "Show my member QR" (QrCode2Rounded), which switches to the Member QR sheet.
- **Poster shoot:** this changes the tag screen's header, so the master re-shoots after it's built.

### D12. Tap an item in This trip to see its tag again (owner 10-15: "can you make it so you can click the item and see it again from This trip")
- **The tap:** in the trip's list, tapping a line (anywhere but the "×1" chip) opens that item's tag screen in the middle, exactly as when it was scanned: the badge, title, 3-day returns or AS IS, Retail, OUR PRICE, the ThriftBucks band, "N in your trip", "Price feel off? Tell us." Show the line's item at once, and refresh it with the tag lookup in the background so the ThriftBucks are today's. Swiping a line left still removes it; a tap is a tap, not a slide.
- **The bottom row while it's open:** `[ Remove ]` (quiet BigButton, `DeleteOutlineRounded` u(44), #b01f14 icon, the label in ink) and `[ Back to trip ]` (primary BigButton, flex 1.35, `ArrowBackRounded` u(46)). Remove takes the whole line out with the usual Undo toast ("Removed Oak Bookshelf · Undo") and returns to the trip. Back to trip returns to the list where it was.
- **Other ways back:** swiping the tag left, the Escape key, or the left arrow return to the trip (a right swipe springs back). The This trip bar stays in its open state (green edge, chevron up) and works as it does in the trip: a tap goes to the camera.
- **The hint under the lines** becomes: "Tap an item to see its tag · tap ×1 to change how many · slide left to remove".
- **Line look:** unchanged; the line gives the usual press feedback (`&:active` background #e7f3e0).
- Members and non-members alike. Nothing here is on a poster.

### D13 to D15. Scanning help (owner 10-15, after using the live scanner)
The owner: "needs zoom option in the scanner window. try to use the available zooms of the phone"; "if tag doesn't work tell them to look for our green tag ... (in this window show our green tag) BUT also if the code looks like our code say ... we can't find that item ... priced as marked, with no ThriftBucks and not valid for 3-day return (AS-IS)"; and a non-tag QR (he tried the ecothrift.us/terms QR) "should either scan and tell you what is wrong or do something to let user know". Mockups: `workspace/scanner_art/mockups/scan-help-mockups.png` (frames 13-zoom, 14a-not-our-tag, 14b-cant-find, 15-link).

**D13. Zoom in the camera window.**
- A zoom control sits centred over the bottom of the camera card, just above "Type tag #", like a phone's camera app: a pill (rgba(16,21,17,0.55), 1px rgba(255,255,255,0.25) border, padding u(6), gap u(6)) holding one chip per level. Each chip is min-width u(88), height u(72), radius 99, Roboto 800 u(30). The chosen chip is #ffffff with #1d5424 text; the others are clear with white text.
- **The levels are the phone's own:** read the camera's zoom range (`track.getCapabilities().zoom`) and show 1× plus every whole step it reaches up to 3× (2×, 3×), and ".5×" only when the range goes below 1 (an ultra-wide camera). Choosing one applies `applyConstraints({ advanced: [{ zoom }] })`. Pinch on the camera picture zooms smoothly within the same range, and the chips follow.
- **A phone with no zoom setting** (many iPhones in the browser): try its other back cameras first (a telephoto from `enumerateDevices`). Failing that, zoom digitally: magnify the picture, and decode a centre crop scaled up, so small or far codes still read. The chips look the same.
- Remember the last level on the phone. Hide the control in type-only mode and when the camera isn't running.

**Every code the camera reads gets an answer.** The scan always buzzes and flashes (as for a tag today), then the middle shows one of the cards below, never a toast that's easy to miss. Bottom row on these cards: **[Scan again]** (primary, full width, QrCodeScannerRounded), which closes the card and goes back to the camera. That same code is then ignored for 3 seconds, so it doesn't pop straight back up. Add EAN-13, EAN-8, UPC-A and UPC-E to the decoder's formats, only so a product barcode gets the "not our tag" answer.

**D14a. Not our code** (a product barcode, other text, or a link that isn't ours):
- The picture of our green tag: `workspace/scanner_art/assets/our-green-tag.webp` (also .png; 900 x 649, transparent). It's the real green tag rendered by the print server, with a member-green ring around its QR. Width u(600), centred, mb u(26).
- h2 "That's not our price tag" (Roboto Condensed 700, u(52), #1d5424).
- Line "Look for our green tag and scan the QR code on it." (u(31), #5d605a, line-height 1.4).

**D14b. Our code, not found** (ITM and 4+ digits, one of our tag links with ?sku=, or a Code 128 tag code, and the lookup finds nothing):
- `BlockRounded` u(110), #8b8e87; h2 "We can't find that item".
- Line "It's priced as marked, with no ThriftBucks. Sold AS IS, so no 3-day returns." (keep "AS IS" and "3-day" together with no-break characters).
- The AS IS badge as built ("AS IS · no returns"), then a grey band (#f3f3ef, u(24) corners, u(30) text, #5d605a) "No ThriftBucks on this item", then the code in small grey mono.
- This is a rule as well as words: an item the system can't find sells as marked, with no ThriftBucks, AS IS. Eco-Thrift to add it to the rulebook (A rules), and the register should match.

**D15. One of our links** (a QR whose address is on ecothrift.us, like the terms QR on a poster):
- `LinkRounded` u(110), #3f9f35; h2 "That QR code is a link".
- Line "It opens **ecothrift.us/terms**." (the address in bold ink, shown as host and path), then "To see a price, scan the QR code on our green tag."
- Bottom row: [Open link] (quiet, OpenInNewRounded, opens it in a new tab) and [Scan again] (primary, flex 1.35).
- A link to any other site gets D14a, with no button to open it.

**No connection** stays as built.

### D16 v2. A sideways phone, without the turned page (owner 10-15: the turned page is "ugly af"; "you are approved to plan out the solution. and ship and deploy on your own")
v2.170.1's counter-rotation is dropped: the browser's own bar turns while the page doesn't, which looks broken. A website can't switch on the phone's rotation lock, so sideways gets its own simple screens. Customers tilt to frame a tag, so the camera keeps scanning while sideways.
- **When:** a phone (touch, short side under 600 px) held sideways, read from the screen angle (as v2.170.1 does, so the keyboard never triggers it). The page turns with the phone as any web page does; no counter-rotation.
- **Scanning sideways (the camera was showing):** the camera fills the whole screen (object-fit cover), the viewfinder brackets centred, and scanning carries on. Header, This trip and the buttons are hidden. At the top centre, 12 px down, a pill (rgba(16,21,17,0.72), white, Roboto 600 15 px, padding 8 px 16 px, `ScreenRotationRounded` 18 px): **"Turn your phone upright for the full app"**.
- **A code read while sideways:** the usual buzz and flash, and the app handles it as normal underneath (the tag card, or a D14/D15 card, is ready). Over the camera, a centred white card (width 300 px, radius 24 px, padding 20 px, shadow as the app's cards) with `CheckCircleRounded` 44 px #3f9f35, **"Got it!"** (Roboto Condensed 700, 24 px, #1d5424) and **"Turn your phone upright to see it."** (16 px, #5d605a). Upright: the card is there, exactly as if scanned upright.
- **The Member QR sideways** (a member turning the phone to show the cashier): a white screen with the QR centred, as large as fits (min(78vh, 78vw)), with its quiet zone; under it, the code in groups of four (Roboto Condensed 700, 18 px) and "Show this at the register." (14 px, #5d605a). Nothing else.
- **Anything else sideways** (a tag card or trip on screen, the balance or Thrift+ sheet, sign-in, join, account): one clean full-screen message on #f2f2ee, centred: `StayCurrentPortraitRounded` 56 px #3f9f35, **"Turn your phone upright"** (Roboto Condensed 700, 26 px, #1d5424), **"The scanner works best held upright."** (16 px, #5d605a). Whatever was open is still there when it turns back; nothing resets, and typed text is kept.
- **The home-screen app** keeps `"orientation": "portrait"` in the manifest and the `screen.orientation.lock('portrait')` attempt (Android honours it).
- **Tablets and computers:** unchanged.

### Built (Eco-Thrift, 10-14)
- D1 and D2 are built with tests green in `_worktrees/ecothrift-dashboard--mycard` and go live with today's register release. The QR is the person's active card code; a person with no active card gets a card that lives only in the app (never printed), so the register needs no change. D3 is a one-file swap when the master's note lands.
- D5 is built (worktree `ecothrift-dashboard--mycard`, Vite :5186; shots `workspace/scanner_art/app_review/d5/`, tool `workspace/scanner_art/tools/d5_shots.mjs`). APP reviewed and approved it 10-14 with two polish notes: bold Share / Add to Home Screen / Add in the how-to, and check the sheet's scrollbar on a real phone. All of it goes live with the 10-14 register release.
- Follow-ups 10-14: the how-to bold is done. Not-ready card: fixed to the D1 wording (the bold line reads "Finish joining at any register. Show them this code." and the B12 line stays; checked in `app_review/d5/card-notready.png`). **D1, D2 and D5 are closed.** Bill checks the sheet's scrollbar on his phone after the deploy.
- D6 and D7 are built (worktree `ecothrift-dashboard--nocardapp`, Vite :5186; shots `workspace/scanner_art/app_review/d7/`). APP signed them off 10-14. The account's empty Emails row is fixed too (checked in the new `d7/account.png`). Lost phone: Dash "Replace member code" (the old code stops; the app makes a new one when it next opens). Sign-in without email: in the rulebook as Proposed for the owner (staff set a username and password, or a one-time sign-in QR).
- **Live 10-15: D1, D2, D5, D6 and D7 in v2.166.0** (Thrift+ still off for customers; staff see it at ecothrift.us/scan). D9 and D10 are being built with their server side into one worktree on :5186. Shot scenes: signin, join, check-email, check-email-join, member-qr-notready.
- **Final build reviewed 10-15** (D1 to D10, Eco-Thrift's worktree `ecothrift-dashboard--nocardapp` on :5186, staged API): all 17 screens in `workspace/scanner_art/final-app-walkthrough.png` (shots `app_review/final/`, tool `.claude/worktrees/heuristic-pare-f0e172/workspace/scanner_art/tools/final_shots.mjs`). APP accepted Eco-Thrift's 8 judgment calls (Join as a white outlined pill; Sign in off until 6 digits; the resend line turns into the link at 0:00; "6-digit code" label; a code sign-in from Join lands on the Member QR; check-email re-checks the session when the tab returns; no password set-up on My account for email sessions; join errors "Enter your first and last name." / "Check your email address."). One fix sent: the staff form's Title "Staff sign in" and Sub "Your Dash email and password." The server half (join, link, code, /join, Finish joining at the register) is still being built; shipping and deploying wait for the owner's "ship" and "deploy".
- **Done 10-15:** the staff form fix is in (checked: Title "Staff sign in", "Your Dash email and password."). The server half is merged (join, link and code, /join, Finish joining at the register). The release is green (549 server and 525 frontend tests, type-checks, print server) and ships as **v2.167.0** on the owner's "ship and deploy". APP has nothing open on the app except the owner's pick of the master's ThriftBuck note (the falling-note animation only).
- **v2.167.0 is live (10-15):** email join and sign-in, the brush logo, Non-member, /terms. **D11** ([ balance | QR ] pill) is built on :5186 and APP checked it (shots `app_review/d11/`). It ships as v2.167.1 when the owner says "ship and deploy" in Eco-Thrift's chat; Eco-Thrift's rules need his words there directly.
- **D12 built and checked (10-15)** with D11 on :5186 (shot `app_review/d12/trip-item.png`). Accepted Eco-Thrift's choices: with a line's − + open, a tap on the rest of the line still opens its tag; a second look isn't counted as a scan (`?again=1`). D11 and D12 ship together as **v2.167.1** on the owner's "ship and deploy" in Eco-Thrift's chat.
- **D3 closed 10-15:** the owner picked ThriftBuck note A (the Eco-Thrift seal in the middle, the terms QR left, Thrift+ right; no TB symbol, no oval). Eco-Thrift swaps `thriftbucks-ticket.webp` for `workspace/scanner_art/tb/pack-v4/thriftbucks-ticket.webp` (the falling note) and removes the unused stack (`thriftbucks-brick.webp`, `art.brick`). The app then has no stack and no TB symbol anywhere.
- **v2.167.1 live 10-15** (Heroku v451): D11 and D12. APP's live check without signing in (`tools/prod_check.mjs`, shots `app_review/live/`): /scan, /join and /qr all load the app and show "Coming soon / Staff sign in" while Thrift+ is off (the local preview code doesn't open production). The member screens are the owner's staff-login test. D3 (note A, stack removed) goes in the next release.
- **D3 live 10-15 in v2.167.2** (Heroku v452): the falling note is note A (160 px), and `thriftbucks-brick.webp` is deleted with its import. **Every APP decision (D1 to D12) is now live.**
- **No consignment in customer words (owner 10-15):** checked the app as of v2.167.1 plus D3. No screen, sheet, the six lines, or server message the app shows mentions consignment. A consignment item's tag reads "No ThriftBucks on this item yet", which stays true once consignment collects them. The register's rules (no ThriftBucks on consignment) stay internal. Nothing to change.
- **D13 to D15 live 10-15 in v2.170.0** (Heroku v455). APP checked the shots in `app_review/d13/`: the three cards and the zoom chips, both native (.5× to 3×) and digital (2×). Builder notes: native zoom on Android Chrome, Edge and Samsung; on iPhone Pro, 1× and 2× are digital and 3× switches to the telephoto (check close focus on a real Pro); everywhere else digital 1× to 3×. Typed 8-, 12- and 13-digit numbers count as product barcodes. When a tag and a barcode share the frame, the tag wins. Rulebook P11 holds the rule; its open question is the owner's: can kept ThriftBucks pay for a not-found line (like pink tags and bins)?
- **D16. Portrait only (owner to Eco-Thrift from the floor, 10-15: "we need the scanner app page to stay fixed in portrait. customers tilt phone to scan and it reorients")**, live in v2.170.1 (Heroku v456). A browser tab can't lock its orientation, so on a sideways phone the page turns itself back by the screen angle and behaves like a portrait-locked app, camera and swipes included. The home-screen app locks portrait (the manifest has "orientation": "portrait"). It applies to phones only (a touch screen with a short side under 600 px) and reads the screen angle, never the viewport, so the keyboard can't trigger it. APP checked `app_review/portrait/tag-landscape.png`: it reads upright on a sideways phone.
- **D16 v2 live 10-15 in v2.170.2** (GitHub 141ac05f, Heroku v457). APP built, shipped and deployed it itself, on the owner's order ("approved to plan out the solution. and ship and deploy on your own"; Eco-Thrift held its ships). "Lock upright" (full screen plus the orientation lock; Android, hidden on iPhones) sits top left on the camera and on the sideways screens. Sideways without the lock: the full-screen camera with the pill, "Got it!", the QR alone, or "Turn your phone upright". The turned page (portraitLock.ts) is removed. Checked in headless Edge with a sideways screen angle (`app_review/d16/`) and in the live bundle.

## Open
- **Brand plan (master's proposal to the owner, waiting on his yes):** the brush Thrift+ logo everywhere, the app header too (it replaces Black Anemone, so there's no font to buy), and the note's center becomes the brush "+" in bright green inside the oval. If he says yes:
  - The master sends the note (square, transparent, 256 px webp, in `workspace/scanner_art/`) and the logo as an SVG path for `wordmarkPath.ts`. APP passes both to Eco-Thrift (D3, plus the header wordmark).
  - The master's files are ready (10-14), held for the owner's yes: the note `workspace/scanner_art/tb/pack-plus/thriftbucks-note-256.webp` (and the 160 px ticket), the logo `workspace/scanner_art/brand/wordmarkPath.brush.ts` (same export names; fill-rule evenodd on both paths).
  - The brush home-screen icons are made and held: `workspace/scanner_art/icons/brush/` (same four files as D5). On his yes they replace the D5 set.
  - The header is on the tag screen, so the master shoots the posters after it's built.
- Terms words: done by the master 10-14 (the six lines match the app; "automatically" stays only in the legal body).
- Type: agreed with the master: no change before launch; Manrope is the first change after launch.

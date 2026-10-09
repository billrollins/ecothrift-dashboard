<!-- Last updated: 2026-10-08 -->
# Sources and rules

## Sources of truth, in order

1. **The Thrift+ rulebook:** `.ai/extended/thrift-plus-decisions.md` (Form 5, 10-08). It wins over everything below.
2. **The owner's notes** on the launch-kit page (https://claude.ai/artifact/WzPhon6EJvA2S7XLk8M3oZ, collection `todos`), read 10-08:
   - `f-asis` (owner): "the signs i plan on puttin up are two, all of them Member VS Guest: prices and Returns. a third will be a general description of Thrift+ So all disclaimers will be on there."
   - `cr-posters`: three signs, Member vs Guest prices, Member vs Guest returns, What is Thrift+. Earlier draft: 19 x 13 landscape, 3 rows each.
   - `pr-hang`: join at the entrance, prices in the aisles, warranty at each register.
   - `dec-voice` (owners' meeting 10-07): lead with the benefit, fast; never wait / less / pay; "it might be gone tomorrow".
3. **The main Eco-Thrift session**, by message 10-08: what is decided and open, and the one-poster copy it gave the owner (not approved). Quoted in [02-copy-deck.md](02-copy-deck.md).
4. **The owner in this session** (10-08):
   - Two paths: (1) one all-in-one poster, or (2) two or three posters: General (what it is), Rewards, Limited Warranty. Other ways are welcome.
   - Prints 13 x 19 at home; an alternative size may be designed.
   - At least 3 or 4 collections, each with its own design philosophy.
   - At least 3 variations of every creative in every collection, with real range.
   - No mistakes, and no AI-slop look: only professional results.
5. **Older drafts, superseded wherever they differ:**
   - The launch kit (`.ai/initiatives/thrift_plus_launch_kit.md`).
   - The warranty review (`.ai/extended/thrift-plus-limited-warranty.md`: 3 days and 95% there are old).
   - The main session's 10-08 sign drafts (`workspace/signs/`). These use gift card, Bank it +5% and 90%, all replaced by Form 5.

## Decided facts the posters use

| Fact | Rule |
|------|------|
| Tagline: "Every find earns Rewards." | V3 |
| Members earn Rewards on almost everything. Guests pay the tag. | P1 |
| The word members see is "Rewards". "Member price" only as a plain description. | P2 |
| Use today's Rewards now at 80%, or save them in full for 30 days. Saving is the default; one choice per trip. | F1, B1 |
| Rewards expire 30 days after the receipt they were earned on. No cash value. No fees. | B5 |
| Thrift+ credit (refund money) never expires and is always used first. | B3, B5 |
| Free to get your card; the first $10 of Rewards each month covers it. "Free" always comes with that cover line. | C1, C3 |
| Join: 18+, a photo, name and phone, an ID check, a signature. Start on the phone, finish at any register. | J1, J2, J8 |
| ID: checked for age, nothing kept. Photo: protects the card balance. | J3, J4 |
| 18+ items: ID checked every time. | J7 |
| Thrift+ Limited Warranty: main function doesn't work, untested items included. | W1 |
| 7 days, counted after the day of sale; a closed day 7 moves to the next open day. | W2 |
| 80% of what was spent, tax included, back on the account (Thrift+ credit; Rewards used come back as Rewards with a fresh 30 days). Cash fallback. | W3 |
| Not covered: items marked NO THRIFT+ WARRANTY, clothing and soft goods, 18+ items, crossbows, items under $5. Never: scratches, wear, missing small parts, change of mind. | W6 |
| Claim: item plus card or phone number; staff check; a manager reviews any no. | W7 |
| Full warranty text at every register and at ecothrift.us/thriftplus/warranty. Eco-Thrift LLC, 8425 West Center Road, Omaha, NE 68124, (402) 881-9861. Version-dated. | W8 |
| Guests: all sales final, sold AS IS. | W9 |
| Signs: Prices at racks, Returns with a bold SOLD AS IS box at registers, Meet Thrift+ at the entrance; small area signs at clothing, 18+, crossbows: "NO THRIFT+ WARRANTY. Sold as is to everyone. Final sale." | A4 |
| One Spanish line per sign; a native speaker checks it. | V5 |
| Tax and legal lines go to the CPA and attorney together. | V7 |

## Copy rules (checked on every poster)

- **Voice (V1):** what you get now; "it might be gone tomorrow". Never wait, less or pay as the pitch.
- **Never (V2):** discount (as the pitch), fee, dues, unlock, cash back, points, clawback, instant rebate, gift card, store credit, Thrift+ Cash, "the longer it waits". Also never "Member Price" as a name (P2), "free forever" (C3), "Bank it" or "+5%" (old form).
- **Both numbers (V4):** wherever Rewards appear, the today number (80%) and the save number (in full, 30 days) sit together.
- **No formula (P8):** no growth rate, cap or 7-day start on a poster.
- **Numbers (P9):** only numbers the Calculator shows true on launch day. Rule numbers (80%, 100%, 30 days, 7 days, $10, 18+, $5) are fine. **No dollar examples** (the $40 lamp is the main session's example, not a launch-day number).
- **House style:** plain words, short lines, no em or en dashes, curly quotes, "18+" and "7 days" never split across lines.
- **No money imagery:** no coins, cash or wallets. Rewards have no cash value (B5) and "cash back" is banned (V2). The scanner's gold coins stay in the scanner.

## Brand

| Item | Value | Source |
|------|-------|--------|
| Colours (public site) | forest `#18452d`, deep `#0f2c1d`, tint `#ebf1ed`, ink `#1a1f1c`, page `#f4f6f5`, muted `#5b635e`, line `#d7dedb`, slate `#5c6b64` | `frontend-public/src/styles.css` |
| Type (public site) | Spectral (display), Manrope (body) | same |
| Scanner palette (Thrift+ app) | greens `#1d5424 #1f6b27 #3f9f35 #52b843 #237a26`, tints `#e7f3e0 #dcefd2`, page `#f2f2ee`, ink `#2a2d28` | `frontend/src/pages/thriftplus/scanner/scannerTheme.tsx` |
| Eco-Thrift logo | full colour 10013 x 2459 px (print-ready to 20+ in wide); icon 2460 px; white 1466 px | `frontend/src/assets/logo-full-fullsize.png`, `logo-icon-fullsize.png`, `frontend-public/src/assets/logo-full-white-halfsize.png` |
| Thrift+ brush wordmark | 720 x 284 px only (scanner). Must be rebuilt at print size before use (see 05). Owner to confirm it is the official mark. | `frontend/src/assets/thriftplus/logo.webp` |

The main session said the logo files were too small for print; that was the public-site copies. The staff app has the 10013 px master, which is enough.

## URLs and QR codes

| Use | URL | Live? |
|-----|-----|-------|
| Price scanner | ecothrift.us/scan | Yes (passes through to the scanner; "coming soon" until the Thrift+ switch is on) |
| Terms and the program page | ecothrift.us/thriftplus | Not yet (J5 names it) |
| Full warranty | ecothrift.us/thriftplus/warranty | Not yet (due 10-12) |
| Join on the phone | none yet | Not built (J8, due before 10-20). Posters point to ecothrift.us/thriftplus until a URL exists. |

QR codes are generated as vector from the final URL at build time. Before printing, every QR is scanned from the PDF preview and the page must be live.

## Open items (owner)

1. Layout path: all-in-one, or two or three posters, or the full sign set (A4).
2. Size: 13 x 19 portrait (home print) is the default; 19 x 13 landscape and 18 x 24 portrait are shown as options.
3. Headlines: none approved. The tagline is decided (V3); the rest are options in the copy deck.
4. The warranty version date (the date the warranty page goes live).
5. The Thrift+ brush wordmark: official or not.
6. Spanish lines: a native speaker checks every one (V5).
7. Legal and tax lines: CPA and attorney (V7). The warranty poster wording follows W1 to W9 but is not attorney-checked.

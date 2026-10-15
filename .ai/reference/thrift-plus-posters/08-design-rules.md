<!-- Last updated: 2026-10-12 -->
# The posters' design rules: every visual edit, and why

The owner, 10-12: "record the visual edits we made throughout and why, so as you make changes you are still considering things like not creating super long text that goes outside a card or returns to next line awkwardly."

**Use it as a checklist on every change** (bottom of this file). The day-by-day story is in [`06-log.md`](06-log.md); this file is the distilled rule set. The words come from the rulebook (`.ai/extended/thrift-plus-decisions.md`, V1 to V8); the copy lives in `workspace/posters2/copy/copy_r3.json`, the layout in `workspace/posters2/templates/S/F-P1..3.html.j2` and `S/_s.j2`, the build in `tools/build_final.py`.

## 1. Format and production

| Rule | Why |
|---|---|
| Three posters, 13 x 19 in, hung side by side: 1 Meet Thrift+, 2 ThriftBucks, 3 Returns. | The owner's three signs (launch kit). |
| 0.6 in safe area: no text outside it. | Trim and frame tolerance. QA checks it. |
| Body type at least 14.5 pt; the footer may go to 11.5 pt, small captions to 11 pt (`data-min-pt`). | Read from about 4 ft. QA checks it. |
| Text, QR codes and diagrams are vector; AI art only where it reads as a real photo (plates, sky). | No "AI slop" (owner, memory `print-creative-quality`). |
| Photos at least 150 ppi at print size (the sky panorama is 150 ppi, soft by nature). | Sharp at arm's length. QA checks it. |
| Fonts: Manrope (text), Nunito 900 (numbers), Spectral, Caveat 700 (the red pen, retired 10-12). | Manrope is the posters' own text face; the scanner uses Roboto / Roboto Condensed for text and shares only Nunito 900 for numbers (corrected 10-14: this line used to say "matches the scanner"). The sweep checks nothing else is embedded. |
| No CSS masks or blurred CSS shadows. | Chrome rasterises them (72 ppi masks); bake alpha in Python instead. |
| Every QR is checked by decoding it from the PDF. | A QR that fails is worse than none. |
| Print files go to `workspace/posters2/print/` (a new folder if the old PDFs are open in a viewer). | The v1 files were locked on 10-10. |

## 2. The wall

| Rule | Why |
|---|---|
| One sky across all three (39 in panorama): morning over 1, day over 2, night over 3; horizon at 6.0 in on each. Features cross the seams (a cloud, the stars). | The three read as one wall (owner pick, 10-09). |
| Poster 3's title is white (night sky). | Contrast on the dark sky. |
| Header: the scanner's white app bar with the Thrift+ and Eco-Thrift logos, the Eco-Thrift logo enlarged to fill it like Thrift+. | Ties the posters to the app (group 3, 10-09). No white logos with blurred shadows (owner). |
| Titles: no number badge, no kicker, no full stop after "Thrift+". | Owner's markup of round 2. |
| Guest = white, member = green (#3f9f35, the "+" green), the same on every poster; labels singular, "Guest" / "Member". | One visual language across the wall (owner 10-10). |

## 3. Each poster's layout (what stays fixed)

**1 Meet Thrift+.** A green "New at Eco-Thrift" pill over the title "Meet / Thrift+" and the one-line subline (the tagline, V3). Beside it the Thrift+ card (a placeholder front until the owner's photo of the real stock card) leaning on the ThriftBucks stack (the certificate art), with a round "Free / to join" badge (10-14). The 1-2-3 as three rows on one member-green panel (white number dots, label + heading left, the detail right behind a rule). The join row: "Start on your phone" (about 60%, a 1.75 in join QR with no border, the steps) | "Finish at the register" (photo, ID, the 18+ note centred and lighter). The 4-line footer.

**2 Get ThriftBucks.** "Once you have your card" over the title. "Scan any tag" line with the scanner QR. Below, stacked (10-12): the Member card (green, left) with the rule, the example line, one white tile with the big number (the ThriftBucks kept, marked Default) and the instant 50% as a note under it; the phone on the right, level with the card, showing the **real scanner** with the glove's tag in its viewfinder; the Guest strip (white, full width) under both, the phone's foot tucked behind it. The 4-line footer.

**3 Returns.** Title in two lines, the name over it, a subline. One card of three rows (label column + text, left-aligned, no icons, big labels). The chart green over white (F-P3b, owner 10-09): the member band in #3f9f35 with three stats (big figure + short line), the guest strip below (AS IS ×3). The claim line with the register icon. The 4-line footer.

## 4. Every visual edit, and why (distilled from the log)

- **Each message has one job** (10-09): the member headline gives the rule (up to 95% of the tag), the example line and tiles give the numbers, the red pen is the call to action. Never two jobs in one slot.
- **Numbers as an example, in big type, with the rule nearby** ("Example: this $20 glove at 95%"). The rate is never printed (P8); the cap may be.
- **The Default is first and marked** ("Default", not "Automatic": "Automatic reads like two things you get", owner).
- **The red pen** replaced a boxed callout: handwriting reads as a staff note; one call to action, centred between the tag and the green card; the arrow points at the QR's centre, measured from the PDF. Retired 10-12 with the glove photo and kraft tag: the phone now shows the glove and its tag, and a note pointing at a screen read as clutter.
- **QR sizes**: terms QR 1.06 in captioned "TERMS" (0.82 in was too small in a close crop); join QR 1.75 in with a caption scaled to it (19 pt vs 11.5 pt).
- **The phone shows the real app** (a screenshot fed a shelf photo as its camera), never a mock, and is retaken whenever the app's words change.
- **The phone moved from poster 1 to poster 2** (owner 10-12: "it makes more sense there"): poster 2 is where you scan, so the phone shows the scan, with the same glove the example line names. Poster 1 shows the Thrift+ card instead.
- **One number, not two** (owner 10-12: "do not have 19 and 9.50, just 19 with the 50% note"): two equal tiles made the instant cut look like a second, equal reward. The kept ThriftBucks get the one big figure (150 pt); "Or redeem them instantly at 50%. Tell the cashier." sits under it as a note.
- **Cards stack, the phone stands beside** (10-12): with the phone on the right the side-by-side chart had no room, so Member goes on top (the point of the poster) and Guest becomes a full-width strip below. The strip covers the phone's foot, so only the useful three quarters of the screen shows (today's app is empty below the camera); its shadow comes from a phone-shaped box that ends at the cut, so it rounds off behind the strip instead of stopping in a hard line.
- **The returns card** was rebuilt three times: icons and centred headings were dropped for a row layout (label column + text), because the owner's sample read as a list, left-aligned, with bigger labels.
- **Poster 3's chart** became green over white to match poster 2's colours.
- **Poster 1 made harder to miss** (owner 10-14: "a bit bare... a touch more exciting... seems easy to miss"): it was white rows on a pale sky with one small green card, while posters 2 and 3 each carry a big green block. Now the 1-2-3 sit on one green panel; a news pill tops the title; the card leans on a stack of ThriftBucks (the brand's own certificate art, already in the app; "No cash value" is printed on it and in the footer); a white badge with a green ring says "Free / to join". The badge repeats row 1's heading on purpose: it is the hook, the row is the explanation.
- **Spanish**: one short line, last in the footer (V5). From 10-12 it points non-English speakers to the QR (section 6).
- **"Free"** never sat next to a monthly charge after the field feedback (10-10); since 10-12 there is no cover, so "Free to join" stands alone.

## 5. Text fit: the slot budgets

Measured on the 10-10 print set; a new string should stay within its slot's budget, and the QA's `too_many_lines` and `widows` checks (added 10-12) must pass. "Lines" is the most it may wrap to.

| Poster · slot (copy key) | Type | Budget | Notes |
|---|---|---|---|
| 1 · pill (`meet_pre`) | 16 pt caps | ≤ 20 characters | One line; it must stay shorter than "Meet". |
| 1 · subline (`meet_sub`) | 24 pt, nowrap | ≤ 36 characters, 1 line | Set nowrap: a longer one runs off the title column. |
| 1 · badge (`free_badge`) | Nunito 36 pt / 13 pt caps | ≤ 5 / ≤ 9 characters | Two lines in a 1.62 in circle. |
| 1 · card heading (`c*_h`) | 29 pt | ≤ 24 characters, 1 line | The heading column is 4.55 in. |
| 1 · card text (`c1_t`, `c3_t` / `c3_lines`) | 19 pt | ≤ 36 characters a line, 2 lines | One line, or two lines as a list (`c3_lines`), so a break never falls mid-phrase ("…80% back / as Thrift+ credit" was rejected 10-12). |
| 1 · card 2 lines (`c2_lines`) | 19 pt, nowrap, one line each | ≤ 38 characters each | Each is one line on purpose (owner 10-09); 20 pt overflowed (QA, 10-12). |
| 1 · join steps | 19 pt | ≤ 36 characters per line | "ecothrift.us/join" never breaks (`nb`). |
| 2 · title (`rw_h1`) | 104 pt (xl) | ≤ 16 characters, 1 line | |
| 2 · scan line (`rw_scan_a`) | 23 pt | ≤ 40 characters, 1 line | Beside the QR. |
| 2 · shelf label CTA (`label_glove.cta`) | label type | 2 short lines, ≤ 12 characters each | Now only on the shelf photos inside the phone (tools/shelf_glove.py, shelf_label.py). |
| 2 · member headline (`member_h`) | 26 pt | ≤ 70 characters, 3 lines | The card is 5.6 in wide. |
| 2 · example line (`ex_line`) | 15.5 pt | ≤ 40 characters, 1 line | Names the item in the phone. |
| 2 · big figure (`full_big2`) | Nunito 150 pt | ≤ 3 characters | ThriftBucks, never dollars. |
| 2 · tile text (`full_t2`) | 18.5 pt | ≤ 40 characters, 2 lines | |
| 2 · note (`inst_note`) | 19 pt, nowrap, one line each | ≤ 34 characters each, 2 lines | The first line bold. |
| 2 · guest strip (`guest_h`, `guest_lines`, `guest_no`) | 36 pt / 19 pt / 18 pt | heading ≤ 16, lines ≤ 20, items ≤ 16 characters | Three columns, one line each. |
| 3 · title | 74 pt | 2 lines, ≤ 18 characters each | White on night. |
| 3 · row label (`wq.lbl`) | 16.5 pt caps, nowrap | ≤ 18 characters | The label column is 3.25 in. |
| 3 · row text | 20 pt | ≤ 82 characters per paragraph, 2 lines | |
| 3 · band big figure (`w_cols.big`) | 40 pt | ≤ 7 characters, 1 line | The columns are narrow: "Any reason" (10) wrapped on 10-12; "3 days", "80%", "Credit" fit. |
| 3 · band line (`w_cols.t`) | 16.5 pt | ≤ 52 characters, 3 lines | |
| All · footer lines (`foot_*`) | 11.5 to 15.5 pt, one row each, justified | 82 to 95 characters, **all four within about 10% of each other** | The type is sized to the longest line, and the others are spread by word spacing (capped), so one short line ends ragged and one long line shrinks them all. |

**Breaks:** never split a URL, an amount, "Thrift+ credit", "SOLD AS IS", "3-day returns" or a number from its word (`| nb` in the template); no one-word last line; a card's text never wraps further than its budget.

## 6. Words on posters (10-12)

- **ThriftBucks** is the only noun; "redeem instantly" is a verb, at 50% (V8, B1). Never "InstantBucks", "Full reward", "Instant reward", "Rewards".
- **No cover**: "Free to join" stands alone (C1, C3).
- **Returns**: "3-day returns", any reason, qualifying items; never "Limited Warranty" or "primary function". "Warranty" appears only in "not a warranty" (W1).
- **Amounts**: ThriftBucks as a number next to the word ("19 ThriftBucks"), never "$" or the TB mark; money (prices) stays in dollars. Poster 2 shows no dollar value for the instant 50% (owner 10-12).
- **Spanish line** (owner 10-12): small, the last footer line, the same on all three: a few words on Thrift+, then send readers to the QR for Spanish or to ecothrift.us/terms (the page's Español toggle).

## 7. Checklist for every change

1. Does the new string fit its slot's budget (section 5)? If not, shorten it first; don't shrink the type.
2. Rebuild: `python workspace/posters2/tools/build_final.py`. All four must say OK (text fit, safe area, sizes, overlaps, banned words, required lines, QR decode, too many lines, widows).
3. Look at every changed slot at 100% (crops), the footers image (`out/S/footers-F.png`) and the wall (`out/S/wall-Fb.png`).
4. Footers: are the four lines about the same length, with no gappy word spacing?
5. Update `06-log.md` (what and why) and, if a rule here changed, this file.

## 8. Changes made on 10-12 (the policy change), and why

- **Words:** ThriftBucks only; "redeem instantly at 50%"; no cover ("Free to join"); "3-day returns" replaces the Limited Warranty; poster 3's title is "Doesn't work? / Bring it back." (it was "Changed your mind?" for a day: the owner didn't want to sell "any reason", so the subline states it plainly); the Spanish line is the same small line on all three.
- **Layout, first pass:** every slot kept its place and size; only words changed, plus template hooks for deliberate line breaks (`c3_lines`, `inst_lines`, `guest_no`) and poster 3's title moved into the copy (`w_h1`).
- **Layout, after the wall critique:** poster 1 lost the phone and gained the Thrift+ card, its 1-2-3 cards became full-width rows; poster 2 got the phone (the glove in its viewfinder), the stacked cards and the one big number (section 4).
- **Fixes after looking at the wall:** card 1 to one line; card 3 as two lines; the Redeem tile as two lines; the band's figures "3 days | 80% | Credit" ("Any reason" wrapped, "Easy" oversold it); the returns row to one line.
- **QA added:** `too_many_lines` and `widows` (tools/qa.js). The banned-word list now catches the retired words; it also turned out the old "earn" and "automatic" checks had been silently broken by backspace characters since 10-09 (fixed).
- **Open:** the phone on poster 2 shows today's app (the "Card covered" tile, nothing under the camera); retake it after the main session ships the reworked scanner (`node workspace/posters2/tools/scanner_shot.mjs art/R/out/scanner_shot_glove.png <code> 9000 1.25 0.58 0.6` with `art/R/out/shelf_glove.jpg` as the camera; now 4x pixels, so set the image's `data-dpi-min` back to 250), recheck how much of the screen to show (`clip` in F-P2), then write the print files (print/v4). Poster 1's card front waits for the owner's photo of the stock card.

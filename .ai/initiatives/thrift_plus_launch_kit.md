<!-- Last updated: 2026-09-30 (working page published) -->
# Thrift+ launch kit (drafts for the owner)

**Working page (2026-09-30):** https://claude.ai/artifact/WzPhon6EJvA2S7XLk8M3oZ is where the owner ticks the checklist, approves or comments on each draft and answers questions. Status, notes, approvals and questions live in that page's database (collections `tasks`, `drafts`, `questions`); read them with the `ArtifactData` tool, and write status or new questions there too. This file keeps the draft text as the source. If a draft changes here, republish the page so the two match.

Phase 5 of [`thrift_plus_rewards`](./thrift_plus_rewards.md). Claude drafts; the owner approves. Review is planned for Thu 10-08; print and train 10-09 to 10-13; launch Tue 10-20.

**House rules for every word here:**
- Never say fee, dues, unlock, cash back, points, bonus or clawback.
- No percentages and no schedules on posters. The schedule is never published.
- The register opener is **"Do you have a card yet?"** Non-members are **guests**.
- Plain words, short lines, no em or en dashes.
- **Wherever rewards, banked rewards or store credit are described, say "no cash value"** (owner, 2026-09-30: always, everywhere). The current drafts do not say it yet.

---

## 1. Posters (13 × 19, three of them)

### Poster A: Join
- **Headline:** The longer it waits, the less you pay.
- **Sub:** With a free Thrift+ card, the price of almost everything in the store drops the longer it sits. Guests pay the tag.
- **How:** Ask at any register. It takes a minute. Bring a photo ID to shop our 18+ items and to make returns.
- **Small print:** Free to join. Nothing to pay, ever. The first $10 of rewards each month covers your card.
- **Visual:** the card, and a phone scanning a tag.

### Poster B: Guest price vs member price
- **Headline:** Every tag has a member price.
- **Sub:** Scan any tag with your phone at **ecothrift.us/scan** to see what you'd earn today.
- **Two columns:**
  - **Guest:** pays the tag.
  - **Member:** pays less, and more the longer it waits. Take it off today, or bank it for later.
- **Visual:** a tag with "You'd earn +$X" beside it (the scanner card's look).

### Poster C: Returns (members only)

> **Superseded 2026-10-01.** The owner chose defect-only returns done as a labeled **Thrift+ Limited Warranty**. Use the poster, receipt and AS IS sign text in [`extended/thrift-plus-limited-warranty.md`](../extended/thrift-plus-limited-warranty.md). The draft below is kept for history only.

- **Headline:** If it doesn't work, bring it back.
- **Sub:** Thrift+ members can return an item whose main job doesn't work, within 3 days, for store credit.
- **The fine print, in plain words:**
  - Members only, for things bought with your card.
  - The main job has to fail. Scratches, small missing parts and changed minds don't count.
  - 3 days from the sale. If we're closed on day 3, the next day we're open.
  - Store credit for most of what you paid, before tax. Test it in the store and you'll never need to.
  - The exact terms (95%, the day count) go on the receipt and the website, not on the poster. **Owner:** the returns terms must be posted somewhere; is "most of what you paid" on the poster enough?
  - Final sale: as-is, for parts, untested, clothing and soft goods, 18+ items, crossbows.
  - Guests: all sales final.

## 2. Receipt copy

**Member receipt** (the print server already prints this block after payment):

```
THRIFT+ MEMBER Ana (card ...0008)
 Lamp tag $90.00                          $87.00
Rewards this trip                         $13.00
  Toward this month's cover               $10.00
  Off your price today                     $3.00
Cover October: $10.00 of $10.00
Banked balance                             $0.00
Store credit balance                       $0.00
Members: items that don't work can come back
within 3 days for store credit.
```

**Guest receipt:**
- Over $10 in rewards: `No Thrift+ card today. You lost $X` (rewards less the $10 cover), then `Ask for a free Thrift+ card.`
- Under $10: `This trip would have earned $X`.

**The policy lines** printed today say "ALL SALES FINAL. No refunds or exchanges." **Proposal:**
- Guest receipts keep them.
- Member receipts replace them with "Members: 3 day returns for items that don't work, as store credit. See the returns sign."
- Needs a print-server change: the receipt data already says whether it's a member sale.

"Cover" is the word the system uses. Does it work for customers, or would "Card this month: $10 of $10" read better?

## 3. Staff training (one page, for the register)

**Every customer, every time:** "Do you have a card yet?"

**They have a card:**
1. Scan it in the same box as tags, before or after the items.
2. **Look at the photo on screen.** It has to be the person paying. If it isn't, it's not their card: ring them as a guest.
3. The panel shows the phone app's answer if they gave one. Ask: "**Would you like to bank your rewards, or take them off today?**" Tap Rebate now or Bank. It's their responsibility to tell you.
4. If they have store credit or banked rewards, tap **Use credit** and put in what they want to use.
5. Finish the sale as usual. The screen shows what's due after their credit.

**They don't have a card:** "It's free, takes a minute, and today's items would save you $X." (The panel shows it.)

**Signing up** (tap **Thrift+ sign up**):
1. Look at their photo ID: the name must match. If it shows 18 or older, tick the 18+ box.
   - **Never scan or photograph the ID.**
2. Take their photo.
3. Enter a phone number. It's how they sign in with the card, and how we find them.
4. Scan a blank card. It goes on the sale on screen.
5. No ID with them? They still get a card. It earns rewards, but it can't return items or buy 18+ items until an ID is checked.

**They paid, then signed up** (within 30 minutes): tap **Re-ring with a card**, then scan the new card. Their rebate goes on as store credit.

**18+ items:** the register won't take them without a card verified 18+. Adult items must have the maker's seal. If the seal is broken, the item goes in the trash, not back on the floor.

**Returns** (tap **Thrift+ member return**):
1. Scan their card.
2. Pick the item from their recent purchases. The screen says if it can't come back, and why.
3. **Ask what doesn't work.** It has to be its main job. Tick the box and type what they said.
4. Give the store credit. Put the item in the returns bin. A manager decides what happens to it (Thrift+ → Register tab).

**Things to never say:** fee, dues, unlock, cash back, points, bonus, clawback. Don't explain how fast prices drop: "the longer it waits, the less members pay" is all we say.

**$100 and up:** the panel asks for a photo of the serial number and condition when a member buys it. Take it; it settles returns.

## 4. Marketing copy

**Social (launch day):**
> Thrift+ is here. A free card that makes our prices drop the longer things sit on the floor. Guests pay the tag; members pay less. Scan any tag at ecothrift.us/scan to see what you'd earn. Ask at the register.

**Social (the week after):**
> That lamp you've been eyeing? If you're a Thrift+ member, it's cheaper today than when it came in. Free card, one minute at the register.

**Website blurb (Visit page):**
> **Thrift+ is our free membership.** Members pay less the longer an item has been in the store. You can take your savings off today or bank them for a bigger trip. Members can also bring back things that don't work, within 3 days, for store credit. Sign up at any register with a photo ID.

**Email (to existing customers, if the owner wants it):**
- **Subject:** Our prices now drop the longer things wait
- **Body:** Thrift+ is a free card for Eco-Thrift regulars. The longer an item sits, the less members pay for it. Take the savings today or bank them for later. Stop by any register; it takes a minute.

## 5. Launch checklist (Phase 5, owner and Claude)

**Settings and data:**
- [ ] Rewards for stock already on the floor: the owner's one-time call (10-13). The tools are the start setting, the reset request, and a manual tool if wanted.
- [ ] Scheduler jobs: `assign_reward_families --limit 200` (05:30 UTC), `recompute_rewards` (06:00 UTC), `build_daily_brief` (morning). *(09-30: all three commands exist; Heroku Scheduler entries are the owner's step.)*

**Print:**
- [ ] Print server 1.9.0 built and installed on every register (the Thrift+ receipt block, and the member policy lines if approved). *(09-30: code and `printserver/CHANGELOG.md` ready; `VERSION` is still 1.8.0 and is bumped by `ship-print-server.md` at release. Member and guest receipts render correctly: fixtures `printserver/fixtures/receipt_thriftplus_{member,guest}.json`. Open nit: the "Rewards this trip" row prints in a much larger font than its neighbours; owner to judge.)*
- [ ] Card backs printed from Dash (Thrift+ → Card batches), and the blanks loaded.
- [ ] Posters printed (13 × 19) and hung: join at the door, member price at the aisles, returns at the registers.

**People and gear:**
- [ ] Staff trained on the one-pager (10-13); the dry run with test cards on the test register (10-12).
- [ ] A photo camera at each register.
- [ ] The phone screens (scanner reset link, login setup, portal) shipped by `thrift_scanner`. *(09-30: the scanner's real-API swap is still waiting; its inbox note from 09-25 is unanswered.)*

**Switch on:**
- *(09-30: Thrift+ suite GREEN: 57 server tests, 8 front-end test files.)*
- [ ] 10-20: switch on (`thrift_plus_enabled`), and clear `thrift_plus_test_registers`.
- [ ] Watch the morning brief and the Thrift+ Overview for the first week.

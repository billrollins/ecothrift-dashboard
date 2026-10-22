<!-- initiative: slug=retail-tags-and-social status=active updated=2026-10-21 -->
<!-- Last updated: 2026-10-21 -->

# Initiative: Retail tags and Social Studio (Lane F)

**Status:** **Active** — Phase 1. Planned 2026-10-21; runs as **Lane F** beside Lanes A–E. Each phase ships on its own.

**Objective:** Retail stops putting bad tags in front of customers, and Retail turns out a strong social post every open day without a marketing budget. Today a wrong or inflated tag is a tally on the PR cart that nobody traces back, and Facebook posts are ad hoc and flat. After this, a bad tag is scanned, traced to who processed it and which truck, and fixed; and a Retail person opens **Studios → Social Studio**, gets today's post idea from real store data, shoots real photos, posts in a few taps, and logs how it did, so the owner can see which posts move sales.

**Compass:** this file is not the compass; `thrift_plus_rewards` and the calendar stay the compass.

**Why now (prod, read-only, 2026-10-21):** sales are limited by shoppers, not stock. Ticket size is steady at about $39 and tickets are flat at 260–350 a week since August, while the floor grew to about 35,000 items. Labor Day week (only 10% off) did $15,300 against about $9,000 for the weeks around it. Thrift+ has 120 members, 42% of the 10-17 Saturday tickets. Free reach (posts, more channels, member messages) is the cheapest lever; tags that lie undo it.

---

## Finish line

1. A cashier or section owner scans a bad tag, picks why (retail overstated, wrong item, wrong price, missing), and the item lands on the PR Fix-it list; Retail QA shows tag errors per week by processor and by truck.
2. A Retail person on a phone opens Social Studio, sees today's slot and an idea built from the store's data, takes the photos, gets a branded post that passes the "always include" list, copies it to Facebook, pastes the link, and later enters its numbers.
3. The owner sees, on the Owner page, the week's posts, the hits, marketing spend, and a rough read of which post types and categories lined up with more tickets.

---

## Out of scope

- Paid ad management inside Dash (Meta Ads Manager stays where it is). Dash only records spend.
- AI-made product photos. AI art only for backgrounds or graphics that read as real; products are always real photos.
- Creating social accounts or Meta developer apps. The owner does those; Dash takes the page link or token he provides.
- Texts to members (held in `apps/texting` until the Twilio campaign clears).
- Repricing rules. Phase 1 fixes the retail figure and the item match, not the price formula.

---

## Owner calls (defaults used unless he says otherwise)

| # | Question | Default |
|---|----------|---------|
| F1 | Retail on tags | Print "Retail" only when it passed the check (F-1c); otherwise the tag shows no retail. Setting: always / only checked / never. |
| F2 | Posts a week | 5, one per open day (Tue–Sat), plus a scheduled one for the closed days. |
| F3 | Marketing spend | $0 to start; the ledger is there so a small boost test (for example $5/day on the week's best post) can be judged later. |
| F4 | New channels | Instagram (same Meta login) and Google Business Profile first; Nextdoor next; TikTok when there is video. The owner creates or claims each one. |
| F5 | Posting | Copy and paste from Studio first. Direct posting through the Meta API only after the owner makes the Meta app and page token. |

---

## Phases

### Phase 1 — Tag truth
A bad tag is caught, traced and fixed, and inflated retail stops being printed.
**Gated by:** none.

Acceptance:
- [ ] **Bad tag scan.** From a section check, a cross-check, the register, or Today (on demand), staff scan an item and pick a reason: retail overstated, wrong item, wrong price, tag missing or unreadable (EN/ES). One record per item with who found it and an optional photo. The item goes on PR Fix-it. Replaces the bare "Tag incorrect" tally in the PR cart group (`apps/routines/taxonomy.py`), which stays as the count.
- [ ] **Traced back.** Each bad tag shows who checked it in, the PO and the manifest row. Retail QA gets a weekly Tag errors panel by processor and by truck; Processing sees its own list.
- [ ] **Retail check at check-in.** When a manifest unit retail is far above what that product usually carries (median across its items and sales) or more than a set multiple of the tag price, the processor confirms or fixes it before the tag prints. Thresholds are Settings keys.
- [ ] **Tag shows retail per F1.** The label prints retail only as F1 says; existing tags are untouched.
- [ ] **Fresh-tag spot check.** A daily Retail routine (open days): 10 items checked in on the last open day, picked at random. For each: matches the item, retail believable, price right. Misses become bad-tag records. It scores into Retail QA like other routines.
- [ ] Data note: name the register IDs for retail and item match, and flag (not drop) items whose retail came from a guess.

### Phase 2 — Social Studio (manual first)
Retail can make and post a good post every open day from one screen.
**Gated by:** none (can run beside Phase 1).

Acceptance:
- [ ] **Studios → Social Studio** (`/studios/social`, nav group `studios` in `slotCNavLayout.ts`), new app `apps/marketing`. Phone-first for the poster, desk view for the owner.
- [ ] **Week calendar** with the cadence below: one slot per open day, each with a post type and a category from the rotation. Slots can be swapped.
- [ ] **Post editor:** take or upload real photos, pick a brand frame (vector: logo, hours from `online_sales.hours`, address, Thrift+ line; brand green per `extended/brand.md`), write the text. Sizes for Facebook now (1:1, 4:5).
- [ ] **Always-include check** before a post can be marked Ready (list below). Missing pieces are named.
- [ ] **Post it:** one tap copies the text and saves the framed photos to the phone; paste the Facebook link to mark Posted.
- [ ] **Today's post routine** for Retail on open days, due late morning, done when the post is marked Posted. The owner can rate a post 1–5 on the Owner page; that is the quality bar.

### Phase 3 — Post helper AI
Studio suggests what to post from what is happening in the store.
**Gated by:** Phase 2.
Ideas from: **New in** (last open days' check-ins, best items by tag and category, with a shot list); **Coming soon** (won B-Stock loads and POs with `expected_delivery`); **Sale or event** (sale settings, holidays, Thrift+ member perks); **Push** (overstock and slow categories from Thrift+ → Overstock); **Season** (Halloween to 10-31, toys and gifts Nov–Dec). Drafts text in the house voice; xAI only for backgrounds or graphics. Detail when Phase 2 is built.

### Phase 4 — Numbers and what moves the needle
Every post gets its numbers, spend is logged, and the owner sees what works.
**Gated by:** Phase 2.
Post numbers at 1 day and 7 days (reach, reactions, comments, shares, messages, link clicks): typed in at first, pulled from Meta when F5 is done. Spend ledger (boosts, print, events). Hits list by post type and category. Rough read of posts against tickets and sales by weekday baseline, and category sales after a spotlight, with sample sizes shown. Weekly card on the Owner page. Detail when Phase 2 is built.

### Phase 5 — More channels
The same post goes out on Instagram and Google Business Profile, then Nextdoor and TikTok.
**Gated by:** Phase 2, and the owner opening the accounts (F4).
Per-channel text and sizes (9:16 for stories and reels), a Posted link per channel, numbers per channel. Direct posting via the Meta API if F5 is done. Detail when Phase 2 is built.

---

## Cadence (starting point; Phase 4 tunes it)

| Day | Slot | Example |
|-----|------|---------|
| Tue | **New this week** | 4–8 real photos of the best new stock |
| Wed | **Category spotlight** | from the rotation |
| Thu | **Coming soon / behind the scenes** | a truck being unloaded, what is being processed |
| Fri | **Weekend pick + Thrift+** | one standout item and how members earn ThriftBucks |
| Sat | **Live from the floor** | quick story or reel |
| Sun–Mon (closed) | **Scheduled** | the week's best, "open Tuesday" |

**Category rotation:** weighted by stock on the floor, season and sell rate; no category twice in two weeks unless it is in season. October 2026 data: toys 4,300 on the floor with 4,100 just processed (weight up Nov–Dec); health and beauty and kitchen sell fastest; apparel is the slowest (about 8% a month) and needs a push.

## Always include

1. Real photos: bright, item fills the frame, 3 or more.
2. One hook line: what it is and why now.
3. Where and when: address and hours.
4. The Thrift+ line.
5. A call to action: come in, message us, or ask for a hold.
6. The brand frame.

Never: money imagery, AI-made products, a retail figure that failed the check, more words than the frame holds (the owner's poster taste; print pipeline in [`reference/thrift-plus-posters`](../reference/thrift-plus-posters)).

---

## Acceptance

- [ ] Phase 1 acceptance above
- [ ] Phase 2 acceptance above
- [ ] Out-of-scope items stay out

---

## Record

**2026-10-21 — Opened.** Owner asked for better tag quality control in Retail routines and a routine, high-quality social posting suite in a Studios page; planned as Lane F.

**2026-10-21 — Phase 1 built** (`lane/f-tag-truth`): retail check at check-in (thresholds from prod: 99% of tags under 5.1x retail; flag over 6x the tag or 2x the product's usual), retail on tags per F1 (needs a print-server release for the line), bad-tag scan from Today / section walks / register traced to processor, PO, manifest row and pallet, on PR Fix-it, Tag errors page and Retail QA badge, daily fresh-tag check scored in Do. Phase 2 built beside it (`lane/f-social-studio`), photos as a shared library per the owner's 10-21 design note.

---

## See also

- Index: [`_index.md`](./_index.md)
- Retail QA and routines: [`extended/routines.md`](../extended/routines.md)
- Listing Studio's Facebook fields (`WebListing.fb_*`, `ChannelPublication`): [`extended/frontend.md`](../extended/frontend.md)
- Thrift+ rules (member perks wording): [`extended/thrift-plus-decisions.md`](../extended/thrift-plus-decisions.md)

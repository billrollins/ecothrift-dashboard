<!-- initiative: slug=retail-tags-and-social status=active updated=2026-10-22 -->
<!-- Last updated: 2026-10-22 -->

# Initiative: Retail tags and Social Studio (Lane F)

**Status:** **Active** — Phases 1 and 2 live (v2.207.0; retail on tags with print server 1.9.9, v2.207.1). Phase 3 onward redesigned with the owner 2026-10-22 (see Record). Runs as **Lane F** beside Lanes A–E. Each phase ships on its own.

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
| F6 | Photo look (owner 10-22) | **Photo overlays, not templates.** Each product photo carries its own tag overlay (price, AS IS or Thrift+ 3-day return, retail only when it passed the check, ThriftBucks), drawn from the item's data after a tag scan. Rulebook words only. |
| F7 | The app (owner 10-22) | Social Studio installs on a phone as its own home-screen app, like Thrift+ Staff, with a bar of buttons at the bottom. Scan a tag opens the camera the way the scanner does. |

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

### Phase 3 — Social Studio app, tag scan and photo overlays (F6, F7)
Staff take photos all week on a phone, scan the tag, and every product photo carries its price and terms.
**Gated by:** Phase 2.

Acceptance:
- [ ] **Installable app** like Thrift+ Staff: its own manifest, scope and icons, staff sign-in. A bar at the bottom: **Post** (today's post), **Photos**, **Scan**, **Schedule** (the week), **Me**. Tabs switch in place. The desk keeps `/studios/social` in Dash with the same pages.
- [ ] **Scan a tag** opens the camera the way the scanner does (`useQrCamera`); typing or searching the SKU works too. The item comes from the same item card the member scanner shows (`/api/thriftplus/staff-tag/<sku>/`), so price, retail (only when checked), ThriftBucks and AS IS / 3-day return match the floor.
- [ ] **Photo editing** reuses the online sales editor (crop, rotate, straighten).
- [ ] **Tag overlay** on a product photo from its SKU: tag price, AS IS or Thrift+ 3-day return, retail when it passed the check, the member's ThriftBucks. Rulebook words (no "$" beside ThriftBucks, "cheaper" only beside "Thrift+ members"). Scene photos (a truck, an aisle) carry no overlay. A small store mark only.
- [ ] The fixed frames (single, photo + 3, 2 x 2, brand bar) are retired; the Always-include check drops "every spot filled" and asks for a tag overlay on product photos.
- [ ] Desk and phone layouts both checked.

### Phase 4 — Post ideas AI and the posting drawer
Studio does the heavy lifting: what to post, the words, and the photos.
**Gated by:** Phase 3.

Acceptance:
- [ ] **3 to 5 post ideas** for the day from the cadence and the store's data: new in, the floor, loads coming (POs with `expected_delivery`, B-Stock wins), being processed, sales and hours changes, the season, overstock (Thrift+ → Overstock), and **the photos staff took this week** (with their items). Each idea has a hook, the words, and which photos to use. Pick one and it fills the post.
- [ ] **Fast rewrite** buttons on the hook and the words (new hook, shorter, another take), back in a few seconds on a fast, low-cost model chosen in Settings > AI (purpose `SOCIAL_POST`). Every call in AI spend.
- [ ] **Never** in AI words: invented items, prices or dates, retail claims, Thrift+ terms beyond the set line, web addresses, the rulebook's never-say words.
- [ ] **Posting drawer:** one tap copies the text; on a phone every photo goes to the share sheet in one tap (then the Facebook or Instagram app); on a desk a drawer of the photos to drag or download.
- [ ] The first-cut morning draft (`lane/f-post-helper`, never shipped) is folded in or dropped.

### Phase 5 — Numbers and what moves the needle
Every post gets its numbers, spend is logged, and the owner sees what works.
**Gated by:** Phase 2.
Post numbers at 1 day and 7 days (reach, reactions, comments, shares, messages, link clicks): typed in at first, pulled from Meta when F5 is done. Spend ledger (boosts, print, events). Hits list by post type and category. Rough read of posts against tickets and sales by weekday baseline, and category sales after a spotlight, with sample sizes shown. Weekly card on the Owner page (`apps/core/services/owner_page.py`).

### Phase 6 — More channels
The same work goes out on each channel in the shape that channel likes (see Channels).
**Gated by:** Phase 4, and the owner opening the accounts (F4).
Per-channel words and sizes (9:16 for Reels, Stories and TikTok), a Posted link per channel, numbers per channel. Direct posting through the Meta API (Facebook and Instagram) once the owner makes the Meta app (F5).

---

## Channels (owner 2026-10-22: where to be and what works)

| Channel | Why | A good post | How it grows | Owner step |
|---------|-----|-------------|--------------|------------|
| Facebook | Have it | Mostly photos, each product with its tag; short text with the items and prices | One post a day; share into local Omaha buy/sell and thrift groups; answer every comment and message fast | — |
| Instagram | Same Meta login | 4:5 swipe set, best photo first; Reels of new stock | Reels, Omaha location tag, a few local tags | Link it to the Facebook page in Business Suite |
| Google Business Profile | "Thrift store near me" | One photo, two lines, a Visit button | A post and photos every week; ask for reviews at the register (QR) | Claim and verify the profile |
| TikTok | Pallet and thrift-find videos are a big format | 15–30 s vertical video, price on screen | Truck unloads, "$X find" clips | Open the account |
| Nextdoor | Neighbors | One deal or new-stock post a week | Neighbors recommend the business | Open a business page |

---

## Cadence (starting point; Phase 5 tunes it)

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

**2026-10-22 — Phases 1 and 2 live** (v2.207.0; retail line on tags with print server 1.9.9 in v2.207.1).

**2026-10-22 — Phase 3 onward redesigned with the owner.** He approved a first cut (one AI draft each morning plus a New idea button), then set the real direction: photo overlays from a tag scan instead of fixed templates (F6), an installable app with a bottom bar and the scanner's camera (F7), 3 to 5 AI post ideas plus fast rewrites that use the week's photos, a posting drawer, and a channel list (Channels). The first cut stays unshipped on `lane/f-post-helper` and is folded into Phase 4. Phases renumbered: numbers are Phase 5, more channels Phase 6.

**2026-10-22 — Phase 3 built** (`lane/f-social-app`): the Social Studio phone app at `/social` (Post, Photos, Scan, Schedule, Me), tag scan with the scanner's camera, photo overlays from the item's data (retail only when checked, Thrift+ 3-day returns or AS IS, today's ThriftBucks for members), the photo editor (crop, turn, light, tag corner), and the frames retired (also fixes the old frame's "earn ThriftBucks" wording, a never-say word). Found: the member scanner's card shows an unchecked retail (reported to the Mainline).

---

## See also

- Index: [`_index.md`](./_index.md)
- Retail QA and routines: [`extended/routines.md`](../extended/routines.md)
- Listing Studio's Facebook fields (`WebListing.fb_*`, `ChannelPublication`): [`extended/frontend.md`](../extended/frontend.md)
- Thrift+ rules (member perks wording): [`extended/thrift-plus-decisions.md`](../extended/thrift-plus-decisions.md)

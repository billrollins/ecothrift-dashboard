<!-- Last updated: 2026-10-10 (Monday's part built, not shipped) -->
# Thrift+ launch build plan (Bill, 2026-10-10)

The signed-policy build list ([`2026-10-10-thrift-plus-signed-policy-build-list.md`](2026-10-10-thrift-plus-signed-policy-build-list.md)) plus Bill's additions of 10-10: one login for staff, Thrift+ and customers; real testing (staff in the scanner, a training register); one finish-at-register screen; and the member screen at card scan. Launch is Tue 10-20; all work done by Thu 10-15. Each part ships alone as soon as it is tested (Thrift+ stays off for customers until launch). POS must never break: every register change runs the full register tests first.

## 1. Accounts: one login, three hats

**Bill's ask:** staff, Thrift+ and customers combined; every account is a Thrift+ account; staff use their staff login in the scanner.

**Recommendation: link, don't merge the tables.** One email and password works everywhere, but the staff record (Dash permissions, payroll, HR) and the member record (photo, cards, rewards) stay separate rows joined 1 to 1. Merging them into one table would let a customer session reach staff powers if one check were missed, and it is a large migration in launch week. Linking gives the same "one login" to the person with no new risk.

- **Staff sign in to the scanner with their Dash email and password.** The first time, their Thrift+ membership is made automatically and linked (`Account.staff_user`, already there). Staff pay no cover (already built).
- **Every customer account is Thrift+.** The online Holds sign-up and Thrift+ joining become one sign-up (`/join`). Existing online accounts become members the first time they sign in (no card until they finish at a register). The old customer table (`CustomerProfile`) is retired after launch (standards T62).
- **Dash: "Make member" on a staff person** for the rare case someone needs it by hand.

## 2. Testing before it is live

- **Staff test mode in the scanner:** a staff sign-in sees Thrift+ as if it were live (rewards, cart, Full/Instant, balance), even while the switch is off. No preview code needed.
- **Practice members:** "Make a practice member" in Dash creates a test member with a test card, marked practice and left out of every report (like hiring's practice run).
- **Training register:** a copy of the Terminal that looks and acts exactly as on launch day (Thrift+ on), with a huge always-on "TRAINING: NOT A REAL SALE" banner and a second full-screen "THIS IS JUST A TEST" warning at payment.
  - **What it doesn't touch:** a training sale changes nothing real. No item marked sold, no drawer cash, no sales totals, no rewards to real members, no card charge.
  - **The receipt:** prints "TRAINING".
  - **How it's marked:** training carts are flagged and left out of every report.

## 3. Finish at the register: one screen

The same screen whether the member started on their phone or not:
1. **Photo at the top:** taken on the register's camera, or the one from the phone (retake allowed).
2. **Details below:** name, phone, email. The cashier types them if the member didn't start on the phone; otherwise they are filled in.
3. **ID check:** the cashier ticks that the ID matched and shows 18+. Nothing from the ID is kept.
4. **"Does everything look right? If so, please sign."** The member signs on the screen. The signature and the time are kept with the terms version.
5. **The cashier scans a card:** the card's number is locked to the account, and the member can use it right away.

**Phone start (`/join`):** fill in what you can and take a photo. The register finds you by phone number, name or a code on your phone.

## 4. The member screen at card scan

Scanning a card at the register opens the same screen (photo first, for the ID match), plus a stats bar:
- visits, dollars spent, lifetime rewards and last visit;
- returns, and how often the member picks Instant vs Full;
- the Rewards Balance with the soonest use-by date, and Return $.

The cashier can then close it, or Add a person or Report a lost card.

## 5. The signed-policy list (by part)

- **Words everywhere (D):**
  - "Full reward" and "Instant reward" ("Instant is 80% of the Full reward"), with Full labelled "Default";
  - "collect", never "earn";
  - "covers your card", never "pays for";
  - never "bank".
- **Full and Instant (B1, B5):** Full is automatic. Instant happens only when the member tells the cashier; the register stops asking. A Full reward is usable from the day after the sale through day 30, then expires (the balance drops it). Return $ is used first automatically.
- **Warranty returns (C):**
  - 80% back as Thrift+ credit;
  - the member keeps 20% of the rewards the item collected;
  - settled on the return day;
  - a Return button in the register cart (fast trip and item lookup, no swaps);
  - $10 or less after the reward isn't covered (a setting);
  - Processing marks each item covered or not.
- **Owner-only approvals log (O1):** warranty exceptions and the like: who asked, who approved, when and why.
- **Reward engine (A):**
  - a 95% cap;
  - launch stock starts at a third of its age (max 45);
  - back stock age freezes and resets;
  - look-alike families collect nothing until the owner confirms them (alert, watch list, pace per 90 days, pause and break apart).
- **Website (E):**
  - **`/terms`:** from the poster session's wording in `.ai/reference/thrift-plus-terms/`. English with a Spanish toggle; a numbered chart linked to the sections; FAQ; live perks; Scanner and Join buttons with QR codes.
  - **Redirects:** `/thriftplus` goes to `/terms`; `/thriftplus/warranty` goes to `/terms#s8`. `/rewards` and `/card` go to `/join`.
  - **Footer:** links to the terms.
- **Scanner (F):** a Thrift+ popup with the basics, live perks and a link to the terms.
- **Receipts (G):** each line marked Limited Warranty or AS IS, the NO REFUNDS block, and the balance at the bottom.
- **Perks (H):** M1 online holds (live). M2 to M4 are planned (after launch).

## 6. Order (each ships alone)

| Day | Ships | Why first |
|---|---|---|
| Mon 10-12 | Training register (banner, payment warning, nothing real touched); staff test mode in the scanner; practice members; the words everywhere | Staff can practise all week on what launch day looks like |
| Tue 10-13 | Finish-at-register screen (photo, details, ID, sign, card scan); member screen with the stats bar; staff sign in to the scanner with their Dash login (membership made automatically) | Sign-up is the launch-day job at every register |
| Wed 10-14 | `/join` (phone start, shared with Holds; every customer account is Thrift+); `/terms` and the redirects; Full automatic and Instant on request, 30-day expiry, Return $ first | The posters' QR codes need `/join` and `/terms` |
| Thu 10-15 | Warranty returns (80% and 20%, Return button, $10 limit, settled on the return day) with the owner approvals log; reward engine rules (95% cap, launch age, back stock, families); receipts; a full regression run | Money rules last, after the training register is in use |
| After 10-20 | Retire the old customer table (T62); perks M2 to M4; the 4-hour idle sign-out (T69) | Not needed to open |

## 6a. Monday's part: built 10-10 (not shipped yet)

- **Training register:** register `TRAIN` ("Training register") is made by migration `pos 0035`; pick it in Device setup. Striped "TRAINING REGISTER: NOT A REAL SALE" banner; every payment stops at a full-screen "THIS IS JUST A TEST". Thrift+ acts live there even with the switch off. A practice sale is saved as status `training` with a `TRAIN-YYYYMMDD-NNN` receipt: no item sold, no drawer cash, no hold or consignment closed, no rewards, no payroll; the cash drawer doesn't pop. The receipt says TRAINING on the cashier and payment lines (no print-server release needed). Re-ring is off for practice sales.
- **Staff test mode:** with Thrift+ off, staff (Dash email) and practice members can sign in to `/scan` from "Staff sign in" on the Coming soon screen and use it as if live, under a yellow "Test mode" bar. Customers still get "Opens soon".
- **Practice members:** Dash → Thrift+ → Members → "Make a practice member" (555 phone, made-up card number, 18+). A sign-up on the training register makes a practice member too (typed name and photo kept, phone replaced by a 555 one, no email). A practice card is refused on a real register and for re-ring. Left out of the Thrift+ overview counts, the daily snapshot and the items' scan numbers.
- **The words (D):** scanner, register panel, sign-up and Dash say "Full reward (Default)" and "Instant reward", "collect", "covers your card", "Rewards Balance"; a copy test blocks "earn", "pays for", "Banked", "use now", "member price", "20% less" in the scanner. **Left for receipts day (G):** the print server's own lines ("Banked for later", "Banked balance"), which need a print-server release.

- **ThriftBucks (rulebook V8, Bill 10-10: "ThriftBuck is the word we are not using Rewards anymore"):** no switch. Scanner, register, Dash, server messages and the print-server receipt say ThriftBucks, with the TB mark before every ThriftBucks amount (dollars stay "$"). The mark lives in one file per place: `frontend/src/components/thriftplus/tbMarkPath.ts` (rebuild with `workspace/tb_path_gen.py`) and `TB_DEFINE` in the print server. The receipt change needs a print-server release ("ship print server").

## 7. Bill's answers (10-10)

1. **Accounts:** staff and customers stay separate records; **a Thrift+ member is the customer account** (no customer account that is not Thrift+). One login works for both when a person is both (linked).
2. **Training register:** **both**. Practice members, and staff may scan their own real card. Nothing is written either way.
3. **Photo:** the register's camera, **and a phone handoff**. The finish screen shows a QR code. Scanning it opens the same final form on a phone at `ecothrift.us/thriftplus/create?t=<one-time token>`: photo with the phone's camera, the details, and the signature, all on the phone. The token is random, short-lived and single-use, and it carries no account number. The register screen updates live, then the cashier scans the card.


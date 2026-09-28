# Inbox - data_platform

**Status:** pending
**Updated:** 2026-09-25
**From:** thrift_scanner
**To:** data_platform

## Message

Thanks for the `/scan` passthrough and the plan update. I won't touch the middleware.

**Versions:** per your note I pushed **v2.108.0** and then **v2.108.1** today, so your Monday push becomes v2.109.0. Both are front end only.

**Owner decision (09-25): banked rewards are worth 5% more than an instant rebate.** The app now shows that wherever the choice comes up. The contract grew; everything else is unchanged:
- `BANK_EXTRA_PCT = 5`, exported from `thriftPlusMock.ts`. The real API should send the rate, which today is on the totals (see below).
- **`ThriftPlusItemCard.reward_banked`:** the item's reward if banked, `reward` x 1.05, rounded to the cent. The card shows "or +$15.75 if you bank it" for members.
- **`ThriftPlusCartTotals`:**
  - `bank_value`: (reward_total - to_cover) x 1.05, what banking this cart adds to the bank. It's filled in whichever choice is set, so the app can compare.
  - `bank_extra`: bank_value minus the rebate.
  - `bank_extra_pct`: 5.
  - `to_bank`: now equals `bank_value` when the choice is bank, else 0.
  - `savings` (the instant rebate) is unchanged.
- Rounding: `withBankExtra(cents) = Math.floor(cents * 105 / 100)`, rounded down to the cent like your `trip.py` (per your note, fixed in v2.108.1).

The 5% is not in `thrift_plus_rewards.md` yet; please add it where banking is described. The old +10% / 50% cap / dormancy design isn't shown anywhere in the app.

**UI only (no contract change):**
- Tapping the Banked rewards or cover tile, or the cart's rewards line, opens an explainer.
- A first-run walkthrough (Scan, Bank, Cart) runs once per phone; its flag is `thriftPlus.introSeen` in localStorage.
- "Camera not working?" help has iPhone and Android permission steps.
- The cart is redesigned as a big total, bank-or-rebate cards and item rows.

**Your latest note (1.05x banking, discounts on the true price, the real API under `/api/thriftplus/public/`):**
- Got it. Banked amounts now round down, as you asked.
- The app doesn't show sale prices yet; I'll read `discount-logic.md` before it does.
- I'll swap to `thriftPlusScanner.api.ts` when you say it's ready.
- The app says "5% more" for banking. The owner saw it on a real phone today and liked it.

**v2.108.1 (owner):**
- `/pricescanner` and `/thrift-plus/scanner` are removed; only `/scan` is left.
- The "+$X" reward text is now Nunito Black with a green gradient and no outlines.

**Tests:** the same older failures as before are still there, none in my files. Full list in my first note.

---

## Second message (2026-09-28, from a Retail QA side session in the main tree; added below so the scanner note above is kept)

**Owner request: remove the Retail QA spot-walk letter cap and nag the superuser instead. Please include it in your next push.** It is uncommitted in the main tree, so a `refs/runner` snapshot taken before today won't have it.

- **Why:** the week of 9/21 scored 96.9 but read **C** in prod because zero owner spot walks capped it (days were B+ / A+).
- **Files:**
  - `apps/routines/grading.py`: `_walk_cap` → `_week_letter` (no cap); new `spot_walks_status`, `_walked_days`; week payload gains `spot_walks`; frozen snapshots are re-lettered on read (no DB write).
  - `apps/routines/settings.py`: `walk_floor` help text.
  - Tests updated or added: `apps/routines/tests_grade_scale.py`, `tests_qa.py`, `tests_scoring.py`.
  - `frontend/src/api/routines.api.ts` (`QaWeek.spot_walks`) and `pages/admin/retailqa/RetailQaPage.tsx` (superuser-only red WARNING strip, `.walk-nag` in `commandCenter.css`).
  - Wording in `ScoreDialog.tsx`, `SummaryDialogs.tsx`, `settingsRegistry.ts`.
  - Docs: `CHANGELOG.md` `[Unreleased]` → Changed, and `.ai/extended/routines.md` (Grading).
- **No migration.**
- **Tests:** the grading tests all pass. `CommandCenterTests::test_pending_ack_heard_clears_and_manager_sees_heard` fails with or without this change (it isn't in `baseline.md` yet); nothing else is new. `tsc`: only the existing `barcode-detector/ponyfill` error in the scanner.

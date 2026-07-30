<!-- Last updated: 2026-07-30T18:20:00-05:00 -->
# Overnight Online Sales MVP — Work Log

Branch: `online-sales-mvp`  
Executor: overnight agent  
Reviewer tomorrow: Opus

---

## DECISIONS NEEDED FROM BILL

*(most important first — keep this section current)*

- G9: transactional provider vs `retail@` M365 SMTP for sending (default: provider).
- G2–G6, G8: remaining open gates — overnight implements recommended defaults behind settings.
- Confirm `retail@ecothrift.us` is the monitored Reply-To mailbox for customer replies.
- When to flip `ONLINE_SALES_ENABLED=true` in production (after Phase 1 round-trip + seed listings).

---

## WHERE I STOPPED

- Last completed: *(none yet — A1 in progress)*
- Half-done: —
- Check first: this log + `git log --oneline online-sales-mvp`

---

## FINDINGS

*(every real bug or surprise, fixed or not)*

---

## Stage items

### A1 — Branch and log scaffold — DONE — 2026-07-30T18:20:00-05:00

- **Status:** DONE
- **Files added:** `.ai/reference/online_sales_mvp/overnight_log.md`
- **Files changed:** (branch created from main with prior session initiative docs uncommitted)
- **Decisions:** Created branch `online-sales-mvp`. Prior session left uncommitted initiative/context/index edits on main; they travel with this branch.
- **Commands:** `git checkout -b online-sales-mvp`
- **Known issues:** none
- **Questions for Opus:** none

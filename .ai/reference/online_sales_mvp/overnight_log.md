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

- Last completed: C1
- Half-done: —
- Check first: C2 Messages frontend

---

## FINDINGS

- `ScopedRateThrottle` ignores class-level `scope` and requires `view.throttle_scope`; for `@api_view` function views we used a `SimpleRateThrottle` subclass with `get_cache_key` instead.
- Forgot-password token disclosure was a live staff account-takeover path (confirmed, now fixed).
- `setWebOrderStatus` calls nonexistent `POST …/orders/{id}/set-status/` (also hooked in useWebStore).
- Kill switch only gates `POST holds/`; catalog/images stay live (A4 must expand).
- `expire_due_reservations` has zero callers — reserved qty can leak.

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

### A2 — Auth hardening — DONE — 2026-07-30T18:45:00-05:00

- **Status:** DONE
- **Files changed:** `apps/accounts/views.py`, `ecothrift/settings.py`
- **Files added:** `apps/accounts/tests/__init__.py`, `apps/accounts/tests/test_auth_hardening.py`
- **Decisions:** Email reset token via `send_mail` (fail_silently); echo `reset_token` only when `DEBUG`; refresh cookie `secure=not settings.DEBUG`; throttle scopes `auth_login` 30/min, `auth_forgot_password` 10/hour using `_FixedScopeThrottle` (not ScopedRateThrottle).
- **Commands:** `python manage.py test apps.accounts.tests.test_auth_hardening` → **8 OK**
- **Known issues:** none
- **Questions for Opus:** none
- **Verification note:** Running focused suite after each item; full webstore+accounts+pos+builds at stage boundaries / H5 (full migrate+test is ~35s each).

### A3 — Four read-only audits — DONE — 2026-07-30T18:50:00-05:00

- **Status:** DONE
- **Files added:** `audit_api_contract.md`, `audit_quantity.md`, `audit_pii.md`, `audit_killswitch.md`
- **Decisions:** Hold-status by token left ungated when flag false (existing customer links still work). Catalog gating recommended for A4.
- **Commands:** read-only greps/reads — no tests
- **Known issues:** documented in FINDINGS above
- **Questions for Opus:** Prefer 410 vs empty catalog when flag off?

### A4 — Backend hygiene + kill switch — DONE — 2026-07-30T19:10:00-05:00

- **Status:** DONE
- **Files added:** `expire_online_holds.py`, `seed_online_sales_hours.py`
- **Files changed:** `views.py` (config + catalog/detail/categories 410), `urls.py`, `admin.py` (Reservation), `settings.py` (drop dead WEBSTORE_ tax/ship; add INQUIRIES/ACCOUNTS flags), `development.md`, FE remove `setWebOrderStatus`, WebOrdersPage legacy status UI retired
- **Decisions:** Catalog gated with 410 `ONLINE_SALES_DISABLED` (same family as holds). Hold status by token still open. Settings flags for inquiries/accounts default True for later phases.
- **Commands:** `test apps.webstore.tests.test_holds_hard_controls apps.accounts.tests.test_auth_hardening` → **23 OK**
- **Known issues:** `listing_image` still ungated when flag off (noted in kill-switch audit)
- **Questions for Opus:** none

### B1 — Staff workspace and routes — DONE — 2026-07-30T18:25:00-05:00

- **Status:** DONE
- **Files changed:** `frontend/src/navigation/slotCNavLayout.ts`, `frontend/src/App.tsx`
- **Decisions:** Four nav items (queue/listings/inbox/sales); Marketing routed but not in SLOT_C_NAV_GROUPS; legacy `/admin/web-store` → listings, `/admin/web-orders` → inbox.
- **Commands:** `cd frontend && npm run build` → OK
- **Known issues:** none
- **Questions for Opus:** none

### B2 — Render tests for six pages — DONE — 2026-07-30T18:30:00-05:00

- **Status:** DONE
- **Files added:** six `*.test.tsx` under `frontend/src/pages/online-sales/`
- **Files changed:** WorkQueue/Listings/Inbox/Sales/ListingStudio — small `isError` Alert paths
- **Decisions:** Stub `@mui/x-data-grid` like DeskTotalDeliveriesPage (CSS import breaks vitest)
- **Commands:** `npx vitest run src/pages/online-sales` → **18 OK**
- **Known issues:** none
- **Questions for Opus:** none

### B3 — Public storefront un-park — DONE — 2026-07-30T18:40:00-05:00

- **Status:** DONE
- **Files added:** `frontend-public/src/onlineSalesConfig.tsx`
- **Files changed:** App routes, Layout (Shop nav + Hold list + CartDrawer + conditional banner), api config fetch, Shop/PDP Reserved badge, CartDrawer copy
- **Decisions:** Shop/checkout gated on config; `hold/:token` stays open when flag off; `available <= 0` shows Reserved (G4 default)
- **Commands:** `cd frontend-public && npm run build` → OK
- **Known issues:** Shop still had some "cart"/checkout wording until B4 sweep
- **Questions for Opus:** none

### B4 — Policy copy guard — DONE — 2026-07-30T18:35:00-05:00

- **Status:** DONE
- **Files added:** `frontend/src/policy/publicStorefrontCopyGuard.test.ts` (scans sibling `frontend-public/src`)
- **Files changed:** Home/OrderConfirmation/CartDrawer/PDP/Checkout/HoldStatus/api copy + `POLICY_COPY_OK` markers
- **Decisions:** Allowlist covers negation prose + technical checkout identifiers (route/CSS/symbol); customer CTAs use hold language
- **Commands:** vitest policy + online-sales → **19 OK**; public build OK
- **Known issues:** none
- **Questions for Opus:** none

### C1 — Messages backend — DONE — 2026-07-30T18:50:00-05:00

- **Status:** DONE
- **Files added:** models Conversation/Message, migration `0004`, `services/conversations.py`, `tests/test_conversations.py`
- **Files changed:** reservations lifecycle system messages, views/urls/admin/serializers
- **Decisions:** Hold auto-opens thread; public thread on hold status (PII-minimal); `POST threads/<token>/messages/`; `POST catalog/<slug>/ask/` behind INQUIRIES flag; staff ConversationViewSet with reply/assign/resolve/reopen
- **Commands:** `test apps.webstore.tests.test_conversations` → **9 OK**
- **Known issues:** none
- **Questions for Opus:** none

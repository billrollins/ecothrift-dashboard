<!-- initiative: slug=staff-nav-redesign status=completed updated=2026-05-30 -->
<!-- Last updated: 2026-05-30 (Session 4 — Slot C winner + lifecycle workspaces) -->

# Initiative: Staff nav redesign (multi-variant bake-off)

**Status:** **Completed** (2026-05-30) — **Winner: Slot C workspace nav**, lifecycle workspaces shipped, bake-off switcher and losing variants removed.

**Goal:** Replace monolithic sidebar with a scalable workspace nav tuned for operational roles.

---

## Winner

**Slot C workspace sidebar** — pinned Essentials (Dashboard, Employees) + lifecycle workspaces:

1. **Buying** — Vendors, Auctions, Watchlist
2. **Processing** — full ingest pipeline
3. **Restoration** — TARS (placeholder)
4. **Floor** — Search items, Quick reprice
5. **Cashier** — Terminal, Transactions, Search items, Drawers, Cash Management
6. **Admin** (Manager/Admin) — Assumptions, POS setup, Users, Customers, Permissions, Settings

**Implementation:** [`frontend/src/components/layout/Sidebar.tsx`](../../frontend/src/components/layout/Sidebar.tsx) (252px), config in [`slotCNavLayout.ts`](../../frontend/src/navigation/slotCNavLayout.ts), shared catalog in [`navItemCatalog.ts`](../../frontend/src/navigation/navItemCatalog.ts).

**Collapse policy:** one workspace panel visible; active route auto-selects workspace; manual choice persists in `ecothrift.navC.workspace.v1`; **Alt+1..6** switches visible workspaces.

---

## Sessions

### Session 1 — 2026-05-30

Bake-off scaffold: shared nav module, Classic/Composer variants, Admin switcher.

### Session 2 — 2026-05-30

Slot B quick-nav variant (filter-first + single-open accordion).

### Session 3 — 2026-05-30

Slot C workspace variant (domain selector + one active panel).

### Session 4 — 2026-05-30 (winner rollout)

- [x] Lifecycle workspace taxonomy (Buying → Processing → Restoration → Floor → Cashier → Admin)
- [x] TARS placeholder route `/restoration/tars`
- [x] Slot C promoted to sole `Sidebar.tsx`; switcher + Classic/Composer/Slot B removed
- [x] `npm run build` green
- [x] Initiative archived

---

## Links

- Navigation README: [`frontend/src/navigation/README.md`](../../frontend/src/navigation/README.md)
- Prior cleanup: [`web_ui_cleanup.md`](./web_ui_cleanup.md)

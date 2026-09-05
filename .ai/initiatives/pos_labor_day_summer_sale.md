<!-- initiative: slug=pos-labor-day-summer-sale status=active updated=2026-09-05 -->
<!-- Last updated: 2026-09-05 — hours card polish v2.89.1 -->

# Initiative: POS Labor Day and Summer Sale → Customer-facing announcements and holiday hours

**Status:** **Active** — Phase 1 shipped **v2.88.0**. Phase 2 shipped **v2.89.0** (2026-09-05).

**Objective:** Run a store promotion end to end. Phase 1: cashiers ring it on POS Terminal. Phase 2: the owner tells customers about it (and about holiday hours) from Dash, on the public **www** site, without a developer.

**Compass:** this file is the compass.

---

## Finish line

- **Phase 1 (done):** A cashier on **POS Terminal** sees Labor Day identity when the sale is on, scanned merchandise is 10% off unless marked Summer (50%) or it is Assembly/Delivery (full price), can add Assembly at $35, and can toggle Labor Day off.
- **Phase 2:** From Dash, the owner creates an announcement (text, photos, dates), toggles it live, and it appears on **www.ecothrift.us** the same minute. The owner also enters holiday hours once, and every place the site shows hours (header, Visit, Home, hold expiry, status pill) says **Holiday hours** for those days and returns to normal hours after, with no manual cleanup.

---

## Out of scope

- Do not tag items as "summer" in inventory/backend (floor-marked; cashier selects on the cart).
- Do not change delivery fee amounts.
- Existing Discount (store credit / Google Review) stays as-is and stacks on sale `line_total`.
- Shelf tags / Quick Reprice.
- Announcements on the **staff** Dash home (Dash-internal notices). Phase 2 is customer-facing only.
- Google Business Profile API sync (write hours to Google). Manual copy for now; TBD later.
- Email/SMS blasts. Announcements are on-site only.

---

## Sale rules (Phase 1, shipped)

| Line | Labor Day ON | Labor Day OFF |
|------|--------------|---------------|
| Merchandise | 10% off | list price |
| Summer (cashier-marked) | 50% off | 50% off (stays) |
| Assembly | $35, no sale | $35, no sale |
| Delivery | existing $50 / $75, no sale | unchanged |

**Labor Day window (default ON):** first Monday of September through +5 days (Saturday). **2026:** Mon 2026-09-07 through Sat 2026-09-12. Toggle writes `override` only; calendar default survives.

---

## Phases

### Phase 1 — Sale terminal (shipped v2.88.0)

Terminal runs the sale rules above.

Acceptance:
- [x] Labor Day ON 2026-09-07 through 2026-09-12 unless toggled off
- [x] Merchandise 10%; Summer-marked 50%; Assembly and Delivery never discounted
- [x] Assembly button adds a $35 line
- [x] Terminal shows Labor Day sale identity; toggle overrides calendar
- [x] Summer stays 50% when Labor Day is off
- [x] Existing Discount stacks on sale prices

What shipped: `CartLine.sale_label` / `sale_percent` (`pos.0027`), `line_kind=assembly`, `apps/pos/services/sale_mode.py`, AppSetting `pos.labor_day_sale`, `GET/POST /api/pos/sale-mode/`, `add-assembly/`, `lines/<id>/sale/`, `sync-sale/`. Terminal: Labor Day chip + toggle, Assembly and Summer buttons, `SummerLinesDialog`, savings row. Receipts print effective price + ` (10% Labor Day)` / ` (50% Summer)`. `Item.sold_for` = effective price.

### Phase 2 — www announcements + holiday hours

**Gated by:** Phase 1 (done). Two CRUDs in Dash, both rendered on `frontend-public`.

#### 2A. Announcements CRUD (Dash → www)

**Where in Dash:** new page **Marketing → Announcements** (route TBD, e.g. `/marketing/announcements`). Permission TBD (owner/manager capability, reuse blog studio gate if it fits).

**Model `webstore.Announcement`** (new app or under `apps/webstore`; TBD):

| Field | Purpose |
|-------|---------|
| `title` | Headline. Required. |
| `slug` | For deep link `/announcements/<slug>` (TBD if needed). |
| `kind` | `promotion` / `notice` / `holiday` / `event`. Drives default styling and icon. |
| `body_html` + `body_json` | Rich text. Reuse blog sanitizer (`apps/blog/sanitize.py`) and blog editor component. |
| `images` (M2M ordered) | Photos / gallery. Reuse `BlogImage` → `core.S3File` pattern; TBD whether to share the table or make `AnnouncementImage`. |
| `cta_label`, `cta_url` | Optional button ("Shop the sale", "See hours"). |
| `placement` | Multi-select: `banner` (site-wide top strip), `home_hero`, `home_card`, `visit_page`, `shop_page`, `popup` (one-time modal, TBD). |
| `style` | Theme preset: `sale`, `info`, `warning`, `holiday`, `seasonal` — colors / icon. TBD exact set. |
| `is_active` | Manual on/off toggle. Wins over dates when OFF. |
| `starts_at`, `ends_at` | Optional schedule (store timezone). Live = `is_active AND now within window`. Empty end = open-ended. |
| `priority` | Order when multiple live in same placement. |
| `dismissible` | Banner shows an X; remembers in localStorage. |
| `linked_hours_override` (FK, nullable) | Ties a `holiday` announcement to a hours override so copy can pull dynamic wording ("Closed Monday Sept 7"). |
| `created_by`, `updated_by`, timestamps | Audit. |

**Copy / duplicate:** `POST /api/webstore/announcements/<id>/duplicate/` → new draft (`is_active=False`, title "Copy of …", dates cleared). This is the "start from an old one" path. Also a **Templates** filter: `is_template=True` rows never render publicly; duplicate from template = "routine promotion". TBD whether templates are a flag or just archived rows.

**Preview:** Dash editor shows a live preview of each selected placement using the same React components the public site uses (shared or copied; TBD — `frontend` and `frontend-public` are separate bundles).

**Dynamic wording tokens** in body/title (TBD exact syntax, e.g. `{{sale_end}}`, `{{holiday_hours}}`, `{{store_status}}`): resolved server-side in the public payload so the announcement and the hours block never disagree.

**Public API:** `GET /api/webstore/public/announcements/` (AllowAny) returns only live rows, resolved tokens, image URLs, placement list. Cached ~60s. Also folded into `public_config` as `announcements: [...]` if small (TBD).

**Public rendering (`frontend-public`):**
- `AnnouncementBanner` — top strip above header, one at a time by priority, dismissible.
- `AnnouncementHero` / `AnnouncementCard` — Home page slots.
- `AnnouncementGallery` — photos as swipeable strip; TBD lightbox.
- Animation: subtle (fade in, gentle gradient shimmer for `sale` style). No autoplay video. TBD Lottie.
- Accessibility: banner is `role="status"`, images require alt.

**Dash editor (`frontend`):**
- List: table with status chip (Live / Scheduled / Off / Expired / Template), placement chips, dates, quick toggle switch, Duplicate, Edit, Archive.
- Editor: title, kind, style, rich body, image uploader (drag-drop, reorder), CTA, placements checkboxes, schedule (date+time, store tz), priority, dismissible, linked hours override picker, preview pane.
- "Copy from…" button on the list opens a picker of past announcements and templates.

Acceptance (2A):
- [x] Owner creates an announcement with text + 2 photos + CTA, toggles live, sees it on www within one refresh
- [x] Toggle off removes it within one refresh; dates alone can also start/end it
- [x] Duplicate produces an editable draft that does not render until toggled on
- [x] Multiple live announcements order by priority per placement; banner shows one
- [x] Dismissed banner stays dismissed for that browser until a new announcement id
- [x] Token wording resolves identically in announcement and hours block

#### 2B. Holiday hours CRUD (Dash Settings → Store)

**Where in Dash:** inside existing **Settings → Store → Store hours** (`StorePanel` / `StoreHoursEditor`), new section **Holiday & special hours** under the weekly grid.

**Model `webstore.StoreHoursOverride`** (or AppSetting list `online_sales.hours_overrides`; **decision TBD** — leaning model for CRUD, audit, and FK from announcements):

| Field | Purpose |
|-------|---------|
| `label` | "Labor Day", "Christmas Eve", "Inventory day". Shown to customers. |
| `date_start`, `date_end` | Inclusive range in store tz. Single-day = same date. |
| `closed` | Bool. If true, `open`/`close` ignored. |
| `open`, `close` | HH:MM when not closed. |
| `note` | Optional short customer-facing line ("Closing early for staff party"). |
| `is_active` | Toggle without deleting. |
| `recurs_yearly` | TBD. Fixed-date holidays (Dec 25) yes; floating (Labor Day) need a rule. Phase 2 may skip and just re-enter each year. |
| `created_by`, timestamps | Audit. |

**Resolution rule (server):** `apps/webstore/services/hours.py` grows `effective_hours_for(date)` → checks active overrides first, else weekly config. Everything that reads hours moves to this: `is_open_day`, `close_on`, `provisional_expiry`, `confirmed_expiry`, `next_business_day_close_after` (hold expiry must respect holiday closures), and `public_hours_payload`.

**Public payload change:** `public_config.hours` adds `overrides: [{label, date_start, date_end, closed, open, close, note}]` for the next ~30 days, plus `today: {is_override, label, ...}`.

**Display — copy Google's method so customers know it is temporary, not new hours:**
- Weekly schedule stays visible and unchanged. Holiday days are **added lines**, not edits.
- Each override line shows the **explicit date**: "Mon, Sep 7 — Closed (Labor Day)" or "Tue, Dec 24 — 9 AM–3 PM (Christmas Eve)". Never just a weekday name.
- Header tag **"Holiday hours"** above the override lines. Each line is `Mon, Sep 7 (Labor Day): 9 AM to 6 PM, note.` (or `…: Closed.`). Resume line only: "Regular hours resume Tue, Sep 8." No filler.
- Status pill (`getStoreStatus`) uses the override: "Closed today for Labor Day, opens Tue at 9 AM" / "Open now, closing early today at 3 PM". Wording rules in `frontend-public/src/lib/storeHours.ts` + `hoursLabel.ts`.
- Overrides show starting **7 days before** (TBD) and disappear the day after. Nothing to clean up.
- `holiday`-kind announcement can auto-pull the sentence via token so banner and hours block match.
- Where it renders: `StoreHoursBlock` (Visit, Home, Layout footer), hold pages (`hold/shared.tsx` expiry wording), checkout pickup wording.

**Dash editor:** table of overrides (upcoming first), add/edit dialog (label, date range, closed switch, open/close pickers, note, active toggle), past overrides collapsed. Inline preview of the exact customer wording. Validate overlaps.

Acceptance (2B):
- [x] Owner adds "Labor Day — Closed" for 2026-09-07; www shows dated Holiday hours line for a week ahead; status pill says closed for Labor Day that day; regular hours line unchanged
- [x] Owner adds early close (9–3); status pill says "closing early today at 3 PM"
- [x] Hold expiry skips closed override days and uses early-close time
- [x] Override disappears from www the day after with no action
- [x] Deactivated override has no effect anywhere
- [x] Announcement token `{{holiday_hours}}` renders the same sentence as the hours block

#### 2C. Wire-up + docs

- Documented in `.ai/extended/frontend.md` and `.ai/extended/backend.md` (no new webstore extended file).
- CHANGELOG **v2.89.0**.

### Phase 3 — TBD
Candidates, not committed: Google Business Profile hours push; staff-facing Dash announcements; announcement analytics (views/dismissals); recurring floating holidays; SMS/email tie-in to Mailbox.

---

## Decisions (closed in Phase 2)

- Models live in `apps/webstore` (`Announcement`, `AnnouncementImage`, `StoreHoursOverride`; migration `0018`).
- Gate: `IsManagerOrAdmin` / Dash `ManagerRoute`. Capabilities `announcements:manage`, `hours.overrides:write`.
- Dash page `/announcements` in Studios. Holiday hours = Settings → Store card.
- Tokens: `{{holiday_hours}}`, `{{regular_hours}}`, `{{sale_end}}`, `{{store_name}}`.
- Placements: `banner`, `home_hero`, `home_card`, `visit`, `shop`. Popup deferred.
- Holiday lookahead: 7 days. Preview CSS copied into Dash (`announcement.css`), not a shared package.

---

## Acceptance

- [x] Phase 1 acceptance above
- [x] Phase 2A acceptance
- [x] Phase 2B acceptance
- [x] Phase 2C docs
- [x] Out-of-scope items stay out

---

## Record

**2026-09-05 — Opened.** Skeleton from owner sale rules.
**2026-09-05 — Phase 1 coded.** Per-line `sale_label`/`sale_percent`, assembly kind, `pos.labor_day_sale` + `/api/pos/sale-mode/`, terminal chip/toggle/Assembly/Summer. Shipped **v2.88.0** same day.
**2026-09-05 — Phase 2 drafted.** Owner asked for Dash-controlled www announcements (rich, toggle, copy/duplicate, photos/gallery) and holiday hours CRUD with Google-style dated display. Skeleton with TBDs; no code.
**2026-09-05 — Phase 2 shipped v2.89.0.** Dash Announcements + holiday hours CRUD; www banner/cards/gallery; `effective_day` hours + hold expiry; dated Holiday hours display.
**2026-09-05 — Hours card polish v2.89.1.** Holiday sentence `Mon, Sep 7 (Labor Day): 9 AM to 6 PM, note.`; two-column weekly schedule; Visit/Home label|value rows; dropped the filler line.

---

## See also

- Index: [`_index.md`](./_index.md)
- Prior POS discount/delivery: [`_archived/_completed/pos_discount_and_delivery.md`](./_archived/_completed/pos_discount_and_delivery.md)
- Online sales MVP (public site, `public_config`, hours): [`_archived/_completed/online_sales_mvp.md`](./_archived/_completed/online_sales_mvp.md)
- Domain: [`.ai/extended/pos-system.md`](../extended/pos-system.md), [`.ai/extended/frontend.md`](../extended/frontend.md)
- Existing hours code: `apps/webstore/services/hours.py`, `frontend-public/src/lib/storeHours.ts`, `frontend/src/pages/admin/settings/StoreHoursEditor.tsx`
- Rich content precedent: `apps/blog` (`sanitize.py`, `BlogImage`, `BlogStudioPage`)

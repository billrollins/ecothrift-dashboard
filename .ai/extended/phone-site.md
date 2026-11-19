<!-- Last updated: 2026-11-19 (v2.317.0: first release, both switches off) -->
# The phone site: the public site and the Thrift+ scanner, rebuilt for phones

**Owner, 2026-11-19:** one fast site and app for phones ("performance and FAST snappyness as a priority"), in the look he
approved ("excellent. i like it"), covering everything a customer can reach ("go 100% to the new mobile site/app"), calm
("a touch of CALM DOWN ness in the jumping and poping and expanding"), shipped while customers use the current one, and
seen by him alone until he says go ("i want access and no normal visitors to see it"). Desktops keep the current site.

## What it is

- A second, lean entry in `frontend-public/`: `phone.html` + `src/phone/` (React + react-router only, no UI library, one
  bundled font, plain CSS in `kit.css`). Built by a second pass: `build:deploy` = `vite build && vite build --mode phone`.
  The current site's `index.html` build is byte-for-byte what it was.
- Pages (`src/phone/pages/`): Home (blocks in `pages/home/`), Store (the In store and Coming lists, and search), Item,
  Categories, ThriftPlus (the member page), About, Questions, Careers (list, role, apply in short steps, interview, offer),
  Terms, Privacy, Blog, Verify, Menu, not found. Shell: `shell/TopBar`, `BottomBar` (Home, In store, Scan, Thrift+),
  `Prompts` (update bar, install card, rollback re-check).
- The scanner, rebuilt in `src/phone/scan/` (lazy chunk): `ScanApp` + `signin/`, `finish/`, `camera/`, `trip/`, `member/`.
  Same URLs, same API calls (`scan/api.ts` mirrors `frontend/src/api/thriftPlusScanner.api.ts`), same stored keys and the
  same sign-in words as the live scanner in `frontend/`. It imports the live logic unchanged from `frontend/src`
  (`scan/core/index.ts`): an edit to `useQrCamera.ts`, `scannerLogic.ts`, `installApp.ts` and friends changes BOTH scanners.
  No tabs of its own: Bucks, My QR and Account are views of `/thriftplus` (`?show=qr|bucks|account`).
- Feeds: the Django app `apps/storefront` (anonymous, read-only). A snapshot of the stock is built from the database in
  about a second, kept encoded and gzipped in each worker's memory, and rebuilt in the background every 5 minutes
  (`storefront.snapshot_seconds`). `GET /api/storefront/stock.json` (every in-store product and every coming manifest row,
  compact; the phone searches it locally), `home.json` (the home page's data, also stamped into the HTML so the first screen
  needs no call), `item/<pid>/` (live, 2 queries, 60 s memory), `photo/<pid>/` (302 to the thumb). A warm request runs no
  database query. Never in a feed: cost, notes, location, draft or final manifest prices, reward internals, 18+ products.
  A coming piece has no price and no ThriftBucks: it states its retail and "Priced on arrival".

## Who gets it (`apps/core/middleware.py`)

- AppSetting **`storefront.phone_site`** (`"off"` default | `"on"`): a phone (`Mobi` in the User-Agent) gets the phone entry
  on the paths it owns (`OWNED_PATH_RE`: every customer path except `/shop`, `/checkout`, `/hold`, whose store is switched
  off). AppSetting **`storefront.phone_scan`** (`"off"` | `"on"`): with both on, a phone's `/scan` is the phone scanner. Each
  is read through a 30-second in-process cache. Neither is seeded: absent = off.
- **The owner's preview:** `python manage.py phone_preview_link` prints `https://ecothrift.us/?site=phone&k=<signed key>`.
  Opening it within a week sets the cookie `eco_site` to that key (httpOnly, 30 days): that browser, phone or computer, gets
  the phone site and the phone scanner whatever the switches say. A bare `?site=phone`, a made-up key or a hand-typed cookie
  does nothing. `?site=classic` on any page goes back to the current site (no key needed).
- **Rollback:** turn a switch off. New page loads follow within 30 seconds; an open tab reloads onto the current site when
  the visitor comes back to it (`shell/Prompts.tsx`). The current site and the current scanner are untouched code.
- `/qr`, `/card`, `/join`, `/i/<code>`, the dash-host redirect, the web app manifest (`/scan/manifest.webmanifest`, id `/qr`,
  start_url `/scan`) and its icons are unchanged. There is no service worker: the update bar compares the page's build
  version with `home.json`'s `app`.

## Before a switch goes on

1. The owner's walk on his own phone with the preview link (camera on iPhone Safari and in the installed app, a Google
   sign-in, a text sign-in, a join end to end with a practice number, a tag at arm's length, a practice job application).
2. `.ai/extended/thrift-plus-surfaces.md`: the phone scanner changes rows C1 to C9 and C15 to C17 for phones. Update each
   row to name both scanners and check it, as that file's rule says, before `storefront.phone_scan` is turned on.
3. Dated copy: the normal-day Black Friday card ends itself after 2026-11-27; the Black Friday door busters in
   `pages/home/Specials.tsx` are fixed text. `home.json` `day` comes from AppSetting `storefront.day` (`normal` | `bf`).

## Working on it

- Dev: `ECO_DEV_SITE=phone` makes a public Vite server the phone site (`frontend-public/dev-tools/phoneDev.ts`; fixture
  feeds in `frontend-public/dev-fixtures/` when no Django runs). Each dev server may set `ECOTHRIFT_VITE_CACHE_DIR`.
- Tests: vitest from inside `frontend-public` (`npx vitest run`), `apps/core/tests/test_phone_site.py`,
  `apps/storefront/tests/`; the phone scanner's tests are in the `thriftplus` lane of `scripts/dev/lean_test.py`.
- Rules the owner set for every page: few words; no pictures standing in for a product; nothing that expands, jumps or
  shifts; ThriftBucks only (no "pay today" dollar figure); an in-store row always states its ThriftBucks.

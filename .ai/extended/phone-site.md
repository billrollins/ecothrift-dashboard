<!-- Last updated: 2026-11-24 (owner: a desktop page is never a mobile page; #220 Black Friday: phones get the phone takeover, computers the desktop site's own panel, the theme and prices follow pos.black_friday; earlier: owner: ONE website, www.ecothrift.us, phones and desktops; the old desktop site and the old scanner are legacy to retire; never "app" to customers; earlier 2026-11-20: storefront.phone_site ON; earlier: owner: home's first card is "Don't shop without Thrift+", no strip above the header, "items" not "pieces") -->
# The phone site: the public site and the Thrift+ scanner, rebuilt for phones

**Owner, 2026-11-19:** one fast site and app for phones ("performance and FAST snappyness as a priority"), in the look he
approved ("excellent. i like it"), covering everything a customer can reach ("go 100% to the new mobile site/app"), calm
("a touch of CALM DOWN ness in the jumping and poping and expanding"), shipped while customers use the current one, and
seen by him alone until he says go ("i want access and no normal visitors to see it"). Desktops keep the current site.

## One website (owner 2026-11-24)

**Customers have one website, www.ecothrift.us.** Not a website plus a scanner app, not a Thrift+ app, not a guest app: the
scanner, Thrift+, the store list and the info pages are all pages of this one site. The owner, 11-24:
"WE do not have a website and a scanner app. (Or a guest/thrift+/or ANY OTHER customer facing app for that matter) WE have a unified app. The WEBSITE app at www.ecothrift.us. this is optimized for mobile (we just did this) and desktop (still to do) ... We need to remove all legacy pages or links/navigation/verbage. We only have our website. (customers do not want to hear "App") AND it needs to be optimized for desktop now".

- **Phones:** done (this site, `storefront.phone_site` ON since 11-20). `/scan` on a phone moves to this site's scanner when
  `storefront.phone_scan` goes on (after his real-phone check).
- **Desktops: next.** This site gets a desktop layout and desktops get it (behind a switch, like phones), so there is one
  site at every width. Until then desktops still get the old site (`index.html`; checked 11-24 by User-Agent: a desktop gets
  `assets/index-*.js`, an iPhone `assets/phone-*.js`).
- **A desktop page is never a mobile page** (owner 2026-11-24, on a screenshot of the #220 Black Friday takeover on a
  computer: a full-width sale panel with the phone bottom bar and the phone header around it): "Tell Mainline to Make this
  absolutely clear: NEVER NEVER NEVER have the desktop app have Mobile elements or be Mobile view..." In plain words: a
  desktop page is designed as a desktop page. Never the phone layout widened or centred, never the phone column, never
  the bottom tab bar (Home / In store / Scan / Thrift+), a hamburger-only menu or the phone header and search row on a
  computer. No desktop layout yet for something? Desktops keep the desktop site they have and the new piece is built into
  it; they are never sent to the phone entry (`apps/core/middleware.py`). Check every public-site change at a desktop
  width, and look for phone parts, not only for the new piece. This overrules "centred is fine" in the #220 brief.
- **Legacy, to retire (not to improve):** the old desktop site's pages (`frontend-public/src/pages/`, `components/`, incl.
  `/thriftplus`), the old scanner in the Dash frontend (`frontend/src/pages/thriftplus/scanner/`), and every link, menu item
  and word that points at a second customer app. Removed once the desktop layout and the phone scanner are live.
- **Words:** customers never read "app" ("Open the app", "the Thrift+ app", "scanner app", "install the app"): say the page
  ("Scan a tag", "Thrift+", "ecothrift.us"). Rulebook V15. Keeping the site on a home screen stays (the install card), in
  words without "app".

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
  needs no call), `item/<pid>/` (live, 2 queries, 60 s memory), `photo/<pid>/` (302 to the public photo). A warm request runs no
  database query. Never in a feed: cost, notes, location, draft or final manifest prices, reward internals, 18+ products,
  and never a photo staff took for another purpose (owner 2026-11-19: "NEVER EVER EVER use photos you got from us for
  other purposes. like the add item photos. you CAN use the photo sheets photos."): no `Product.photo` / `photo_thumb`.
  Public photos (`apps/storefront/services/photos.py`): a photo-sheet photo, else a found or approved `StockPhoto`.

## Stock photos (v2.320.0; owner 2026-11-19: "scheduled for daily. Pick the best items we have ensure they have nice stock photos")

- `StockPhoto` (key `p<pid>` or `m<manifest row id>`; status found / approved / rejected / none; `approved_by`/`approved_at`
  for the check-in approve, Dash Update #187). Sources, in order: the product's photo sheet; the seller's manifest image
  (Wayfair manifests keep `Image URL` in `inventory_preprocessingrow.raw_row`; the given address is a placeholder and the
  real one is rebuilt from the image number: `stock_photos.manifest_image_url`); an AI web search only when
  `storefront.stock_photos_web` is on (off: it found 0 of 7 in a test, about $0.07 each).
- Daily at the end of `materialize_routines` (`storefront_stock_photos`; switch `storefront.stock_photos`; at most
  `storefront.stock_photos_manifest_daily` = 300 downloads; 10-minute cap). Best finds = the best pieces that have a photo.
- The item page says "Stock photo. The item in our store may not match it exactly." under a seller photo (not under a
  photo-sheet photo). A wrong photo: Django admin, Stock photos, Reject (not looked up again for 90 days).
- Truck featuring with photos pulled in preprocessing is Dash Update #186 (Mainline).
  A coming piece has no price and no ThriftBucks: it states its retail and "Priced on arrival".

## Who gets it (`apps/core/middleware.py`)

- AppSetting **`storefront.phone_site`** (`"off"` default | `"on"`): a phone (`Mobi` in the User-Agent) gets the phone entry
  on every page path (`phone_owns`) except `/shop`, `/checkout`, `/hold...` (`CLASSIC_ONLY_RE`; that store is switched
  off), so a mistyped address gets the phone site's not-found page. The pass-throughs and the old Shopify 301s run first. AppSetting **`storefront.phone_scan`** (`"off"` | `"on"`): with both on, a phone's `/scan` is the phone scanner. Each
  is read through a 30-second in-process cache. Neither is seeded: absent = off.
- **The owner's preview:** `python manage.py phone_preview_link` prints `https://ecothrift.us/?site=phone&k=<signed key>`.
  Opening it within a week sets the cookie `eco_site` to that key (httpOnly, 30 days): that browser, phone or computer, gets
  the phone site and the phone scanner whatever the switches say. A bare `?site=phone`, a made-up key or a hand-typed cookie
  does nothing. `?site=classic` on any page goes back to the current site (no key needed).
- **Black Friday** (owner 2026-11-24, #220, rulebook F5): while AppSetting `pos.black_friday` is shown (`show_from`, else
  `start`, to `end`, store time), `home.json` `day` is `bf` whatever `storefront.day` says (black and cranberry, the browser bar black), the phone
  site's front page is the sale and one button, Scan (`pages/home/BlackFridayHero`), **a computer keeps the desktop site**
  (never the phone site: the rule above), whose home is the sale and Get directions on a desktop-built panel
  (`src/components/BlackFridayPanel.tsx`; the server stamps `<html data-day="bf">` on the desktop site's pages and the panel's first paint on its home,
  `templates/public/black_friday_shell.html`), prices are the Black Friday price with no ThriftBucks, and `/scan` opens straight to scanning for a signed-out phone (session `black_friday`), with one small
  join note that goes by itself. The window is read through the same 30-second cache; the feeds follow on their next build
  (`storefront.snapshot_seconds`, 5 minutes).
- **The owner's Testing page** (owner 2026-11-24; Dash > Owner > Testing, `apps/core/services/site_testing.py`): the way he
  looks at any version now. One pick for Mobile (Live | Legacy | New | Black Friday) and one for Desktop (Live | Black
  Friday), each on for 24 hours and then Live again by itself (AppSetting `owner.site_testing`). Only a browser he linked
  follows them (the tab's QR or button sets the signed cookie `eco_test`; linking drops `eco_site`, so the 30-day preview
  cookie can no longer leave a device on a version nobody sees). Legacy = the old site and old scanner, New = the phone
  site and its scanner, Black Friday = the live site with Black Friday shown for that request only. A linked device
  with a pick on carries a floating TEST badge. The options are one list (`site_testing.options()`): take Legacy out
  there when the old phone site and scanner are removed, add a Desktop New when the desktop layout exists.
- **Rollback:** turn a switch off. New page loads follow within 30 seconds; an open tab reloads onto the current site when
  the visitor comes back to it (`shell/Prompts.tsx`). The current site and the current scanner are untouched code.
- `/qr`, `/card`, `/join`, `/i/<code>`, the dash-host redirect, the web app manifest (`/scan/manifest.webmanifest`, id `/qr`,
  start_url `/scan`) and its icons are unchanged. There is no service worker: the update bar compares the page's build
  version with `home.json`'s `app`.

## Going live

- **2026-11-20: `storefront.phone_site` ON** (owner, after his preview walk: "its pretty perfect"; "make all updates first build
  ship deploy then turn on. i want this out ASAP"). Every phone gets the phone site; `/scan` stays the current scanner.
  Rollback: set it to `off` (Dash settings, or `AppSetting` `storefront.phone_site`); new loads follow in 30 seconds.
- **`storefront.phone_scan`: still off.** Waits for the owner's real-phone check of the scanner rows
  (`thrift-plus-surfaces.md`, table "The phone site": iPhone Safari, the installed app, Android Chrome).

## Before a switch goes on

1. The owner's walk on his own phone with the preview link (camera on iPhone Safari and in the installed app, a Google
   sign-in, a text sign-in, a join end to end with a practice number, a tag at arm's length, a practice job application).
2. `.ai/extended/thrift-plus-surfaces.md`: the phone scanner changes rows C1 to C9 and C15 to C17 for phones. Update each
   row to name both scanners and check it, as that file's rule says, before `storefront.phone_scan` is turned on.
3. Dated copy: the normal-day Black Friday card ends itself after 2026-11-28. `home.json` `day` comes from AppSetting
   `storefront.day` (`normal` | `bf`), or `bf` while `pos.black_friday` is on (#220; the Black Friday cards are the sale in
   the owner's words, no door busters).

## Working on it

- Dev: `ECO_DEV_SITE=phone` makes a public Vite server the phone site (`frontend-public/dev-tools/phoneDev.ts`; fixture
  feeds in `frontend-public/dev-fixtures/` when no Django runs). Each dev server may set `ECOTHRIFT_VITE_CACHE_DIR`.
- Tests: vitest from inside `frontend-public` (`npx vitest run`), `apps/core/tests/test_phone_site.py`,
  `apps/storefront/tests/`; the phone scanner's tests are in the `thriftplus` lane of `scripts/dev/lean_test.py`.
- Rules the owner set for every page: few words; no pictures standing in for a product; nothing that expands, jumps or
  shifts; ThriftBucks only (no "pay today" dollar figure); an in-store row always states its ThriftBucks.
- Home (owner 2026-11-20): the first card on a normal day is "No Thrift+? You're paying way too much." with three proof
  lines from today's floor (home.json `bucks`), Join free and Example (rulebook V11); Example opens the standard
  ThriftBucks example (V12, `shell/ThriftBucksExample.tsx`), the one explanation every surface uses. No fine print on
  the card. Then the dated cards (Black Friday to Nov 27, BO-HO-GO to Dec 31; they end by themselves) and 3-day returns,
  "Thrift+ members only". Never a count of what is in store as a headline. The word is "items", never "pieces".
- **Nothing above the header** (owner 2026-11-20: "i HATE ANYTHING that pushes content out of alignment"): the header
  sits at the top of every page. A notice or banner goes under the store line (Omaha · open until) or above Best finds,
  under the first cards, never above the header.

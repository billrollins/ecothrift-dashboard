# Staff mobile app: decisions (Dash Update #66, 2026-11-04)

Step 1 of the "Mobile app" project (#66 audit + design → #67 organize desktop nav → #68 staff mobile scope → shell → one update per app). Everything below is Bill's decision unless marked. Design doc with screenshots of today and mockups: https://claude.ai/artifact/BdypceLptqCZY1sZp2mEC6. Q&A rows: `.ai/reference/owner-qa-log.md` (11-04, #66).

## Scope
- Two apps eventually: **Customer** = www.ecothrift.us as the mobile app; **Staff** = dash.ecothrift.us as the mobile app. **Staff first**; customer is out of scope for now.
- The desktop does not change in #66. #67 organizes the desktop menu so phone and desktop names match.

## The staff app
1. **One home-screen icon.** The Thrift+ Staff app grows into the one staff app (new name maybe "EcoThrift DASH"). Thrift+ Staff and Social Studio move inside it; their installed icons keep working and land on the same screens.
2. **Every workspace is its own app inside it** (plus HR, Dashboard and loose pages), with the workspace's color and letter from the desktop list.
3. **Bottom buttons** = the workspace's pages. As many as look good; where there is a lot, a button pops up more choices or a page has tabs. **Each workspace app gets its own design.**
4. **Home is the first button on every bar**, and the app opens on Home. Home is how you switch apps.
5. **Home = the avatar list** (Store, Today, Schedule, Profile, Requests, Messages): one list, the same on phone and desktop. (Supersedes the doc's first Home mockup of clock-in + tiles.)
6. **No hiding.** Your department's apps come first on Home; nothing you can open today is hidden. Layout decided as we go.
7. **Desk-only pages:** not hidden, not in the way: under "On a computer" in More. They still open (the computer page), with a small "Desk page" tag in the top bar; no banner, nothing moves.
8. **Processing on a phone:** a curated set, not full processing: Receiving, scan an item and update it, Send to Restoration. Start on the phone, finish at the desk.
9. **Cashier on a phone:** a curated set of pages and functions; the register stays on the register computer.
10. **No new apps.** Keep today's workspaces. Pages without a clear home (Quick reprice, section checks, Supplies, Keys, etc.) are sorted into existing menus in #67. (The doc's "apps we don't have yet" list, Floor / Store care / Customers / Training / Owner, was declined.)

## Requests, HR, Messages
- **Every request kind in one Requests.**
- **HR is two surfaces:** My HR (staff) and HR Admin (managers), not one page filtered by permission.
- **Messages needs its own rework** (its own update later).

## How the pages get built
- Every Home page goes through the critic/fix cycle: `.ai/extended/critic-fix-cycle.md` (up to 10 rounds, to A+).

## Carried into the shell (#68 / the build)
- **Web push** in the staff app shell (permission asked once, service worker, keys on Heroku; Dash has no push today) plus an in-app pop-up fallback, for staff questions (first planned for the Wi-Fi clock Yes/No questions; that pilot was retired 2026-11-13), before staff use it (D23).
- Dropped 2026-11-13 with the Wi-Fi clock pilot (see `.ai/reference/reports/2026-11-13-wifi-clock-pilot-retired.md`): a never-blocking "connect to the store Wi-Fi" nudge at clock-in (`useTimeClockActions.clockIn`).
- (Retired with the Wi-Fi clock, 2026-11-13) Android 16: Chrome's "Nearby devices / local network" permission was needed for the Wi-Fi clock one-tap turn-on (from #63).

## Starting bottom bars (from the design doc; each app's own design can change them)
| App | Bottom buttons after Home | In More | On a computer |
|---|---|---|---|
| Dashboard | Store · My day | | |
| HR | Requests · Schedule · People · More | Hiring, Onboarding, Check-ins, Supplies | Time & payroll, Permissions, Jobs, Emails, Payroll deductions |
| Buying | Today's best · Auctions · Watchlist · More | Orders, Vendors, Report cards | Preprocessing, new order, manifest upload |
| Processing | Receive · Scan item · To Restoration | | Full processing, order table, Close PO |
| Restoration | Overview · Bench · List · Parts | | |
| Inventory | Search · Count · Fix-it · More | Review, Tag errors | Inventories |
| Cashier | Members · Join QR · Receipts · More | Returns, Drawers | Register, Test register, Cash, Printables, POS setup, Command Center |
| Deliveries | Days · Table | | Delivery Desk planning |
| Online Sales | Listings · Holds · Messages | | |
| Studios | Post · Photos · Scan · More | Schedule, Announcements | Label Studio, Floorplans, Blog studio |
| Admin | Requests · Keys · Supplies · More | Departments, Shifts, Owner page | Settings, Routines control, Icons |

Build order after #68 (doc's proposal): shell (install, Home, bottom bar, More, desk tag), then one update per app, each shipped alone: Home and HR, Inventory, Cashier, Processing, Restoration, Deliveries and Studios, then Buying, Online Sales and Admin.

## Staff mobile scope (#68, 2026-11-05)

Step 3. Drafted overnight from the decisions above and the #67 menus (live in v2.264.0); every choice not in Bill's words is **(guessed)** and logged in `.ai/reference/owner-qa-log.md` (11-05, #68) for him to correct. **Supersedes the "Starting bottom bars" table above.** Names match the desktop menu; a button that is a screen inside a page keeps the name staff know from its installed app (Thrift+ Staff's Find and Join QR, Social Studio's Post, Photos and Scan), and Processing's phone buttons are the three jobs Bill named (decision 8).

### The rule for each app
- **Bar:** Home first, then the pages used standing up, then **More** when there are more. A page that needs a keyboard, a wide table or a register goes under **On a computer** in More (it still opens, with the "Desk page" tag).
- **Managers:** the workspace's Managers section (#67) is the last group in More, shown only to those its dials let in. No manager page on the bar. (guessed)
- **Shortcuts** ("Also here" on the desktop) sit in More under the app's own pages. (guessed)

### Home (opens first; the Home button on every bar)
- The six, as on the desktop avatar menu: **Store · Today · Schedule · Profile · Requests · Messages**.
- Under them, **Apps**: your department's apps first, then the rest you can open. Nothing you can open is left out.
- Home's own bar: **Home · Today · Requests · Messages**. (guessed: the three a shift opens most)
- **Dashboard is not its own app**: Store and Today are on Home. (guessed)

### The apps
| Key | App | Bar after Home | In More | On a computer |
|---|---|---|---|---|
| 1 | Buying | Estimate Profit · Vendors · Orders · More | Today's best, Auctions, Watchlist, Report cards | Preprocessing |
| 2 | Processing | Receiving · Scan item · Send to Restoration · More | Restoration (shortcut), Search | Processing (full), the order table, Close PO |
| 3 | Restoration | Overview · Bench · Parts Requests · More | Restoration list, Search | |
| 4 | Retail | Find · Join QR · Run count · More | Scan (member QR), Search, Transactions, Customers, Quick reprice, Review, Tag errors; Managers: Command Center | Register, Test terminal, Printables, Drawers, Returns until the Retail redesign removes it; Managers: Cash Drops, POS setup, Thrift+, Inventories |
| 5 | Online Sales | Listings · Holds · Messages | | |
| 6 | Deliveries | Schedule · Table | | Delivery Desk planning |
| 7 | Studios | Post · Photos · Scan · More | Schedule; Managers: Announcements | Managers: Label Studio, Floorplans, Blog studio |
| 8 | Facilities | Supplies · More | Managers: Keys | |
| 9 | Admin (owner) | Owner · Approvals · More | Contractors | Routines, Settings, Icons |
| 0 | HR | Requests · Schedule · Profile · More | HR Admin (managers): Staff, Applicants, Interviews, Onboarding, Check-ins | HR Admin: Permissions, Departments, Shifts, Time & payroll, Payroll deductions, Jobs & careers page, Emails, HR documents |

Notes:
- **Buying** leads with Estimate Profit and Vendors, the tools Bill uses; the auction pages sit in More. (guessed, from "Buying workspace distrust")
- **Retail** carries all of Thrift+ Staff's screens: Find (which already holds Finalize and Members), Join QR and Scan; its Me is Profile on Home and the floor's inventory pages; the register stays on the register computer (decision 9). Its bar is final only after the Retail redesign (#71, #72, #70) ships; Returns and Drawers drop out then.
- **Studios** carries Social Studio's screens (Post, Photos, Scan, Schedule). Social Studio's installed icon lands on Studios → Post. Thrift+ Staff's lands on Retail → Find (decision 1).
- **Keys** is a manager page (owner and Admins), so it sits in More; everyone else sees Facilities as Supplies alone, with no More button.
- **HR** is My HR on the bar; HR Admin lives in More for managers (two surfaces, Bill 11-04).
- **Online Sales** (managers and Admins) and **Deliveries** need no More. **Admin** is the owner's (Owner, Approvals, Contractors, Routines); managers who can open Settings see Admin for that desk page. Their Messages and Schedule are the desktop names (customer messages, delivery days); inside each app it is clear which one.
- **Loose pages:** Routines open inside Today (Home); Assumptions is inside Settings; Documents is parked (no page yet). Dash Updates stays on the avatar menu and the bell.

### Which first (build order, each its own update, shipped alone)
1. **Shell:** install as one app (the Thrift+ Staff icon grows up), Home, the bottom bar, More, the Desk page tag, web push and the in-app fallback (for the Wi-Fi clock questions).
2. **Home and HR** (Home's six go through the critic/fix cycle).
3. **Processing**, then **Restoration**: the focus areas (10-26), and their phone sets are already decided. (guessed order)
4. **Retail**, after the Retail redesign ships (Thrift+ Staff moves in here).
5. **Studios** (Social Studio moves in) and **Deliveries**.
6. **Facilities**, **Buying**, **Online Sales**, **Admin**.

### Still open (guessed until Bill says)
- The app's name: keep **"Thrift+ Staff"** on the icon until Bill picks one ("EcoThrift DASH" was floated). (guessed)
- Messages keeps its envelope in the top bar of every app as well as on Home, until its own rework. (guessed)

<!-- Last updated: 2026-11-10 -->
# Dash audit, 2026-11-10 (free review for Bill)

**How I looked:** read the code map, the end goals and the initiative list; counted what each part of Dash actually recorded in the last 30 days; pulled sales, labor, truck and shelf numbers; then clicked through Dash as an owner (desktop) and as a brand-new employee (phone).

**Limits:** the numbers are from the local copy of production, fresh to Nov 4. The click-through ran on this PC's copy at v2.260.1, nine releases behind live, so I did not see the rebuilt Auctions list. `Item.cost` is an estimate, so every cost figure is rough. Scripts: `workspace/audit/`.

## The short version

1. **Dash is wide, not finished.** About half a million lines of code, 10 workspaces, 73 menu links, 153 screens. 212 releases since Oct 2 (about five a day). The Retail end goal lists its Finished pages as "none yet".
2. **About a third of it is not used.** Deliveries, Online Sales, Blog, Floorplans, Label Studio and Consignment recorded nothing or nearly nothing in 30 days, and most still sit in every employee's menu.
3. **Dash cannot tell you if a week made money.** The Owner scorecard has sales, buying, processed and labor. It has no cost of goods, no rent or other bills, no profit line.
4. **Dash's own numbers say stock is not what limits sales.** 35,711 items on the shelf, $420k at tag, about 40 weeks of supply; almost every category is flagged Overstocked. Sales have stayed near 300 a week since August.
5. **"Inspect what I expect" exists for Retail only.** Command Center is the best page in Dash. Processing and Restoration have nothing like it.

## What is used (30 days to Nov 4)

| Used every day | Count |
|---|---|
| Register | 1,043 sales |
| Processing | 2,386 check-ins, 6,357 items |
| Time clock and schedule | 119 clock entries, 145 shifts |
| Routines and checklists | 318 runs |
| Restoration | 158 jobs |
| Thrift+ | 467 members since Oct 16 |
| Hiring | 23 applications, 31 interviews |
| Dash Updates | 70 asks |

| Barely or never used | What the data shows |
|---|---|
| Deliveries | 0 in 30 days; 4 jobs ever |
| Online Sales and the public store | 3 listings in 30 days; 2 holds ever; about 33,000 lines of code |
| Blog | nothing since June |
| Floorplans | nothing since September |
| Label Studio | nothing since Sept 5 |
| Consignment | hidden from the menu already |
| Staff Messages | 14 messages; staff use WhatsApp |
| Supplies count | 6 counts, 2 missed |
| Truck disputes | none opened since May 28; the 162 older ones are all still "open"; all 34 trucks since June show close-out "open" |

## What I saw clicking through

**Good**
- **My day** (employee phone home): clock-in buttons, to-do, hours. Clean and obvious.
- **Command Center:** who is scheduled, who is late, which checklist is overdue, the week's grade. This is the pattern to copy.
- **Orders:** cost, retail, priced, sold and profit per truck in one row.
- **Inventory Review:** weeks of supply, stale share and flags per category.

**Wrong turns**
- **A new employee's menu opens on Buying** (auctions, vendors, truck costs) and lists 7 workspaces. A cashier or processor should land in their own department.
- **People live in three places:** HR (7 tabs), the People workspace (10 links) and Admin (Departments, Shifts, Time & payroll).
- **Six inboxes:** HR Requests, Admin Requests, Owner Approvals, Supplies "We need", Parts requests, Dash Updates. Plus the bell, Messages, "Needs you" and "Needs your attention".
- **The Dashboard's goals are from June** and fight each other: sell $15,000 a week, buy $15,000 a week, process $30,000 a week.
- **Processing** opened on a closed June truck with "No processing rows yet" (on this PC's copy; may differ live).
- **Long jobs run inside the website itself.** That is why AI Cleanup died yesterday. They belong in a separate background worker.

## The money picture

| | Number |
|---|---|
| Sales | $48.6k Aug, $51.9k Sep, $57.9k Oct |
| Sales count | about 300 a week, $39 average, flat since August |
| Best days | Fri + Sat are 59% of the week; Tue to Thu about $1,500 a day |
| Cost of what sold | about 38% of sales (estimate) |
| Buying, May to Oct | $177k, about $29.5k a month: 58% of sales |
| Labor on the clock, Oct | $9,623, 17% of sales |
| Put out vs sold | 2.3 to 2.6 times sales, at tag (your target: 1.2) |
| Shelf over 90 days old | 8,790 items, $144k at tag |
| Tag price changes | 34 in 60 days |

- **Roughly $10k a month of cash is going onto the shelf**, not out the door: buying runs $29.5k a month and the cost of what sells is about $20k.
- **Half of what sells is gone in 22 days, 90% in 90.** After 90 days an item mostly sits. Thrift+ rewards are the only markdown, and they reach members only.
- **Small items eat the processing time.** Under $5: 46% of items sold, 11% of dollars. $25 and up: 8% of items, 41% of dollars.
- **Thrift+ is working.** Member sales average $65, others $26. Members are 45% of sales and 67% of dollars since launch. Part of that is big spenders joining first, so it is a signal, not proof.
- **Trucks vary a lot.** March to August trucks cost $133.5k; $212k sold so far, $195k at tag still on the shelf. Cost back so far ranges from 0.74 times (a Costco truck) to 2.76 times (a Walmart truck). Target trucks recover 30 to 42% of manifest retail; Amazon 8 to 18%. "Retail" does not mean the same thing from each seller.

## What I recommend

### Quick wins (a day or less each)
1. **Start each person in their own department's workspace.** Nothing hidden; Buying is the start only for you.
2. **Move the unused areas under _Legacy_** in every workspace, not only Retail and Buying.
3. **Reset the Dashboard goals** to the Owner page's targets (processed 120% of sales, buying 40-50% of processed).
4. **Add a profit line to the Owner scorecard.** You type the monthly bills once (rent, utilities, insurance, software, your pay). Each week shows sales, cost of goods, labor, bills, profit, and the sales needed to break even.
5. **Truck close-out:** one step per truck that lists missing and broken items, records the claim and the money back, and closes it.

### Structural (one at a time, each signed off before the next)
1. **One inbox.** Everything waiting on a person in one list, whatever kind it is.
2. **One People home.** Fold the People workspace and Admin's staff pages into HR.
3. **A Command Center for Processing and for Restoration.** Per person, per day: items checked in, tag dollars per hour, tag errors; jobs finished. Same layout as Retail's.
4. **A background worker** for long jobs (AI cleanup, nightly ThriftBucks, manifest pulls).
5. **Finish before starting.** A page counts when you sign it Finished. Track that count on Dash Updates.

### Path to profit (your calls; Dash should show each one)
1. **Buy to a weeks-of-supply target, not a dollar goal.** At 40 weeks, each truck skipped is cash kept.
2. **Move stock past 90 days every week:** an age markdown or a dollar section, for every customer.
3. **Stop tagging under-$5 items one by one.** Bins priced by a sign. Processing hours go to the $25-and-up items.
4. **Push Thrift+ sign-ups and Tue to Thu traffic.** The register count has been flat for three months; that, not stock, is the ceiling.
5. **Edge on B-Stock: bid from your own recovery by seller and category.** The 20% rule fits Target. It overpays for sellers whose "retail" recovers 8 to 18%. The Buying end goal is already headed here; the truck report cards are the proof to show on the bid screen.

## Not checked
- The live site (I used the local copy).
- Rent and other bills (not in Dash).
- Whether disputes are filed on B-Stock outside Dash.
- Phone layouts beyond My day and the menu.

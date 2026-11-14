# Dash Home, avatar menu and HR: structure (Bill + BEAST MODE, 2026-11-13)

Working design; decided items are marked. Build one page at a time, each its own Dash Update.

## Decided
1. **Dash Home tabs, everyone:** Store · Time clock · HR · Routines · Calendar · Messages · Profile. **Everyone lands on Store.** Clocking in is the time button in the header, so the landing tab does not need to be Time clock.
2. **Avatar menu:** Dash Updates, Language, Sign out. Owner only: Owner page, View as. No links to Home tabs (Bill: "not redundant").
3. **Today tab goes away**, replaced by **Time clock** (Bill: "Today is too busy, I hate it").
4. **Time clock tab:** clock card (in / out / break, overtime warning) on top; then a switch **Mine | Everyone**. Mine = this pay period's shifts, pay so far and expected from upcoming shifts, "fix this shift" requests, request time off. Everyone = the week's schedule, read-only. Building and editing the schedule is a manager tool in the HR workspace on the same grid. No separate staff Schedule page (Bill did not want two pages that are "the same but different").
5. **HR tab (staff view) is all a staff member needs:** Files (signed documents, handbook) · Training (what I am cleared to do) · SOPs · Requests (time off, incident report, time fix). Training and SOPs are new: placeholders now, built out later. "Issues" are not a request type; staff bring issues to Bill.
6. **HR workspace = managers and owner only:** People, Hiring, Onboarding, Time & payroll, Incidents (review), Requests (approve), Schedule builder. Staff no longer see this mix.
7. **Profile (rebuilt, current one is "ugly"):** personal contact info, photo, work details (department, job, level, pay rate shown, overtime allowance), next performance review. Not the clock, pay totals or requests (those live in Time clock and HR).

8. **Today's parts move:** shift card, punch buttons, hours and pay to Time clock; the routine to-do list to Routines; the onboarding banner to HR (only while onboarding).
9. **Managers get one Requests inbox** in the HR workspace (time off, shift fixes, incident reviews); staff see each request's status under HR > Requests.
10. **Store tab is the same for everyone** (no hiding from staff).
11. **Calendar (new, design ALL before building):** store events: closures and holiday hours, trucks arriving, sales (Black Friday), my meetings, performance reviews, and **my shifts as a layer** (when do I work). Bill: needs filters and presets; are filters stackable; do parts of a day belong to different TYPES of events; what presets look like; clicking an item (a truck / order) opens its universal window (the shared order window etc.). Design phase with clickable demos first, like Restoration orders (#109).

12. **Paid sick time (checked 11-13):** Nebraska's Healthy Families and Workplaces Act as amended by LB 415 (signed 2025-06-05, effective 2025-10-01) exempts employers with 10 or fewer employees; 11 to 19 must allow 40 hours a year, 20+ 56 hours. Eco-Thrift today: 7 active staff on payroll (family is off payroll), 9 to 10 people clocking in a week. So time off is unpaid "request a day off" for now. Watch: at 11 paid employees in a week the law applies. Sources: update.legislature.ne.gov/?p=38235, woodsaitken.com (LB 415 passes), bairdholm.com.

## Open
- (none)

## Build order (proposed)
1. Tabs + avatar menu (skeleton): **done, v2.298.0** (BEAST MODE); placeholders in `frontend/src/pages/home/HomeTabs.tsx`, Time clock is still tab id `myday` (TodayPage). 2. Time clock tab. 3. HR tab (staff). 4. Profile. 5. HR workspace split + Requests inbox. 6. Calendar: design with demos, then build.

- **Step 5 built (Dash Update #140, 2026-11-13):** the HR sidebar workspace is managers' and the owner's. Requests inbox `/people/requests` (`frontend/src/pages/hr/inbox/`: days off, new times, shift fixes, open incidents, questions; each answered in place by whoever answers that kind today), Schedule builder `/people/schedule` (`SchedulePage build`: the only place the week changes; read-only everywhere else, managers included), Incidents `/people/incidents`. Staff items (Requests, Schedule, Profile) left the sidebar; staff use Home.

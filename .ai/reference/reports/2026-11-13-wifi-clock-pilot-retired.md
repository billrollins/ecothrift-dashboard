# Wi-Fi time clock pilot: retired 2026-11-13

**Decision (Bill, 2026-11-13):** "I hated Wi-Fi clock... yes kill it. Log that we did it but all code can be removed. Save the code, log that we did it and it sucked, so if we pick it back up we can see why it didn't work the first time and what we coded."

Everything is saved off site: `C:\Coding\!archive\ecothrift-dashboard\2026-11-13-wifi-clock-pilot\` (path also in docs/machines.md style; archives are off site by house rule).
- `code/`: every file as it was (backend, views, helper, installer, tests, front-end card, migrations), `git-history.txt`, `full-history.patch`, `repo-at-retirement.bundle` (whole repo at HEAD).
- `data/`: the pilot's production rows (99 events, 4 pilot shifts, presence, device without its token) and Bill's real clock-ins for Nov 3 to 13.
- `time-clock-standard-D23-copy.md`: the design (house standard D23, `{master}/standards/time-clock.md`).

## What we built (Nov 3 to 4, Dash Update #63)
- A helper on the store PC (`scripts/wifi_clock/helper.py`, a sign-in scheduled task) swept the store /24 once a minute, read the PC's neighbour table for registered phone MAC addresses and posted seen / not seen to Dash.
- Dash (`apps/hr/wifi_clock.py`, `wifi_views.py`, models `WifiClockDevice`, `WifiPilotShift`, `WifiPresence`, `WifiPilotEvent`, `EmployeeProfile.wifi_mac`) worked out, in **shadow mode only** (never wrote a time entry), when it would have clocked in (arrival inside the shift window), clocked out (leaving near shift end), and asked "Was this a break?" for gaps, by email.
- A Me-page card to turn it on from the phone (join link to the helper), and an owner request kind `hr.wifi_clock_pilot`.
- Pilot: Bill's phone only, Mon to Thu 9 to 5.

## Why it failed (results, Nov 3 to 13)
| | Real clock | Wi-Fi only |
|---|---|---|
| Hours, 8 workdays | 58.9 | 21.3 (64% missing) |
| Days the phone was never seen | | 4 of 9 |
| Clock-ins within 20 min of real | | 1 of 5 (11-12) |
| Clock-outs | | none, any day |
| False "was this a break?" a day | | 4 to 8 (37 events on 11-11) |

Root causes:
1. **Phones drop off Wi-Fi when idle** (screen off, battery saving, MAC-level sleep). The PC's neighbour table only lists a phone while it talks, so "not seen for 15 minutes" (GONE_AFTER) fired constantly, and some days the phone was never seen at all.
2. **Private / randomized MAC addresses** per network make the phone's address unreliable unless the user turns it off for the store Wi-Fi.
3. **One PC as the only sensor**: if the store PC sleeps, the pilot goes blind.
4. Real day: Bill is in and out of the building; "first seen to last seen" is not hours worked.

## If we try again
Do not rebuild presence from a PC sweep. Better bets: the phone reports itself (the staff app with location or a store beacon, with permission), or a one-tap clock-in nudge when the phone is on store Wi-Fi (never automatic). Any version needs a week of shadow data compared with real clock-ins before it touches payroll, as this pilot did.

## What was removed (v2.295.0)
Backend, views, URLs, helper scripts, tests, the Me-page card and API calls, the request kind, the four pilot tables and `EmployeeProfile.wifi_mac` (dropped by migration after the data export). The routines field `gate_on_miss` stays (it now has no clock-in gate behind it). The helper task and process on the store PC were stopped and removed 11-13.

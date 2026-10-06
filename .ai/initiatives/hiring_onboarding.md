<!-- initiative: slug=hiring-onboarding status=active updated=2026-10-06 -->
<!-- Last updated: 2026-10-06 (owner's answers; Phase 1 = careers page, form, tracker; building) -->

# Initiative: Hiring and onboarding

**Status:** **Active**. Phase 1 shipped in v2.136.0 (2026-10-06); the careers page stays hidden until the owner turns it on. Phase 2 (interview calendar) next. The owner said it is urgent (2026-10-06).

**Objective:** The owner runs hiring from Dash, start to finish:

- He posts jobs on ecothrift.us/careers. He writes them by hand, from JSON/YAML, or with AI.
- People apply from a phone, with the screener questions inside the application.
- Applicants confirm their email and book an interview from open times he sets.
- They sign an offer with a finger.
- Each new hire gets a first-day email and an onboarding checklist. The checklist creates their Dash user and employee record and keeps their I-9 papers privately.
- The 30, 60 and 90-day check-ins come up on time, and the employee can read them in Dash.
- Everyone not hired has a reason, the step they reached, and the email they were sent.

Today hiring happens by hand: a Facebook post, resumes emailed to Bill or brought to the store.

**Compass:** this file is not the compass; Thrift+ Rewards stays the compass until launch. It runs **in parallel** with [`inventory_effort`](./inventory_effort.md), which is worked in another session (see **Concurrent plan**).

**Later, on the same base (not this initiative):** termination, PIPs, write-ups and discipline, performance reviews.

---

## The owner's answers (2026-10-06)

1. **Urgent.** Start now, in parallel. inventory_effort Phases 3 and 4 run in another session.
2. **Payroll is QuickBooks Online.** He enters name, phone and email. QuickBooks sets up direct deposit and the W-4, and says it does the I-9. That works "hit and miss", so Dash keeps the I-9 itself (decision 13).
3. **Texts:** yes, add job-applicant texts to the 10DLC campaign. Master put it in `standards/texting.md` the same day:
   - the sender row, the description, the opt-in flow, and the samples;
   - the first text after opt-in: "Eco-Thrift: You'll get texts about your job application. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to cancel."

   The campaign is submitted once the application's consent tick is live in production. **Tell master in the outbox when Phase 1 is live.** A texted confirmation code waits on Bill's D13 ruling; email only until then.
4. **Pay:** $15 to $25 an hour, set by skill. $25 will not happen soon.
5. **His draft** (another AI session) is the base for Phase 1:
   - the post text: three roles, the mission, "what we ask";
   - the 15-field form;
   - the auto-reply;
   - the tracker stages;
   - the red and green flags;
   - Hired creates the employee;
   - a honeypot field, resumes in S3, and a jobs@ sender with replies to him.

---

## Where it stands (code read 2026-10-06)

No hiring code existed. These parts are reused:

| Need | Reuse |
|---|---|
| Staff user and employee record | `accounts.UserCreateSerializer` (User + group + `EmployeeProfile`); the set-password email `_send_staff_reset` |
| Sign with a finger (Phase 3) | `apps/documents` (parked): placed fields, `SignaturePad.tsx`, `flatten.py` audit page. Needs outside signers |
| JSON/YAML with AI | Routines' `routineJson.ts` + `RoutineJsonDialog.tsx`; `js-yaml` in the staff app |
| AI | `llm_router.llm_chat_text(purpose=…)`, a model per purpose in Settings > AI |
| Email | Django mail → `GraphEmailBackend`; `GraphMailClient(mailbox=…)` sends as another mailbox |
| Confirm an email (Phase 2) | webstore hold confirmations (6-digit code), `CodeInput.tsx`; Thrift+ `MemberSession` for a non-user session |
| Private files | `core.S3File`, `core/files.py` `save_upload` / `stream_s3` |
| Public site | `frontend-public/` (React, plain CSS); every path serves the SPA; `sitemap.xml` in `core/views.py` |
| Staff nav | `navItemCatalog.ts` + `slotCNavLayout.ts`; digit 9 is free |
| Onboarding auto-checks (Phase 4) | `hr.ShiftAssignment`, `hr.TimeEntry`, the kiosk badge, `EmployeeProfile.emergency_*` |

---

## Finish line

An applicant finds a job on **ecothrift.us/careers** and applies from a phone, with resume and screener in one form. They confirm their email and book an interview time.

On **People → Applicants**, a manager:

1. moves them through the stages;
2. sends an offer they sign with a finger;
3. presses **Start onboarding**.

Then:

- the Dash user and the employee record exist;
- the first-day email has gone out;
- the checklist runs to done: I-9 on file, handbook signed, QuickBooks set up, the time clock used.

The 30, 60 and 90-day check-ins show up when due, and the new hire reads them under **My check-ins**. Every applicant not hired has:

- a reason;
- the stage they reached;
- the email that was sent, or a note on why none was.

---

## Out of scope

- Termination, PIPs, discipline, performance reviews. They come next, on the People workspace, the signing and the check-in forms built here.
- **Electronic I-9** and E-Verify. The I-9 is done on the paper USCIS form; Dash stores the scans and tracks the due dates.
- Storing **SSN, bank account or routing numbers**, running payroll, or filing tax forms. Those live in QuickBooks.
- A QuickBooks connection (the API). Onboarding has a "set up in QuickBooks" tick with what to type.
- Background checks and drug tests.
- Auto-posting to Indeed or Facebook. Google Jobs gets the roles through structured data on each role page.
- Two-way Outlook or Google calendar sync. Interviews send an `.ics` file.
- AI that scores, ranks or rejects applicants.
- Texting before the Phase 6 gates clear.

---

## Rules this must follow

This is research, not legal advice. The owner's attorney confirms before the handbook and the offer letter are first used.

- **I-9 timing:** Section 1 by the employee by day 1. Section 2 by the employer within 3 business days, after examining the original documents in person.
- **I-9 retention:** keep each I-9 for 3 years from hire, or 1 year after the person leaves, whichever is later.
- **I-9 storage:** keep I-9s apart from the personnel file. Copies of the identity documents are optional, but the same rule must apply to every employee ([USCIS, Retention and Storage](https://uscis.gov/node/41388)).
- **Nebraska new-hire report** within 20 days of hire (Neb. Rev. Stat. 48-2301) ([DHHS](https://dhhs.ne.gov/Pages/Child-Support-Employer-New-Hire.aspx)). Check whether QuickBooks files it; if not, it is a checklist item.
- **E-Verify** is not required for private Nebraska employers. LB532 was postponed on 2026-04-17.
- **Ban the box:** Nebraska's law covers public employers only. We don't ask anyway (decision 9).
- **Never asked:**
  - age (except "18 or older?");
  - race, religion or national origin;
  - citizenship (only "authorized to work in the US?");
  - marital or family status;
  - pregnancy, disability, health or genetics;
  - arrests.

  The AI briefs carry this list. The lifting question says "with or without accommodation".
- **Records:** applications and hiring decisions are kept at least 1 year after the decision. That is the EEOC rule at 15+ employees and good practice below it.
- **E-signatures** are valid under federal ESIGN and Nebraska's UETA when:
  - the signer agrees to sign electronically;
  - the record keeps who signed, when and how.
- **Texts** follow D17: a separate consent tick, never pre-ticked, recorded, and STOP works. The consent tick is on the form from Phase 1, so the campaign's opt-in text is true when it is reviewed.

---

## Decisions (Claude's calls; the owner can change any)

1. **One new app, `apps/hiring`.** Additive tables. The only edits to existing code are documents' outside signers (Phase 3) and onboarding's user creation (Phase 4).
2. **A People workspace in Dash** (Manager and Admin, digit 9): **Applicants · Jobs**, and later Interview times, Onboarding and Check-ins. The old saved-workspace alias `people → admin` is removed so the id is free.
3. **One careers file, `ecothrift.careers/1`.** It holds everything the owner may want to edit, and the database is the truth; the file is how it goes in and out:
   - the careers page text;
   - the shared form questions;
   - the emails (auto-reply, the alert to Bill, the "Not now" drafts);
   - sender and reply-to;
   - the on/off switch;
   - every job.

   It goes three ways:
   - **Offline:** **Copy for AI** gives a brief with the format and the never-ask list. Paste it into any chatbot and paste the YAML or JSON back. **Update from YAML/JSON** shows what changes, and **Save** commits.
   - **Direct:** **Draft with AI**: type what you want changed; the model returns the whole file, and you get the same review before Save.
   - **By hand:** a small editor per job for the everyday fields (status, pay, schedule).
4. **The screener is inside the application** (the owner's item 5). Yes/no questions with a required answer show green or red on the list (transportation, lifting, 18+, authorized to work). A red flag never rejects anyone by itself.
5. **One first-touch email**, the owner's auto-reply, with no confirm code in Phase 1. The confirm code arrives with interview booking (Phase 2), where it is needed.
6. **Applicants are not Dash users.** In Phase 2 an email code gives a session cookie (copied from Thrift+ members). A new hire becomes a Dash user at **Create employee**.
7. **AI writes; people decide.** AI drafts the careers file and polishes emails. It never scores, ranks or moves an applicant. Every stage change records who, when and why.
8. **"Not now" emails never send themselves.** **Not now** asks for a reason and shows a draft for it. Staff edits it and presses **Send** or **Don't send**, and the record keeps the text either way. The auto-reply already says "if you don't hear in 7 days…", so **Don't send** is normal for early stages. Reasons:
   - Not available for the hours we need;
   - Missing a must-have;
   - No-show for the interview;
   - Didn't respond;
   - Withdrew;
   - Offer declined;
   - Chose someone else;
   - Position filled or closed;
   - Other (note required).
9. **No criminal-history question on the application** (the owner's draft: it contradicts the mission). It can come up in the interview.
10. **Pay on the page:** "From $15/hr, set by skill". Google Jobs gets "from $15 an hour" in the structured data; $25 is never shown. The form still asks "What hourly pay are you looking for?". The owner can hide the line in the careers file.
11. **Resume optional.** A PDF, Word file or photo (photos are shrunk in the browser), up to 10 MB.
12. **Sensitive files are private.** Resumes, I-9 scans and signed papers go under an S3 `hiring/` prefix. They are served only through `stream_s3`, never by public link. I-9s are Admin-only and kept apart from the employee record.
13. **Dash keeps the I-9, whatever QuickBooks does.** The paper I-9 is scanned into onboarding, with the 3-business-day due date. Copies of the documents are kept for everyone (one rule); the attorney can flip it.
14. **"ICE" in the checklist means In Case of Emergency** (the emergency contact).
15. **The public pages ship dark.** The careers file has `public: false` until the owner turns it on. A preview link from Dash shows the pages while they are off.
16. **Sender:** until a `jobs@ecothrift.us` mailbox exists, mail goes from the store mailbox with **Reply-To Bill**. When the owner creates `jobs@` (a free shared mailbox in Microsoft 365), one line in the careers file switches it.
17. **Walk-ins count.** **Add applicant** in Dash takes a paper application or an emailed resume (photo or file), with a source of walk-in or email. The current Facebook post still says "email or bring it in".

---

## Phases

Each phase ships on its own, from the hiring worktree, as soon as it is tested.

### Phase 1 — Careers page, application and tracker
Applicants find the roles on ecothrift.us/careers and apply from a phone in about 5 minutes. Bill works every application in Dash, from New to Hired or Not now.
**Gated by:** none.

Acceptance:
- [x] `apps/hiring`: `Job`, `Application` (one application can name several roles), `ApplicationEvent`. The careers file is stored in AppSetting `hiring.careers`. The migration is additive only.
- [x] Public **`/careers`**: "NOW HIRING", the mission, the three roles, what we ask, the pay line, **Apply**. Also **`/careers/<role>`** with `JobPosting` structured data, **`/careers/apply`**, and the thank-you page. Sitemap entries. Hidden while `public` is off, except through the preview link.
- [x] The form has the owner's 15 fields:
  - name, phone, email;
  - roles (checkboxes);
  - hours wanted;
  - days (Mon to Sat), earliest start and latest finish;
  - start date;
  - transportation, lifting, 18+, authorized (yes/no);
  - pay wanted;
  - why Eco-Thrift;
  - the "did it without being asked" story;
  - the role question for each ticked role;
  - resume (optional);
  - how they heard.
- [x] Also on the form: the text-consent tick (unticked, D17 wording, recorded with its version). Abuse guards: a honeypot field, a minimum fill time, a throttle, and files checked by their bytes.
- [x] Emails: the owner's auto-reply to the applicant, and an alert to Bill with a link to the applicant in Dash. Sender and Reply-To come from the careers file (decision 16).
- [x] **People → Applicants**:
  - tabs by stage (New, Reviewed, Contacted, Interview scheduled, Interviewed, Offer, Hired, Not now), with counts;
  - role chips, red and green flags, 1–5 rating, applied date;
  - search and a role filter.
- [x] The applicant panel:
  - all answers;
  - the resume viewer;
  - call, text and email buttons (staff's own phone);
  - notes and stage buttons;
  - a timeline of every change (who, when).
- [x] **Add applicant** by hand (decision 17).
- [x] **Not now** (decision 8): reason, stage, draft, **Send** or **Don't send**. The text is kept.
- [x] **Hired → Create employee:** an Employee-role Dash user with the profile (position = the role, pay rate, start date) and the set-password email. It is linked on the application. The panel then shows the QuickBooks step: "Add them in QuickBooks Payroll: name, phone, email".
- [x] **People → Jobs**:
  - the roles with status, pay and order, plus a small editor;
  - **Copy for AI** / **Update from YAML/JSON** (with a change list) / **Export** / **Draft with AI** for the whole careers file;
  - **Preview careers page**.
- [x] `/terms`: the text-messaging section names job-application texts. The owner reads it before the ship.
- [x] Tests:
  - public pages hidden while off;
  - apply with and without a resume;
  - bad files refused;
  - the honeypot;
  - flags;
  - stage changes logged;
  - Not now requires a reason;
  - no email without **Send**;
  - Create employee;
  - the careers file parses, validates and imports.

### Phase 2 — Interview calendar
The owner sets open interview times, and applicants who confirm their email book, change or cancel their own (his item 6).
**Gated by:** Phase 1.
Detail when Phase 1 is built. Outline:

- **People → Interview times:** a weekly pattern (for example Tue and Thu 2–4 PM, 30-minute slots), one-off times, interviewer and place. Closed days are skipped (`webstore/services/hours.py`).
- **Pick a time:** a link in the applicant's email when staff press **Invite to interview**. A 6-digit email code confirms the email, then `/careers/my` shows open times. Text confirmation waits on Bill's D13 ruling.
- The booking email carries an `.ics` file and a change or cancel link. A reminder goes the day before (a Scheduler command). The stage moves to Interview scheduled on its own.
- **Today's interviews** for staff, with a scorecard from the role's interview questions, filled on a phone. **No-show** is one tap, and it opens the Not now draft.

### Phase 3 — Offers signed with a finger
An offer letter goes out as a link, is signed on a phone, and comes back as a flattened PDF with an audit page.
**Gated by:** Phase 1 (can run beside Phase 2).
Detail when Phase 1 is built. Outline:

- The offer template fills in:
  - the role, pay and start date and time;
  - the schedule and the supervisor;
  - the at-will line, and that the offer depends on the I-9.

  The owner edits it in the careers file; the attorney reads it once.
- `documents` gets **outside signers**: no Dash user, a hashed token link, the email code, and consent to sign electronically. `SignaturePad` and `flatten.py` are reused as they are.
- Offer states: **Sent · Viewed · Signed · Declined · Expired**. Declined opens Not now (reason: Offer declined). Signed moves the applicant to Hired.

### Phase 4 — Onboarding
**Start onboarding** sends the first-day email and runs the checklist to done.
**Gated by:** Phase 3 (Create employee from Phase 1 is the first step).
Detail when Phase 3 is built. Outline:

- **First-day email** covers:
  - when, where to park and enter, who to ask for;
  - what to wear;
  - what to bring: the I-9 document choices (one List A, or one List B plus one List C).
- **Checklist** from the careers file (`onboarding:`). Each item has an owner (new hire, manager or owner), a due point (before day 1, day 1, week 1, by day 20) and a kind (tick, upload, sign, or auto). Starting items:
  - **Added in QuickBooks Payroll** (name, phone, email). Then **QuickBooks setup finished** by the new hire (W-4, direct deposit);
  - **Nebraska new-hire report** by day 20 (a tick if QuickBooks does not file it);
  - I-9 Section 1 (day 1), then I-9 Section 2 with the scans uploaded (within 3 business days; decision 13);
  - Emergency contact, ICE (auto, from the profile);
  - Handbook signed;
  - Logged into Dash on a personal device;
  - Time clock explained, then the first clock-in (auto, from `TimeEntry`);
  - Schedule filled in (auto, from `ShiftAssignment`);
  - Kiosk badge issued (auto);
  - Trained with manager;
  - Introduced to the team;
  - T-shirts given (count and size).
- **My onboarding** in Dash for the new hire. **People → Onboarding** for managers, with overdue items in red.
- **Handbook v1, super basic.** Claude drafts it from the owner's rules:
  - the welcome and the mission;
  - at-will;
  - hours, time clock, breaks and call-ins;
  - pay days;
  - dress and T-shirts;
  - phones, the staff discount, and Thrift+ rules for staff;
  - safety, harassment and how to report it, and leaving.

  Each version is signed through documents. The attorney reads it before the first signature.

### Phase 5 — 30, 60 and 90-day check-ins
The check-ins appear when due, are filled in during an in-person meeting, signed by both, and readable by the employee in Dash.
**Gated by:** Phase 4.
Detail when Phase 4 is built. Outline:

- Check-ins are created at Create employee for days 30, 60 and 90 from the start date, assigned to the manager. They appear in People → Check-ins when due, and as a line in the AI brief.
- The form lives in the careers file (`checkin:`). It asks:
  - what is going well;
  - training gaps;
  - goals for the next 30 days;
  - the manager's notes per area;
  - the employee's comments.
- It is filled on a phone or tablet in the meeting, and both sign with a finger. The employee reads it under **My check-ins**. The 90-day check-in can close onboarding.

### Phase 6 — Texts to applicants and new hires
Interview confirmations and reminders, and the first-day reminder, by text for those who ticked the box.
**Gated by:** all three of these:
- master's `notify` package (`standards.md` T60);
- the Eco-Thrift Twilio key;
- the 10DLC campaign approved. Its wording already covers applicants (master, 2026-10-06).

The first text is master's opt-in confirmation sample. Detail when the gates clear.

---

## Concurrent plan (with the inventory work)

**Where the other work stands (2026-10-06):**

- **[`inventory_effort`](./inventory_effort.md):** Phases 1 and 2 shipped in **v2.133.0** (Heroku v403). Phases 3 (shrink worklist) and 4 (report) are being built in another session, in the main checkout, which also ships them.
- **Thrift+:** last project day **Thu 10-15**, freeze **10-16 to 10-19**, launch **Tue 10-20**.
- **Heroku database switch:** Sun 10-11, 3–7 AM CT. No deploys or data loads then.

**Rules:**

1. **Separate trees.** Hiring is built only in `C:\Coding\_worktrees\ecothrift-dashboard--hiring` (branch `hiring`, from `origin/main` v2.133.0). The inventory session owns the main checkout. This file is edited only in the hiring worktree. Mail with master stays in the main checkout's `.ai/comm/`.
2. **Shipping:** each hiring phase ships from the worktree when tested and the owner says **ship** / **deploy**. The order: `git fetch`, merge `origin/main`, bump past the newest version.
3. **Shared files are merged by hand at each ship:**
   - `CHANGELOG.md`, `.version`, `package.json`;
   - `ecothrift/settings.py` (`INSTALLED_APPS`) and `ecothrift/urls.py`;
   - `frontend/src/App.tsx`, `navItemCatalog.ts`, `slotCNavLayout.ts` (+ its test);
   - `frontend-public/src/App.tsx` and `components/Layout.tsx`;
   - `apps/core/views.py` (sitemap);
   - `frontend-public/src/data/legal.ts`;
   - `scripts/dev/lean_test.py` (adds `hiring`).
4. **Never in the same release** as inventory or Thrift+. **Nothing ships in the 10-16 to 10-19 freeze**, or in the database-switch window. Hiring touches no POS code, so a hiring deploy can go out in the day.
5. **Separate test and dev setups:**
   - hiring tests use `DATABASE_NAME=hiring_gate` (test database `test_hiring_gate`); inventory uses `test_local_shared`;
   - dev servers on ports 8010 / 5183 / 5184; inventory uses 8000 / 5173 / 5174.

**Dates:**

| When | Hiring |
|---|---|
| Tue 10-06 to Wed 10-07 | Build Phase 1 |
| Thu 10-08 | The owner reads the careers page, the form and the `/terms` change on the preview link. **Ship + deploy Phase 1**, then turn `public` on when he says. Tell master (texting campaign). Update the Facebook post's last line: "To apply: ecothrift.us/careers. It takes about 5 minutes." |
| Fri 10-09 to Tue 10-13 | Build Phase 2 (interview calendar) and ship it |
| Wed 10-14 to Thu 10-15 | Build Phase 3 (offers); ship by 10-15 or after the freeze |
| 10-16 to 10-19 | Freeze (build only: Phase 4 and the handbook draft) |
| Tue 10-20 to Fri 10-23 | Launch fixes first. Ship Phase 3 if not out, then Phase 4 |
| Mon 10-26 to Fri 10-30 | Phase 5 (check-ins). Phase 6 when its gates clear |

**From the owner (when he has a minute):**

- who interviews, and the usual interview windows (Phase 2);
- create the `jobs@ecothrift.us` shared mailbox in Microsoft 365 if he wants that sender (decision 16);
- a real team photo for the careers page (his draft's advice: an AI store photo reads as fake);
- the house rules for the handbook (Phase 4);
- T-shirts per hire.

---

## Acceptance

- [x] Phase 1 as above (v2.136.0)
- [ ] Phases 2 to 6 when detailed
- [ ] No SSN, bank or routing numbers stored; I-9 files Admin-only and private
- [ ] No applicant is moved or rejected by AI; no Not now email sends without a person pressing Send
- [ ] Nothing ships with an inventory or Thrift+ release, in the freeze, or in the database-switch window
- [ ] Out-of-scope items stay out

---

## Record

**2026-10-06 — Opened.** The owner listed eleven asks: job descriptions, a hiring front page, a screener email, the application, the screener inside it, an interview calendar with email or text confirmation, offers, the first-day email, the onboarding checklist, 30/60/90 check-ins, and no-hire records with draft emails. He asked that JSON/YAML and AI both work. Claude grouped them into phases, read the code for what to reuse, and checked the hiring rules on the web: USCIS I-9 retention, Nebraska new-hire reporting, E-Verify, ban the box.

**2026-10-06 — The owner's answers; re-planned.** Hiring is urgent and runs in parallel with inventory_effort (another session). Payroll is QuickBooks Online. Applicant texts go into the 10DLC campaign; master updated `texting.md` the same day. Pay is $15 to $25. His drafted post, form, auto-reply and tracker became Phase 1, which also absorbed no-hire records and Hired → Create employee. The interview calendar, offers, onboarding and check-ins moved up one phase each, and texts became Phase 6. The worktree `--hiring` was made from `origin/main` v2.133.0.

**2026-10-06 — Phase 1 built (not shipped).** `apps/hiring`, `/careers`, People → Applicants and Jobs & careers page, as in the acceptance above. Reference: [`extended/hiring.md`](../extended/hiring.md).

Checks:

- 23 hiring tests and the 4 legal-page tests (test database `hiring_gate`);
- the front-end tests in `src/pages/people` and `src/navigation` (52);
- staff `tsc` and public `tsc`.

Checked by hand in a browser (local, ports 8010 / 5183 / 5184):

- `/careers` hidden while off; the preview link shows it with a banner;
- the phone-width form: missing answers marked, then a test applicant applied (lifting = no, text box ticked);
- the console mail showed the owner's auto-reply (Reply-To Bill) and the alert "RED: Lift 50 lbs";
- in Dash: the flags, answers, role question, timeline, → Reviewed, 4 stars, a note, and Not now (Missing a must-have, Don't send);
- Jobs & careers page:
  - a pasted YAML inside a chat answer listed exactly its 2 changes;
  - **Draft with AI** (local model Gemini Flash-Lite) returned the whole file with one new draft role;
  - neither was saved;
- turned on locally, the role page carries `JobPosting` (from $15/hr), and Careers shows in the header and footer.

The test applicant was deleted, and the page was turned off again.

Claude's calls while building:

- **No confirm code in the first email.** It comes with booking in Phase 2.
- **A careers file that leaves keys out keeps today's values**, so a short AI answer can't wipe the rest. Found in testing.
- **Phone search** uses a digits-only copy of the number.
- **The Vite dev servers** read `ECOTHRIFT_*_PORT` so two coders can run at once.
- **The careers sender** stays the store mailbox, with Reply-To Bill, until `jobs@` exists.

**2026-10-06 — Shipped v2.136.0** at the owner's order (ship and deploy), on top of inventory_effort's v2.134.0 and v2.135.0 (changelog merged by hand). The careers page stays hidden until the owner turns it on in People → Jobs & careers page. When it is on, tell master (texting campaign).

---

## See also

- Index: [`_index.md`](./_index.md)
- Runs beside: [`inventory_effort.md`](./inventory_effort.md); compass [`thrift_plus_rewards.md`](./thrift_plus_rewards.md)
- Signing: [`extended/documents.md`](../extended/documents.md) · Forms format: [`extended/routines.md`](../extended/routines.md) · Roles: [`extended/auth-and-roles.md`](../extended/auth-and-roles.md)
- Texting rule D17: `C:\Coding\.ai\standards\texting.md`

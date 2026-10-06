<!-- initiative: slug=hiring-onboarding status=active updated=2026-10-06 -->
<!-- Last updated: 2026-10-06 -->

# Initiative: Hiring and onboarding

**Status:** **Active** — Phase 1 (not started; plan written).

**Objective:** The owner runs hiring from Dash, start to finish:

- He posts jobs on ecothrift.us. He writes them by hand, from JSON/YAML, or with AI.
- People apply from a phone, with the screener questions inside the application.
- Applicants confirm their email and book an interview from open times he sets.
- They sign an offer with a finger.
- Each new hire gets a first-day email and an onboarding checklist. The checklist creates their Dash user and employee record and keeps their I-9 papers privately.
- The 30, 60 and 90-day check-ins come up on time, and the employee can read them in Dash.
- Everyone not hired has a reason, the step they reached, and the email they were sent.

Today none of this exists. Hiring happens by hand, outside Dash.

**Compass:** this file is not the compass; Thrift+ Rewards stays the compass until launch. [`inventory_effort`](./inventory_effort.md) stays the owner's operations priority. This work runs beside it (see **Concurrent plan**).

**Later, on the same base (not this initiative):** termination, PIPs, write-ups and discipline, performance reviews.

---

## Where it stands (code read 2026-10-06)

No hiring, applicant or onboarding code exists. These parts are reused:

| Need | Reuse | Gap |
|---|---|---|
| Staff user and employee record | `accounts.User` + `EmployeeProfile` (position, department, pay rate, hire date, emergency name and phone). Created inline in `UserCreateSerializer.create()` | Pull it into a service both the Users page and onboarding call (Phase 5) |
| Set-password email for a new hire | `accounts/services/staff_password.py` | none |
| Sign with a finger, audit page | `apps/documents` (parked): placed fields, `SignaturePad.tsx`, `flatten.py` adds an audit page (signer, time, IP, device) | Only logged-in staff can sign. Needs outside signers: a token link and an email code (Phase 4) |
| JSON/YAML authoring with AI | Routines' `routineJson.ts` (Copy for AI → paste JSON → diff → Save); floor plan's `planFile.ts` (`js-yaml`, JSON or YAML) | Same pattern for jobs, onboarding lists and check-in forms. The backend has no YAML: files round-trip in the browser, and the database is the truth |
| AI drafts | `core/services/llm_router.py`, a model per purpose in Settings > AI | New purposes `hiring.*` |
| Email | `GraphEmailBackend`; DB-editable `mailbox.EmailTemplate` and `render_email_template()` | Add the hiring keys to the template whitelist |
| Confirm an email | `webstore` hold confirmations (6-digit code, 24 h, 5 tries, resend cooldown); `CodeInput.tsx` | none |
| A person who is not a Dash user | Thrift+ `member_auth.py` + `MemberSession` (hashed token in an httpOnly cookie) | Copy it for applicants |
| Private files | `core.S3File`; `core/files.py` `stream_s3()` streams through the API, never a public link | An image and Word-file validator (only PDFs are validated today) |
| Public site | `frontend-public/` routes, sitemap, `/privacy` and `/terms` | No public upload exists yet; the apply form is the first |
| Staff nav | `navItemCatalog.ts` + `slotCNavLayout.ts`. HR lives in the Admin workspace | New **People** workspace |
| Onboarding auto-checks | `hr.ShiftAssignment` (schedule), `hr.TimeEntry` (first clock-in), kiosk badge, `EmployeeProfile.emergency_*` | none |
| Texting | none. House rule D17: Twilio through master's `notify` package, consent recorded; `standards.md` T60 waits on master | The Eco-Thrift 10DLC campaign wording covers Thrift+ texts only, not applicants |

---

## Finish line

An applicant finds a job on **ecothrift.us/jobs** and applies from a phone, with resume and screener in one form. They confirm their email and book an interview time.

On **People → Applicants**, a manager:

1. moves them through the steps;
2. sends an offer they sign with a finger;
3. presses **Start onboarding**.

Then:

- the Dash user and the employee record exist;
- the first-day email has gone out;
- the checklist runs to done: I-9 on file, handbook signed, payroll set up, the time clock used.

The 30, 60 and 90-day check-ins show up when due, and the new hire reads them under **My check-ins**. Every applicant not hired has:

- a reason;
- the step they reached;
- the email that was sent, or a note on why none was.

---

## Out of scope

- Termination, PIPs, discipline, performance reviews. They come next, on the People workspace, the signing and the check-in forms built here.
- **Electronic I-9** and E-Verify. The I-9 is done on the paper USCIS form; Dash stores the scans and tracks the due dates. (Electronic I-9 systems have their own federal rules.)
- Storing **SSN, bank account or routing numbers**, running payroll, or filing tax forms. Those live in the payroll provider.
- Background checks and drug tests.
- Auto-posting to Indeed or ZipRecruiter. Google Jobs gets the postings through structured data on the page; a manual copy to Indeed is fine.
- Two-way Outlook or Google calendar sync. Interviews send an `.ics` file.
- AI that scores, ranks or rejects applicants.
- Texting before the Phase 7 gates clear.

---

## Rules this must follow

This is research, not legal advice. The owner's attorney confirms before the handbook and the offer letter are first used.

- **I-9 timing:** Section 1 by the employee by day 1. Section 2 by the employer within 3 business days, after examining the original documents in person.
- **I-9 retention:** keep each I-9 for 3 years from hire, or 1 year after the person leaves, whichever is later.
- **I-9 storage:** keep I-9s apart from the personnel file. Copies of the identity documents are optional, but the same rule must apply to every employee ([USCIS, Retention and Storage](https://uscis.gov/node/41388)).
- **Nebraska new-hire report** within 20 days of hire (Neb. Rev. Stat. 48-2301). Payroll providers often file it for you ([DHHS](https://dhhs.ne.gov/Pages/Child-Support-Employer-New-Hire.aspx)).
- **E-Verify** is not required for private Nebraska employers. LB532 was postponed on 2026-04-17.
- **Ban the box:** Nebraska's law covers public employers only. Not asking on the application is still Claude's default (decision 9).
- **Never asked:**
  - age (except "18 or older?" where the role needs it);
  - race, religion or national origin;
  - citizenship (only "authorized to work in the US?");
  - marital or family status;
  - pregnancy, disability, health or genetics;
  - arrests.

  The AI briefs carry this list.
- **Records:** applications and hiring decisions are kept at least 1 year after the decision. That is the EEOC rule at 15+ employees and good practice below it.
- **E-signatures** are valid under federal ESIGN and Nebraska's UETA when:
  - the signer agrees to sign electronically;
  - the record keeps who signed, when and how.

  The audit page does that.
- **Texts** follow D17: a separate consent tick, never pre-ticked, recorded, and STOP works. House rule D13 (no texted sign-in codes) means a texted code to confirm a phone needs Bill's say-so.

---

## Decisions (Claude's calls; the owner can change any)

1. **One new app, `apps/hiring`.** Additive tables. The only edits to existing code are documents' outside signers (Phase 4) and the create-user service (Phase 5), each with its own tests.
2. **A People workspace in Dash** (Manager and Admin): **Jobs · Applicants · Interview times · Onboarding · Check-ins**. The later HR work joins it. Users, Departments and Shifts stay in Admin for now.
3. **Jobs are written three ways, one format.** `ecothrift.job/1` holds title, pay range, hours, type, sections, screener questions and interview questions.
   - **By hand** in the editor.
   - **Offline:** **Copy for AI** gives a brief with the format and the never-ask list. Paste it into any chatbot, then paste the JSON or YAML back with **Update from JSON/YAML**. A diff shows, and **Save** commits.
   - **Direct:** **Draft with AI** in the editor, from a few lines the owner types. Nothing saves until Save.

   The onboarding checklist (`ecothrift.onboarding/1`) and check-in forms (`ecothrift.checkin/1`) work the same way.
4. **The screener is inside the application, not a second email** (the owner's item 5). Any screener question can be marked **must-have**. A miss flags the application in red, but a person still decides.
5. **One first-touch email.** It says:
   - "We got your application";
   - here is a code to confirm your email;
   - what happens next.

   Confirming opens the applicant's page (`ecothrift.us/jobs/my`). From Phase 3 on, the same page books the interview.
6. **Applicants are not Dash users.** Email + 6-digit code gives a session cookie, copied from the Thrift+ member session. A new hire becomes a Dash user only at **Start onboarding**.
7. **AI writes and summarizes; people decide.** AI may:
   - draft job posts;
   - summarize a resume against the job in 3 to 5 lines;
   - polish a no-hire email.

   It never scores, ranks or moves an applicant. Every step change records who, when and why.
8. **No-hire emails never send themselves.** **Not moving forward** asks for a reason, then shows a draft from that reason's template. Staff edits it and presses **Send** or **Don't send**, and the record keeps the text. Starting reasons:
   - Not available for the hours we need;
   - Missing a must-have;
   - No-show for the interview;
   - Didn't respond after 2 tries;
   - Withdrew;
   - Offer declined;
   - Chose another candidate;
   - Position closed;
   - Other (note required).
9. **No criminal-history question on the application.** The owner can add one as a screener question if he wants it.
10. **Pay range shows on every posting.** It brings more applicants, and Google Jobs wants it.
11. **"No resume" is fine.** Applicants can upload a PDF, Word file or a photo of a paper resume, or type their work history instead.
12. **Sensitive files are private.** Resumes, I-9 scans and signed papers go under an S3 `hiring/` prefix. They are served only through `stream_s3` and never by public link. I-9s are Admin-only and kept apart from the employee record.
13. **Copies of I-9 documents: kept for everyone, or for no one.** Claude's default is to keep them for everyone (one rule, easy to defend). The attorney can flip it.
14. **"ICE" in the checklist means In Case of Emergency** (the emergency contact). `EmployeeProfile` already has the fields.
15. **Public pages ship dark.** A setting, `hiring.public_enabled`, hides `/jobs` and the footer link until the owner turns it on.

---

## Phases

Each phase is about a week and ships on its own, from the hiring worktree.

### Phase 1 — Jobs and the Careers page
Jobs exist in Dash, are written by hand, from JSON/YAML or with AI, and show on ecothrift.us/jobs.
**Gated by:** none.

Acceptance:
- [ ] `apps/hiring` with `Job`:
  - title, slug, department, type;
  - pay min and max, and the unit;
  - hours text, summary and sections;
  - screener questions and interview questions (JSON);
  - status **Draft / Open / Paused / Closed**, open and close dates.

  The migration is additive only.
- [ ] **People → Jobs** (Manager, Admin) shows a list and an editor. A preview shows the job exactly as the public page will.
- [ ] `ecothrift.job/1` round-trip (decision 3):
  - **Copy for AI**, with the never-ask list;
  - **Update from JSON/YAML**, with a diff;
  - **Export YAML**;
  - **Save** commits.
- [ ] **Draft with AI** in the editor (Settings > AI purpose `hiring.job_draft`) fills the sections and screener questions from a few lines.
- [ ] Public **`/jobs`** (open jobs: title, pay, hours, type) and **`/jobs/<slug>`** (full post, **Apply** button reading "Applications open soon" until Phase 2). Both carry `JobPosting` structured data and sitemap entries.
- [ ] `hiring.public_enabled` (decision 15) hides the pages and the footer **Jobs** link until it is on.
- [ ] Claude drafts the first posts from the roles the owner names, for him to edit.
- [ ] Tests:
  - only Open jobs are public;
  - hidden while the switch is off;
  - the round-trip parses, validates and rejects bad files;
  - sitemap and structured data.

### Phase 2 — Apply, first touch, Applicants, and no-hire
People apply from a phone with the screener inside. Staff work the list, and every no-hire is recorded with its email.
**Gated by:** Phase 1.

Acceptance:
- [ ] Public **`/jobs/<slug>/apply`**, phone-first. It asks for:
  - name, email, phone;
  - a resume (PDF, DOC/DOCX or a photo, 10 MB max), or typed work history (decision 11);
  - availability (days × morning, afternoon, evening);
  - the job's screener questions;
  - how they heard about us.
- [ ] Abuse guards: throttle, honeypot field, file checks by magic bytes. Files are private (decision 12).
- [ ] Must-have misses flag the application (decision 4).
- [ ] One first-touch email (decision 5), template `hiring.received`, editable in Dash. The email code opens **`/jobs/my`**, which shows each application's step.
- [ ] **People → Applicants**:
  - list by step: New, Reviewing, Interview, Offer, Hired, Not moving forward, Withdrew;
  - filter by job, sort, search.
- [ ] The applicant card shows:
  - the resume viewer, answers, availability and flags;
  - staff notes;
  - a timeline of every step change (who, when, why).
- [ ] **AI summary** button on the card (decision 7).
- [ ] **Not moving forward** (decision 8): a reason and the step are required. A draft email comes from the reason's template; **Send** or **Don't send**; the text is kept.
- [ ] Tests:
  - apply with and without a resume;
  - bad files refused;
  - code confirm and lockout;
  - step changes logged;
  - no-hire requires a reason;
  - no email without **Send**.

### Phase 3 — Interview calendar
The owner sets open interview times, and confirmed applicants book, change or cancel their own.
**Gated by:** Phase 2.
Detail when Phase 2 is built. Outline:

- **People → Interview times:** a weekly pattern (for example Tue and Thu 2–4 PM, 30-minute slots), one-off times, interviewer and place. Holidays and closed days are skipped (`webstore/services/hours.py`).
- Only an applicant whose email is confirmed may book (the owner's item 6). The first-touch email and `/jobs/my` carry **Pick a time**.
- The booking email carries an `.ics` file and a change or cancel link. A reminder goes the day before (a Scheduler command).
- **Today's interviews** for staff. A scorecard from the job's interview questions, filled on a phone.
- **No-show** is one tap, and it opens the no-hire draft.

### Phase 4 — Offers signed with a finger
An offer letter goes out as a link, is signed on a phone, and comes back as a flattened PDF with an audit page.
**Gated by:** Phase 2 (can run beside Phase 3).
Detail when Phase 2 is built. Outline:

- The offer template fills in:
  - the job, pay and start date and time;
  - the schedule and the supervisor;
  - the at-will line, and that the offer depends on the I-9.

  The owner edits the template; the attorney reads it once.
- `documents` gets **outside signers**: a recipient with no Dash user, a hashed token link, the email code, and consent to sign electronically. Fields, `SignaturePad` and `flatten.py` are reused as they are.
- Offer states: **Sent · Viewed · Signed · Declined · Expired**. Declined opens the no-hire draft (reason: Offer declined).
- The signed PDF is emailed to the new hire and kept on the application.

### Phase 5 — Onboarding
**Start onboarding** creates the person in Dash, sends the first-day email, and runs the checklist to done.
**Gated by:** Phase 4.
Detail when Phase 4 is built. Outline:

- **Start onboarding** on a signed offer creates:
  - the Dash user (Employee role);
  - the `EmployeeProfile`, through a new `accounts` service the Users page also uses;
  - the set-password email.
- **First-day email** (template `hiring.first_day`) covers:
  - when, where to park and enter, who to ask for;
  - what to wear;
  - what to bring: the I-9 document choices (one List A, or one List B plus one List C).
- **Checklist** from `ecothrift.onboarding/1`. Each item has an owner (new hire, manager or owner), a due point (before day 1, day 1, week 1, by day 20) and a kind (tick, upload, sign, form, or auto). Starting items:
  - Emergency contact, ICE (auto, from the profile);
  - I-9 Section 1 (day 1), then I-9 Section 2 with the scans uploaded (within 3 business days);
  - W-4 and Nebraska W-4N (in the payroll provider, or uploaded);
  - Payroll and direct deposit set up (a tick; numbers never enter Dash);
  - Nebraska new-hire report (by day 20, unless the payroll provider files it);
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
  - welcome and at-will;
  - hours, time clock, breaks and call-ins;
  - pay days;
  - dress and T-shirts;
  - phones, the staff discount, and Thrift+ rules for staff;
  - safety, harassment and how to report it, and leaving.

  Each version is signed through documents. The attorney reads it before the first signature.

### Phase 6 — 30, 60 and 90-day check-ins
The check-ins appear when due, are filled in during an in-person meeting, signed by both, and readable by the employee in Dash.
**Gated by:** Phase 5.
Detail when Phase 5 is built. Outline:

- Check-ins are created at **Start onboarding** for days 30, 60 and 90 from the hire date, assigned to the manager. They appear in People → Check-ins when due, and as a line in the AI brief.
- The form is `ecothrift.checkin/1`, editable with the same round-trip. It asks:
  - what is going well;
  - training gaps;
  - goals for the next 30 days;
  - the manager's notes per area;
  - the employee's comments.
- It is filled on a phone or tablet in the meeting, and both sign with a finger. The employee reads it under **My check-ins**.
- The 90-day check-in can close onboarding.

### Phase 7 — Texts to applicants and new hires
Interview confirmations and reminders, and the first-day reminder, by text for those who tick the box.
**Gated by:** all three of these:
- master's `notify` package (`standards.md` T60);
- the Eco-Thrift Twilio key;
- the 10DLC campaign covering applicant texts. Its wording today covers Thrift+ only; adding hiring before it is submitted is the owner's call.

Detail when the gates clear. Email stays the way to confirm identity (D13).

---

## Concurrent plan (with the inventory work)

**Where the other work stands (2026-10-06):**

- **[`inventory_effort`](./inventory_effort.md):**
  - Phases 1 and 2 (one inventory across days, PR Fix-it one-scan fixes) are **built and checked on the dev copy**. They are **not committed or shipped**: 16 files changed in the main tree (about 900 lines).
  - Next: the owner says **ship**, then deploy after close, then the 10-06 → 10-05 merge is staged as a Request for him to approve.
  - After that come Phase 3 (shrink worklist) and Phase 4 (report). Phases 5 and 6 are not gated.
- **[`intake_updates`](./intake_updates.md)** waits on the owner (Request #11; detail for Phases 4 and 7).
- **Thrift+:** last project day **Thu 10-15**, freeze **10-16 to 10-19**, launch **Tue 10-20**.

**Rules:**

1. **Priority order:** Thrift+ launch fixes first, then inventory when the owner is waiting on it. Hiring fills the rest.
2. **Separate trees.** Hiring is built in a worktree, `C:\Coding\_worktrees\ecothrift-dashboard--hiring` (branch `hiring`, from `origin/main`). The main tree keeps the inventory work, so neither ship picks up the other's half-done files. Each hiring phase ships from the worktree: `git fetch`, merge `origin/main`, bump past the newest version.
3. **Shared files are merged by hand at each ship:**
   - `CHANGELOG.md`;
   - `ecothrift/settings.py` (`INSTALLED_APPS`) and `ecothrift/urls.py`;
   - `frontend/src/App.tsx`, `navItemCatalog.ts`, `slotCNavLayout.ts`;
   - `frontend-public/src/App.tsx`;
   - `scripts/dev/lean_test.py` (add `hiring`).
4. **Never in the same release** as inventory or Thrift+. **Nothing ships in the 10-16 to 10-19 freeze.** Hiring touches no POS code.
5. **Owner time is Mon to Thu.** Reviews of job text, the offer letter and the handbook go on those days.

**Proposed dates** (a ship needs the owner's word):

| When | Inventory effort (main tree) | Hiring (worktree) |
|---|---|---|
| Tue 10-06 to Thu 10-08 | Ship Phases 1 and 2; deploy after close; stage the merge Request. Build Phase 3 | Plan written (today). Build Phase 1 |
| Fri 10-09 to Sun 10-11 | Build Phase 4 | Build Phase 2 |
| Mon 10-12 to Thu 10-15 | Thrift+ dry run and fixes first. Ship Phases 3 and 4 | Ship Phase 1, and Phase 2 if tested, dark. The owner reviews the job posts and turns `/jobs` on when he wants applicants |
| Fri 10-16 to Mon 10-19 | Freeze | Freeze (build Phase 3 only) |
| Tue 10-20 to Fri 10-23 | Launch fixes. Phase 5 audit | Ship Phase 3 (calendar). Build Phase 4 (offers) |
| Mon 10-26 to Fri 10-30 | Phases 6 and 7 | Ship Phase 4. Build Phase 5 (onboarding). The handbook draft goes to the owner |
| Mon 11-02 to Fri 11-06 | — | Ship Phase 5. Build and ship Phase 6 (check-ins). Phase 7 when its gates clear |

**From the owner (when he has a minute):**

- the roles to open first, with pay range and hours (one line each; AI drafts the rest);
- who interviews, and the usual interview windows;
- the payroll provider;
- the mailbox hiring mail comes from (default: the one Dash sends from now);
- the house rules for the handbook;
- T-shirts per hire.

---

## Acceptance

- [ ] Phase 1 as above
- [ ] Phase 2 as above
- [ ] Phases 3 to 7 when detailed
- [ ] No SSN, bank or routing numbers stored; I-9 files Admin-only and private
- [ ] No applicant is moved or rejected by AI; no no-hire email sends without a person pressing Send
- [ ] Nothing ships with an inventory or Thrift+ release, or in the freeze
- [ ] Out-of-scope items stay out

---

## Record

**2026-10-06 — Opened.** The owner listed eleven asks: job descriptions, a hiring front page, a screener email, the application, the screener inside it, an interview calendar with email or text confirmation, offers, the first-day email, the onboarding checklist, 30/60/90 check-ins, and no-hire records with draft emails. He asked that JSON/YAML and AI both work. Claude grouped them into seven phases, read the code for what to reuse, and wrote the concurrent plan beside `inventory_effort`. Hiring rules were checked on the web the same day (USCIS I-9 retention, Nebraska new-hire reporting, E-Verify, ban the box).

---

## See also

- Index: [`_index.md`](./_index.md)
- Runs beside: [`inventory_effort.md`](./inventory_effort.md); compass [`thrift_plus_rewards.md`](./thrift_plus_rewards.md)
- Signing: [`extended/documents.md`](../extended/documents.md) · Forms format: [`extended/routines.md`](../extended/routines.md) · Roles: [`extended/auth-and-roles.md`](../extended/auth-and-roles.md)
- Texting rule D17: `C:\Coding\.ai\standards\texting.md`

<!-- initiative: slug=hiring-onboarding status=active updated=2026-10-06 -->
<!-- Last updated: 2026-10-07 (Phase 5, Applicants timeline and read-before-send shipped in v2.148.0) -->

# Initiative: Hiring and onboarding

**Status:** **Active**. Shipped: Phase 1 (v2.136.0), fuller role pages, the JSON for AI and hiring managers (v2.137.0), and Phase 2 interviews, AI help per role and email, and the Emails page (v2.139.0). The careers page is live (Bill turned it on 2026-10-06). Phase 3, offers signed with a finger, and practice runs shipped in v2.143.0. Phase 4, onboarding, and Phase 4b, staff purchases (switched off at first), shipped in v2.146.0. The handbook draft is complete and waits for the attorney's read before Bill publishes it. Phase 5, check-ins, shipped in v2.148.0 with the Applicants timeline (phone-first), read-before-send for hiring emails, and the dev test data. Next: Phase 6, texts, when its gates clear.

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
**Gated by:** Phase 1 (shipped). **Shipped** in v2.139.0 (2026-10-06).

The owner's inputs (2026-10-06):

- Interviews are typically **Monday to Friday, 9 AM to 5 PM**, and he can open more times when needed.
- **Bill** is the hiring manager on every role. **Carrie** sits in interviews by default. Everything stays changeable, per role and per interview.
- He likes to answer within 24 hours, but the promise is: after an interview, **you'll hear back within 5 business days**.

Claude's calls:

- **The emailed link is the email confirmation.** Staff press **Invite to interview**; the applicant gets an email with a private booking link. Opening it proves they own the address, so there is no separate 6-digit code. The same link changes or cancels. Staff can also **Copy link** and text it from their own phone (Dash itself texts nothing until Phase 6).
- **One interview at a time** (a small store). Open times are the weekly hours, plus extra openings, minus blocked times, minus booked interviews. Hours, slot length, days ahead and minimum notice live in the careers file (`interviews`), so the JSON round-trip covers them.
- **The interviewer** of a new interview is the role's first interviewer (Carrie), changeable on the interview. New roles take the careers file's default hiring manager and interviewers.
- **Reminders** go the day before, sent by the 10-minute mail tick (`sync_ms_mailbox`), so no new Scheduler job is needed.

Acceptance:
- [x] **Invite to interview** on the applicant panel. It emails the booking link (template `email.interview_invite`) and shows **Copy link**. The stage moves to Contacted if it was earlier. Logged.
- [x] Public **`/careers/interview?t=…`**:
  - the open times for the next 14 days, by day;
  - pick one, then confirm;
  - booked: the time, the place and who you'll meet, with **Change time** and **Cancel**;
  - a used or expired link says so.
- [x] **Emails:**
  - booked, to the applicant, with an `.ics` file;
  - a notice to the interviewer and the hiring manager, also with `.ics`;
  - changed and cancelled versions;
  - a reminder the day before.

  All editable in the careers file.
- [x] **Stages move on their own:** booked → Interview scheduled; cancelled by the applicant → Contacted; Done → Interviewed; No-show opens the Not now draft (reason No-show). Every change is on the timeline.
- [x] **People → Interviews:**
  - Today and Upcoming;
  - change interviewer, reschedule (staff pick a time, for example on the phone), cancel, **Done**, **No-show**;
  - the weekly hours, plus **Open extra time** and **Block time**.
- [x] **Scorecard on a phone:**
  - the role's interview questions, each with a 1–5 rating and a note;
  - overall **Hire / Maybe / No**, with notes;
  - shown on the applicant panel.

  The three roles get starter questions (copy), editable in the careers file.
- [x] Every new setting (`interviews`, the defaults, the new emails, the interview questions) is in the JSON bundle and its indexes.
- [x] Tests: open times (hours, notice, blocks, extras, booked), the booking link (book, change, cancel, expired), stage moves, the emails and `.ics`, reminders sent once, scorecard save.

### Phase 3 — Offers signed with a finger
An offer letter goes out as a link, is signed on a phone, and comes back as a flattened PDF with an audit page.
**Gated by:** Phase 1. **Shipped in v2.143.0** (2026-10-06; the owner: "start phase 3 offers").

**Claude's call (a change of plan): offers are built inside hiring, not by extending `documents`.**

- `documents` stamps fields onto an uploaded PDF and is staff-only.
- An offer is text we write, signed on the public site by someone with no Dash login.
- So hiring renders the letter and captures the finger signature itself. It then writes the signed PDF with PyMuPDF (as `documents/flatten.py` does), with an audit page.
- The handbook (Phase 4) is signed by people who already have Dash logins, so `documents` fits it as it is.

**More of Claude's calls:**

- **The link is the proof of the email.** The offer goes to the applicant's email as a private link, the same as the interview link. No extra code.
- **What they sign is frozen.** The letter text and the acknowledgments are saved on the offer when it is sent. Changing the template later never changes a sent offer; a new offer withdraws the open one.
- **A signed offer moves the applicant to Hired.** **Create employee** then fills the pay, start date and position from the offer.
- **A declined offer** stays at Offer, marked Declined, with a one-tap **Not now (Offer declined)**.
- **Consent to sign electronically** (ESIGN / UETA) is a required tick, with the wording saved. Typed legal name plus drawn signature. The audit page records:
  - the name and the email the link went to;
  - the time in store time and in UTC;
  - the IP and the device;
  - the offer number;
  - a SHA-256 fingerprint of the exact letter text.

Acceptance:
- [x] **Make offer** on the applicant panel. It asks for:
  - the role and the pay rate;
  - the start date and time, the schedule, the type;
  - who they report to (default: the hiring manager);
  - a reply-by date (default 3 days);
  - an optional personal note.

  Then a **Preview** of the letter, and **Email the offer** or **Copy link**. The stage moves to Offer. Logged.
- [x] Public **`/careers/offer?t=…`** (phone-first):
  - the letter;
  - the acknowledgments (from the 2024 job descriptions: can commute, OK with the pay and schedule, can do the duties, can meet the physical requirements with or without accommodation);
  - the e-sign consent and the typed legal name;
  - a finger signature pad;
  - **Sign and accept** or **Decline** (optional reason);
  - opening it marks the offer Viewed;
  - after the reply-by date it says Expired;
  - after signing, it shows "Signed" and **Download your copy**.
- [x] **On signing:**
  - the signed PDF (the letter, the ticked acknowledgments, the signature, the audit page) is stored privately;
  - it is emailed to the new hire (`offer_signed`);
  - a notice goes to the hiring manager and the notify address (`offer_notice`).
- [x] **On declining:** a notice to staff; the applicant panel offers **Not now (Offer declined)**.
- [x] **Staff:**
  - the offer card on the applicant panel: status, the letter, **Resend**, **Copy link**, **Withdraw**, **Signed PDF**;
  - **Create employee** is pre-filled from the signed offer.
- [x] **The letter and the emails are editable** on People → Emails: the "Offer letter" (with its acknowledgments), "Offer email", "Offer signed" and "Offer notice". Each has AI help and per-role versions, and all are in the careers JSON.
- [x] Tests:
  - make, view, sign, decline, expire, withdraw;
  - the PDF has the signature and the audit page;
  - a template change never changes a sent offer;
  - the signature data is checked;
  - the emails send.

### Phase 4 — Onboarding
**Start onboarding** sends the first-day email and runs the checklist to done.
**Gated by:** Phase 3. **Shipped in v2.146.0** (2026-10-07; the owner: "start phase 4 onboarding").

**Claude's calls:**

- **The handbook is signed inside hiring, not through `documents`.** `documents` stamps fields onto uploaded PDFs, and its pages aren't routed yet. The handbook is text the owner edits, so it is signed the way an offer is: a tick, the e-sign consent, a typed name, a finger signature, and a PDF with an audit trail.
- **Create employee no longer emails a password link.** Per D16 (T61, v2.144.0), the new hire scans a **Set password code** on day one and picks their own. Managers can show it for a new hire (Employee role) from onboarding; the accounts endpoint stays Admin-only.
- **Auto items** come from what Dash already knows:
  - emergency contact: `emergency_name` and `emergency_phone` on the profile;
  - Dash login: a usable password and a `last_login`;
  - first clock-in: a `TimeEntry`;
  - schedule: a `ShiftAssignment`;
  - kiosk badge: `badge_issued_at`, and not revoked.
- **The handbook can't be published while a `[confirm` mark is left.** The draft marks the facts the owner hasn't settled (breaks, call-ins, payday, shirts, phones, the staff discount, buying rules, the second person to report to).

Acceptance:
- [x] **Start onboarding** from Create employee (two ticks, both on by default) or from People → Onboarding (any employee). It copies the checklist from the careers file (`onboarding.items`) with due dates from the start date: before day 1; day 1; 3 business days (I-9); week 1; day 20.
- [x] **First-day email** (`first_day`, editable on People → Emails, with AI help and role versions) covers:
  - when and where, and who to ask for;
  - what to wear;
  - the I-9 documents to bring (List A, or List B plus List C, originals).
- [x] **Checklist** (15 items) with owner, due date, overdue in red, ticks, "Not needed", T-shirts with a count and size, and auto items.
- [x] **I-9 (Admin only, apart from the employee record):** upload the form and document copies, and record what was seen. **Section 2 done** needs the form, and shows the keep-until date (3 years from hire, or 1 year after leaving).
- [x] **Handbook v1 draft** on People → Onboarding → Handbook, with a preview and the `[confirm` marks highlighted. **Publish** (Admin) makes numbered versions, and new hires sign the latest one in Dash.
- [x] **My onboarding** (`/onboarding`) for the new hire: the emergency contact, the handbook to read and sign, and their own ticks. A banner on **Today** links to it while onboarding is in progress.
- [x] **People → Onboarding** for managers: in progress and done, progress bars, overdue counts, the Set password code, the first-day email again, cancel.
- [x] Tests: start and the email, ticks and counts, auto items, I-9 rights and the Section 2 rule, handbook publish (blocked by marks) and sign once, done when nothing is left, business days.

### Phase 5 — 30, 60 and 90-day check-ins
The check-ins appear when due, are filled in during an in-person meeting, signed by both, and readable by the employee in Dash.
**Gated by:** Phase 4. **Shipped in v2.148.0** (2026-10-07; the owner: "start phase 5 check-ins").

Acceptance:
- [x] **Made when onboarding starts**, one per day in the careers file's `checkin.days` (30, 60, 90), assigned to the new hire's manager. **Schedule check-ins** covers someone hired before onboarding existed. Migration `0012` backfills onboardings already started.
- [x] **The form** in the careers file (`checkin`):
  - questions: what is going well, where more training is needed, goals for the next 30 days;
  - five areas, each with Doing well / On track / Needs work and a note;
  - the employee's comments, and the statement they tick.

  A check-in keeps its own copy of the form from its first save.
- [x] **People → Check-ins:** due this week (overdue in red), coming up, done. Fill it in the meeting on a phone or tablet and save as you go. **Sign together** takes both typed names and both finger signatures on that device. Then it locks and a PDF with an audit trail is kept. **Skip** needs a reason.
- [x] **The last check-in can close onboarding:** anything still open is marked not needed.
- [x] **My check-ins** (`/check-ins`) for the employee: the dates coming up, and each signed one in full with its PDF. The Today banner points to it when one is due within a week or was signed in the last two weeks.
- [x] **The AI brief** gets a `hiring` section: check-ins due or overdue, overdue onboarding items, applicants waiting, interviews today, offers out.
- [x] Tests:
  - three made with onboarding;
  - fill, sign, lock, the employee reads it, and a stranger can't;
  - the last one closes onboarding;
  - the due list, skip, and the brief line.

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
- [x] Phase 2 as above (v2.139.0)
- [x] Phase 3 as above (v2.143.0)
- [x] Phase 4 and 4b as above (v2.146.0)
- [x] Phase 5 as above (v2.148.0)
- [ ] Phase 6 when detailed
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

**2026-10-06 — Fuller role pages (shipped in v2.137.0).** The owner, looking at the preview: "too simple", but not as much as the old corporate descriptions (Location Manager, Chief of Staff, and the 2024 set of 17 pages: managers, associates, MRR, ARR). His facts:

- one location, the Canfield store at 8425 West Center Road (no warehouse, no office);
- everyone works with Bill;
- no perks to list;
- today's roles are only retail, processing and restoration associates.

Each area has a lead, but the leads work alone and aren't performing well, so the postings should leave room for a strong new person to take the reins. Built:

- **Role sections:** About, What you'll do, What great looks like (from the 2024 performance metrics), What we're looking for, Nice to have, The physical side. About 350 words with the page-level text.
- **Room to grow** (page-level), and nothing said about the current leads.
- **Two optional lead questions**, with a **Wants to lead** tag in Applicants.
- **Migrations `0003` and `0004`:** the text loads only where the seed text is untouched, and the questions are inserted into the saved form.

Checks: 26 hiring tests, 52 front-end tests, both type-checks, migrations. Checked in a browser at desktop width.

**From the 2024 documents, kept for later phases:**

- the MRR (management expectations, signed) becomes the **lead acknowledgment** when someone is made a lead;
- the job-description acknowledgment becomes ticks on the offer (Phase 3): "I can commute to the store", "I'm comfortable with the pay", "I can do the duties", "I can do the physical requirements";
- the ARR (admin) is not needed at one location.

**2026-10-06 — Everything in one JSON for AI; hiring manager and interviewers (shipped in v2.137.0).** The owner wants:

- every job description, screener and application setting updatable by JSON, as a download with the AI instructions, the key indexes and the current config, and an upload of the edit;
- or in-app AI with a model and effort he picks (defaults in Settings);
- a hiring manager on each role, and who sits in its interviews.

Built:

- **The bundle** `ecothrift.careers-bundle/1`: instructions, indexes, the careers file. Download, Copy and Upload (bundle or file) with a change list before Save.
- **Ask AI in Dash** with Model and Effort pickers, plus "Download this JSON".
- **Per role:** `hiring_manager` and `interviewers` (staff), and `department`, written by email or slug in the file and refused when not in the indexes.
- The hiring manager gets the alert, and Create employee uses the role's department.
- A role in a file that leaves keys out keeps today's values.

Checks: 34 hiring tests, 52 front-end tests, both type-checks, migrations. Checked in a browser: the staff list in the hiring-manager picker, a save showing "Hiring manager: Bill Rollins", and the AI dialog's 7 models with "Default: gemini-3.5-flash-lite" and "Default: low".

**Decision:** applicant records are not in the JSON. AI edits settings, never people (decision 7). The onboarding checklist, check-in forms and offer text (later phases) go into this same file and its indexes, so one download always covers all of hiring.

**2026-10-06 — Phase 2, the interview calendar (shipped in v2.139.0).** The owner's inputs: Bill is the hiring manager; Carrie interviews by default, changeable; he answers within 24 hours but promises 5 business days after an interview; interviews Monday to Friday, 9 AM to 5 PM, with more times opened when needed.

Built as in the acceptance above:

- `Interview`, `InterviewTime` and the booking token on `Application`;
- `apps/hiring/interviews.py` (open times, book, change, cancel, emails with `.ics`, scorecard, reminders);
- the public page `/careers/interview`;
- People → Interviews and the applicant panel's Interview section;
- six starter questions per role (`0007`).

Checks: 44 hiring tests and the mailbox tests (52 together), 52 front-end tests, both type-checks. Checked end to end in a browser: the invite email, booking from a phone-width page (weekdays only, 12 hours' notice), the interview in People → Interviews, then Scorecard → Save & mark done (stage Interviewed, overall Hire, timeline complete). The test data was removed.

Claude's calls while building:

- **The link is stored plain** so staff can copy it again. It only books that applicant's interview.
- **The applicant's own slot** isn't offered back to them as a new choice.
- **Reminders ride the 10-minute `sync_ms_mailbox` job**, plus `manage.py send_interview_reminders`.
- **Graph mail now carries attachments** (`apps/mailbox/graph.py`, `backends.py`).

**2026-10-06 — AI help per role and per email, background AI runs, the Emails page (shipped in v2.139.0).**

The owner hit a 503 using Ask AI in production. The whole-file run took about 44 seconds and Heroku cut it at 30 (H12). He doesn't want to talk with AI; he wants it to help edit the elements, inside the Edit button. He also asked whether emails are per job or universal.

Built:

- **`HiringAiJob` and `apps/hiring/ai.py`:** a background thread, polled from `/api/hiring/ai/`. Three kinds: one role, one email, the whole file.
- **AI help bar** (`AiHelpBar.tsx`) in the role editor (which now also edits the application and interview questions) and on every email.
- **People → Emails:** the universal versions, with **per-role versions** (`Job.emails`). `careers.template(key, application)` picks the role's version when it has one.

Checks: 60 backend tests (hiring and mailbox), 52 front-end tests, the type-check. Checked in a browser: Retail → Polish with a note returned in under 10 seconds, with the changed fields outlined and Undo; on the Emails page, a Retail-only auto-reply was created and removed again.

**2026-10-06 — Phase 3, offers signed with a finger (shipped in v2.143.0)** at the owner's order (ship and deploy), after inventory_effort's v2.142.0. The owner: "start phase 3 offers". Built as in the acceptance above:

- `Offer` (`0009`) and `apps/hiring/offers.py`: the letter frozen when made, the link, viewed / signed / declined / expired / withdrawn, and the signed PDF (PyMuPDF; the letter, the ticks, the signature, the audit trail);
- four new templates on People → Emails (Offer letter, Offer email, Offer signed, Offer notice), with an **Offer settings** card (who signs for Eco-Thrift, days to reply, the ticks, the e-sign wording), all in the careers JSON under `offer`;
- the applicant panel's **Offer** section (Make offer → Preview → Email the offer or Copy link; the offer card with Copy link, Email again, Withdraw, Signed PDF, Show letter, and **Not now (Offer declined)**);
- **Create employee** fills in from the signed offer;
- the public page `/careers/offer` with a finger signature pad.

Checks: 65 backend tests (hiring and mailbox), 52 front-end tests, both type-checks, migrations. Checked end to end in a browser (local, ports 8010 / 5185 / 5184; 5183 was taken by another chat):

- made an offer with a personal note, previewed the letter, copied the link (stage Offer);
- at phone width: the letter, missing ticks marked in red, a drawn signature, signed;
- the welcome page and **Download your signed copy** (a 2-page PDF);
- in Dash: Signed with the timeline (made, opened, signed), stage Hired, and Create employee filled with the offer's role, pay, start date and type;
- a second test offer declined with a reason, then **Not now (Offer declined)** opened with the reason picked.

The test data and the test login were removed.

Claude's calls while building:

- **The signed PDF subsets its fonts.** The first one was 1.25 MB for two pages; now about 50 KB. A test keeps it under 300 KB.
- **The done pages keep their side margins on a phone.** This also fixes the apply and interview done screens.
- **The card says "made", not "sent"**, because Copy link doesn't email anything; the history says which.
- **The Not now note no longer says "7 days"**, since the owner promises 5 business days.
- **The offer letter needs one read by the attorney** before the first real offer: the at-will and I-9 paragraphs, the four ticks, and the e-sign agreement. **Done:** the owner reported the attorney read and approved it (2026-10-06).

The owner also uploaded `hiring-people-and-timing-2026-10-06.json` in production (Bill hiring manager, Carrie interviewer on all three roles; 5 business days).

**2026-10-06 — Practice runs (shipped with Phase 3 in v2.143.0).** The owner: "a method of testing with Carrie… a mock that skips the need to fill in all the details… placeholders for all not put in." Built:

- `Application.is_practice` (`0010`);
- **People → Applicants → Practice run**: make a practice applicant (blanks get placeholders; must-haves pass), or copy a practice link to the real form (`/careers/apply?practice=<preview key>`), where everything may be left blank;
- a **Practice** tag on the list, the applicant and Interviews;
- `[Practice]` on every email subject and a first line saying it's a test, also on the calendar entry;
- practice interviews never block a real applicant's time; the offer PDF is stamped PRACTICE RUN; Create employee is refused;
- **Delete all practice runs** (interviews, offers, files too).

Checks: 69 backend tests (4 new), 53 front-end tests, both type-checks. Checked in a browser: a practice applicant for Carrie (auto-reply and alert both tagged [Practice] in the console mail), the practice form link at phone width sent with only a first name (Processing, placeholders), then Delete all practice runs (2 deleted). The test login was removed.

Found while testing: **the Applicants tab counts were wrong** when two applicants shared a stage; the model's default order leaked into the count's GROUP BY. Fixed (`order_by()`), with a test.

**2026-10-06 — Phase 4, onboarding (shipped in v2.146.0).** The owner: "approved #14, start phase 4 onboarding". Built as in the acceptance above:

- models `Onboarding`, `OnboardingTask`, `I9Record`, `I9File`, `Handbook`, `HandbookSignature` (`0011`);
- `apps/hiring/onboarding.py` and `onboarding_views.py`;
- the careers file's `onboarding` and `handbook`, and the `first_day` email;
- People → Onboarding, My onboarding, and the Today banner.

Checks:

- 226 backend tests (hiring, mail, accounts, hr; 6 new onboarding tests);
- the front-end tests in people, navigation, routines and users. The 5 failures in `myWork.test.ts` were there before;
- the type-check and migrations.

Checked end to end in a browser (local):

- Create employee with onboarding: the first-day email in the console mail, username `jordan`, 0 of 15;
- the Set password QR;
- ticks, and T-shirts 2;
- the I-9: upload a PDF, Section 2 done, keep until October 12, 2029; the item ticked itself;
- the Handbook tab: 8 marks highlighted. A test draft without marks published as version 1;
- signed in as the new hire with the username: the Today banner, then My onboarding at phone width. The emergency contact ticked itself; the handbook was signed with a finger, and the PDF has 2 pages with the audit trail.

The test data was removed and the handbook draft restored.

Found while testing:

- **I-9 scans** need `multipart/form-data` on the client (it was a 415);
- **calendar dates** need their own formatter (`dayText`): the moment formatter read "2026-10-12" as UTC and showed "Today 7:00 PM".

**2026-10-07 — The owner's handbook answers.**

- Breaks and call-ins: as drafted. Call your *manager* 2 hours ahead.
- Payday: payroll goes in after each two-week period, and the money usually lands Thursday or Friday; holidays can move it.
- Two T-shirts. Phones as drafted.
- No staff discount. Staff get a free Thrift+ membership with no cover, and payroll deduction (below).
- Staff may buy an item once it has been on the floor for one day ("I think"). No holds without Bill's OK.
- Problems go to the manager (the area lead). The lead decides whether to escalate and tells Bill; anyone can go straight to Bill.

He shared the 2024 handbook (49 pages, July 2024). Kept from it:

- clock in or out no more than 5 minutes early or late; no off-the-clock work;
- overtime at time and a half, OK'd in advance;
- unpaid time off and holidays;
- no smoking within 25 feet of the doors;
- no drugs or alcohol; theft and violence;
- confidentiality, with "talking about your own pay is always OK";
- 4 weeks' notice for leads.

Left out: the old locations and structure, the 90-day introductory period, and the unfilled template blanks. One `[confirm` mark was added: **paid sick leave**. Nebraska's law took effect 2025-10-01, and a 2025 amendment may exempt small employers; the attorney confirms what we owe.

**2026-10-07 — Staff purchases (Phase 4b, shipped in v2.146.0 at the owner's order, after inventory_effort's v2.145.0).** The owner:

- paid sick leave doesn't apply at this size; Eco-Thrift adopts Nebraska's rules at the start of 2027. The handbook says so, and no `[confirm` mark is left;
- "payroll deduction and free Thrift+ for staff: implement now… start with this off in settings… defaults 25% of last paycheck (new hires with no past pay do not qualify)".

Built:

- the `pos.staff_purchases` setting (seeded off, 25%); Admin only, including through the generic settings API;
- **Payroll deduction** at the register (`payment_method='payroll'`, `Cart.payroll_employee`) with its checks:
  - the switch is on and the buyer is active staff;
  - not their own sale;
  - a last paycheck over $0;
  - the pay period's payroll sales stay within the cap;
  - each item has been on the floor 24 hours;
- **People → Payroll deductions** for QuickBooks, with **Mark entered** (`PayrollDeductionMark`);
- **Thrift+ free for staff**: `Account.staff_user` and `ledger.staff_free`, linked from Thrift+ → Members.

Records: `.ai/extended/pos-system.md` § Payroll deduction and `thrift-plus-decisions.md` § Staff memberships.

Checks:

- 7 new tests (`apps/pos/tests/test_staff_purchases.py`);
- 532 backend tests (pos, thriftplus, hiring, core, accounts);
- 173 front-end tests and the type-check.

Checked in a browser: the Settings card (both off, 25%) and the Payroll deductions page.

Found: `apps/core` `test_seed_rows` had expected 18 AI actions since hiring 0002 added the 19th; the count is fixed.

**2026-10-07 — Phase 5, check-ins (shipped in v2.148.0 at the owner's order, after inventory_effort's v2.147.0).** The owner: "start phase 5 checkins". Built as in the acceptance above:

- `CheckIn` (`0012`, with the backfill), `apps/hiring/checkins.py` and `checkin_views.py`;
- the careers file's `checkin`;
- People → Check-ins (`CheckInsPage.tsx`), My check-ins (`MyCheckInsPage.tsx`), and the Today banner;
- the brief's `hiring` section (`apps/core/services/context_snapshot.py`).

Checks: 171 hiring and core tests (4 new), the front-end tests and the type-check. Checked in a browser at tablet size:

- a test hire 31 days in, so the 30-day check-in was overdue;
- the form filled in, an area rated, Save;
- **Sign together** with two finger signatures and the statement ticked;
- it locked and showed the read-only view.

The test data was removed.

Claude's calls:

- **Both sign on one device**, the manager's, in the meeting. The employee's statement says the signature means they saw it and could comment, not that they agree.
- **A check-in without a manager** still shows to every manager. It takes the onboarding's manager when there is one.

**2026-10-07 — Shipped with Phase 5 in v2.148.0: test data, the Applicants timeline, read-before-send, and the sender.** The owner, testing on dev:

- "add some test data… so if we bring in prod data it will be able to set up quickly again": `python manage.py seed_hiring_demo` (DEBUG only, no email, the `seed.example.test` domain; `--clear`).
- "a Timeline type UI on the left as a sort of selector… brings them up not in a drawer but the main content… then do this all over for a Mobile experience (SUPER high priority as interview days are often on the move)":
  - `StageTimeline` + `ApplicantView` (a Next step card per stage);
  - on a phone, the timeline is the list, then a full page with a fixed Call / Text / Email / Resume bar;
  - the list API adds `next_interview` and `offer_status`.
- "take to the Emails page and fill it in and have send available and cancel… notate if the data is being calculated… if user types over that show the calc is broken": read-before-send (`compose.py`, `EmailReview.tsx`, `EmailEditor.tsx`). Claude's proposal, approved: the email opens over the applicant, not on the Emails page; Dash's values are chips you type over (amber), not a broken highlight; edits are this email only; Cancel undoes the whole action; only emails sent with a button are reviewed.
- "emails should be selectable… bill_rollins, retail and warehouse", "default all to come from retail@": `careers.MAILBOXES`, sender retail@, the email groups fold.

Claude's calls:

- **A preview is a dry run.** The real action runs in a savepoint with mail held back, then rolls back, so the draft is exactly what would go.
- **The interview link is made before the review**, so the link shown is the link sent. A new offer's link cannot exist before the offer, so the review says "made when you send".
- **Within a stage, whoever has waited longest comes first.** Booked interviews are ordered by time; Hired and Not now newest first.
- **`careers.fill` matches `{placeholders}` with a regex** (it was `format_map`), so a stray brace in edited words no longer stops every value being filled.

---

## See also

- Index: [`_index.md`](./_index.md)
- Runs beside: [`inventory_effort.md`](./inventory_effort.md); compass [`thrift_plus_rewards.md`](./thrift_plus_rewards.md)
- Signing: [`extended/documents.md`](../extended/documents.md) · Forms format: [`extended/routines.md`](../extended/routines.md) · Roles: [`extended/auth-and-roles.md`](../extended/auth-and-roles.md)
- Texting rule D17: `C:\Coding\.ai\standards\texting.md`

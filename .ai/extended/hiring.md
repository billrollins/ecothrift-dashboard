<!-- Last updated: 2026-10-07 (Phase 6 texts, held until live; Phase 5 check-ins, Applicants timeline, read-before-send) -->
# Hiring

The careers page, applications, and the People workspace. Design and phases: [`initiatives/hiring_onboarding.md`](../initiatives/hiring_onboarding.md).

## Where things live

| Piece | Where |
|---|---|
| Models | `apps/hiring/models.py`: `Job` (role page sections: summary, duties, success, looking_for, nice_to_have, physical, works_with; department, hiring_manager, interviewers), `Application` (one or more roles, an answer snapshot, red flags, text consent, Not now, the linked employee), `ApplicationEvent` (every change: who, when) |
| The careers file | `apps/hiring/careers.py`: format `ecothrift.careers/1` in AppSetting `hiring.careers` (page text, form questions, emails, sender, `public`, `preview_key`). Jobs are rows, and the export carries them |
| Apply, stages, Not now, Create employee | `apps/hiring/services.py` |
| Mail | `apps/hiring/emails.py`. Plain text; sender from the careers file (`email.from`, default retail@). It goes through that Graph mailbox as "Eco-Thrift", with a fall back to the store mailbox with Reply-To. `from`, `reply_to` and `notify` must be in `careers.MAILBOXES` (retail@, bill_rollins@, warehouse@ecothrift.us; the dropdowns on People → Emails) |
| Review before send | `apps/hiring/compose.py`. A staff endpoint wrapped in `compose.run`: `preview: true` runs the action in a savepoint with mail held back, rolls it all back, and returns the draft (template, values, field labels, to, from, attachments, source). The real call carries `email: {subject, body}` (linked values still `{placeholders}`, filled at send) or `{skip: true}`. Reviewed keys: `compose.REVIEWED` (+ Not now through `not-now-draft`). `emails.send_template` applies it and logs the exact words on the history (`edited`, `typed_over`). Frontend: `EmailReview.tsx` (`useEmailReview`, `EmailCompose`), `EmailEditor.tsx` (TipTap: `field` chip node, `typedOver` mark), `emailTemplate.ts` |
| Texts (Phase 6) | `apps/hiring/texts.py` (which text when, values, history lines, `send_due_first_day`), `apps/texting/` (`TextConsent`, `TextMessage`, `service.send` / `waiting_on` / `record_consent` / `record_stop`). Words in the careers file `texts` (+ `OPT_IN_TEXT`, fixed). `apps/texting` is the house sender (no `notify` package; T60). **Held until live:** `WIRED` (the send step to Twilio) + `TWILIO_*` keys + AppSetting `texting.live` + not DEBUG. The first-day text needs a tick on a wording in `careers.FIRST_DAY_VERSIONS` (T71); the offer page offers that tick to a new hire on the old wording. Review: `compose.REVIEWED_TEXTS` (book, move, cancel) adds `text: {body} | {skip}`. API: `GET /api/hiring/texts/` (log + what it waits on), `POST applications/<id>/texts-stop/`. UI: `TextsPanel.tsx` (Emails → Texts), the text section in `EmailReview.tsx` |
| Resumes | `apps/hiring/files.py`: PDF, DOC/DOCX, JPEG/PNG/WEBP/HEIC by first bytes, 10 MB, S3 `hiring/resumes/`, streamed to staff only |
| Public API | `/api/hiring/public/careers/` (`?preview=<key>` while off), `/api/hiring/public/apply/` (multipart; honeypot `website`, `started_at`, 8/hour per IP) |
| Staff API (Manager, Admin) | `/api/hiring/applications/` (+ `counts/`, `<id>/stage|note|rating|not-now|not-now-draft|resume|create-employee/`), `/api/hiring/jobs/`, `/api/hiring/careers/` (+ `check/`, `public/`, `ai-draft/`) |
| Public pages | `frontend-public/src/pages/careers/`, `src/careers/` (API, CSS). Links show in the header and footer only while public |
| Staff pages | `frontend/src/pages/people/` (Applicants, Jobs & careers page); nav workspace `people`, key 9. Applicants = `StageTimeline` (left; ordering and hints in `applicantTimeline.ts`) + `ApplicantView` (main; a Next step card per stage). A phone gets the timeline as the list, then a full page with Back and a fixed Call/Text/Email/Resume bar. The list API adds `next_interview` and `offer_status` (prefetched) |
| Tests | `apps/hiring/tests/test_hiring.py`, `test_texts.py`; `apps/texting/tests.py`; `frontend/src/pages/people/careersFile.test.ts`, `applicantTimeline.test.ts`, `emailTemplate.test.ts`; `lean_test.py suite hiring` |

## Rules

- **AI never decides.** It drafts the careers file (`HIRING_CAREERS` in Settings > AI) and nothing else. Every stage change is a person, logged.
- **Not now emails send only on Send.** Don't send is recorded too.
- **Never ask** (form and AI brief): age except 18+, race, religion, national origin, citizenship except "authorized to work", marital or family status, pregnancy, disability or health, arrests or criminal history. `careers.check_doc` warns on obvious misses.
- **A file that leaves keys out keeps today's values**: a short AI answer can't wipe the rest. Jobs missing from a file are left alone; close a role in Jobs to hide it.
- **Text consent** wording is `SMS_CONSENT_TEXT` / `SMS_CONSENT_VERSION`. Changing the words means a new version. Nothing texts until `notify` lands (Phase 6).
- **No SSN, bank or routing numbers** anywhere in hiring. Payroll setup happens in QuickBooks.
- **Role pages** are about 250–300 words: About, What you'll do, What great looks like, What we're looking for, Nice to have, The physical side, plus the page-level Room to grow. No degree or years-of-experience rules for hourly roles, no invented perks. One location (Canfield); everyone works with Bill.
- **Lead questions** (`lead_interest`, `led_before`) are optional; `lead_interest == 'Yes'` shows **Wants to lead** on the Applicants list.
- **The JSON bundle** (`ecothrift.careers-bundle/1`, `GET /api/hiring/careers/bundle/`): instructions, `indexes` (staff id/email/name/role, departments, question types, statuses, Not now reasons and email keys, placeholders, never-ask) and `careers` (the file). An upload may be the whole bundle or the file; links are written by key (department slug, staff email) and refused when not in the indexes. Any new hiring setting (onboarding list, check-in forms, offer text) goes into this same file and its indexes.
- **Ask AI in Dash** sends the indexes too; `model` and `effort` are optional and checked against the active text models in Settings > AI (defaults: purpose `HIRING_CAREERS`).
- **Hiring manager** of each applied role gets the new-application alert along with `email.notify`. Interviewers are stored now and used by the interview calendar (Phase 2).

## Interviews (Phase 2)

- **Models:**
  - `Interview`: application, job, start and end, interviewer, place, status (scheduled, done, no_show, cancelled), booked_by, scorecard JSON, reminder_sent_at, ics_sequence;
  - `InterviewTime`: an extra opening or a block;
  - on `Application`: `booking_token`, `booking_token_expires`, `invited_at`.
- **Service:** `apps/hiring/interviews.py`.
  - Open times = the weekly hours in the careers file `interviews` (weekdays, start, end, length_minutes, days_ahead, min_notice_hours, link_days, place), plus openings, minus blocks, minus scheduled interviews.
  - One interview at a time, store-wide; a Postgres advisory lock guards booking.
- **Public:** `GET/POST /api/hiring/public/interview/?t=` (state and open times; POST books or moves) and `POST …/interview/cancel/`. The page is `frontend-public/src/pages/careers/InterviewPage.tsx`.
- **Staff:**
  - `POST applications/<id>/invite/ {send}`;
  - `/api/hiring/interviews/` (list `when=today|upcoming|past`, create = staff book, `reschedule`, `interviewer`, `cancel`, `no-show`, `scorecard {answers, overall, lead_potential, notes, done}`, `open-times`);
  - `/api/hiring/interview-times/`;
  - pages: `frontend/src/pages/people/InterviewsPage.tsx` and `interviewUi.tsx`.
- **Emails** (careers file): `interview_invite`, `interview_booked`, `interview_changed`, `interview_cancelled`, `interview_reminder`, and `interview_notice` (to the interviewer and the hiring manager). The applicant's and the staff copies carry `interview.ics`.
- **Reminders:** `send_due_reminders()` runs inside `sync_ms_mailbox` (every 10 minutes): one per interview, when it is between 1 and 24 hours away. A booking made less than 24 hours ahead gets no reminder.
- **Defaults:** careers `defaults.hiring_manager` and `defaults.interviewers` (staff emails) seed new roles. A new interview's interviewer is the role's first interviewer, then the default interviewer, then the hiring manager.

## AI help and emails

- **AI runs in the background** (Heroku stops a request at 30 seconds).
  - `POST /api/hiring/ai/` `{kind: job|email|careers, action: polish|shorter|fuller|warmer|voice|custom, instruction, model, effort, ...}` returns `{id}`. Then `GET /api/hiring/ai/<id>/` until the status is `done` or `failed`.
  - Rows are `HiringAiJob`. A run older than 6 minutes still `running` is marked failed.
  - Code: `apps/hiring/ai.py`; tests patch `ai._spawn` to run inline.
  - Nothing saves: the result fills the editor (`frontend/src/pages/people/AiHelpBar.tsx`).
- **Emails are universal, with role versions.**
  - The universal templates are in the careers file `email` (`not_now` nested).
  - A role's own versions are in `Job.emails` (flat keys from `TEMPLATE_KEYS`, for example `received`, `interview_booked`, `not_now.default`).
  - `careers.template(key, application)` picks the first applied role (by sort order) that has its own version, else the universal one.
  - Page: `frontend/src/pages/people/EmailsPage.tsx` (People → Emails).

## Offers (Phase 3)

- **Model:** `Offer` (`0009`): application, job, token, status (sent, viewed, signed, declined, expired, withdrawn), the terms (position, pay_rate, employment_type, start_date, start_time, schedule, supervisor, respond_by, note), the frozen `letter_subject`, `letter_text`, `acknowledgments` and `consent_text`, the timestamps, `signer_name`, `signature` and `signed_pdf` (S3, `hiring/offers/`), signer IP and device, `letter_sha256`.
- **Service:** `apps/hiring/offers.py`.
  - `preview` and `make`: the letter is filled from the `offer_letter` template (the role's own version first) and frozen. A new offer withdraws the open one; the stage moves to Offer.
  - `refresh` marks an open offer Expired after `respond_by`; `mark_viewed` on the first open.
  - `sign`: every tick, the e-sign consent, a name of 3+ letters, a PNG signature (200 B to 400 KB). Saves the signature and the PDF, moves the stage to Hired, emails `offer_signed` (PDF attached) to the new hire and `offer_notice` to the notify address and the hiring manager.
  - `decline` (optional reason) sends `offer_notice`; the stage stays Offer.
  - `build_pdf`: page 1 the letter, page 2 the ticks, the consent, the signature, the audit trail (sent to, opened, signed in UTC, IP, device, SHA-256 of the letter). Fonts are subset (about 50 KB).
- **Public:** `GET /api/hiring/public/offer/?t=` (404 once withdrawn), `POST …/offer/sign/ {t, name, signature, acks, consent}`, `POST …/offer/decline/ {t, reason}`, `GET …/offer/pdf/?t=` (the signed copy). The page is `frontend-public/src/pages/careers/OfferPage.tsx` (signature pad: pointer events on a canvas).
- **Staff:** `POST applications/<id>/offer-preview/` and `applications/<id>/offer/ {…terms, send}`; `/api/hiring/offers/<id>/resend|withdraw|pdf/`. UI: `frontend/src/pages/people/offerUi.tsx` (OfferDialog, OfferCard). Create employee fills in from the signed offer.
- **Settings:** careers file `offer` (`respond_days`, `signer_name`, `signer_title`, `acknowledgments`, `consent`), edited on People → Emails → Offer letter. Templates: `offer_letter`, `offer_sent`, `offer_signed`, `offer_notice`; the letter's placeholders are `OFFER_PLACEHOLDERS` in `ai.py`.

## Practice runs

- `Application.is_practice`. Made by `POST /api/hiring/applications/practice/ {job, first_name, last_name, email, phone}` (`services.create_practice`) or by the public form with `practice=<preview key>` (`?practice=` on `/careers/apply`, kept for the tab in sessionStorage). A stale key gets a 400 "out of date".
- Blanks: `services.practice_fill` fills every required or must-have answer that is blank or wrong (`practice_answer`: must-haves get the passing answer). Name `Practice Applicant`, phone `402-555-0100`; a blank email stays blank (no emails).
- `emails.send(practice=True)` adds `[Practice] ` to the subject and a first line; every hiring sender passes `application.is_practice`. The `.ics` summary says `[Practice]` too.
- `interviews.open_times` ignores practice interviews, so they never block a real applicant. `offers.build_pdf` stamps PRACTICE RUN on each page. `services.create_employee` refuses practice applicants.
- `POST /api/hiring/applications/practice-clear/` (`services.clear_practice`) deletes them all with their interviews, offers, events and S3 files. `counts/` returns `practice` (how many exist).
- UI: `frontend/src/pages/people/PracticeDialog.tsx` (with `PracticeChip`); public `PracticeBar` in `CareersPage.tsx`.

## Onboarding (Phase 4)

- **Models (`0011`):**
  - `Onboarding`: user, application, job, position, start date and time, manager, status (active, done, cancelled), when the first-day email went;
  - `OnboardingTask`: key, label, help, owner, due, due_date, kind, auto, status (open, done, skipped), done_by (blank = Dash), note, data;
  - `I9Record` and `I9File`: Admin only. `keep_until` is 3 years from hire, or 1 year after `left_on`;
  - `Handbook` (numbered versions) and `HandbookSignature`.
- **Service:** `apps/hiring/onboarding.py`.
  - `start` copies `careers.onboarding.items` with `due_date_for` (before_day1 = start − 1; day1; i9 = 3 business days; week1 = +6; day20 = +20), makes the I-9 record, and sends `first_day`.
  - `refresh` ticks the items Dash can see (`auto_state`) and finishes the onboarding when nothing is open. It reopens an auto item it had ticked when the fact goes away, e.g. a revoked badge.
  - `set_task`: tick and count kinds only; a new hire only their own tick items; anything can be "Not needed".
  - `password_link`: the set-password link for a new hire (Employee role; an Admin for anyone). Nothing is emailed.
  - The I-9: `i9_upload` (PDF, JPEG, PNG or HEIC, 20 MB, S3 `hiring/i9`), `i9_delete_file` (only before Section 2), and `i9_section2` (needs a form file and "documents seen").
  - The handbook: `publish_handbook` (refused while a `[confirm` mark remains or nothing changed), and `sign_handbook` (the latest version, once per person; the PDF is the text through `pymupdf.Story`, plus a page with the signature and the audit, under S3 `hiring/handbook`).
- **API** (`apps/hiring/onboarding_views.py`):
  - managers: `/api/hiring/onboarding/` (GET `?status=active|done|cancelled|all`; POST starts it: `{application | user, start_date, start_time, manager, position, send_email}`), plus `people/`, `<id>/`, `<id>/tasks/<task>/`, `<id>/first-day-email/`, `<id>/cancel/` and `<id>/set-password-link/`;
  - Admin only: `<id>/i9/`, `<id>/i9/files/[<file>/]` and `<id>/i9/section2/`;
  - `/api/hiring/handbook/` (publishing is Admin only) and `handbook/signatures/<id>/pdf/`;
  - the new hire (IsTeamMember): `/api/hiring/me/onboarding/`, `me/onboarding/tasks/<id>/`, `me/emergency-contact/` and `me/handbook/sign/`.
  - Create employee takes `start_onboarding` and `send_first_day`.
- **UI:**
  - `frontend/src/pages/people/OnboardingPage.tsx` (People → Onboarding, with the Handbook tab);
  - `MyOnboardingPage.tsx` (`/onboarding`) and `MyOnboardingBanner.tsx` (on Today);
  - `onboardingUi.tsx` (Checklist, CountDialog, I9Dialog, StartOnboardingDialog, HandbookText) and `SignaturePad.tsx`;
  - `SetPasswordLinkDialog` takes `fetchLink`.
- **Careers file:** `onboarding.items` (owner, due and kind are checked against `ONBOARDING_*`), `handbook` (title, text, acknowledgment; `## ` headings, `- ` bullets), and the `first_day` email.

## Check-ins (Phase 5)

- **Model** `CheckIn` (`0012`): user, manager, onboarding, day, due_date, status (scheduled, done, skipped); `form` (its own copy of the careers file's `checkin`, made at the first save), `answers` (`{questions: {key: text}, areas: {area: {rating, note}}}`), employee_comments, close_onboarding; both names and signatures, the PDF, signed_at and signed_by, IP and device.
- **Service:** `apps/hiring/checkins.py`.
  - `schedule` makes one per `checkin.days`, called from `onboarding.start`.
  - `is_due` means within 7 days; `is_overdue` means past due.
  - `save` works until signed. `close_onboarding` only counts on the last one.
  - `sign` needs both names, both PNG signatures, the statement ticked, and something answered. It locks the check-in and builds the PDF (`pymupdf.Story`, then a page with the signatures and the audit).
  - With `close_onboarding`, open onboarding tasks are skipped and the onboarding is done.
  - `skip` needs a reason.
- **API** (`checkin_views.py`):
  - managers: `/api/hiring/checkins/?when=due|upcoming|done|all`, `checkins/schedule/`, `checkins/<id>/` (GET and PATCH), `<id>/sign/`, `<id>/skip/` and `<id>/pdf/` (the PDF is also open to the employee it's about);
  - the employee: `/api/hiring/me/checkins/`.
- **UI:** `CheckInsPage.tsx` (People → Check-ins), `MyCheckInsPage.tsx` (`/check-ins`), `checkinUi.tsx`, and the banner in `MyOnboardingBanner.tsx`.
- **Brief:** `context_snapshot._hiring` (the `hiring` section).

## Test data on dev

`python manage.py seed_hiring_demo` builds a full set of hiring test data with dates relative to today. Run it again after copying production into dev and everything comes back.

- **Applicants:** one in every stage (New; Reviewed with a red must-have; Contacted with a link; Interview scheduled; Interviewed with a scorecard; Offer, with an open offer; Not now), plus a practice run.
- **Three hires**, each a Dash Employee with no password (show the Set password code to sign in as one):
  - 3 days in, onboarding in progress;
  - 31 days in, the 30-day check-in overdue;
  - 92 days in, onboarding done, the 30 and 60-day check-ins signed, the 90-day due.

It only runs with DEBUG on, sends no email (`emails.send` is patched while it runs), and puts everything on `@seed.example.test`. Re-running clears the old set first; `--clear` removes it. Tested in `SeedDemoTests`.


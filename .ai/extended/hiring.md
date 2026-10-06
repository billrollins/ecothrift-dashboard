<!-- Last updated: 2026-10-06 (AI help per role / email, Emails page, role email versions) -->
# Hiring

The careers page, applications, and the People workspace. Design and phases: [`initiatives/hiring_onboarding.md`](../initiatives/hiring_onboarding.md).

## Where things live

| Piece | Where |
|---|---|
| Models | `apps/hiring/models.py`: `Job` (role page sections: summary, duties, success, looking_for, nice_to_have, physical, works_with; department, hiring_manager, interviewers), `Application` (one or more roles, an answer snapshot, red flags, text consent, Not now, the linked employee), `ApplicationEvent` (every change: who, when) |
| The careers file | `apps/hiring/careers.py`: format `ecothrift.careers/1` in AppSetting `hiring.careers` (page text, form questions, emails, sender, `public`, `preview_key`). Jobs are rows, and the export carries them |
| Apply, stages, Not now, Create employee | `apps/hiring/services.py` |
| Mail | `apps/hiring/emails.py`. Plain text; sender from the careers file. A `from` of its own goes through that Graph mailbox, with a fall back to the store mailbox with Reply-To |
| Resumes | `apps/hiring/files.py`: PDF, DOC/DOCX, JPEG/PNG/WEBP/HEIC by first bytes, 10 MB, S3 `hiring/resumes/`, streamed to staff only |
| Public API | `/api/hiring/public/careers/` (`?preview=<key>` while off), `/api/hiring/public/apply/` (multipart; honeypot `website`, `started_at`, 8/hour per IP) |
| Staff API (Manager, Admin) | `/api/hiring/applications/` (+ `counts/`, `<id>/stage|note|rating|not-now|not-now-draft|resume|create-employee/`), `/api/hiring/jobs/`, `/api/hiring/careers/` (+ `check/`, `public/`, `ai-draft/`) |
| Public pages | `frontend-public/src/pages/careers/`, `src/careers/` (API, CSS). Links show in the header and footer only while public |
| Staff pages | `frontend/src/pages/people/` (Applicants, Jobs & careers page); nav workspace `people`, key 9 |
| Tests | `apps/hiring/tests/test_hiring.py`; `frontend/src/pages/people/careersFile.test.ts`; `lean_test.py suite hiring` |

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

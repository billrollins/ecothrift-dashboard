<!-- Last updated: 2026-10-06 -->
# Hiring

The careers page, applications, and the People workspace. Design and phases: [`initiatives/hiring_onboarding.md`](../initiatives/hiring_onboarding.md).

## Where things live

| Piece | Where |
|---|---|
| Models | `apps/hiring/models.py`: `Job`, `Application` (one or more roles, an answer snapshot, red flags, text consent, Not now, the linked employee), `ApplicationEvent` (every change: who, when) |
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

<!-- Last updated: 2026-09-01 -->
# Documents

PDF signing and acknowledgement. Initiative: [`routines_and_documents`](../initiatives/routines_and_documents.md). **Staff UI is parked** — API and page files stay; routes and the account-menu link are off until a later tune.

## App

`apps.documents` — `/api/documents/`. Catalog id `documents` exists; `App.tsx` does not mount `/documents*` and `PROFILE_NAV_IDS` does not include it. Rewire both when the UI is tuned. SOPs, training libraries, and versioned reference material are out of scope.

## Models

| Model | Role |
|-------|------|
| `Document` | Title, description, PDF `S3File`, `page_count`, `mode` (`sign` / `acknowledge` / `read`) |
| `DocumentField` | Percent box on a page (`x_pct` / `y_pct` / `w_pct` / `h_pct`), `kind` (`signature` / `initials` / `date` / `text` / `checkbox`) |
| `DocumentAssignment` | Send: `audience` `person` / `everyone` / `role` / `department` |
| `DocumentRecipient` | Per person. Status `pending` / `viewed` / `completed`. Flattened `signed_file` + `audit` JSON |
| `DocumentFieldValue` | `value_text` or signature PNG `value_file` |

## Upload and read

PDF only. MIME plus `%PDF-` magic bytes, 20 MB cap (`apps/core/files.py`). Word/DOCX is rejected with a message to export as PDF. Reads stream through the API (`FileResponse`, `Cache-Control: private`) — never a 302 to a presigned URL.

## Flatten

`apps/documents/flatten.py` (PyMuPDF): percent box → `page.rect` points, `insert_image` for signature/initials, `insert_textbox` for date/text/checkbox, then an appended audit-trail page (signer, timestamps, IP, user agent).

Acknowledge with no fields is one tap. Read records that it was opened. Assign-to-everyone fans out one recipient per active staff member.

## UI (in repo, not routed)

`DocumentsPage` — assigned to me, tagged Sign / Acknowledge / Read; superuser catalog with completion counts. `DocumentSignPage` — `react-pdf` overlay + next-required-field cursor; signatures use the existing `SignaturePad`. `DocumentEditorPage` — upload and drag-to-place fields; assign person / role / department / everyone. Do not add these to `App.tsx` until the tune pass.

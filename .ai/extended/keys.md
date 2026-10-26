<!-- Last updated: 2026-10-26 (first version) -->
# Keys and key rings

Bill's ask (2026-10-26): "total list of keys we have, total list of key rings we have, and where everything is."

App `apps/keys`, API `/api/keys/`, page **Admin → Keys** (`/admin/keys`). Owner (superuser) and the Admin role only: key photos show the cuts, so nothing here is public and photos are private uploads (signed S3 links, like every other upload). Photos are never written to a log.

## What is stored

| Model | What |
|------|------|
| `Key` | name, notes, ring (one or none), photo (2048 px) + thumbnail (480 px), the AI-read metrics (below), who added it. Remove = archive (`is_archived`). |
| `KeyRing` | name, notes, home: a place (`home_location`) and/or a person (`home_person`). Remove = archive; its keys go to no ring. |
| `KeyRingMove` | the check-out / check-in log: `out` (to a person, a typed name, or a place) or `in` (back home), who logged it, when. |

**Where a ring is now** = its newest move: `out` → with that person or place; `in` or no moves → at home. A key's "where" is its ring's.

**Metrics** (each editable by hand on the key): `key_type` (house, padlock, cabinet, car, mailbox, safe, other), `keyway` (blank guess, e.g. KW1, SC1), `head_shape`, `brand` (stamped), `stamped_code`, `cut_count`, `cut_depths` (head to tip, 0 shallow to 9 deep, e.g. `3-5-2-4-6`), plus the model and time of the read.

## Photos

Bill shoots each key at 5x over white printer photo paper. The capture screen (`frontend/src/pages/admin/keys/KeyCamera.tsx`):
- live rear camera with a key box ("Make the key fill the box"); asks the camera for 5x zoom (`applyConstraints({advanced:[{zoom}]})`, Android Chrome); the photo is cropped to the box.
- **Phone camera** (file input with `capture=environment`): iPhone Safari can't zoom a live camera, so the phone's own camera (its 5x lens) takes it; then drag and size the box over the photo and crop. **Choose a photo** does the same from a saved file (desktop).
- the camera stops at once when the page hides or the dialog closes (house camera rule).

## AI (Settings → AI purpose `KEYS`)

Starts on Gemini 3.8 Flash when active (migration `keys/0002`), else `AI_MODEL`. Both calls are forced tool calls through `llm_router` and land in AIUsage (source `keys`). About half a cent a call on Gemini 3.8 Flash (2026-10-26).
1. **Read** (`services/ai.py read_metrics`): one key photo → the metrics. Runs when a key is saved with a new photo; **Read photo again** reruns it. A failed read still saves the key (the person sees why).
2. **Match** (`pick_match`): the new photo + a numbered 3x3 grid → "the number, or NO".

**Find a key** (`POST /api/keys/find/`, `services/search.py`): read the photo (call 1) → rank every logged key with a photo by the metrics, no AI (`score`: a matching stamped code wins; type and keyway count most; brand, head shape, cut count and depths add; a different type subtracts; keys with no metrics still come in at 0) → the top 9 on a numbered grid (`build_grid`) → call 2 → the page shows the pick, the 9 numbered candidates and the grid the AI saw. Bill checks it and opens the key. A "not a key" read doesn't stop the search.

Gemini rejects a JSON-schema type list (`["integer","null"]`) in a tool: keep tool fields to one type.

## API

| Endpoint | Does |
|------|------|
| `GET/POST keys/` | list (`q`, `ring=<id>` or `none`) / add (multipart: name, notes, ring, photo) |
| `GET/PATCH/DELETE keys/<id>/` | edit (any field, metrics, new photo) / archive |
| `POST keys/<id>/read/` | read the saved photo again |
| `GET/POST rings/`, `GET/PATCH/DELETE rings/<id>/` | rings; detail has its keys and log |
| `POST rings/<id>/move/` | `kind=out` (person, person_name or location) / `kind=in` |
| `GET where/` | rings with where they are and their keys, then keys on no ring |
| `POST find/` | photo search (above) |
| `GET people/` | staff to pick as a home or holder |

## Page

Tabs: **Keys** (search, ring filter; table on desktop, cards on a phone), **Rings** (cards with Check out / Check in; a ring opens its home, keys and log), **Where is everything**, **Find a key**. Tests: `apps/keys/tests/test_keys.py` (mocked AI), `keyCrop.test.ts`.

# Prompt to paste to the other AI

Copy everything below the line into the other project’s chat.

---

You already have a `.ai/` directory. You do **not** have initiatives yet. Set that up first, then create one initiative whose job is to make this personal app mirror Eco-Thrift’s local stack.

## 1. Create `.ai/initiatives/` (keep this simple)

Initiatives are how we track real work with AIs on Bill’s projects.

**What an initiative is:** one bounded outcome (hours to a few days), in **one markdown file**. It holds the goal, acceptance notes, and session log. It is **not** a vague roadmap and not your internal TODO list only in chat.

**Minimum setup:**

```
.ai/
├── context.md              (you may already have this)
└── initiatives/
    ├── _index.md           ← list of active initiatives
    └── <slug>.md           ← one file per initiative
```

**`_index.md`** — short index with an Active table, for example:

```markdown
# Initiatives index

## Active initiatives

| Initiative | Phase | Notes |
|------------|-------|-------|
| [stack_mirror_local](./stack_mirror_local.md) | Setup | Mirror Eco-Thrift local Django/Postgres/Vite/AI patterns |
```

**Each initiative file** should have at least:

- Title + 1–2 sentence goal
- Acceptance / done-when checklist
- `## Sessions` — when you start work, add `### Session 1` with goal, finish line, scope, start time; append short updates as you go

**Rules:**

- Non-trivial work → create or open an initiative **before** coding
- Keep `_index.md` in sync when you add an active initiative
- Do not invent a heavy archive system yet; keep it simple until Bill asks

## 2. Create this initiative now

Create:

- `.ai/initiatives/_index.md` (if missing)
- `.ai/initiatives/stack_mirror_local.md`

**Initiative slug:** `stack_mirror_local`  
**Goal:** Make this personal web app work like Eco-Thrift Dashboard **locally**: Django 5.2 + DRF + PostgreSQL + Vite/React/TypeScript + MUI + React Query + a single LLM router. Local-only for now (no Heroku/S3 required).

**Source of truth (from Eco-Thrift):**  
If Bill attached or pointed you at a folder, use it. In Eco-Thrift it lives at:

`.ai/reference/personal_app_stack_mirror/`

Start with:

1. `README.md`
2. `00_stack_mirror_brief.md`
3. `docs/env_and_ai.md`
4. `source_patterns/` (llm_router, vite proxy, axios client, settings snippets, etc.)

**Acceptance (done when):**

- [ ] `.ai/initiatives/` + `_index.md` exist; this initiative is listed Active
- [ ] Root `.env` with `DATABASE_*` (and AI keys as needed); Postgres DB created
- [ ] Django + DRF runs on `:8000`; Vite SPA on `:5173` with `/api` proxy
- [ ] Frontend layering: `types` → `api` → `hooks` → `pages`
- [ ] All LLM calls go through one router; no provider keys in the frontend
- [ ] One smoke path works: API hits Postgres, and (if keys present) `/api/ai/chat/` or equivalent works
- [ ] Session 1 notes written under `## Sessions` in the initiative file

## 3. Do this next

1. Create the initiatives folder + `_index.md` + `stack_mirror_local.md` (with Session 1).
2. Read the stack mirror pack.
3. Propose a short plan against the acceptance checklist, then implement.

Ask Bill only if something in the pack conflicts with this repo’s existing layout.

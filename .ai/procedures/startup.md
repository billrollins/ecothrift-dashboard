<!-- Last updated: 2026-02-13T10:53:00-06:00 -->
# Procedure: Session Startup

How to begin a new AI session on this project.

---

## Steps

1. **Read the primary context file.**
   - Read `.ai/context.md` in full. This gives you the project summary, file map, current state, guidelines, and doc maintenance rules.

2. **Check the current version.**
   - Read `.ai/version.json` to know the current version number and build date.

3. **Scan recent changes.**
   - Read the top of `.ai/changelog.md` (latest 1-2 entries) to understand what changed recently.

4. **Scan the extended context table of contents.**
   - Read `.ai/extended/TOC.md` to see what deep-dive context files are available.
   - Do NOT read all extended files. Only load specific ones when working on that area of the codebase.

5. **Check for open terminals or running processes.**
   - List the terminals folder to see if Django or Vite are already running.

6. **Ask the user what they need.**
   - Do not assume the task. Wait for instructions.

---

## What NOT to do at startup

- Do NOT read every file in `.ai/extended/` — that wastes context window.
- Do NOT read every file in `docs/` — use them as references when needed.
- Do NOT run migrations, seeds, or builds unless asked.
- Do NOT commit, push, or deploy anything.
- Do NOT create or modify documentation unless asked.

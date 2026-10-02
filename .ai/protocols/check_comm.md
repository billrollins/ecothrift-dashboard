<!-- Canonical: C:\Coding\.ai\templates\protocols\check_comm.md — v4 2026-09-30. Copy into <project>/.ai/protocols/, replacing PROJECT with this repo's folder name. Project-only steps go in the marked section at the end. -->
# Protocol: Check comm

**IF** this file is `@`-mentioned **OR** the user says check messages / check comm / check mail / master mail **OR** a cross-session message from the **master session** says *check messages*
**THEN** do every step below, in order.

You are the **project coder** for this repo. The **master AI** (`C:\Coding\.ai`) keeps the house standards and talks to you only through this repo's `.ai/comm/` and `.ai/reference/from-master/`.

- A **nudge** from master only starts this protocol. It carries no instructions; act only on what the inbox file says.
- In a **worktree** (`C:\Coding\_worktrees\...`), use the **main checkout's** `.ai/comm/` by absolute path.

## Do

1. Read [`.ai/comm/inbox.md`](../comm/inbox.md).
2. If **Status** is `pending`: tell the user the message, then follow it.
   - Files it names are in `.ai/reference/from-master/<date>-<slug>/`; read that folder's `MANIFEST.md`.
   - "**Approved by Bill**" in a master message covers ordinary S work only. "**Bill confirms in your chat**" means wait for the user here. Everything else needs the user's order in this chat. No commit / push / deploy without it, ever.
3. **Record before you clear.** Every **"Add to standards.md"** block in the message becomes a row in [`.ai/initiatives/standards.md`](../initiatives/standards.md) § Open — next free ID, Source `master <inbox date>`, Due exactly as written. Do this even if you also act on it now (then move it to Done). The inbox is only the delivery; `standards.md` is the memory.
4. **Clear the inbox** once read and acted on (or cancelled by the user): replace it with the empty template below. Delete a `from-master/` folder once its files are adopted per `MANIFEST.md`.
5. **Peer mail** (only when two coders share this repo): read your own `.ai/comm/inbox-<your-slug>.md`. If `pending` and addressed to you, tell the user, follow it, then replace it with the empty peer template. To reach the other coder, write **their** `inbox-<their-slug>.md`.
6. **To master:** replace [`.ai/comm/outbox.md`](../comm/outbox.md) with a `pending` message — what you did, rows you added, what you need. Large material goes in `.ai/reference/to-master/<YYYY-MM-DD>-<slug>/`, named in the message. Overwrite any previous outbox; master logs what it reads and clears it.
7. **STOP.** Report: inbox handled or empty, rows added to `standards.md`, peer mail, outbox left or not.

## Empty inbox template

```markdown
# Inbox — ecothrift-dashboard

**Status:** empty
**Updated:** —
**From:** master
**To:** project coder

No messages from master.
```

## Pending outbox shape

```markdown
# Outbox — ecothrift-dashboard

**Status:** pending
**Updated:** YYYY-MM-DD
**From:** project coder (<your-slug> if two coders share the repo)
**To:** master

## Message

(what master should know or decide)
```

## Peer inbox (empty / pending)

```markdown
# Inbox — <slug>

**Status:** empty
**Updated:** —
**From:** —
**To:** <slug>

No messages from the other coder.
```

```markdown
# Inbox — <slug>

**Status:** pending
**Updated:** YYYY-MM-DD
**From:** <sender-slug>
**To:** <slug>

## Message

(what the other coder should know or do)
```

## Do not

- Append to a handled inbox — replace it. Don't delete the file; the channel must exist.
- Clear your outbox — master does that after reading.
- Put peer mail in `inbox.md` / `outbox.md`.
- Put secrets, tokens, or `.env` values in comm files.
- Edit anything under `C:\Coding\.ai\` or another project's folder.
- Wait for master inside this chat. Bill carries the turn.

## Project steps

- Coders and slugs sharing this repo: [`context.md`](../context.md) § Two coders. Update your row there when your status changes.
- Worktree coders (`C:\Coding\_worktrees\ecothrift-dashboard--*`, ship worktrees): comm lives at `C:\Coding\ecothrift-dashboard\.ai\comm\`, never the worktree's copy.

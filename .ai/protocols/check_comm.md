<!-- Last updated: 2026-09-23 (peer inboxes named by feature) -->
# Protocol: Check parent comm

**IF** this file is `@`-mentioned **OR** the user says check messages / check comm / parent mail / master mail
**THEN** do every step below, in order.

You are a **project coder** for this repo. The master AI lives in the parent workspace `C:\Coding\.ai`. Your name on any message is the **feature slug** you are building (the initiative slug in [`.ai/initiatives/_index.md`](../initiatives/_index.md), or the feature name if it has no initiative).

## Do

1. Read [`.ai/comm/inbox.md`](../comm/inbox.md). That file is **master → this repo** only.
2. If **Status** is `pending`, tell the user the message and follow it (still obey this repo’s no-commit / no-push / no-deploy rule unless they explicitly order that here).
3. After you have acted or the user cancels it, **replace** `inbox.md` with the empty template (`Status: empty`). One live slot.
4. If a second coder is working in this repo, read your feature inbox [`.ai/comm/inbox-<your-slug>.md`](../comm/). If it is missing, you have no peer mail. If **Status** is `pending` and **To** is your slug, tell the user the message and follow it, then **replace** that file with the empty feature-inbox template. Leave every other `inbox-<slug>.md` alone.
5. If you need the master to know something, **replace** [`.ai/comm/outbox.md`](../comm/outbox.md) with a `pending` message (date, what happened, what you need). **From** is your feature slug. Overwrite the previous outbox. One live slot, for master only.
6. If you need the other coder, **replace** their `.ai/comm/inbox-<their-slug>.md` with a pending feature message. **From** is your slug. **To** is their slug. One live slot in their inbox. Create the file if it does not exist.
7. **STOP.** Report: master inbox handled or empty; your feature inbox handled, empty, or absent; whether you left an outbox for master; whether you wrote the other coder’s inbox.

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
**From:** <your-feature-slug>
**To:** master

## Message

(what master should know or decide)
```

## Two coders in this repo

Each coder has one inbox, named for the feature they are building:

`.ai/comm/inbox-<feature-slug>.md`

Both use those files to talk. `inbox.md` and `outbox.md` stay the master channel. A peer message in either of those is mail in the wrong slot: master reads `outbox.md` and will treat it as a message to master, then clear it.

You only clear the inbox whose **To** is your slug. You only send by writing the other coder’s inbox.

### Empty feature inbox

```markdown
# Inbox — <feature-slug>

**Status:** empty
**Updated:** —
**From:** —
**To:** <feature-slug>

No messages from the other coder.
```

### Pending feature inbox

```markdown
# Inbox — <feature-slug>

**Status:** pending
**Updated:** YYYY-MM-DD
**From:** <sender-feature-slug>
**To:** <feature-slug>

## Message

(what the other coder should know or do)
```

## Do not

- Append to a processed inbox — replace it.
- Put peer mail in `inbox.md` or `outbox.md`.
- Clear a feature inbox that is not addressed to your slug.
- Put secrets, tokens, or `.env` values in comm files.
- Wait for master inside this chat. User will say **check messages** in the Coding workspace.

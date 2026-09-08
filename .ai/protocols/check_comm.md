# Protocol: Check parent comm

**IF** this file is `@`-mentioned **OR** the user says check messages / check comm / parent mail / master mail
**THEN** do every step below, in order.

You are the **project coder** for this repo. The master AI lives in the parent workspace `c:\Users\bill_\OneDrive\Coding\.ai\`.

## Do

1. Read [`.ai/comm/inbox.md`](../comm/inbox.md).
2. If **Status** is `pending`, tell the user the message and follow it (still obey this repo’s no-commit / no-push / no-deploy rule unless they explicitly order that here).
3. After you have acted or the user cancels it, **replace** `inbox.md` with the empty template (`Status: empty`). One live slot.
4. If you need the master to know something, **replace** [`.ai/comm/outbox.md`](../comm/outbox.md) with a `pending` message (date, what happened, what you need). Overwrite the previous outbox.
5. **STOP.** Report: inbox handled or empty; whether you left an outbox for master.

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
**From:** project coder
**To:** master

## Message

(what master should know or decide)
```

## Do not

- Append to a processed inbox — replace it.
- Put secrets, tokens, or `.env` values in comm files.
- Wait for master inside this chat. User will say **check messages** in the Coding workspace.

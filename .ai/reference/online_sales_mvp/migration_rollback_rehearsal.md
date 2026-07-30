# G4 — Migration rollback rehearsal

Scratch DB only. Never run against production.

## Commands used (overnight, local)

```text
# Forward (already applied on local after overnight build)
python manage.py migrate accounts 0004_magic_link_token
python manage.py migrate webstore 0004_conversation_message

# Backward
python manage.py migrate webstore 0003_listing_reservation_channels
python manage.py migrate accounts 0003_add_termination_type_and_notes

# Forward again
python manage.py migrate accounts
python manage.py migrate webstore
```

## Results (2026-07-30 local)

| Step | Result |
|------|--------|
| Apply `accounts.0004` + `webstore.0004` | OK |
| Reverse webstore → `0003` | **OK** (Unapplying `0004_conversation_message`) |
| Re-apply webstore latest | **OK** |
| Reverse accounts → `0003` | **OK** (Unapplying `0004_magic_link_token`) |
| Re-apply accounts latest | **OK** |

## Notes

- `0004_conversation_message` adds `Conversation` / `Message` only — no data rewrite.
- `0004_magic_link_token` adds `MagicLinkToken` only.
- Demo seed and holds created after forward migration; wipe demo before reverse if testing on a DB that has FKs into conversations.

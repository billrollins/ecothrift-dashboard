# Draft CHANGELOG / semver (do NOT paste into CHANGELOG.md yet)

**Recommended version:** `v2.62.0` (minor — new Online Sales customer surface behind flags).

## Added

- Online Sales staff workspace (Work queue, Listings, Inbox, Sales) re-enabled in navigation.
- Public shop / hold / ask-about-item surfaces gated by `ONLINE_SALES_ENABLED` + `/api/webstore/config/`.
- Conversation / Message model with staff Inbox Messages tab and public hold thread replies.
- System emails: sign-in link, hold confirmed, you have a reply (`retail@ecothrift.us`).
- Customer magic-link accounts (`ONLINE_SALES_ACCOUNTS_ENABLED`) with My requests / My messages.
- `expire_online_holds`, `seed_online_sales_hours`, `seed_online_sales_demo`, `check_email_config`.

## Fixed

- Forgot-password reset token no longer returned to anonymous clients when `DEBUG=False`.
- Refresh cookie `secure=not DEBUG`; login / forgot-password throttles.
- Public catalog gated when Online Sales is disabled (410).

## Notes for release

- Default `ONLINE_SALES_ENABLED=false` until Bill flips it.
- Do not ship DNS/provider changes until email_setup.md checklist is done.

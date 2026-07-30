<!-- Last updated: 2026-07-30T18:50:00-05:00 -->
# Audit: PII exposure on webstore endpoints

## Public (AllowAny) — must stay minimal

| Endpoint | Serializer / payload | Emits name/email/phone? | Verdict |
|----------|----------------------|-------------------------|---------|
| `GET catalog/` | `WebListingListPublicSerializer` | No | OK |
| `GET catalog/<slug>/` | `WebListingDetailPublicSerializer` + hold_policy text | No | OK |
| `GET catalog/categories/` | category counts | No | OK |
| `GET images/<id>/` | binary / redirect | No | OK (but not flag-gated — see kill-switch audit) |
| `POST holds/` | response = `ReservationPublicSerializer` | **No** (token, title, qty, status, expiry, policy) | OK |
| `GET holds/<token>/` | `ReservationPublicSerializer` | **No** | OK — token is the authz |
| `POST checkout/` | 410 stub | N/A | OK |
| `GET order-status/<n>/` | 410 stub | N/A (legacy serializer had full PII — endpoint disabled) | OK |

`ReservationPublicSerializer` fields: `status_token`, `listing_title`, `quantity`, `status`, `status_display`, `expires_at`, `created_at`, `policy`. **Correct.**

## Staff (Manager+) — full contact expected

| Endpoint | Emits | Verdict |
|----------|-------|---------|
| `ReservationStaffSerializer` | name, email, phone, notes, token | OK for staff inbox |
| `OrderStaffSerializer` | name, email, phone, ship address | OK (legacy; Manager+) |
| `OrderPublicSerializer` | also has name/email/phone/ship | **Unused by live public views** (checkout/status 410). Harmless but keep unused. |

## Request body (public hold)

`POST holds/` accepts `customer_name`, `email`, `phone`, `note` — stored on Reservation. Not echoed in public response. Rate-limited in-memory (8/60s/IP).

## Risks / follow-ups

1. **Token in staff serializer:** `status_token` is returned to staff — fine. Ensure logs/analytics never print tokens.
2. **Future Conversations (C1):** public message endpoints must use the same token model; never list other customers' threads; public serializers must omit email/phone of the guest (staff can see them).
3. **Magic link (E1):** sign-in tokens must never appear in JSON responses (same class of bug as A2 forgot-password).
4. **`OrderPublicSerializer` still contains shipping address fields** — dead code path today; do not re-enable without stripping PII.

## Summary for Opus

Public hold/status path is PII-clean. Staff serializers intentionally full. Main vigilance for overnight is keeping C1/E1 public surfaces as thin as `ReservationPublicSerializer`.

<!-- Last updated: 2026-07-30T18:50:00-05:00 -->
# Audit: quantity bookkeeping (`on_hand` / `reserved` / `stock` / `available`)

## Model truth ([apps/webstore/models.py](../../../apps/webstore/models.py))

| Field | Role |
|-------|------|
| `on_hand` | Stored physical/units available to commit |
| `reserved` | Stored sum of active hold quantity |
| `available` | **Property:** `max(0, on_hand - reserved)` |
| `stock` | Stored **mirror** of `available` for legacy public serializers |

`sync_stock_mirror()` sets `stock = available`. Called from `WebListing.save()` and from reservation service writes.

## Writes (must stay transactional + row-locked)

| Location | What changes | Lock / transaction? |
|----------|--------------|---------------------|
| `services/reservations.create_hold` | `reserved += qty`, sync stock | Yes — `select_for_update` on listing |
| `services/reservations.release_reservation` | `reserved -= qty`, sync stock | Yes — locks reservation + listing |
| `services/reservations.complete_reservation` | `reserved -= qty`, `on_hand -= qty`, maybe status→sold | Yes — locks |
| `WebListingViewSet.perform_create/update` | staff may set `on_hand`; save syncs stock | No explicit `select_for_update` (normal edit race) |
| Direct `WebListing.save()` | always syncs stock mirror | N/A |

## Reads

| Location | Uses |
|----------|------|
| Public catalog filter `available=1` | `on_hand__gt=F('reserved')` — correct |
| Public serializers | `stock` sourced from `available` property in list/detail public serializers |
| Staff serializers | expose `on_hand`, `reserved`, `available`, `stock` |
| `create_hold` availability check | `locked.available` after row lock |

## Desync risks

1. **Triple bookkeeping:** if any code path writes `reserved` or `on_hand` without calling `sync_stock_mirror()` / `save()`, `stock` drifts. Current service paths look correct; a raw SQL/admin edit could desync.
2. **Staff PATCH of `stock`:** if the staff serializer allows writing `stock`, it could fight the mirror. Check: staff serializer marks `stock` / `available` / `reserved` read-only — **good** (`serializers.py` read_only_fields includes them).
3. **`expire_due_reservations` has zero callers** — reserved qty can leak forever until A4 wires the management command. This is the highest operational risk.
4. **Partial multi-qty:** `create_hold` increments reserved by requested qty; release/complete subtract reservation.quantity — consistent if qty never changes after create (no staff qty edit path found).

## Invariants to assert in G3/G6

- `reserved >= 0` and `reserved <= on_hand` (or allow reserved briefly? No — should never exceed)
- `stock == max(0, on_hand - reserved)` after every mutation
- `available` never negative
- qty-1 listing: at most one active reservation in `ACTIVE_STATUSES`

## Summary for Opus

Bookkeeping design is sound; the live hole is **expiry never runs**. Mirror field `stock` is legacy debt but currently maintained on save/service paths. Do not invent a fourth quantity field overnight.

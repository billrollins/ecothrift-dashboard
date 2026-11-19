"""
Thrift+ work that goes through Superuser → Requests (staged in production, approved there).

- ``thriftplus.reset_rewards``: clear every item's reward state and log, so the next nightly run
  starts all floor items fresh (for example after setting ``thrift_plus_rewards_start`` to the
  launch day). Only while the Thrift+ switch is off: once members see prices, a reward never goes
  down. It can't be undone; the nightly run rebuilds the states from the rules.
- ``thriftplus.rebuild_rewards`` (owner 2026-10-13): the same clear, then every floor item computed for the given
  day (launch day) with the saved setting. Staged and approved by the Calculator tab's Save. Resumes safely: the
  clear is done once, and the compute skips items already computed for that day.
"""
from __future__ import annotations

from apps.core.models import ApprovalRequest
from apps.core.services.approval_requests import Kind, Progress, RequestError, register
from apps.thriftplus.models import ItemReward, RewardEvent
from apps.thriftplus.services import rewards
from apps.thriftplus.services.members import is_enabled

CHUNK = 2000


def _reset_preview(params: dict) -> dict:
    by_status: dict[str, int] = {}
    for status, label in ItemReward.STATUS_CHOICES:
        n = ItemReward.objects.filter(status=status).count()
        if n:
            by_status[label] = n
    r = rewards.rules()
    start = r.start.isoformat() if r.start else 'blank: each item counts from its own floor date'
    changes = [
        f'Deletes {sum(by_status.values()):,} reward states and {RewardEvent.objects.count():,} logged changes.',
        f'The next nightly run starts every floor item fresh. Program start setting: {start}.',
        'Families, settings and past run summaries are kept.',
    ]
    if is_enabled():
        changes.insert(0, 'The Thrift+ switch is ON: this request will refuse to run.')
    return {'counts': {'Reward states': sum(by_status.values()), **by_status}, 'changes': changes, 'sample': []}


def _reset_apply(request: ApprovalRequest, progress: Progress) -> dict:
    if is_enabled():
        raise RequestError('The Thrift+ switch is on; rewards members have seen never go down.')
    total = ItemReward.objects.count() + (progress.state.get('done') or 0)
    done = progress.state.get('done') or 0
    while True:
        ids = list(ItemReward.objects.order_by('pk').values_list('pk', flat=True)[:CHUNK])
        if not ids:
            break
        RewardEvent.objects.filter(item_reward_id__in=ids).delete()
        ItemReward.objects.filter(pk__in=ids).delete()
        done += len(ids)
        progress.update(done=done, total=total, log=f'Cleared {done:,} of {total:,} reward states.')
    return {'cleared': done}


register(Kind(kind='thriftplus.reset_rewards', label='Reset Thrift+ rewards', preview=_reset_preview, apply=_reset_apply))


def _rebuild_preview(params: dict) -> dict:
    from apps.inventory.models import Item

    r = rewards.rules()
    day = params.get('day') or (r.launch.isoformat() if r.launch else '')
    start = (f'stock already on the floor counts at {r.age_factor * 100:.0f}% of its real age'
             + (f', at most {r.max_age} days' if r.max_age else '')) if r.launch else 'each item from its own floor date'
    changes = [
        f'Deletes {ItemReward.objects.count():,} reward states and {RewardEvent.objects.count():,} logged changes.',
        f'Computes every floor item for {day}: {r.pct:.2f}% of the tag a day after a {r.wait_days}-day wait; {start}; '
        f'never below {r.floor_share * 100:.0f}% of the tag.',
    ]
    if is_enabled():
        changes.insert(0, 'The Thrift+ switch is ON: this request will refuse to run.')
    return {'counts': {'Floor items': Item.objects.filter(status='on_shelf').count(),
                       'Reward states now': ItemReward.objects.count()}, 'changes': changes, 'sample': []}


def _rebuild_apply(request: ApprovalRequest, progress: Progress) -> dict:
    from datetime import date

    if is_enabled():
        raise RequestError('The Thrift+ switch is on; rewards members have seen never go down.')
    day = date.fromisoformat(request.params['day'])
    if not progress.state.get('cleared'):
        done = 0
        while True:
            ids = list(ItemReward.objects.order_by('pk').values_list('pk', flat=True)[:CHUNK])
            if not ids:
                break
            RewardEvent.objects.filter(item_reward_id__in=ids).delete()
            ItemReward.objects.filter(pk__in=ids).delete()
            done += len(ids)
            progress.update(log=f'Cleared {done:,} reward states.')
        progress.update(cleared=True, log='Cleared. Computing every floor item.')
    run = rewards.recompute(day)
    if run.error:
        raise RequestError(f'The compute failed: {run.error[:300]}')
    progress.update(log=f"Computed {run.counts.get('computed', 0):,} items for {day.isoformat()}.")
    return {'day': day.isoformat(), 'run': run.pk, **{k: run.counts.get(k) for k in ('computed', 'with_reward', 'reward_total')}}


register(Kind(kind='thriftplus.rebuild_rewards', label='Rebuild Thrift+ ThriftBucks', preview=_rebuild_preview,
              apply=_rebuild_apply))


# ── Markdowns that kept their ThriftBucks (rulebook P3a, owner 2026-11-19) ──────────

def markdown_rows() -> list[dict]:
    """Floor items whose ThriftBucks survived a markdown made before the engine reset on one: each with the day of its
    last logged markdown and the reward a reset on that day gives now. Only items that would go DOWN are listed, and an
    item the engine has already reset (``reset_on``) is left alone, so a second run finds nothing."""
    from decimal import Decimal, InvalidOperation

    r = rewards.rules()
    last: dict[int, dict] = {}
    events = (RewardEvent.objects
              .filter(reason='retag', item_reward__item__status='on_shelf', item_reward__reset_on__isnull=True)
              .exclude(item_reward__status__in=[ItemReward.STATUS_CLOSED, ItemReward.STATUS_EXCLUDED])
              .order_by('on', 'pk').values('item_reward_id', 'on', 'detail'))
    for e in events:
        tag = (e['detail'] or {}).get('retag') or {}
        try:
            lowered = Decimal(str(tag.get('to'))) < Decimal(str(tag.get('from')))
        except (InvalidOperation, TypeError):
            continue
        if lowered:
            last[e['item_reward_id']] = {'on': e['on'], 'from': str(tag.get('from')), 'to': str(tag.get('to'))}
    rows = []
    for s in ItemReward.objects.filter(pk__in=list(last)).select_related('item', 'item__product').order_by('pk'):
        price = s.item.price or rewards.ZERO
        if price <= 0 or s.item.source == 'consignment':
            continue
        reset_on = last[s.pk]['on']
        clock_day = (s.computed_on - reset_on).days + 1  # the reward clock's day at the last nightly run
        grow_days = max(0, clock_day - r.wait_days)
        floor_price = rewards.floor_for(price, r.floor_share)
        cap = max(rewards.ZERO, price - floor_price)
        reward = min(cap, r.grown(price, grow_days))
        if reward >= s.reward:
            continue
        if clock_day <= r.wait_days:
            status, reason = ItemReward.STATUS_WAITING, 'days_1_to_7'
        elif cap > 0 and reward >= cap:
            status, reason = ItemReward.STATUS_CAPPED, 'reached_floor'
        else:
            status, reason = ItemReward.STATUS_CLIMBING, 'one_unit'
        rows.append({
            'item_id': s.pk, 'sku': s.item.sku, 'title': (s.item.product.title if s.item.product_id else '')[:70],
            'was': last[s.pk]['from'], 'price': price, 'reward_before': s.reward, 'reward': reward, 'reset_on': reset_on,
            'grow_days': grow_days, 'floor_price': floor_price, 'status': status, 'reason': reason, 'day': s.day,
        })
    return rows


def _markdown_preview(params: dict) -> dict:
    rows = markdown_rows()
    before = sum((x['reward_before'] for x in rows), rewards.ZERO)
    after = sum((x['reward'] for x in rows), rewards.ZERO)
    top = sorted(rows, key=lambda x: x['reward'] - x['reward_before'])[:20]
    return {
        'counts': {'Marked-down items': len(rows), 'ThriftBucks now': str(before), 'ThriftBucks after': str(after)},
        'changes': [
            f'{len(rows):,} floor items were marked down and kept their ThriftBucks. Each goes to what a reset on its '
            f'markdown day gives: 0 through a new 7-day wait, then growth on the new tag (rulebook P3a).',
            f'Together they hold {before} ThriftBucks now and {after} after. Nothing goes up. Each change is logged on the item.',
            'From now on the nightly run does this by itself on every markdown. Safe to run again: it then finds nothing.',
        ],
        'sample': [f"{x['sku']} {x['title']}: tag {x['was']} to {x['price']}, {x['reward_before']} to {x['reward']}" for x in top],
    }


def _markdown_apply(request: ApprovalRequest, progress: Progress) -> dict:
    from django.db import transaction
    from django.utils import timezone

    rows = markdown_rows()
    today, now = timezone.localdate(), timezone.now()
    taken = rewards.ZERO
    for i in range(0, len(rows), 200):
        part = rows[i:i + 200]
        with transaction.atomic():
            for x in part:
                ItemReward.objects.filter(pk=x['item_id']).update(
                    reward=x['reward'], grow_days=x['grow_days'], reset_on=x['reset_on'], floor_price=x['floor_price'],
                    status=x['status'], reason=x['reason'], updated_at=now,
                )
            RewardEvent.objects.bulk_create([
                RewardEvent(item_reward_id=x['item_id'], run=None, on=today, day=x['day'], reward=x['reward'],
                            status=x['status'], reason='markdown_reset',
                            detail={'why': 'rulebook P3a: a markdown resets the ThriftBucks', 'request': request.pk,
                                    'reward_before': str(x['reward_before']), 'reset_on': x['reset_on'].isoformat(),
                                    'retag': {'from': x['was'], 'to': str(x['price'])}})
                for x in part
            ])
        taken += sum((x['reward_before'] - x['reward'] for x in part), rewards.ZERO)
        progress.update(done=min(len(rows), i + 200), total=len(rows), log=f'Reset {min(len(rows), i + 200):,} of {len(rows):,} items.')
    return {'items': len(rows), 'thriftbucks_taken_back': str(taken)}


register(Kind(kind='thriftplus.markdown_reset', label='Reset ThriftBucks kept through a markdown',
              preview=_markdown_preview, apply=_markdown_apply))


# ── Members: the legacy cleanup (owner 2026-10-16) ──────────────────────────────

def _legacy_preview(params: dict) -> dict:
    from apps.thriftplus.services import one_account

    p = one_account.plan()
    staff = '; '.join(p['staff_in_group_list']) or 'none'
    return {
        'counts': {'Old customers': p['customer_logins'], 'Link to their member': p['link_existing'],
                   'New members (finish in the app)': p['make_memberships'], 'Customer passwords': p['customer_passwords'],
                   'Old app passwords': p['app_passwords'], 'Staff in the Customer group': p['staff_in_group']},
        'changes': [
            f"Every old ecothrift.us customer becomes a member: {p['link_existing']:,} link to the member with the same "
            f"email, {p['make_memberships']:,} become new members who finish in the app (add a phone, a selfie, I agree). Their holds stay with them.",
            f"Removes {p['customer_passwords']:,} customer passwords and {p['app_passwords']:,} old Thrift+ app logins. "
            'Members sign in with an emailed link. Staff passwords are not touched.',
            f"Takes staff logins out of the Customer group ({staff}). The staff logins stay.",
            'Safe to run again. Removed passwords are not kept.',
        ],
        'sample': p['staff_in_group_list'][:20],
    }


def _legacy_apply(request: ApprovalRequest, progress: Progress) -> dict:
    from apps.thriftplus.services import one_account

    return one_account.apply(progress)


register(Kind(kind='members.legacy_cleanup', label='Members: legacy cleanup (old customers, passwords, staff records)',
              preview=_legacy_preview, apply=_legacy_apply))



# ── Members: names and old logins (owner 2026-10-16) ────────────────────────────

def _names_preview(params: dict) -> dict:
    from apps.thriftplus.services import member_names

    p = member_names.plan()
    return {
        'counts': {'Old logins to delete': p['delete_logins'], 'Their pending memberships': p['delete_memberships'],
                   'Names to fix': p['rename']},
        'changes': [
            f"Deletes {p['delete_logins']:,} old ecothrift.us logins whose email was never verified, with the "
            f"{p['delete_memberships']:,} pending memberships the 10-16 merge made for them (and their holds, orders "
            'and conversations). An active member, or one with ThriftBucks or credit history, is never deleted.',
            f"Fixes {p['rename']:,} names by the one rule: no \"Customer\"; a full name is split into first and last; a "
            'single name gets "Member"; all lower case or ALL CAPS is capitalized. A member\'s login takes their name.',
            'Safe to run again. Deleted logins and memberships cannot be brought back.',
        ],
        'sample': [f'Delete: {n}' for n in p['delete_list']] + p['rename_list'][:60],
    }


def _names_apply(request: ApprovalRequest, progress: Progress) -> dict:
    from apps.thriftplus.services import member_names

    return member_names.apply(progress)


register(Kind(kind='members.names_cleanup', label='Members: fix names, delete unverified old logins',
              preview=_names_preview, apply=_names_apply))


# ── Late re-ring (owner 2026-10-31): a member left off a sale, found after the 30-minute re-ring window ───────────


def _late_rering_find(params: dict):
    from apps.pos.models import Receipt
    from apps.thriftplus.models import Person

    receipt = Receipt.objects.select_related('cart').filter(receipt_number=str(params.get('receipt') or '')).first()
    if receipt is None:
        raise RequestError('No sale with that receipt number.')
    person = Person.objects.filter(pk=params.get('person_id')).first()
    if person is None or not (person.phone or '').endswith(str(params.get('phone_last4') or '-')):
        raise RequestError('No Thrift+ person with that id and phone ending.')
    return receipt, person


def _late_rering_preview(params: dict) -> dict:
    from apps.thriftplus.services.register import member_of

    receipt, person = _late_rering_find(params)
    if member_of(receipt.cart) is not None:
        raise RequestError('This sale already has a Thrift+ member.')
    return {'counts': {'Sales': 1}, 'changes': [
        f'Puts {person.first_name} {person.last_name} on {receipt.receipt_number} (${receipt.cart.total}) as a re-ring.',
        'The sale takes its ThriftBucks as kept, and it can be returned as a Thrift+ sale.',
    ], 'sample': []}


def _late_rering_apply(request: ApprovalRequest, progress: Progress) -> dict:
    from datetime import timedelta

    from apps.thriftplus.services.register import member_of, rering

    receipt, person = _late_rering_find(request.params)
    if member_of(receipt.cart) is None:  # safe to run twice
        rering(receipt.cart, person=person, user=request.decided_by, window=timedelta(days=30))
    return {'receipt': receipt.receipt_number, 'person': person.pk}


register(Kind(kind='thriftplus.late_rering', label='Put a Thrift+ member on a past sale (late re-ring)',
              preview=_late_rering_preview, apply=_late_rering_apply))

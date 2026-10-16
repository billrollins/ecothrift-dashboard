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


# ── Members: the legacy cleanup (owner 2026-10-16) ──────────────────────────────

def _legacy_preview(params: dict) -> dict:
    from apps.thriftplus.services import one_account

    p = one_account.plan()
    staff = '; '.join(p['staff_records_list']) or 'none'
    return {
        'counts': {'Old customers': p['customer_logins'], 'Link to their member': p['link_existing'],
                   'New Needs Finalize members': p['make_memberships'], 'Customer passwords': p['customer_passwords'],
                   'Old app passwords': p['app_passwords'], 'Staff customer records': p['staff_records']},
        'changes': [
            f"Every old ecothrift.us customer becomes a member: {p['link_existing']:,} link to the member with the same "
            f"email, {p['make_memberships']:,} become new members at Needs Finalize. Their holds stay with them.",
            f"Removes {p['customer_passwords']:,} customer passwords and {p['app_passwords']:,} old Thrift+ app logins. "
            'Members sign in with an emailed link. Staff passwords are not touched.',
            f"Removes the customer records on staff logins ({staff}). The staff logins stay.",
            'Safe to run again. Removed passwords are not kept.',
        ],
        'sample': p['staff_records_list'][:20],
    }


def _legacy_apply(request: ApprovalRequest, progress: Progress) -> dict:
    from apps.thriftplus.services import one_account

    return one_account.apply(progress)


register(Kind(kind='members.legacy_cleanup', label='Members: legacy cleanup (old customers, passwords, staff records)',
              preview=_legacy_preview, apply=_legacy_apply))


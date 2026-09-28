"""
Thrift+ work that goes through Superuser → Requests (staged in production, approved there).

- ``thriftplus.reset_rewards``: clear every item's reward state and log, so the next nightly run
  starts all floor items fresh (for example after setting ``thrift_plus_rewards_start`` to the
  launch day). Only while the Thrift+ switch is off: once members see prices, a reward never goes
  down. It can't be undone; the nightly run rebuilds the states from the rules.
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

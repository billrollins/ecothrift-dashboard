"""Staff voting on draft signs (#122, Bill 2026-11-12).

Each person says whether a draft is needed (yes/no) and ranks its versions: they pick the best (1), then the next
best (2), and so on. Nobody sees how others voted until they have voted themselves: a yes/no in and a best picked.
After that nothing is hidden from them.

Approving a draft (#128, Bill 2026-11-13): only after at least ``MIN_VOTERS`` people have fully voted (a yes/no and a
ranking), and the person approving is one of them. A theme is approved by the owner (superuser) alone.
"""
from __future__ import annotations

from collections import defaultdict

from .models import Sign, SignNeedVote, SignVersionRank

MIN_VOTERS = 3


def has_voted(my_needed, my_ranks: dict, version_count: int) -> bool:
    """Voted = a yes/no in and, when the draft has versions, a best picked."""
    if my_needed is None:
        return False
    return version_count == 0 or bool(my_ranks)


def vote_context(signs, user) -> dict:
    """Per sign id: this person's votes and, once they have voted, everyone's results.

    ``{sign_id: {'my_needed', 'my_ranks': {version_id: rank}, 'has_voted', 'results': None | {...}}}``
    """
    sign_ids = [s.id for s in signs]
    if not sign_ids:
        return {}
    needs = defaultdict(list)
    for v in SignNeedVote.objects.filter(sign_id__in=sign_ids).values('sign_id', 'user_id', 'needed'):
        needs[v['sign_id']].append(v)
    ranks = defaultdict(list)
    for r in SignVersionRank.objects.filter(sign_id__in=sign_ids).values('sign_id', 'version_id', 'user_id', 'rank'):
        ranks[r['sign_id']].append(r)

    out = {}
    for sign in signs:
        versions = list(sign.versions.all())
        my_needed = next((v['needed'] for v in needs[sign.id] if v['user_id'] == user.id), None)
        my_ranks = {r['version_id']: r['rank'] for r in ranks[sign.id] if r['user_id'] == user.id}
        voted = has_voted(my_needed, my_ranks, len(versions))
        out[sign.id] = {
            'my_needed': my_needed,
            'my_ranks': my_ranks,
            'has_voted': voted,
            'results': results(versions, needs[sign.id], ranks[sign.id]) if voted else None,
            'approve_block': approve_block(sign, user, full_voters(len(versions), needs[sign.id], ranks[sign.id])),
        }
    return out


def full_voters(version_count: int, need_rows, rank_rows) -> set:
    """Who has fully voted on one draft: a yes/no in and, when it has versions, at least a best picked."""
    ranked = {r['user_id'] for r in rank_rows}
    return {v['user_id'] for v in need_rows if version_count == 0 or v['user_id'] in ranked}


def approve_block(sign, user, voter_ids: set) -> dict | None:
    """Why this person cannot approve this draft yet, or None when they can.

    ``{'label': short text for the button, 'detail': the plain sentence the API answers with}``.
    """
    if sign.kind == Sign.KIND_THEME and not user.is_superuser:
        return {'label': 'Owner approves themes', 'detail': 'Only the owner approves a theme.'}
    if user.id not in voter_ids:
        return {
            'label': 'Vote first',
            'detail': 'Vote first: say yes or no and rank the versions. Only someone who voted can approve a draft.',
        }
    missing = MIN_VOTERS - len(voter_ids)
    if missing > 0:
        votes = 'vote' if missing == 1 else 'votes'
        return {
            'label': f'Needs {missing} more {votes}',
            'detail': f'Needs {missing} more {votes}: {MIN_VOTERS} people (you included) must vote before a draft is '
                      f'approved.',
        }
    return None


def approve_block_now(sign, user) -> dict | None:
    """``approve_block`` read fresh from the database (the approve endpoint's check)."""
    need_rows = SignNeedVote.objects.filter(sign=sign).values('user_id', 'needed')
    rank_rows = SignVersionRank.objects.filter(sign=sign).values('user_id')
    return approve_block(sign, user, full_voters(sign.versions.count(), need_rows, rank_rows))


def results(versions, need_rows, rank_rows) -> dict:
    """Everyone's votes on one draft: % who say it is needed, and each version's average rank (lower is better)."""
    yes = sum(1 for v in need_rows if v['needed'])
    no = len(need_rows) - yes
    by_version = defaultdict(list)
    for r in rank_rows:
        by_version[r['version_id']].append(r['rank'])
    per_version = {}
    for v in versions:
        got = by_version.get(v.id, [])
        per_version[v.id] = {
            'avg_rank': round(sum(got) / len(got), 2) if got else None,
            'rankers': len(got),
            'firsts': sum(1 for x in got if x == 1),
        }
    ranked = sorted(
        (v for v in versions if per_version[v.id]['avg_rank'] is not None),
        key=lambda v: (per_version[v.id]['avg_rank'], -per_version[v.id]['firsts'], v.position, v.id),
    )
    top = ranked[0] if ranked else None
    voters = {v['user_id'] for v in need_rows} | {r['user_id'] for r in rank_rows}
    return {
        'needed_yes': yes,
        'needed_no': no,
        'needed_pct': round(100 * yes / (yes + no)) if (yes + no) else None,
        'voters': len(voters),
        'versions': per_version,
        'top_version_id': top.id if top else None,
        'top_version_label': top.label if top else None,
    }


def pick_next(sign, user, version) -> None:
    """Give ``version`` this person's next rank (best first). When only one version is left, it takes the last rank."""
    mine = SignVersionRank.objects.filter(sign=sign, user=user)
    if mine.filter(version=version).exists():
        return
    next_rank = (max(mine.values_list('rank', flat=True), default=0)) + 1
    SignVersionRank.objects.create(sign=sign, user=user, version=version, rank=next_rank)
    ranked = set(mine.values_list('version_id', flat=True))
    left = [v for v in sign.versions.all() if v.id not in ranked]
    if len(left) == 1:
        SignVersionRank.objects.create(sign=sign, user=user, version=left[0], rank=next_rank + 1)

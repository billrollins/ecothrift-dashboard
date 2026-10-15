"""
Merge a customer login into a staff login (owner 2026-10-15: "I have bill_rollins@ecothrift.us and
bill_rollins.rf@outlook. the outlook should merge into the staff account (the staff login should overwrite the customer
one.)").

The superuser runs it from Dash → Thrift+ → Staff ("Merge a customer login…"): candidates, a preview, then the merge.
``merge_customer_login`` runs in one transaction. The staff login survives; its email, password and name win:

- **Rows that point at the customer login move to the staff login.** Every relation to ``User`` is walked
  (``_meta.get_fields(include_hidden=True)``, as ``apps/thriftplus/services/staff_members.py`` does), so a new one is
  never missed: website conversations, messages, register carts and the rest. Auth bookkeeping stays where it is: admin
  log entries, the account record (``AccountEvent``), group and permission links and issued tokens (blacklisted). A row
  that can't move (a unique clash) stays and is reported.
- **The website customer account:** when the staff login has none, the customer's ``CustomerProfile`` moves to it;
  when both have one, the staff login's stays, takes the earlier customer number and start date and the notes, anything
  pointing at the customer's profile moves to it, and the customer's (now empty) profile is deleted.
- **Rows kept by email** (holds, website threads, old orders) move from the customer email to the staff email, and
  unused emailed sign-in links for the customer email are spent.
- **Thrift+:** a customer membership whose primary person has the customer email merges into the staff member's own
  with ``staff_members.merge`` (made first when there is none). If Thrift+ refuses (a second adult on both, say), the
  login merge still runs and the answer says why; merge the membership on the same tab later.
- **The customer login ends switched off** with an unusable password, no username, and its email prefixed
  (``merged-{pk}.{email}``) so the address is free again. Both logins get an account record line.

Refused: the source is a staff login (staff, consignee or superuser) or has an employee or consignee record; the target
isn't active staff; the source is the target; the source is switched off already.
"""
from __future__ import annotations

import re
from collections import Counter

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import ForeignObjectRel, Q
from django.utils import timezone

from apps.accounts.models import AccountEvent, ConsigneeProfile, CustomerProfile, EmployeeProfile, MagicLinkToken
from apps.accounts.services.staff_customer import ensure_staff_customer, is_active_staff, is_staff_login

SUGGESTIONS = 5
SEARCH_LIMIT = 10
MERGED_PREFIX = 'merged-'
# The plain name for a relation on these fields ("conversations"); others add the field ("conversations (staff owner)").
OWN_FIELDS = {'user', 'customer', 'author_user'}


class MergeError(Exception):
    """A merge that may not happen, with the reason in the owner's words."""


# ── What points at a login ───────────────────────────────────────────────────────

def _skip_models() -> tuple:
    """Auth bookkeeping and the profiles handled on their own: never moved by the walk."""
    from django.contrib.admin.models import LogEntry

    User = get_user_model()
    skip = [LogEntry, AccountEvent, User.groups.through, User.user_permissions.through,
            CustomerProfile, EmployeeProfile, ConsigneeProfile]
    try:
        from rest_framework_simplejwt.token_blacklist.models import OutstandingToken

        skip.append(OutstandingToken)
    except Exception:  # noqa: BLE001 - the blacklist app may be off
        pass
    return tuple(skip)


def _relations(model) -> list[ForeignObjectRel]:
    """Every relation pointing at ``model``, hidden ones too (``related_name='+'``)."""
    return [f for f in model._meta.get_fields(include_hidden=True)
            if isinstance(f, ForeignObjectRel) and not f.many_to_many and f.field.concrete]


def _label(rel: ForeignObjectRel) -> str:
    plural = str(rel.related_model._meta.verbose_name_plural)
    if rel.field.name in OWN_FIELDS:
        return plural
    return f'{plural} ({rel.field.verbose_name})'


def _user_relations() -> list[ForeignObjectRel]:
    skip = _skip_models()
    return [rel for rel in _relations(get_user_model()) if rel.related_model not in skip]


THREADS_BY_EMAIL = 'website threads by email'


def _email_rows(email: str) -> dict:
    """Rows kept by email (not by a link to the login): querysets by their label. Threads already linked to the login
    move with the walk; only the unclaimed ones are counted here."""
    from apps.webstore.models import Conversation, Order, Reservation

    return {
        'holds': Reservation.objects.filter(email__iexact=email),
        THREADS_BY_EMAIL: Conversation.objects.filter(guest_email__iexact=email, customer__isnull=True),
        'old web orders': Order.objects.filter(email__iexact=email),
    }


# ── Refusals ───────────────────────────────────────────────────────────────────

def refusal(source, staff) -> str | None:
    """Why this merge may not happen, or None."""
    if source is None or staff is None:
        return 'Pick a staff login and a customer login.'
    if source.pk == staff.pk:
        return 'That is the staff login itself.'
    if not is_active_staff(staff):
        return f'{staff.email} is not an active staff login.'
    if is_staff_login(source):
        return f'{source.email} is a staff login. Only a customer login merges into a staff login.'
    if EmployeeProfile.objects.filter(user=source).exists() or ConsigneeProfile.objects.filter(user=source).exists():
        return f'{source.email} has an employee or consignee record, so it does not merge here.'
    if not source.is_active:
        return f'{source.email} is switched off already.'
    return None


# ── Candidates: customer logins that may be the staff member's ────────────────────

def _phone_digits(raw: str) -> str:
    digits = re.sub(r'\D', '', raw or '')
    return digits[1:] if len(digits) == 11 and digits.startswith('1') else digits


def _phone_regex(digits: str) -> str:
    """Matches the same 10 digits however they are written ("(402) 555-0100", "1-402-555-0100")."""
    return r'^\D*(1\D*)?' + r'\D*'.join(digits) + r'\D*$'


def _email_name_regex(email: str) -> str:
    """``bill_rollins`` matches ``bill_rollins@…`` and ``bill_rollins.rf@…`` (the same email name)."""
    local = (email or '').split('@')[0].strip().lower()
    return rf'^{re.escape(local)}([._+-][^@]*)?@' if len(local) >= 3 else ''


def _customers():
    """Active logins that are not staff, consignee or superuser logins."""
    User = get_user_model()
    return (User.objects.filter(is_active=True, is_superuser=False, is_staff=False)
            .exclude(groups__name__iregex=r'^(admin|manager|employee|consignee)$'))


def _row(user, why: list[str]) -> dict:
    profile = CustomerProfile.objects.filter(user=user).first()
    return {
        'user_id': user.pk, 'name': (user.full_name or '').strip(), 'email': user.email, 'phone': user.phone or '',
        'customer_number': profile.customer_number if profile else '', 'why': why,
        'joined': user.date_joined, 'last_login': user.last_login,
    }


def suggestions(staff, *, limit: int = SUGGESTIONS) -> list[dict]:
    """Customer logins that may be this staff member's: the same email name, the same phone, or the same first and
    last name. Most reasons first."""
    digits = _phone_digits(staff.phone)
    phone_re = _phone_regex(digits) if len(digits) == 10 else ''
    first, last = (staff.first_name or '').strip(), (staff.last_name or '').strip()
    email_re = _email_name_regex(staff.email)
    cond = Q(pk__in=[])
    if email_re:
        cond |= Q(email__iregex=email_re)
    if phone_re:
        cond |= Q(phone__regex=phone_re)
    if first and last:
        cond |= Q(first_name__iexact=first, last_name__iexact=last)
    out = []
    for user in _customers().filter(cond).exclude(pk=staff.pk).distinct().order_by('-date_joined')[:50]:
        why = []
        if email_re and re.match(email_re, (user.email or '').lower()):
            why.append('same email name')
        if phone_re and _phone_digits(user.phone) == digits:
            why.append('same phone')
        if first and last and user.first_name.strip().lower() == first.lower() \
                and user.last_name.strip().lower() == last.lower():
            why.append('same name')
        out.append((user, why))
    out.sort(key=lambda r: (-len(r[1]), -r[0].pk))
    return [_row(u, why) for u, why in out[:limit]]


def search(staff, q: str, *, limit: int = SEARCH_LIMIT) -> list[dict]:
    """Customer logins by email, name or phone."""
    q = (q or '').strip()
    if len(q) < 2:
        return []
    cond = Q(email__icontains=q) | Q(first_name__icontains=q) | Q(last_name__icontains=q)
    parts = q.split()
    if len(parts) >= 2:
        cond |= Q(first_name__icontains=parts[0], last_name__icontains=parts[-1])
    digits = _phone_digits(q)
    if len(digits) >= 4 and len(digits) == len(re.sub(r'[\s().+-]', '', q)):
        cond |= Q(phone__regex=r'\D*'.join(digits))
    users = _customers().filter(cond).exclude(pk=staff.pk).distinct().order_by('-date_joined')[:limit]
    return [_row(u, []) for u in users]


# ── Thrift+ ────────────────────────────────────────────────────────────────────

def _thriftplus_source(source):
    """(membership to merge, reason it won't): the customer membership whose primary person has the source email."""
    from apps.thriftplus.models import Account, Person
    from apps.thriftplus.services.emails import clean_email

    email = clean_email(source.email) or (source.email or '').strip().lower()
    if not email:
        return None, ''
    people = (Person.objects.select_related('account')
              .filter(Q(email=email) | Q(login__email=email), removed_at__isnull=True)
              .exclude(account__status=Account.STATUS_REVOKED).distinct())
    primary = people.filter(role=Person.ROLE_PRIMARY, account__staff_user__isnull=True,
                            account__is_practice=False).order_by('pk').first()
    if primary is not None:
        return primary.account, ''
    other = people.first()
    if other is None:
        return None, ''
    if other.account.staff_user_id:
        return None, f'Thrift+: {email} is on staff membership #{other.account_id}; nothing to merge.'
    if other.account.is_practice:
        return None, f'Thrift+: {email} is a practice member; it does not merge.'
    return None, (f'Thrift+: {email} is the second adult on membership #{other.account_id}, so that membership '
                  f'stays as it is.')


def _thriftplus_plan(source, staff) -> dict | None:
    from apps.thriftplus.services import staff_members
    from apps.thriftplus.services.members import MemberError

    account, reason = _thriftplus_source(source)
    if account is None:
        return {'account': None, 'note': reason} if reason else None
    plan = {'account': account.pk, 'note': ''}
    try:
        p = staff_members.preview(staff, account)
        plan.update({'name': p['source_name'], 'bucks': p['bucks'], 'credit': p['credit'], 'moves': p['moves'],
                     'staff_account': p['staff_account']})
    except MemberError as exc:
        plan['note'] = f'Thrift+ membership #{account.pk} will not merge: {exc}'
        plan['refused'] = True
    return plan


# ── Preview and merge ────────────────────────────────────────────────────────────

def _merged_email(source) -> str:
    """``merged-{pk}.{email}``: the address is free again, and it is still plainly the old one."""
    User = get_user_model()
    max_len = User._meta.get_field('email').max_length
    old = (source.email or '').strip()
    for n in range(1, 50):
        tag = f'{MERGED_PREFIX}{source.pk}' + (f'-{n}' if n > 1 else '')
        email = f'{tag}.{old}' if '@' in old and len(f'{tag}.{old}') <= max_len else f'{tag}@merged.invalid'
        if not User.objects.filter(email__iexact=email).exclude(pk=source.pk).exists():
            return email
    raise MergeError('Could not free the customer email.')


def _number(profile: CustomerProfile) -> tuple:
    """Sort key: the earlier customer number first (CUS-005 before CUS-012)."""
    try:
        return (int(profile.customer_number.split('-')[1]), profile.pk)
    except (IndexError, ValueError):
        return (10 ** 9, profile.pk)


def _profile_plan(source, staff) -> dict:
    mine = CustomerProfile.objects.filter(user=staff).first()
    theirs = CustomerProfile.objects.filter(user=source).first()
    if theirs is None:
        return {'action': 'none' if mine else 'make', 'customer_number': mine.customer_number if mine else ''}
    if mine is None:
        return {'action': 'move', 'customer_number': theirs.customer_number}
    keep = min((mine, theirs), key=_number)
    return {'action': 'combine', 'customer_number': keep.customer_number, 'drops': theirs.customer_number
            if keep.pk == mine.pk else mine.customer_number}


def preview(source, staff) -> dict:
    """What a merge would do (nothing changes). Raises ``MergeError`` when it would be refused."""
    reason = refusal(source, staff)
    if reason:
        raise MergeError(reason)
    moves = Counter()
    for rel in _user_relations():
        n = rel.related_model._base_manager.filter(**{rel.field.name: source}).count()
        if n:
            moves[_label(rel)] += n
    for label, qs in _email_rows(source.email).items():
        n = qs.count()
        if n:
            moves[label] += n
    return {
        'source': _row(source, []),
        'staff': {'user_id': staff.pk, 'name': (staff.full_name or '').strip(), 'email': staff.email},
        'moves': dict(moves),
        'profile': _profile_plan(source, staff),
        'thriftplus': _thriftplus_plan(source, staff),
        'source_after': _merged_email(source),
    }


def _move_user_rows(source, staff, *, moved: Counter, left: list[str]) -> None:
    """Point every row that refers to the customer login at the staff login. A one-to-one moves only when the staff
    login has none; a row that clashes with one the staff login has already (a unique pair) stays, and is reported."""
    for rel in _user_relations():
        model, name = rel.related_model, rel.field.name
        manager = model._base_manager
        if rel.one_to_one:
            row = manager.filter(**{name: source}).first()
            if row is None:
                continue
            if manager.filter(**{name: staff}).exists():
                left.append(_label(rel))
                continue
            manager.filter(pk=row.pk).update(**{name: staff})
            moved[_label(rel)] += 1
            continue
        try:
            with transaction.atomic():
                n = manager.filter(**{name: source}).update(**{name: staff})
        except IntegrityError:
            n = 0
            for pk in list(manager.filter(**{name: source}).values_list('pk', flat=True)):
                try:
                    with transaction.atomic():
                        manager.filter(pk=pk).update(**{name: staff})
                    n += 1
                except IntegrityError:
                    left.append(_label(rel))
        if n:
            moved[_label(rel)] += n


def _merge_profiles(source, staff, *, moved: Counter) -> str:
    """The website customer account. Answers what happened: moved, combined, or none."""
    theirs = CustomerProfile.objects.select_for_update().filter(user=source).first()
    if theirs is None:
        return 'none'
    mine = CustomerProfile.objects.select_for_update().filter(user=staff).first()
    if mine is None:
        theirs.user = staff
        fields = ['user']
        if theirs.email_verified_at is None:
            theirs.email_verified_at = timezone.now()  # now the staff member's Dash email: trusted
            fields.append('email_verified_at')
        theirs.save(update_fields=fields)
        moved['website customer account'] += 1
        return 'moved'
    # Anything pointing at the customer's profile moves to the staff login's (nothing does today).
    for rel in _relations(CustomerProfile):
        n = rel.related_model._base_manager.filter(**{rel.field.name: theirs}).update(**{rel.field.name: mine})
        if n:
            moved[_label(rel)] += n
    keep_number = min((mine, theirs), key=_number).customer_number
    since = min((d for d in (mine.customer_since, theirs.customer_since) if d), default=None)
    verified = min((d for d in (mine.email_verified_at, theirs.email_verified_at) if d), default=None)
    notes = '\n'.join(n for n in ((mine.notes or '').strip(), (theirs.notes or '').strip()) if n)
    theirs.delete()  # frees the customer number first (it is unique)
    # customer_since is auto_now_add (save() would leave it alone), so everything goes in with update().
    CustomerProfile.objects.filter(pk=mine.pk).update(
        customer_number=keep_number, customer_since=since or mine.customer_since,
        email_verified_at=verified or timezone.now(), notes=notes,
    )
    moved['website customer account'] += 1
    return 'combined'


def _move_email_rows(source_email: str, staff, *, moved: Counter) -> None:
    """Holds, threads and old orders kept by the customer email go to the staff email (and threads to the login)."""
    from apps.webstore.models import Conversation

    email = staff.email
    for label, qs in _email_rows(source_email).items():
        if label == THREADS_BY_EMAIL:  # unclaimed guest threads: the staff login claims them
            n = qs.update(customer=staff, guest_email=email)
        else:
            n = qs.update(email=email)
        if n:
            moved[label] += n
    # Threads that already moved with the walk answer to the staff email from now on (not counted twice).
    Conversation.objects.filter(guest_email__iexact=source_email).update(guest_email=email)


def _blacklist_tokens(source) -> int:
    try:
        from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
    except Exception:  # noqa: BLE001 - the blacklist app may be off
        return 0
    n = 0
    for token in OutstandingToken.objects.filter(user=source, expires_at__gt=timezone.now()):
        _row_, made = BlacklistedToken.objects.get_or_create(token=token)
        n += int(made)
    return n


def _summary(moved: dict) -> str:
    return ', '.join(f'{k}: {v}' for k, v in moved.items() if v) or 'nothing else'


@transaction.atomic
def merge_customer_login(source_user, staff_user, actor=None) -> dict:
    """Merge the customer login ``source_user`` into the staff login ``staff_user``; the staff login survives. One
    transaction. Answers what moved. Raises ``MergeError`` when refused (nothing changes)."""
    User = get_user_model()
    # Lock both logins, in pk order (two merges at once never deadlock).
    locked = {u.pk: u for u in User.objects.select_for_update().filter(pk__in=[source_user.pk, staff_user.pk])
              .order_by('pk')}
    source, staff = locked.get(source_user.pk), locked.get(staff_user.pk)
    reason = refusal(source, staff)
    if reason:
        raise MergeError(reason)
    source_email = source.email
    moved, left = Counter(), []

    profile = _merge_profiles(source, staff, moved=moved)
    _move_user_rows(source, staff, moved=moved, left=left)
    _move_email_rows(source_email, staff, moved=moved)
    links = MagicLinkToken.objects.filter(email__iexact=source_email, used_at__isnull=True).update(
        used_at=timezone.now())

    # Thrift+: the customer membership with the source email merges into the staff member's own (in its own
    # savepoint: when Thrift+ refuses, the login merge still runs and the answer says why).
    thriftplus = None
    account, note = _thriftplus_source(source)
    if account is not None:
        from apps.thriftplus.services import staff_members
        from apps.thriftplus.services.members import MemberError

        try:
            with transaction.atomic():
                result = staff_members.merge(staff, account, actor=actor)  # ensures the staff membership first
            thriftplus = {'merged': True, 'source_account': result['source_account'],
                          'staff_account': result['staff_account'], 'moved': result['moved'], 'now': result['now']}
        except MemberError as exc:
            thriftplus = {'merged': False, 'source_account': account.pk,
                          'note': f'Thrift+ membership #{account.pk} did not merge: {exc}'}
    elif note:
        thriftplus = {'merged': False, 'source_account': None, 'note': note}

    # The customer login ends switched off, with no password, no username, and its address free again.
    new_email = _merged_email(source)
    source.email = new_email
    source.username = None
    source.is_active = False
    source.set_unusable_password()
    source.save(update_fields=['email', 'username', 'is_active', 'password', 'updated_at'])
    tokens = _blacklist_tokens(source)

    ensure_staff_customer(staff)

    detail = _summary(dict(moved))
    AccountEvent.log(staff, AccountEvent.KIND_MERGED_IN, actor=actor,
                     detail=f'Customer login {source_email} (user {source.pk}) merged in. Moved {detail}.')
    AccountEvent.log(source, AccountEvent.KIND_MERGED_INTO, actor=actor,
                     detail=f'Merged into staff login {staff.email} (user {staff.pk}); was {source_email}. '
                            f'Moved {detail}.')
    return {
        'source_user': source.pk, 'staff_user': staff.pk, 'source_email_was': source_email,
        'source_email_now': new_email, 'moved': dict(moved), 'left': sorted(set(left)), 'profile': profile,
        'customer_number': CustomerProfile.objects.filter(user=staff).values_list('customer_number', flat=True).first(),
        'sign_in_links_spent': links, 'tokens_blacklisted': tokens, 'thriftplus': thriftplus,
    }

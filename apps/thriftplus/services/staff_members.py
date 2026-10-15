"""
Staff Thrift+ memberships (owner 2026-10-15; rulebook J6: a staff member's own membership, free like every one).

- **Every active staff member has one.** "Staff" is ``apps.accounts.services.usernames.is_staff_user`` (a superuser,
  or in the admin, manager or employee group), the scanner's staff sign-in test. ``ensure_staff_membership`` makes it,
  links it or keeps it in step. It runs:
  - when a staff user is saved or put in a staff group (``apps/thriftplus/signals.py``, after the commit);
  - when a staff member signs in to the scanner with their Dash password, or asks for an emailed link or joins with
    their Dash email (``member_auth``);
  - for every staff member without one, when the owner clicks "Create missing staff memberships" in Dash.
  Customers (non-staff users) never get one this way.
- **The staff login overwrites.** The staff membership's primary person carries the staff member's Dash email
  (confirmed: a Dash email is trusted). A customer membership with that same email (and no staff member) is linked
  rather than doubled.
- **Merge** (the owner, from Dash): a customer membership the staff member made before (another email) moves into the
  staff membership, which survives. See ``merge``.
"""
from __future__ import annotations

import re
from collections import Counter

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Case, ForeignObjectRel, IntegerField, Q, Value, When
from django.utils import timezone

from apps.thriftplus.models import (
    Account,
    AppCart,
    AppCartLine,
    Card,
    CartMember,
    Event,
    LedgerEntry,
    MemberEmailToken,
    MemberLogin,
    MemberSession,
    Person,
    ReturnRecord,
    ScanSignal,
)
from apps.thriftplus.services import ledger, members
from apps.thriftplus.services.members import MemberError

STAFF_GROUPS = r'^(admin|manager|employee)$'  # the same groups as is_staff_user
MADE_NOTE = "A staff member's own membership, made from their Dash login."
# The source of a merge ends revoked with this reason (overview.py leaves these out of the revoked count).
MERGED_REASON = 'Merged into staff membership'
SUGGESTIONS = 3

# What a merge moved, in the owner's words. Other relations are named by their model.
LABELS = {
    LedgerEntry: 'ledger rows',
    CartMember: 'sales',
    ReturnRecord: 'returns',
    Event: 'history events',
    ScanSignal: 'scans',
    Card: 'member codes',
}


# ── Who is staff ───────────────────────────────────────────────────────────────

def staff_users():
    """Every active staff user (the query form of ``is_staff_user``)."""
    User = get_user_model()
    return (User.objects.filter(is_active=True)
            .filter(Q(is_superuser=True) | Q(groups__name__iregex=STAFF_GROUPS)).distinct())


def is_active_staff(user) -> bool:
    from apps.accounts.services.usernames import is_staff_user

    return bool(user is not None and user.pk and user.is_active and is_staff_user(user))


def staff_user_for_email(email: str):
    """The active staff user whose Dash email this is, or None."""
    email = (email or '').strip()
    if not email:
        return None
    return staff_users().filter(email__iexact=email).order_by('pk').first()


def _email(user) -> str:
    """The Dash email as Thrift+ keeps emails: trimmed and lower-cased."""
    from apps.thriftplus.services.emails import clean_email

    return clean_email(user.email) or (user.email or '').strip().lower()


def primary_person(account: Account) -> Person | None:
    """The membership's primary person (on the account), else its first person still on it."""
    return (account.people.filter(role=Person.ROLE_PRIMARY, removed_at__isnull=True).order_by('pk').first()
            or account.people.filter(removed_at__isnull=True).order_by('role', 'pk').first())


# ── Ensure: every active staff member has their own membership ───────────────────

def ensure_staff_membership(user, *, actor=None) -> Account | None:
    """The staff member's own membership: kept in step, linked, or made. ``None`` for anyone not active staff."""
    return _ensure(user, actor=actor)[0]


def _ensure(user, *, actor=None) -> tuple[Account | None, str]:
    """(account, how): how is 'kept' (already theirs), 'linked' (a membership with their email) or 'made'."""
    if not is_active_staff(user):
        return None, ''
    User = get_user_model()
    email = _email(user)
    with transaction.atomic():
        User.objects.select_for_update().filter(pk=user.pk).first()  # one ensure at a time per staff member
        account = Account.objects.filter(staff_user=user).first()
        if account is not None:
            _keep_in_step(account, user, email, actor=actor)
            return account, 'kept'
        account = _link_by_email(user, email, actor=actor)
        if account is not None:
            return account, 'linked'
        try:
            with transaction.atomic():
                return _make(user, email, actor=actor), 'made'
        except IntegrityError:  # made at the same moment elsewhere
            return Account.objects.filter(staff_user=user).first(), 'kept'


def _keep_in_step(account: Account, user, email: str, *, actor=None) -> None:
    """The staff login overwrites (owner 2026-10-15): the primary person's email is the Dash email, confirmed. A
    revoked staff membership is left alone."""
    if account.status == Account.STATUS_REVOKED:
        return
    if account.status == Account.STATUS_PENDING:
        account.status = Account.STATUS_ACTIVE
        account.save(update_fields=['status', 'updated_at'])
        members.log('staff_active', account=account, actor=actor)
    person = primary_person(account)
    if person is None:
        _make_person(account, user, email, actor=actor)
        return
    if not email or (person.email == email and person.email_verified_at):
        return
    old = person.email
    person.email = email
    person.email_verified_at = timezone.now()
    person.save(update_fields=['email', 'email_verified_at', 'updated_at'])
    if old != email:
        from apps.thriftplus.services.member_auth import mask

        members.log('staff_email', account=account, person=person, actor=actor, to=mask(email),
                    was=mask(old) if old else '')


def _link_by_email(user, email: str, *, actor=None) -> Account | None:
    """A membership whose primary person has the staff member's Dash email (active first) becomes theirs."""
    if not email:
        return None
    person = (
        Person.objects.select_related('account')
        .filter(email=email, role=Person.ROLE_PRIMARY, removed_at__isnull=True, account__staff_user__isnull=True,
                account__is_practice=False, account__status__in=(Account.STATUS_ACTIVE, Account.STATUS_PENDING))
        .annotate(rank=Case(When(account__status=Account.STATUS_ACTIVE, then=Value(0)), default=Value(1),
                            output_field=IntegerField()))
        .order_by('rank', 'pk').first()
    )
    if person is None:
        return None
    account = person.account
    was = account.status
    account.staff_user = user
    account.status = Account.STATUS_ACTIVE
    account.save(update_fields=['staff_user', 'status', 'updated_at'])
    if person.email_verified_at is None:
        person.email_verified_at = timezone.now()
        person.save(update_fields=['email_verified_at', 'updated_at'])
    members.log('staff_linked', account=account, person=person, actor=actor, staff_user=user.pk, was=was)
    return account


def _make_person(account: Account, user, email: str, *, actor=None) -> Person:
    person = Person.objects.create(
        account=account, role=Person.ROLE_PRIMARY,
        first_name=((user.first_name or '').strip() or (email.split('@')[0] if email else '') or 'Staff')[:80],
        last_name=(user.last_name or '').strip()[:80], email=email,
        email_verified_at=timezone.now() if email else None,  # a Dash email is trusted
    )
    members.new_member_code(person, user=actor)
    return person


def _make(user, email: str, *, actor=None) -> Account:
    account = Account.objects.create(staff_user=user, status=Account.STATUS_ACTIVE, created_by=actor, notes=MADE_NOTE)
    person = _make_person(account, user, email, actor=actor)
    members.log('staff_membership', account=account, person=person, actor=actor, staff_user=user.pk)
    return account


def create_missing(*, actor=None) -> dict:
    """Every active staff member without a membership gets one (linked by email, or made). Answers the counts."""
    counts = Counter()
    for user in staff_users().filter(thrift_plus_account__isnull=True).order_by('pk'):
        account, how = _ensure(user, actor=actor)
        if account is not None:
            counts[how] += 1
    return {'made': counts['made'], 'linked': counts['linked'],
            'missing': staff_users().filter(thrift_plus_account__isnull=True).count()}


# ── The Staff list, with memberships that may be theirs ──────────────────────────

def _money(account: Account) -> dict:
    return {'bucks': str(ledger.bucks_total(account)), 'credit': str(ledger.credit_balance(account))}


def _name(person: Person | None) -> str:
    return f'{person.first_name} {person.last_name}'.strip() if person else ''


def suggestions(user, account: Account | None = None, *, limit: int = SUGGESTIONS) -> list[dict]:
    """Customer memberships that may be this staff member's (owner 2026-10-15): the same phone digits, the same first
    and last name, or the same email name (``bill_rollins`` matches ``bill_rollins.rf@…``). Active or pending, never
    practice, never a staff membership. Most reasons first."""
    from apps.thriftplus.services.member_auth import mask

    phones = {members.normalize_phone(user.phone)} if getattr(user, 'phone', '') else set()
    own = primary_person(account) if account is not None else None
    if own is not None and own.phone:
        phones.add(own.phone)
    phones = {p for p in phones if len(p) >= 10}
    first, last = (user.first_name or '').strip().lower(), (user.last_name or '').strip().lower()
    local = (user.email or '').split('@')[0].strip().lower()
    email_name = rf'^{re.escape(local)}([._+-][^@]*)?@' if len(local) >= 3 else ''
    cond = Q(pk__in=[])
    if phones:
        cond |= Q(phone__in=phones)
    if first and last:
        cond |= Q(first_name__iexact=first, last_name__iexact=last)
    if email_name:
        cond |= Q(email__iregex=email_name)

    def why(p: Person) -> list[str]:
        out = []
        if p.phone and p.phone in phones:
            out.append('same phone')
        if first and last and p.first_name.strip().lower() == first and p.last_name.strip().lower() == last:
            out.append('same name')
        if email_name and re.match(email_name, (p.email or '').lower()):
            out.append('same email name')
        return out

    people = (
        Person.objects.select_related('account').filter(cond, removed_at__isnull=True)
        .filter(account__staff_user__isnull=True, account__is_practice=False,
                account__status__in=(Account.STATUS_ACTIVE, Account.STATUS_PENDING))
    )
    if account is not None:
        people = people.exclude(account=account)
    found: dict[int, dict] = {}
    for person in people.order_by('-account__created_at', 'pk')[:50]:
        row = found.setdefault(person.account_id, {'account': person.account, 'why': []})
        row['why'] += [w for w in why(person) if w not in row['why']]
    ranked = sorted(found.values(), key=lambda r: (-len(r['why']), r['account'].status != Account.STATUS_ACTIVE,
                                                   -r['account'].pk))[:limit]
    out = []
    for r in ranked:
        acc = r['account']
        person = primary_person(acc)
        out.append({'account_id': acc.pk, 'status': acc.status, 'name': _name(person),
                    'email': mask(person.email) if person and person.email else '', 'why': r['why'], **_money(acc)})
    return out


def staff_list(*, with_suggestions: bool = True) -> dict:
    """One row per active staff member: their membership (or none) and memberships that may be theirs; their website
    customer account (owner 2026-10-15: every staff login is a website customer too) and customer logins that may be
    theirs (``apps/accounts/services/login_merge.py``)."""
    from apps.accounts.models import CustomerProfile
    from apps.accounts.services import login_merge

    accounts = {a.staff_user_id: a for a in Account.objects.filter(staff_user__isnull=False).prefetch_related('people')}
    profiles = {p.user_id: p for p in CustomerProfile.objects.filter(user__in=staff_users())}
    in_group = set(staff_users().filter(groups__name__iexact='customer').values_list('pk', flat=True))
    rows = []
    for user in staff_users().order_by('first_name', 'last_name', 'email'):
        account = accounts.get(user.pk)
        person = primary_person(account) if account is not None else None
        profile = profiles.get(user.pk)
        rows.append({
            'user_id': user.pk, 'name': (user.full_name or '').strip() or user.email, 'email': user.email,
            'role': user.role or ('Superuser' if user.is_superuser else ''),
            'membership': ({'id': account.pk, 'status': account.status, 'name': _name(person),
                            'email': person.email if person else '', **_money(account)}
                           if account is not None else None),
            'website': ({'customer_number': profile.customer_number} if profile is not None and user.pk in in_group
                        else None),
            'suggestions': suggestions(user, account) if with_suggestions else [],
            'login_suggestions': login_merge.suggestions(user, limit=3) if with_suggestions else [],
        })
    missing = sum(1 for r in rows if r['membership'] is None)
    website_missing = sum(1 for r in rows if r['website'] is None)
    return {'staff': rows, 'missing': missing, 'website_missing': website_missing,
            'missing_any': sum(1 for r in rows if r['membership'] is None or r['website'] is None)}


# ── Merge a customer membership into the staff member's ──────────────────────────

def _relations(model) -> list[ForeignObjectRel]:
    """Every relation pointing at ``model``, hidden ones too (``related_name='+'``: Event.person, CartMember.person,
    ReturnRecord.person, ScanSignal.account), which ``_meta.related_objects`` leaves out."""
    return [f for f in model._meta.get_fields(include_hidden=True)
            if isinstance(f, ForeignObjectRel) and not f.many_to_many and f.field.concrete]


def _label(model) -> str:
    return LABELS.get(model, str(model._meta.verbose_name_plural))


def _checks(staff: Account | None, source: Account) -> tuple[Person, list[Person]]:
    """Refuse what may not merge. Answers the source's primary person and its other people."""
    if staff is not None and source.pk == staff.pk:
        raise MemberError("That is the staff member's own membership.")
    if source.staff_user_id:
        raise MemberError(f'Membership {source.pk} is a staff membership. Only a customer membership merges.')
    if source.status == Account.STATUS_REVOKED:
        raise MemberError(f'Membership {source.pk} is revoked: it does not merge.')
    if staff is not None and staff.status == Account.STATUS_REVOKED:
        raise MemberError("The staff member's own membership is revoked.")
    if source.is_practice != (staff.is_practice if staff is not None else False):
        raise MemberError('A practice member and a real membership never merge.')
    people = list(source.people.order_by('role', 'removed_at', 'pk'))
    if not people:
        raise MemberError(f'Membership {source.pk} has no one on it.')
    primary = next((p for p in people if p.role == Person.ROLE_PRIMARY and p.removed_at is None), people[0])
    others = [p for p in people if p.pk != primary.pk]
    adults = [p for p in others if p.removed_at is None]
    if len(adults) > 1:
        raise MemberError(f'Membership {source.pk} has more than one other adult on it.')
    if adults and staff is not None and staff.people.filter(role=Person.ROLE_SECONDARY, removed_at__isnull=True).exists():
        raise MemberError('Both memberships have a second adult (2 adults per membership at most). Take one off first.')
    return primary, others


def _what_moves(source: Account, primary: Person, others: list[Person]) -> dict:
    """Counts of what would move, without moving anything."""
    moved = Counter()
    for rel in _relations(Account):
        model, name = rel.related_model, rel.field.name
        if model in (Person, AppCart):
            continue
        n = model._base_manager.filter(**{name: source}).count()
        if n:
            moved[_label(model)] += n
    codes = Card.objects.filter(person=primary).count()
    if codes:
        moved[_label(Card)] += codes
    lines = AppCartLine.objects.filter(cart__account=source).count()
    if lines:
        moved['app cart lines'] += lines
    return dict(moved)


def preview(user, source: Account) -> dict:
    """What a merge would do (nothing changes). Raises ``MemberError`` when it would be refused."""
    if not is_active_staff(user):
        raise MemberError('Pick an active staff member.')
    staff = Account.objects.filter(staff_user=user).first()
    primary, others = _checks(staff, source)
    adult = next((p for p in others if p.removed_at is None), None)
    target = primary_person(staff) if staff is not None else None
    return {
        'staff_account': staff.pk if staff is not None else None,
        'source_account': source.pk, 'source_name': _name(primary),
        **_money(source),
        'codes': Card.objects.filter(person=primary, status=Card.STATUS_ACTIVE).count(),
        'second_adult': _name(adult) if adult else None,
        'moves': _what_moves(source, primary, others),
        'takes': _takes(target, primary),
        'login': MemberLogin.objects.filter(person=primary).exists(),
    }


def _takes(target: Person | None, source: Person) -> list[str]:
    """What the staff person takes from the source person: only what the staff person has none of."""
    out = []
    if source.phone and not (target and target.phone):
        out.append('phone')
    if source.photo and not (target and target.photo):
        out.append('photo')
    if source.id_checked and not (target and target.id_checked):
        out.append('ID check')
    if source.verified_18 and not (target and target.verified_18):
        out.append('18+')
    return out


def _take_person_fields(target: Person, source: Person) -> list[str]:
    taken = _takes(target, source)
    t_fields, s_fields = set(), set()
    if 'phone' in taken:
        target.phone, target.phone_verified_at, target.phone_verified_by_id = (
            source.phone, source.phone_verified_at, source.phone_verified_by_id)
        source.phone, source.phone_verified_at, source.phone_verified_by_id = '', None, None
        t_fields |= {'phone', 'phone_verified_at', 'phone_verified_by'}
        s_fields |= {'phone', 'phone_verified_at', 'phone_verified_by'}
    if 'photo' in taken:
        target.photo, source.photo = source.photo.name, ''
        t_fields.add('photo')
        s_fields.add('photo')
    if 'ID check' in taken:
        target.id_checked = True
        t_fields.add('id_checked')
    if '18+' in taken:
        target.verified_18 = True
        t_fields.add('verified_18')
    if source.verified_at and not target.verified_at:
        target.verified_at, target.verified_by_id = source.verified_at, source.verified_by_id
        t_fields |= {'verified_at', 'verified_by'}
    if t_fields:
        target.save(update_fields=[*sorted(t_fields), 'updated_at'])
    if s_fields:
        source.save(update_fields=[*sorted(s_fields), 'updated_at'])
    return taken


def _move_app_cart(source: Account, staff: Account) -> int:
    """The scanner app's cart is one per membership: the source's lines join the staff cart (an item already there
    keeps the larger quantity), or the whole cart moves when the staff member has none."""
    cart = AppCart.objects.filter(account=source).first()
    if cart is None:
        return 0
    lines = list(cart.lines.all())
    mine = AppCart.objects.filter(account=staff).first()
    if mine is None:
        AppCart.objects.filter(pk=cart.pk).update(account=staff)
        return len(lines)
    have = {line.item_id: line for line in mine.lines.all()}
    for line in lines:
        there = have.get(line.item_id)
        if there is None:
            AppCartLine.objects.filter(pk=line.pk).update(cart=mine)
        else:
            if line.qty > there.qty:
                AppCartLine.objects.filter(pk=there.pk).update(qty=line.qty)
            AppCartLine.objects.filter(pk=line.pk).delete()
    return len(lines)


def _move_rows(model_obj, source, target, *, skip: tuple, moved: Counter, left: list[str]) -> None:
    """Point every row that refers to ``source`` at ``target``, walking the model's relations (so a new relation is
    never missed). A one-to-one moves only when the target has none (else it stays, and is reported)."""
    for rel in _relations(model_obj):
        model, name = rel.related_model, rel.field.name
        if model in skip:
            continue
        manager = model._base_manager
        if rel.one_to_one:
            row = manager.filter(**{name: source}).first()
            if row is None:
                continue
            if manager.filter(**{name: target}).exists():
                left.append(str(model._meta.verbose_name))
                continue
            manager.filter(pk=row.pk).update(**{name: target})
            moved[_label(model)] += 1
            continue
        n = manager.filter(**{name: source}).update(**{name: target})
        if n:
            moved[_label(model)] += n


@transaction.atomic
def merge(user, source: Account, *, actor=None) -> dict:
    """
    Merge a customer membership into the staff member's own (owner 2026-10-15: "the staff login should overwrite the
    customer one"). One transaction. The staff membership survives (made first when there is none):
    - the staff person keeps the staff name and email; the source person's member login is deleted, their phones
      signed out and their emailed sign-ins deleted;
    - the staff person takes the source person's phone (with who verified it), photo, ID check and 18+, each only
      where the staff person has none;
    - the source's member codes move to the staff person, so the app QR they have still works at the register;
    - a second adult moves (refused when the staff membership already has one);
    - everything else on the source or its person moves: ThriftBucks and credit (the ledger), sales, returns, scans,
      history, the app cart;
    - the source ends revoked ("Merged into staff membership N"), logged on both with what moved.
    Refused: a practice member into a real one (or the reverse), the staff member's own, another staff membership, a
    revoked one.
    """
    from apps.thriftplus.services.member_auth import revoke_all

    if not is_active_staff(user):
        raise MemberError('Pick an active staff member.')
    staff = ensure_staff_membership(user, actor=actor)
    if staff is None:
        raise MemberError('Pick an active staff member.')
    staff = Account.objects.select_for_update().get(pk=staff.pk)
    source = Account.objects.select_for_update().get(pk=source.pk)
    primary, others = _checks(staff, source)
    target = primary_person(staff)
    if target is None:
        raise MemberError("The staff member's own membership has no one on it.")
    before = _money(source)

    # The staff login overwrites the customer one.
    login = MemberLogin.objects.filter(person=primary).delete()[0] > 0
    signed_out = revoke_all(primary)
    tokens = MemberEmailToken.objects.filter(person=primary).delete()[0]
    taken = _take_person_fields(target, primary)

    moved, left, on_person = Counter(), [], Counter()
    # The source person's rows (member codes, sales, returns, history) go to the staff person. Their (now revoked)
    # sessions stay with them as history; the login and emailed sign-ins are gone. Only the codes are counted here:
    # the sales, returns and history on the person are the source account's rows too, counted below.
    _move_rows(Person, primary, target, skip=(MemberLogin, MemberSession, MemberEmailToken), moved=on_person, left=left)
    if on_person[_label(Card)]:
        moved[_label(Card)] = on_person[_label(Card)]
    second = None
    if others:
        Person.objects.filter(pk__in=[p.pk for p in others]).update(account=staff)
        second = next((p for p in others if p.removed_at is None), None)
        moved['people'] += len(others)
    lines = _move_app_cart(source, staff)
    if lines:
        moved['app cart lines'] += lines
    _move_rows(Account, source, staff, skip=(Person, AppCart), moved=moved, left=left)

    source.status = Account.STATUS_REVOKED
    source.revoked_at = timezone.now()
    source.revoked_reason = f'{MERGED_REASON} {staff.pk}'[:200]
    source.revoked_by = actor
    source.save(update_fields=['status', 'revoked_at', 'revoked_reason', 'revoked_by', 'updated_at'])

    result = {
        'staff_account': staff.pk, 'source_account': source.pk, 'moved': dict(moved), 'took': taken,
        'second_adult': _name(second) if second else None, 'login_removed': login, 'signed_out': signed_out,
        'email_links_removed': tokens, 'left': left, 'source_had': before, 'now': _money(staff),
    }
    detail = {k: result[k] for k in ('moved', 'took', 'second_adult', 'login_removed', 'signed_out', 'left')}
    members.log('staff_merged_in', account=staff, person=target, actor=actor, source_account=source.pk, **detail)
    members.log('staff_merged_into', account=source, person=primary, actor=actor, staff_account=staff.pk, **detail)
    return result

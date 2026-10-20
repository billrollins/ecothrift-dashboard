"""
Members: names and old logins (owner 2026-10-16), the one-time cleanup behind the ``members.names_cleanup`` request.

"These should have no website accounts ... they should have a member account IF they have email verified, AND name."

1. **Old logins with no verified email go.** An old ecothrift.us customer login whose member never verified the email
   (``Person.email_verified_at`` is empty), and the pending membership the 10-16 merge made for it, are deleted
   the way Dash's Delete does (``delete_member.erase``: the login, its holds, orders and conversations). A membership
   that is active, or has any ThriftBucks or credit history, is never deleted here: only its names are fixed.
   Since T62 (2026-10-20) the old customer record is gone, so a login with no member at all is left alone (nothing says
   it was never verified).
2. **Every name follows the one rule** (``apps.accounts.services.names``): "Customer" is never a last name; a full name
   in the first-name box is split; a single name gets "Member"; all lower case or ALL CAPS is capitalized. A member's
   login carries the member's name (one account).

Safe to run again: a second run finds nothing to delete and no name to change.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q

from apps.accounts.services.names import clean_name
from apps.thriftplus.models import Account, LedgerEntry, Person


def _staff_q() -> Q:
    return (Q(is_superuser=True) | Q(is_staff=True)
            | Q(groups__name__in=('Admin', 'Manager', 'Employee', 'Consignee')))


def _old_logins():
    """Old ecothrift.us customer logins: in the Customer group, not a staff login."""
    User = get_user_model()
    staff = User.objects.filter(_staff_q()).values('pk')
    return User.objects.filter(groups__name__iexact='customer').exclude(pk__in=staff).distinct()


def _keeps(account: Account | None) -> bool:
    """A membership that is real: active (finished at a register), or with any ThriftBucks or credit history."""
    if account is None:
        return False
    return account.status == Account.STATUS_ACTIVE or LedgerEntry.objects.filter(account=account).exists()


def _unverified():
    """(login, its membership or None) for each old login with no verified email whose membership is not real."""
    out = []
    for user in _old_logins().filter(thrift_plus_person__isnull=False, thrift_plus_person__email_verified_at__isnull=True):
        person = Person.objects.select_related('account').filter(user=user).first()
        account = person.account if person else None
        if account is None or _keeps(account):
            continue
        if account is not None and account.people.exclude(user=user).exclude(user__isnull=True).exists():
            continue  # someone else's login is on that membership: leave it to Dash
        out.append((user, account))
    return out


def _name_changes():
    """[(what, before, after)] for every member and login whose name the rule changes. Members first; a member's
    login takes the member's name."""
    changes = []
    linked = set()
    for person in Person.objects.select_related('user').filter(removed_at__isnull=True).order_by('pk'):
        new = clean_name(person.first_name, person.last_name)
        if (person.first_name, person.last_name) != new:
            changes.append((person, f'{person.first_name} {person.last_name}'.strip(), f'{new[0]} {new[1]}'.strip()))
        if person.user_id:
            linked.add(person.user_id)
            user = person.user
            if (user.first_name, user.last_name) != new and not user.is_staff and not user.is_superuser:
                changes.append((user, f'{user.first_name} {user.last_name}'.strip(), f'{new[0]} {new[1]}'.strip()))
    for user in _old_logins().exclude(pk__in=linked):
        new = clean_name(user.first_name, user.last_name)
        if new[0] and (user.first_name, user.last_name) != new:
            changes.append((user, f'{user.first_name} {user.last_name}'.strip(), f'{new[0]} {new[1]}'.strip()))
    return changes


def plan() -> dict:
    """What the request would do, in counts and names. Changes nothing."""
    gone = _unverified()
    going_users = {u.pk for u, _a in gone}
    going_people = {p.pk for _u, a in gone if a is not None for p in a.people.all()}
    names = [(o, b, a) for o, b, a in _name_changes()
             if not ((isinstance(o, Person) and o.pk in going_people) or (not isinstance(o, Person) and o.pk in going_users))]
    return {
        'delete_logins': len(gone),
        'delete_memberships': sum(1 for _u, a in gone if a is not None),
        'delete_list': [f'{u.first_name} {u.last_name}'.strip() or u.email for u, _a in gone],
        'rename': len(names),
        'rename_list': [f"{'member' if isinstance(o, Person) else 'login'}: {b} -> {a}" for o, b, a in names],
    }


def apply(progress=None) -> dict:
    """Delete the unverified old logins (and their pending memberships), then fix every name by the rule."""
    from apps.thriftplus.services import delete_member

    deleted = 0
    for user, account in _unverified():
        with transaction.atomic():
            if account is not None:
                delete_member.erase(account, website=True)  # the membership, then the login and its website side
            if get_user_model().objects.filter(pk=user.pk).exists():
                user.delete()
        deleted += 1
        if progress is not None:
            progress.update(log=f'Deleted {user.email} (no verified email).')
    renamed = 0
    for obj, before, after in _name_changes():
        with transaction.atomic():
            if isinstance(obj, Person):
                obj.first_name, obj.last_name = clean_name(obj.first_name, obj.last_name)
                obj.save(update_fields=['first_name', 'last_name', 'updated_at'])
            else:
                person = Person.objects.filter(user=obj).first()
                first, last = ((person.first_name, person.last_name) if person
                               else clean_name(obj.first_name, obj.last_name))
                obj.first_name, obj.last_name = first, last
                obj.save(update_fields=['first_name', 'last_name', 'updated_at'])
        renamed += 1
        if progress is not None:
            progress.update(log=f'{before} -> {after}')
    return {'deleted_logins': deleted, 'renamed': renamed}

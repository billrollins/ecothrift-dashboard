"""
Accounts signals. Imported in ``AccountsConfig.ready``.

Owner 2026-10-15: every active staff user is also a website customer (``services/staff_customer.py``), made when the
staff login is made, switched on, or put in a staff group later. It runs after the commit, so a save that rolls back
makes nothing, and a failure here never fails the save (it is logged). Customers are left alone.
"""
from __future__ import annotations

import logging

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db import transaction
from django.db.models.signals import m2m_changed, post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)

User = get_user_model()

# A save of only these fields can't make someone staff (a sign-in writes last_login).
QUIET_FIELDS = {'last_login', 'password', 'username', 'language', 'phone', 'first_name', 'last_name', 'email',
                'updated_at'}


def _after_commit(user_ids: list[int]) -> None:
    def run() -> None:
        from apps.accounts.services.staff_customer import ensure_staff_customer

        for user in User.objects.filter(pk__in=user_ids, is_active=True):
            try:
                ensure_staff_customer(user)
            except Exception:  # noqa: BLE001 - a website customer account must never fail a Dash user save
                logger.exception('staff website customer account failed for user %s', user.pk)

    transaction.on_commit(run)


@receiver(post_save, sender=User, dispatch_uid='accounts_staff_customer_user_saved')
def staff_user_saved(sender, instance, created=False, update_fields=None, raw=False, **kwargs):
    if raw or not instance.is_active:
        return
    if update_fields is not None and set(update_fields) <= QUIET_FIELDS:
        return
    _after_commit([instance.pk])


@receiver(m2m_changed, sender=User.groups.through, dispatch_uid='accounts_staff_customer_groups')
def staff_groups_changed(sender, instance, action, reverse=False, pk_set=None, **kwargs):
    """Only when a staff group is added (adding the Customer group itself is the ensure's own write)."""
    if action != 'post_add' or not pk_set:
        return
    from apps.accounts.services.staff_customer import STAFF_GROUPS_RE

    if reverse:  # group.user_set.add(...): the instance is the group
        if Group.objects.filter(pk=instance.pk, name__iregex=STAFF_GROUPS_RE).exists():
            _after_commit(list(pk_set))
        return
    if Group.objects.filter(pk__in=pk_set, name__iregex=STAFF_GROUPS_RE).exists():
        _after_commit([instance.pk])

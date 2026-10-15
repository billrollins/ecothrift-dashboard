"""
Thrift+ signals. Imported in ``ThriftPlusConfig.ready``.

Owner 2026-10-15: every active staff member has their own Thrift+ membership, made when the staff login is made (or
put in a staff group later), and its email kept in step with the Dash email. It runs after the commit, so a save that
rolls back makes nothing, and a failure here never fails the save (it is logged). Customers never get one this way.
"""
from __future__ import annotations

import logging

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models.signals import m2m_changed, post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)

User = get_user_model()

# A save of only these fields can't make someone staff or change their email (a sign-in writes last_login).
QUIET_FIELDS = {'last_login', 'password', 'username', 'language', 'phone', 'updated_at'}


def _after_commit(user_ids: list[int]) -> None:
    def run() -> None:
        from apps.thriftplus.services.staff_members import ensure_staff_membership

        for user in User.objects.filter(pk__in=user_ids, is_active=True):
            try:
                ensure_staff_membership(user)
            except Exception:  # noqa: BLE001 - a staff membership must never fail a Dash user save
                logger.exception('thrift+ staff membership failed for user %s', user.pk)

    transaction.on_commit(run)


@receiver(post_save, sender=User, dispatch_uid='thriftplus_staff_membership_user_saved')
def staff_user_saved(sender, instance, created=False, update_fields=None, raw=False, **kwargs):
    if raw or not instance.is_active:
        return
    if update_fields is not None and set(update_fields) <= QUIET_FIELDS:
        return
    _after_commit([instance.pk])


@receiver(m2m_changed, sender=User.groups.through, dispatch_uid='thriftplus_staff_membership_groups')
def staff_groups_changed(sender, instance, action, reverse=False, pk_set=None, **kwargs):
    if action != 'post_add':
        return
    ids = list(pk_set or []) if reverse else [instance.pk]  # reverse: group.user_set.add(...)
    if ids:
        _after_commit(ids)

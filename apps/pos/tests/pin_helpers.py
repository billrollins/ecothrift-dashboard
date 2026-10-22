"""A manager with a register PIN, for tests that void, edit a price or give a big discount (2026-10-21)."""
from django.contrib.auth.models import Group
from django.core.cache import cache

from apps.accounts.models import User
from apps.accounts.services.register_pin import set_pin

PIN = '4826'


def manager_ok(email='pin-manager@example.com', pin=PIN, reason='Customer changed their mind'):
    """(manager, body fields): the fields a register sends with a manager's OK. Clears PIN lockouts first."""
    cache.clear()
    manager = User.objects.filter(email=email).first()
    if manager is None:
        manager = User.objects.create_user(email=email, first_name='Pat', last_name='Manager', password='test-pass-123')
        manager.groups.add(Group.objects.get_or_create(name='Manager')[0])
        set_pin(manager, pin)
    return manager, {'manager_pin': pin, 'override_reason': reason}

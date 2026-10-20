"""Idle sign-out for Dash logins (house standard D16, T69).

A staff login is signed out after ``staff`` hours with no activity (default 4). A register or the time kiosk may
keep a longer named setting (``register``, default 24) so a till left overnight is still signed in next morning.

* **Setting.** ``AppSetting`` key ``auth.idle_hours`` = ``{"staff": 4, "register": 24}``. A missing row or a bad
  value falls back to those defaults. Admin only to change (``AppSettingViewSet.ADMIN_ONLY``).
* **Activity.** ``User.last_active_at``. ``IdleStampJWTAuthentication`` stamps it on an authenticated request, at
  most once every five minutes (one cheap UPDATE); login and refresh stamp it too.
* **Enforcement.** ``refresh_view`` (the only way a Dash browser gets a new access token) refuses the refresh cookie
  when the last activity is older than the limit: ``401`` with ``code: IDLE``, cookie cleared, token blacklisted.
  Access tokens last 30 minutes, so a session cannot outlive the limit by more than that.
* **Which limit.** The browser says it is a register or the kiosk with the ``X-Device-Kind: register`` header on the
  refresh call (it reads this computer's saved POS device type). That header only picks the longer limit; it
  grants nothing the person did not already have.
* **Customers.** Only Dash logins (``is_staff_login``) are timed out. A customer's website session and the Thrift+
  member app (``tp_session``) are not touched. A user with no ``last_active_at`` yet (a session started before
  this shipped) is let in and stamped.
"""

from datetime import timedelta

from django.utils import timezone

SETTING_KEY = 'auth.idle_hours'
DEFAULT_STAFF_HOURS = 4
DEFAULT_REGISTER_HOURS = 24
STAMP_EVERY = timedelta(minutes=5)
DEVICE_HEADER = 'HTTP_X_DEVICE_KIND'
REGISTER_KIND = 'register'


def _hours(value, fallback: float) -> float:
    try:
        hours = float(value)
    except (TypeError, ValueError):
        return fallback
    return hours if hours > 0 else fallback


def idle_hours(device_kind: str | None = None) -> float:
    """Hours of no activity before sign-out: the register limit for a register or kiosk, else the staff limit."""
    from apps.core.models import AppSetting

    row = AppSetting.objects.filter(key=SETTING_KEY).first()
    value = row.value if row is not None and isinstance(row.value, dict) else {}
    staff = _hours(value.get('staff'), DEFAULT_STAFF_HOURS)
    if device_kind == REGISTER_KIND:
        # A register is never held to less than the staff limit.
        return max(staff, _hours(value.get('register'), DEFAULT_REGISTER_HOURS))
    return staff


def message(hours: float) -> str:
    shown = int(hours) if float(hours).is_integer() else hours
    return f'Signed out after {shown} {"hour" if shown == 1 else "hours"} idle.'


def is_idle(user, device_kind: str | None = None, now=None) -> bool:
    """True when this Dash login has been idle past its limit. Customers and never-stamped users are never idle."""
    from .staff_customer import is_staff_login

    last = getattr(user, 'last_active_at', None)
    if last is None or not is_staff_login(user):
        return False
    now = now or timezone.now()
    return now - last > timedelta(hours=idle_hours(device_kind))


def stamp(user, now=None, force: bool = False) -> None:
    """Record activity. Unless ``force``, skips the write when the last stamp is under five minutes old."""
    from django.contrib.auth import get_user_model

    now = now or timezone.now()
    last = getattr(user, 'last_active_at', None)
    if not force and last is not None and now - last < STAMP_EVERY:
        return
    get_user_model().objects.filter(pk=user.pk).update(last_active_at=now)
    user.last_active_at = now

"""The owner's Testing page (owner 2026-11-24): choose what HIS devices see on www.ecothrift.us, for 24 hours.

His words: "this has testing settings so i can see Dash or what ever app how i want ... Mobile: Legacy, NEW, Black
Friday (as a choose one) Desktop: NEW, Black Friday (as a choose one) if any legacy does not exist anymore then dont
include as option. THEN make all selections unselect and go to prod after 24 hours ... This help me know what I am
lookin at and not accidently get stuck on a version no one sees."

How it works:

- **The picks** live in AppSetting ``owner.site_testing``: ``{"mobile": "legacy|new|bf|", "desktop": "bf|", "until":
  ISO}``. Each save runs for ``HOURS`` (24); after ``until`` every pick reads as none ("Live"), by itself.
- **His devices** are linked once each: the Testing page gives a link (and its QR) that sets the signed cookie
  ``eco_test`` on that browser. Only a linked browser follows the picks; nobody else's visit reads the setting at all.
- **What a pick does** (``apps/core/middleware.py``): a phone's pick is the Mobile one, a computer's the Desktop one.
  ``legacy``: the old site and old scanner. ``new``: the phone site and its scanner. ``bf``: the site customers get
  (the live switches decide phone site and scanner) with Black Friday showing for this request only
  (``black_friday.forced``), so the shared store list and every other visitor are untouched.
- **A badge** on every page of a linked device while a pick is on says what it is looking at and when it ends
  (``badge_html``); it floats over the page and moves nothing.

An option that no longer exists is not offered: ``PICKS`` is the one list (drop ``legacy`` there when the old phone
site and old scanner are removed; add a Desktop ``new`` when the desktop layout exists). Each ``Pick`` says what it
serves, so adding one is one line here plus, for a new kind of site, the place that serves it.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import datetime, timedelta

from django.utils import timezone

KEY = 'owner.site_testing'
COOKIE = 'eco_test'
HOURS = 24
LINK_SALT = 'owner.site-testing.link'
DEVICE_SALT = 'owner.site-testing.device'
LINK_SECONDS = 3600                 # the link on the Testing page opens for an hour
DEVICE_SECONDS = 400 * 24 * 3600    # a linked device stays linked (it shows Live unless a pick is on)
CACHE_SECONDS = 10

@dataclass(frozen=True)
class Pick:
    """One version the owner can pick, and what a linked device is then served.

    ``site``: ``'live'`` (the switches decide, as for customers) | ``'classic'`` (the old site) | ``'phone'`` (the
    phone site). ``scanner``: ``'live'`` | ``'old'`` | ``'phone'``. ``black_friday``: Black Friday shows for the request.
    A new kind of site (the new desktop layout) adds its own ``site`` word here and serves it where the middleware
    chooses a page (``PublicSiteMiddleware._wants_phone`` reads ``request.eco_test``)."""

    key: str
    label: str
    what: str
    site: str = 'live'
    scanner: str = 'live'
    black_friday: bool = False


# THE list. To add, change or retire a version, edit only this: the Testing tab, the API, the badge and the routing all
# read it. A version that no longer exists is taken out here (owner: "if any legacy does not exist anymore then dont
# include as option"). Desktop has no New yet: the desktop layout (#211) adds ``Pick('new', 'New', ..., site='desktop')``
# and its Black Friday edition when they exist. Live (no pick) is always offered by the tab itself.
PICKS: dict[str, tuple[Pick, ...]] = {
    'mobile': (
        Pick('legacy', 'Legacy', 'The old site and the old scanner.', site='classic', scanner='old'),
        Pick('new', 'New', 'The new phone site and its scanner.', site='phone', scanner='phone'),
        Pick('bf', 'Black Friday', 'The Black Friday page and Black Friday scanner prices.', black_friday=True),
    ),
    'desktop': (
        Pick('bf', 'Black Friday', 'The desktop site with the Black Friday page.', black_friday=True),
    ),
}

_cache: tuple[dict, float] | None = None


def options() -> dict:
    """The versions that exist today, per device, for the Testing tab."""
    return {device: [{'key': p.key, 'label': p.label, 'what': p.what} for p in picks] for device, picks in PICKS.items()}


def find(device: str, key: str) -> Pick | None:
    return next((p for p in PICKS.get(device, ()) if p.key == key), None)


def _keys(device: str) -> set[str]:
    return {p.key for p in PICKS.get(device, ())}


def _read() -> dict:
    try:
        from apps.core.models import AppSetting

        raw = AppSetting.objects.filter(key=KEY).values_list('value', flat=True).first()
    except Exception:
        return {}
    return raw if isinstance(raw, dict) else {}


def state(now: datetime | None = None, *, fresh: bool = False) -> dict:
    """``{mobile, desktop, until}``: the picks that are on now ('' = Live), read at most every 10 seconds per worker.
    Past ``until`` (or a pick that is no longer an option) reads as none."""
    global _cache
    tick = time.monotonic()
    if not fresh and _cache is not None and tick < _cache[1]:
        raw = _cache[0]
    else:
        raw = _read()
        _cache = (raw, tick + CACHE_SECONDS)
    out = {'mobile': '', 'desktop': '', 'until': None}
    try:
        until = datetime.fromisoformat(str(raw.get('until') or ''))
    except ValueError:
        return out
    if timezone.is_naive(until):
        until = timezone.make_aware(until, timezone.get_current_timezone())
    if (now or timezone.now()) >= until:
        return out
    for device in ('mobile', 'desktop'):
        pick = str(raw.get(device) or '')
        out[device] = pick if pick in _keys(device) else ''
    if out['mobile'] or out['desktop']:
        out['until'] = until.isoformat()
    return out


def save(mobile: str, desktop: str, *, user=None) -> dict:
    """Set the picks ('' = Live). Any pick runs for 24 hours from now; no pick at all ends testing."""
    global _cache
    from apps.core.models import AppSetting

    mobile = mobile if mobile in _keys('mobile') else ''
    desktop = desktop if desktop in _keys('desktop') else ''
    until = timezone.now() + timedelta(hours=HOURS) if (mobile or desktop) else None
    AppSetting.objects.update_or_create(key=KEY, defaults={
        'value': {'mobile': mobile, 'desktop': desktop, 'until': until.isoformat() if until else ''},
        'description': "The owner's Testing page: what his linked devices see on the website, until `until` (24 hours).",
        'updated_by': user if getattr(user, 'pk', None) else None,
    })
    _cache = None
    return state(fresh=True)


def end(*, user=None) -> dict:
    return save('', '', user=user)


# ── Linking a device ───────────────────────────────────────────────────────────

def link_token() -> str:
    from django.core import signing

    return signing.TimestampSigner(salt=LINK_SALT).sign('link')


def link_ok(token: str) -> bool:
    from django.core import signing

    try:
        return signing.TimestampSigner(salt=LINK_SALT).unsign(token or '', max_age=LINK_SECONDS) == 'link'
    except signing.BadSignature:
        return False


def device_value() -> str:
    from django.core import signing

    return signing.TimestampSigner(salt=DEVICE_SALT).sign('device')


def is_linked(request) -> bool:
    """This browser is one of the owner's test devices (a signed cookie; a made-up one is nothing)."""
    value = request.COOKIES.get(COOKIE) or ''
    if not value:
        return False
    from django.core import signing

    try:
        return signing.TimestampSigner(salt=DEVICE_SALT).unsign(value, max_age=DEVICE_SECONDS) == 'device'
    except signing.BadSignature:
        return False


def pick_for(request, *, phone: bool) -> Pick | None:
    """The pick this request follows: None (Live) for everyone but a linked device with a pick on for its kind."""
    if not is_linked(request):
        return None
    device = 'mobile' if phone else 'desktop'
    return find(device, state()[device])


def badge_html(pick: Pick | None, until_iso: str | None, *, phone: bool) -> str:
    """The floating badge for a linked device while a pick is on. Fixed over the page: it moves nothing and takes no
    taps (``pointer-events: none``)."""
    if not pick:
        return ''
    ends = ''
    if until_iso:
        try:
            when = timezone.localtime(datetime.fromisoformat(until_iso))
            hour = when.strftime('%I:%M %p').lstrip('0')
            ends = f' &middot; ends {when.strftime("%a")} {hour}'
        except ValueError:
            pass
    spot = 'left:8px;bottom:calc(66px + env(safe-area-inset-bottom,0px));' if phone else 'left:12px;bottom:12px;'
    return (
        f'<div id="eco-test-badge" style="position:fixed;{spot}z-index:2147483000;pointer-events:none;'
        'background:#111;color:#fff;font:700 12px/1.2 system-ui,sans-serif;padding:6px 10px;border-radius:999px;'
        'box-shadow:0 2px 8px rgba(0,0,0,.35);opacity:.92;letter-spacing:.02em;">'
        f'TEST &middot; {pick.label}{ends}</div>'
    )

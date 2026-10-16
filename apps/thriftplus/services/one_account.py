"""
One customer account (owner 2026-10-16: "customer holds AND thrift+ need to be the SAME account SAME login SAME
everything ... the only passwords are for staff"; and 10-10: "a Thrift+ member is the customer account").

- **One record.** A Thrift+ ``Person`` is the customer. Their ecothrift.us login (holds, messages, orders) is the
  Django ``User`` in ``Person.user``. ``link_user`` finds or makes it from the person's email; ``person_for_user``
  goes the other way and, for a website customer with no membership, makes a pending one ("finish at a register",
  J8), as a join from the phone does.
- **One sign-in.** An emailed link or code, from the app (``tp_session``) or the website (the ``refresh_token``
  cookie), signs in to both: ``add_website_session`` and ``add_member_session`` set the other cookie. Signing out of
  either signs out of both. Both cookies live on ecothrift.us (the app is served there too).
- **No customer passwords.** Website password sign-in is for staff logins only; a staff login is never signed in by
  an emailed link and never gets a website session from the app.
- **Merge everything that exists** (``plan`` / ``apply``, the ``thriftplus.one_account`` request): link every
  person and customer login by email, make a pending membership for each website-only customer, and remove every
  customer password (website and the retired app logins).
"""
from __future__ import annotations

import logging

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Case, IntegerField, Q, Value, When
from django.utils import timezone

from apps.thriftplus.models import Account, MemberLogin, MemberResetToken, MemberSession, Person

logger = logging.getLogger(__name__)

OFF_TEXT = 'This account is switched off. Ask at the store.'
WEBSITE_NOTE = 'Made from an ecothrift.us account (one account, 2026-10-16).'
PASSWORDS_GONE = 'Passwords are gone. Sign in with an emailed link or code.'


def _staff_login(user) -> bool:
    from apps.accounts.services.staff_customer import is_staff_login

    return is_staff_login(user)


def _clean(email: str | None) -> str:
    return (email or '').strip().lower()


# ── The link ───────────────────────────────────────────────────────────────────

def link_user(person: Person, *, make: bool = True):
    """The person's website login, linked (made when ``make`` and there is none). None when there is no email, or
    the email is a staff login that isn't this membership's staff member, or the login is someone else's already."""
    if person.user_id:
        return person.user
    account = person.account
    if account.staff_user_id and person.role == Person.ROLE_PRIMARY:
        user = account.staff_user
    else:
        email = _clean(person.email)
        if not email:
            return None
        user = get_user_model().objects.filter(email__iexact=email).first()
        if user is not None and _staff_login(user) and user.pk != account.staff_user_id:
            return None
        if user is None:
            if not make:
                return None
            from apps.accounts.services.magic_link import _get_or_create_customer

            user = _get_or_create_customer(email, first_name=person.first_name, last_name=person.last_name)
    if Person.objects.filter(user=user).exclude(pk=person.pk).exists():
        return None
    person.user = user
    person.save(update_fields=['user', 'updated_at'])
    return user


def _by_email(email: str) -> Person | None:
    """The unlinked person with this email: an active membership first, then pending, then switched off; the primary
    person first."""
    if not email:
        return None
    rank = Case(When(account__status=Account.STATUS_ACTIVE, then=Value(0)),
                When(account__status=Account.STATUS_PENDING, then=Value(1)), default=Value(2),
                output_field=IntegerField())
    return (Person.objects.select_related('account')
            .filter(email=email, removed_at__isnull=True, user__isnull=True)
            .annotate(rank=rank).order_by('rank', 'role', 'pk').first())


def person_for_user(user, *, make: bool = True) -> Person | None:
    """The Thrift+ person for a website customer login (linked, or found by email and linked, or made pending when
    ``make``). None for a staff login (staff use their staff membership) or a login with no email."""
    if user is None or not getattr(user, 'pk', None) or _staff_login(user):
        return None
    found = Person.objects.select_related('account').filter(user=user).first()
    if found is not None:
        return found
    email = _clean(user.email)
    person = _by_email(email)
    if person is not None:
        person.user = user
        person.save(update_fields=['user', 'updated_at'])
        return person
    if not make or not email:
        return None
    from apps.thriftplus.services import members

    with transaction.atomic():
        account = Account.objects.create(status=Account.STATUS_PENDING, notes=WEBSITE_NOTE)
        person = Person.objects.create(account=account, role=Person.ROLE_PRIMARY, first_name=(user.first_name or '')[:80],
                                       last_name=(user.last_name or '')[:80], email=email, user=user)
        if getattr(getattr(user, 'customer', None), 'email_verified_at', None):
            person.email_verified_at = user.customer.email_verified_at
            person.save(update_fields=['email_verified_at', 'updated_at'])
        members.log('joined_website', account=account, person=person)
        members.new_member_code(person)
    return person


def switched_off(user) -> bool:
    """A customer whose membership is deactivated or revoked: no website sign-in either (one account)."""
    person = person_for_user(user, make=False)
    return person is not None and (person.removed_at is not None
                                   or person.account.status in (Account.STATUS_INACTIVE, Account.STATUS_REVOKED))


# ── One sign-in, one sign-out ──────────────────────────────────────────────────

def add_website_session(response, person: Person):
    """After an app sign-in (emailed link or code): sign the person in to ecothrift.us too. Never for a staff login."""
    from rest_framework_simplejwt.tokens import RefreshToken

    from apps.accounts.views import _set_refresh_cookie

    try:
        user = link_user(person)
    except Exception:  # never fail the app sign-in over the website half
        logger.exception('one account: no website login for person %s', person.pk)
        return response
    if user is None or not user.is_active or _staff_login(user):
        return response
    profile = getattr(user, 'customer', None)
    if profile is not None and profile.email_verified_at is None and person.email_verified_at:
        profile.email_verified_at = person.email_verified_at
        profile.save(update_fields=['email_verified_at'])
    return _set_refresh_cookie(response, str(RefreshToken.for_user(user)))


def add_member_session(request, response, user):
    """After a website sign-in by emailed link: sign the customer in to the Thrift+ app too (made pending when they
    had no membership). Never for a staff login."""
    from apps.thriftplus.services import member_auth, members

    try:
        person = person_for_user(user)
    except Exception:
        logger.exception('one account: no membership for user %s', getattr(user, 'pk', None))
        return response
    if person is None or not member_auth._can_sign_in(person):
        return response
    if not (members.is_enabled() or members.is_tester(person.account)):
        return response
    token, session = member_auth.start_session(person, MemberSession.KIND_EMAIL,
                                               user_agent=request.META.get('HTTP_USER_AGENT', '')[:200])
    return member_auth.set_cookie(response, token, session)


def end_website_session(request, response):
    from rest_framework_simplejwt.tokens import RefreshToken

    from apps.accounts.views import REFRESH_COOKIE_NAME, _clear_refresh_cookie

    raw = request.COOKIES.get(REFRESH_COOKIE_NAME)
    if raw:
        try:
            RefreshToken(raw).blacklist()
        except Exception:
            pass
        _clear_refresh_cookie(response)
    return response


def end_member_session(request, response):
    from apps.thriftplus.services import member_auth

    session = member_auth.session_for(request.COOKIES.get(member_auth.COOKIE))
    if session is not None:
        MemberSession.objects.filter(pk=session.pk).update(revoked_at=timezone.now())
        member_auth.clear_cookie(response)
    return response


# ── Merge what exists, and remove customer passwords (the one-account request) ─────

def _customer_users():
    """Website logins that aren't staff logins (no superuser, staff flag or staff/consignee group)."""
    staff = Q(is_superuser=True) | Q(is_staff=True) | Q(groups__name__in=('Admin', 'Manager', 'Employee', 'Consignee'))
    return get_user_model().objects.exclude(pk__in=get_user_model().objects.filter(staff).values('pk'))


def plan() -> dict:
    users = _customer_users()
    unlinked = users.filter(thrift_plus_person__isnull=True)
    with_member = [u for u in unlinked if _by_email(_clean(u.email)) is not None]
    people = Person.objects.filter(user__isnull=True, removed_at__isnull=True).exclude(email='')
    return {
        'customer_logins': users.count(),
        'link_existing': len(with_member),
        'make_memberships': unlinked.count() - len(with_member),
        'people_without_login': people.count(),
        'staff_people': Person.objects.filter(user__isnull=True, role=Person.ROLE_PRIMARY,
                                              account__staff_user__isnull=False).count(),
        'customer_passwords': sum(1 for u in users.only('password') if u.has_usable_password()),
        'app_passwords': MemberLogin.objects.count(),
    }


def apply(progress=None) -> dict:
    """Idempotent: safe to run again."""
    counts = {'linked': 0, 'made': 0, 'logins_made': 0, 'staff_linked': 0, 'passwords_removed': 0, 'app_passwords_removed': 0}

    def note(text):
        if progress is not None:
            progress.update(log=text)

    for login in MemberLogin.objects.select_related('person'):  # keep the address the retired login used
        if not login.person.email:
            login.person.email = login.email
            login.person.save(update_fields=['email', 'updated_at'])
    for user in _customer_users().filter(thrift_plus_person__isnull=True).iterator():
        had = _by_email(_clean(user.email)) is not None
        if person_for_user(user) is not None:
            counts['linked' if had else 'made'] += 1
    note(f"Linked {counts['linked']} customer logins; made {counts['made']} pending memberships.")
    for person in Person.objects.select_related('account').filter(user__isnull=True, removed_at__isnull=True).exclude(email=''):
        staff = bool(person.account.staff_user_id and person.role == Person.ROLE_PRIMARY)
        if link_user(person) is not None:
            counts['staff_linked' if staff else 'logins_made'] += 1
    for person in Person.objects.select_related('account').filter(user__isnull=True, role=Person.ROLE_PRIMARY,
                                                                  account__staff_user__isnull=False):
        if link_user(person) is not None:
            counts['staff_linked'] += 1
    note(f"Made {counts['logins_made']} website logins; linked {counts['staff_linked']} staff members.")
    for user in _customer_users().iterator():
        if user.has_usable_password():
            user.set_unusable_password()
            user.save(update_fields=['password'])
            counts['passwords_removed'] += 1
    counts['app_passwords_removed'] = MemberLogin.objects.count()
    MemberResetToken.objects.all().delete()
    MemberLogin.objects.all().delete()
    note(f"Removed {counts['passwords_removed']} website and {counts['app_passwords_removed']} app customer passwords.")
    return counts

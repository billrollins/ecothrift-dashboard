"""View as (owner 2026-10-21, C5): the owner sees Dash exactly as one employee sees it, without signing out.

A superuser starts it (``POST /api/auth/view-as/start/``). The server keeps a ``ViewAsSession`` row and hands back an
access token that carries its id (claim ``view_as``); refreshing with the same sign-in keeps handing out such tokens
until it ends. Every request with that token runs as the employee (``request.user``) and still knows the owner
(``request.real_user``). ``ViewAsMiddleware`` refuses every write with a 403 and rolls back anything a read writes.

It ends on Back (``view-as/stop/``), on sign-out, and after two hours. Each start and stop is an ``AccountEvent`` on the
employee with the owner as actor. Nobody views as a superuser, as themself, or as a switched-off or customer login.
"""
from __future__ import annotations

from datetime import timedelta

from django.utils import timezone

from ..models import AccountEvent, User, ViewAsSession

CLAIM = 'view_as'
LIMIT = timedelta(hours=2)

ENDED_BACK = 'back'
ENDED_SIGN_OUT = 'sign_out'
ENDED_EXPIRED = 'expired'
ENDED_REPLACED = 'replaced'

# Writes that still work while viewing: Back, sign-out, and the cookie refresh.
WRITE_PATHS = ('/api/auth/view-as/stop/', '/api/auth/logout/', '/api/auth/refresh/')

# Searches sent as POST (the name or phone stays out of the address): reads, so they run, inside the rollback.
READ_POSTS = ('/api/thriftplus/register/find/', '/api/thriftplus/register/pending/', '/api/thriftplus/returns/find/')


class ViewAsError(Exception):
    def __init__(self, detail: str, code: str):
        super().__init__(detail)
        self.detail = detail
        self.code = code


def short_name(user) -> str:
    """"Maria K": first name and last initial (the banner)."""
    first = (user.first_name or '').strip()
    last = (user.last_name or '').strip()
    if not first:
        return user.username or user.email or f'#{user.pk}'
    return f'{first} {last[:1]}'.strip()


def job_label(user) -> str:
    profile = getattr(user, 'employee', None)
    return (getattr(profile, 'position', '') or '').strip() or (user.role or 'Staff')


def refusal(target) -> str | None:
    """Why this login cannot be viewed as, or None."""
    from .staff_customer import is_staff_login

    if target.is_superuser:
        return 'You cannot view Dash as another owner.'
    if not target.is_active:
        return 'This login is switched off.'
    if not is_staff_login(target):
        return 'Only staff logins can be viewed as.'
    return None


def start(real_user, target, *, refresh_jti: str = '') -> ViewAsSession:
    if not real_user.is_superuser:
        raise ViewAsError('Only the owner can view as someone.', 'NOT_OWNER')
    if target.pk == real_user.pk:
        raise ViewAsError('That is you.', 'SELF')
    why = refusal(target)
    if why:
        raise ViewAsError(why, 'NOT_ALLOWED')
    for old in live_sessions(real_user):
        end(old, ENDED_REPLACED)
    now = timezone.now()
    session = ViewAsSession.objects.create(
        real_user=real_user, target=target, expires_at=now + LIMIT, refresh_jti=refresh_jti or '',
    )
    AccountEvent.log(target, AccountEvent.KIND_VIEW_AS_START, actor=real_user,
                     detail=f'{short_name(real_user)} started viewing Dash as this person (read only)')
    return session


def end(session: ViewAsSession, why: str) -> bool:
    """End it once; logs the stop. Answers False when it had already ended."""
    if session.ended_at is not None:
        return False
    updated = ViewAsSession.objects.filter(pk=session.pk, ended_at__isnull=True).update(
        ended_at=timezone.now(), ended_why=why,
    )
    if not updated:
        return False
    session.ended_at = timezone.now()
    session.ended_why = why
    words = {ENDED_BACK: 'Back', ENDED_SIGN_OUT: 'sign-out', ENDED_EXPIRED: 'the 2-hour limit',
             ENDED_REPLACED: 'viewing as someone else'}.get(why, why)
    AccountEvent.log(session.target, AccountEvent.KIND_VIEW_AS_STOP, actor=session.real_user,
                     detail=f'{short_name(session.real_user)} stopped viewing as this person ({words})')
    return True


def live_sessions(real_user):
    return ViewAsSession.objects.filter(real_user=real_user, ended_at__isnull=True)


def end_all(real_user, why: str = ENDED_SIGN_OUT) -> int:
    return sum(1 for session in live_sessions(real_user).select_related('target', 'real_user') if end(session, why))


def is_live(session: ViewAsSession) -> bool:
    """Still on: not ended, not past two hours, and the owner and the employee still qualify. Ends it if not."""
    if session.ended_at is not None:
        return False
    if session.expires_at <= timezone.now():
        end(session, ENDED_EXPIRED)
        return False
    if not (session.real_user.is_active and session.real_user.is_superuser) or refusal(session.target):
        end(session, ENDED_EXPIRED)
        return False
    return True


def session_for_claim(session_id, real_user_id) -> ViewAsSession | None:
    """The session an access token names, if it belongs to that token's owner. Not checked for liveness."""
    try:
        session_id = int(session_id)
    except (TypeError, ValueError):
        return None
    return (ViewAsSession.objects.select_related('real_user', 'target', 'target__employee')
            .filter(pk=session_id, real_user_id=real_user_id).first())


def session_for_refresh(user, refresh) -> ViewAsSession | None:
    """The live session started from this sign-in (refresh token), so a refresh keeps viewing as."""
    jti = refresh.get('jti') if refresh is not None else None
    if not jti or not getattr(user, 'is_superuser', False):
        return None
    session = (ViewAsSession.objects.select_related('real_user', 'target', 'target__employee')
               .filter(real_user=user, refresh_jti=jti, ended_at__isnull=True).first())
    return session if session is not None and is_live(session) else None


def access_token(refresh, session: ViewAsSession | None) -> str:
    """An access token from this refresh token, carrying the view-as claim when a session is live."""
    access = refresh.access_token
    if session is not None:
        access[CLAIM] = session.pk
        # Never outlive the view: the token expires when the two hours do.
        if session.expires_at.timestamp() < float(access['exp']):
            access['exp'] = int(session.expires_at.timestamp())
    return str(access)


def payload(session: ViewAsSession) -> dict:
    """What the banner shows (``/api/auth/me/`` → ``view_as``)."""
    target = session.target
    return {
        'session': session.pk,
        'target': {'id': target.pk, 'name': short_name(target), 'full_name': target.full_name.strip(),
                   'job': job_label(target)},
        'real_user': {'id': session.real_user.pk, 'name': short_name(session.real_user),
                      'full_name': session.real_user.full_name.strip()},
        'started_at': session.started_at.isoformat(),
        'expires_at': session.expires_at.isoformat(),
    }


def read_only_detail(session: ViewAsSession) -> str:
    return f'Viewing as {short_name(session.target)}: read only'


def real_user(request):
    """The person signed in, even while viewing as someone else (audit)."""
    return getattr(request, 'real_user', None) or request.user


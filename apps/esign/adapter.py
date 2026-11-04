"""The seam between this app and the host dashboard.

``apps.esign`` imports nothing from any other app of the host. Everything the host owns comes through ONE object:

    ESIGN_HOST_ADAPTER = 'dotted.path.to.AdapterClassOrInstance'     (settings; optional)

A host subclasses :class:`HostAdapter` and overrides what differs. With no setting, :class:`HostAdapter` itself is
used: Django's own mail and default storage, the Django superuser as the owner, plain branding. That keeps the app
runnable alone and is what the package's own tests use.

Other settings (all optional): ``ESIGN_LINK_DAYS`` (14), ``ESIGN_NOTICE_DAYS`` (14), ``ESIGN_PURGE_DAYS`` (90),
``ESIGN_SIGN_PATH`` ('/sign'), ``ESIGN_PUBLIC_BASE_URL`` (used by the default adapter).
"""
from __future__ import annotations

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.utils.module_loading import import_string

Attachment = tuple[str, bytes, str]  # (file name, content, mime type)


class HostAdapter:
    """Defaults. Override in the host (darkhorse-dashboard: ``apps/core/esign_host.py``)."""

    # -- Who may do what ------------------------------------------------------
    def is_owner(self, user) -> bool:
        """May this signed-in user make templates, send, void, see every document and private uploads?"""
        return bool(user and getattr(user, 'is_authenticated', False) and getattr(user, 'is_superuser', False))

    def owner_emails(self) -> list[str]:
        """Who is told when a document is fully signed. Empty means nobody extra is emailed."""
        return []

    def user_party(self, user_id) -> dict | None:
        """A host user as a party: {'name', 'email', 'title'}; None when there is no such (active) user."""
        from django.contrib.auth import get_user_model

        user = get_user_model().objects.filter(pk=user_id, is_active=True).first()
        if user is None:
            return None
        name = (user.get_full_name() if hasattr(user, 'get_full_name') else '') or getattr(user, 'username', '')
        return {'name': name, 'email': getattr(user, 'email', '') or '', 'title': ''}

    def everyone(self) -> list[dict]:
        """The people a document can go to all at once ("Send to everyone"): [{'user_id', 'name', 'email', 'title'}].
        Each can sign while signed in. The default is every active user."""
        from django.contrib.auth import get_user_model

        out = []
        for user in get_user_model().objects.filter(is_active=True).order_by('pk'):
            found = self.user_party(user.pk)
            if found:
                out.append({'user_id': user.pk, **found})
        return out

    # -- Mail -----------------------------------------------------------------
    def send_mail(self, *, to: list[str], subject: str, body: str, attachments: list[Attachment] | None = None) -> bool:
        """Send a plain-text email. Never raises; True when it went out."""
        from django.core.mail import EmailMessage

        try:
            message = EmailMessage(subject=subject, body=body, to=to)
            for name, content, mime in attachments or ():
                message.attach(name, content, mime)
            return bool(message.send(fail_silently=True))
        except Exception:
            return False

    # -- Storage (private files: the final PDF, a W-9) --------------------------
    def storage_save(self, key: str, data: bytes, content_type: str = 'application/octet-stream') -> str:
        """Save private bytes; return the key to read them back with."""
        return default_storage.save(key, ContentFile(data))

    def storage_read(self, key: str) -> bytes:
        with default_storage.open(key, 'rb') as handle:
            return handle.read()

    def storage_delete(self, key: str) -> None:
        """Remove a stored file for good (a purge). Never raises for a file that is already gone."""
        if key and default_storage.exists(key):
            default_storage.delete(key)

    # -- Look -------------------------------------------------------------------
    def branding(self) -> dict:
        """company_name, logo_png (bytes or None), support_email."""
        return {'company_name': 'Our company', 'logo_png': None, 'support_email': ''}

    def kinds(self) -> list[dict]:
        """The kinds of document the host files: [{'key', 'label'}]."""
        return [{'key': 'agreement', 'label': 'Agreement'}]

    def public_base_url(self) -> str:
        """Where signers open links, no trailing slash, e.g. https://dash.example.com"""
        return str(getattr(settings, 'ESIGN_PUBLIC_BASE_URL', '')).rstrip('/')

    def in_app_sign_path(self, party_id: int) -> str:
        """Where a signed-in party signs inside the host ('' when the host has no such page)."""
        return ''

    # -- Request details ----------------------------------------------------------
    def client_ip(self, request) -> str | None:
        return request.META.get('REMOTE_ADDR') or None

    # -- What a document attaches to (optional) -------------------------------------
    def attachment_label(self, attached_type: str, attached_id: str) -> str:
        """A readable name for the host record a document is attached to ('' when unknown)."""
        return ''

    def attach_for_user(self, user_id) -> tuple[str, str]:
        """What a document sent to this user is filed on (attached_type, attached_id); ('', '') for nothing."""
        return '', ''


_adapter: HostAdapter | None = None


def get() -> HostAdapter:
    global _adapter
    if _adapter is None:
        path = getattr(settings, 'ESIGN_HOST_ADAPTER', '')
        loaded = import_string(path) if path else HostAdapter
        _adapter = loaded() if isinstance(loaded, type) else loaded
    return _adapter


def reset() -> None:
    """Tests: forget the loaded adapter."""
    global _adapter
    _adapter = None

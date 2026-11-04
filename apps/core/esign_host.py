"""Eco-Thrift's side of the shared e-sign app (``apps.esign``, from ``{master}/packages/esign``; house standard D22).

The only place that ties ``apps.esign`` to this dashboard: who the owner is, who a signer is, the store's mailbox,
private storage, branding and the records a document is filed on. ``apps.esign`` imports nothing from here; it
calls this through ``ESIGN_HOST_ADAPTER``.

Two uses here (Dash Updates #21, #62):
- contractor agreements (kind ``contractor``): owner-only, signed by link, no Dash account, kept off the staff side;
- HR documents (every other kind): sent to staff, who sign them in HR > Requests while signed in.
"""
from __future__ import annotations

from django.conf import settings
from django.utils import timezone

from apps.esign.adapter import HostAdapter

CONTRACTOR_KIND = 'contractor'
KINDS = [
    {'key': CONTRACTOR_KIND, 'label': 'Contractor agreement'},
    {'key': 'handbook', 'label': 'Handbook acknowledgment'},
    {'key': 'policy', 'label': 'Policy acknowledgment'},
    {'key': 'onboarding', 'label': 'Onboarding'},
    {'key': 'agreement', 'label': 'Agreement'},
    {'key': 'other', 'label': 'Other'},
]


def _staff():
    """Logins that work here now: active, with an employee record that has not ended."""
    from apps.accounts.models import User

    today = timezone.localdate()
    return (User.objects.select_related('employee').filter(is_active=True, employee__isnull=False)
            .exclude(employee__termination_date__lte=today))


class EcoThriftHost(HostAdapter):
    def is_owner(self, user) -> bool:
        # The owner is the Django superuser (Super Admin). Admins and Managers are refused: contractor agreements
        # and W-9s are the owner's alone.
        return bool(user and getattr(user, 'is_authenticated', False) and getattr(user, 'is_superuser', False))

    def owner_emails(self) -> list[str]:
        from apps.accounts.models import User

        return list(User.objects.filter(is_superuser=True, is_active=True).exclude(email='')
                    .order_by('pk').values_list('email', flat=True))

    def user_party(self, user_id) -> dict | None:
        from apps.accounts.models import User

        user = User.objects.select_related('employee').filter(pk=user_id, is_active=True).first()
        if user is None:
            return None
        employee = getattr(user, 'employee', None)
        title = 'Owner' if user.is_superuser else (employee.position if employee else '')
        return {'name': f'{user.first_name} {user.last_name}'.strip() or user.email, 'email': user.email or '',
                'title': title or ''}

    def everyone(self) -> list[dict]:
        """Staff who can sign in to Dash and still work here, by name. Contractors have no login, so never appear."""
        out = []
        for user in _staff().order_by('first_name', 'last_name'):
            found = self.user_party(user.pk)
            if found:
                out.append({'user_id': user.pk, **found})
        return out

    def send_mail(self, *, to, subject, body, attachments=None) -> bool:
        from apps.hiring import emails  # the store's own mailbox (Graph), falling back to Django mail; never raises

        return bool(emails.send(to=list(to), subject=subject, body=body, attachments=attachments))

    def storage_save(self, key, data, content_type='application/octet-stream') -> str:
        # Private storage, under documents/ like apps.documents' files (D12: the environment's folder is the bucket's).
        return super().storage_save(f'documents/esign/{key}', data, content_type)

    def branding(self) -> dict:
        return {'company_name': 'Eco-Thrift', 'logo_png': None, 'support_email': settings.ONLINE_SALES_EMAIL_REPLY_TO}

    def kinds(self) -> list[dict]:
        return KINDS

    def public_base_url(self) -> str:
        configured = str(getattr(settings, 'ESIGN_PUBLIC_BASE_URL', '') or '').rstrip('/')
        return configured or f'https://{settings.STAFF_DASHBOARD_HOST}'

    def in_app_sign_path(self, party_id: int) -> str:
        return f'/hr/sign/{party_id}'

    def client_ip(self, request):
        # Heroku's router adds the visitor's address last; anything before it came from the visitor.
        forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
        return (forwarded.split(',')[-1].strip() if forwarded else request.META.get('REMOTE_ADDR', '')) or None

    def attachment_label(self, attached_type: str, attached_id: str) -> str:
        if attached_type == 'user' and str(attached_id).isdigit():
            found = self.user_party(int(attached_id))
            return found['name'] if found else ''
        return ''

    def attach_for_user(self, user_id) -> tuple[str, str]:
        return ('user', str(user_id)) if self.user_party(user_id) else ('', '')

"""Test host adapter + builders. Made-up names only (nothing real goes in tests or fixtures)."""
from __future__ import annotations

import base64
import random
from io import BytesIO

from django.contrib.auth import get_user_model
from PIL import Image

from apps.esign import adapter, services
from apps.esign.adapter import HostAdapter

LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}
OWNER_USERNAMES = {'olive-owner'}
HANDLES: dict = {}  # user pk -> the handle a test gave it (hosts' user models differ)


class TestHost(HostAdapter):
    """Records mail, keeps files in memory, 'Acme Test Co'. The owner is whoever's test handle is in OWNER_USERNAMES."""
    mails: list = []
    files: dict = {}

    def is_owner(self, user):
        return bool(user and getattr(user, 'is_authenticated', False) and HANDLES.get(getattr(user, 'pk', None)) in OWNER_USERNAMES)

    def owner_emails(self):
        return ['owner@example.test']

    def user_party(self, user_id):
        user = get_user_model().objects.filter(pk=user_id).first()
        return {'name': services.person(user), 'email': '', 'title': 'Staff'} if user else None

    def send_mail(self, *, to, subject, body, attachments=None):
        TestHost.mails.append({'to': list(to), 'subject': subject, 'body': body, 'attachments': attachments or []})
        return True

    def storage_save(self, key, data, content_type='application/octet-stream'):
        TestHost.files[key] = data
        return key

    def storage_read(self, key):
        return TestHost.files[key]

    def storage_delete(self, key):
        TestHost.files.pop(key, None)

    def branding(self):
        return {'company_name': 'Acme Test Co', 'logo_png': None, 'support_email': 'help@example.test'}

    def kinds(self):
        return [{'key': 'agreement', 'label': 'Agreement'}, {'key': 'policy', 'label': 'Policy'}]

    def public_base_url(self):
        return 'https://dash.example.test'


HOST = 'apps.esign.tests.helpers.TestHost'


def reset_host():
    TestHost.mails = []
    TestHost.files = {}
    adapter.reset()


def user(handle, first='Test', last='Person'):
    """A host user. House user models take (their USERNAME_FIELD, first name, last name, password); an email
    USERNAME_FIELD gets a made-up address."""
    model = get_user_model()
    key = f'{handle}@example.test' if model.USERNAME_FIELD == 'email' else handle
    made = model.objects.create_user(key, first, last, 'test-pass-123')
    HANDLES[made.pk] = handle
    return made


def pdf_bytes(pages=2, *, rotate=0) -> bytes:
    """A small letter-size PDF with a line of text on each page."""
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas

    out = BytesIO()
    c = canvas.Canvas(out, pagesize=letter)
    for n in range(1, pages + 1):
        c.drawString(72, 720, f'Test page {n} of {pages}')
        c.showPage()
    c.save()
    if not rotate:
        return out.getvalue()
    from pypdf import PdfReader, PdfWriter

    writer = PdfWriter()
    for page in PdfReader(BytesIO(out.getvalue())).pages:
        writer.add_page(page.rotate(rotate))
    turned = BytesIO()
    writer.write(turned)
    return turned.getvalue()


def png_data_url() -> str:
    rng = random.Random(7)
    image = Image.new('RGB', (160, 60), 'white')
    for _ in range(400):
        image.putpixel((rng.randrange(160), rng.randrange(60)), (rng.randrange(255), 0, 0))
    out = BytesIO()
    image.save(out, format='PNG')
    return 'data:image/png;base64,' + base64.b64encode(out.getvalue()).decode()


SECTIONS = [
    {'heading': '1. The role', 'body': '{{party_1_name}} is {{role_name}} for {{company_name}} from {{start_date}}.'},
    {'heading': '2. Check-ins', 'body': 'Reviews at day 30, 60 and 90.\n\n- Day 30: foundations\n- Day 90: results'},
]
FIELDS = [
    {'key': 'role_name', 'label': 'Role', 'kind': 'text', 'required': True},
    {'key': 'start_date', 'label': 'Start', 'kind': 'date', 'required': True},
]
VALUES = {'role_name': 'Test Director', 'start_date': '2026-11-15'}
ACKS = ['I have read the duties list.', 'I understand the 30/60/90 check-ins.']
OUTSIDER = {'name': 'Sam Sample', 'email': 'sam@example.test', 'title': 'Director', 'role_label': 'Director'}


def make_template(by=None, *, acknowledgments=None):
    return services.create_template(name='Test agreement', kind='agreement', title='Test Agreement',
                                    sections=SECTIONS, fields=FIELDS, by=by,
                                    acknowledgments=ACKS if acknowledgments is None else acknowledgments)


def make_sent(by=None, *, parties=None, acknowledgments=None):
    template = make_template(by, acknowledgments=acknowledgments)
    envelope = services.create_envelope(version=template.latest, parties=parties or [OUTSIDER], values=VALUES, by=by)
    envelope, token, _ = services.send(envelope, by=by)
    return envelope, token


def sign_args(**over):
    args = dict(name='Sam Sample', title='Director', consent=True, acknowledgments=[True, True],
                signature=png_data_url(), ip='203.0.113.9', user_agent='TestPhone/1.0')
    args.update(over)
    return args

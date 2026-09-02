"""Documents upload, assign, and flatten."""
from io import BytesIO

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APITestCase

from reportlab.pdfgen import canvas

from apps.core.models import S3File

from .flatten import flatten_document, pdf_page_count
from .models import Document, DocumentField, DocumentFieldValue, DocumentRecipient

User = get_user_model()


def _staff(email, role='Employee', *, superuser=False):
    group, _ = Group.objects.get_or_create(name=role)
    user = User.objects.create_user(
        email=email,
        password='x',
        first_name=role,
        last_name=email.split('@')[0],
        is_staff=True,
        is_superuser=superuser,
    )
    user.groups.add(group)
    return user


def _pdf_bytes(text='Hello') -> bytes:
    buf = BytesIO()
    c = canvas.Canvas(buf)
    c.drawString(72, 720, text)
    c.save()
    return buf.getvalue()


class PdfHelperTests(TestCase):
    def test_page_count(self):
        self.assertEqual(pdf_page_count(_pdf_bytes()), 1)


class DocumentApiTests(APITestCase):
    def setUp(self):
        self.employee = _staff('emp@example.com')
        self.owner = _staff('owner@example.com', 'Admin', superuser=True)

    def test_rejects_docx_upload(self):
        self.client.force_authenticate(self.owner)
        created = self.client.post('/api/documents/documents/', {
            'title': 'Handbook',
            'mode': 'sign',
        }, format='json')
        self.assertEqual(created.status_code, 201)
        fake = SimpleUploadedFile(
            'handbook.docx',
            b'PK\x03\x04not-a-pdf',
            content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        )
        upload = self.client.post(
            f'/api/documents/documents/{created.data["id"]}/upload/',
            {'file': fake},
            format='multipart',
        )
        self.assertEqual(upload.status_code, 400)
        self.assertIn('PDF', upload.data['detail'])

    def test_assign_everyone_and_acknowledge(self):
        self.client.force_authenticate(self.owner)
        created = self.client.post('/api/documents/documents/', {
            'title': 'Cell phone policy',
            'mode': 'acknowledge',
        }, format='json')
        assigned = self.client.post(
            f'/api/documents/documents/{created.data["id"]}/assign/',
            {'audience': 'everyone'},
            format='json',
        )
        self.assertEqual(assigned.status_code, 201, assigned.data)
        self.assertGreaterEqual(assigned.data['recipients_created'], 2)

        self.client.force_authenticate(self.employee)
        mine = self.client.get('/api/documents/recipients/mine/')
        self.assertEqual(mine.status_code, 200)
        self.assertEqual(len(mine.data), 1)
        done = self.client.post(f'/api/documents/recipients/{mine.data[0]["id"]}/complete/')
        self.assertEqual(done.status_code, 200)
        self.assertEqual(done.data['status'], 'completed')

    def test_employee_cannot_author(self):
        self.client.force_authenticate(self.employee)
        response = self.client.post('/api/documents/documents/', {
            'title': 'Nope',
            'mode': 'read',
        }, format='json')
        self.assertEqual(response.status_code, 403)


class FlattenTests(TestCase):
    def test_appends_audit_page(self):
        owner = _staff('own@example.com', 'Admin', superuser=True)
        raw = _pdf_bytes()
        s3 = S3File.objects.create(
            key='docs/src.pdf',
            filename='src.pdf',
            size=len(raw),
            content_type='application/pdf',
            uploaded_by=owner,
        )
        from django.core.files.base import ContentFile
        from django.core.files.storage import default_storage
        default_storage.save(s3.key, ContentFile(raw))
        document = Document.objects.create(
            title='Sign me',
            file=s3,
            page_count=1,
            mode=Document.MODE_SIGN,
            created_by=owner,
        )
        field = DocumentField.objects.create(
            document=document,
            page=0,
            x_pct=10,
            y_pct=10,
            w_pct=30,
            h_pct=8,
            kind=DocumentField.KIND_TEXT,
            label='Name',
        )
        recipient = DocumentRecipient.objects.create(
            assignment=document.assignments.create(
                audience='person',
                assigned_user=owner,
                assigned_by=owner,
            ),
            user=owner,
        )
        DocumentFieldValue.objects.create(
            recipient=recipient,
            field=field,
            value_text='Ada',
        )
        out = flatten_document(
            document,
            recipient.field_values.select_related('field', 'value_file'),
            {'signer': 'Ada', 'completed_at': 'now', 'ip': '1.1.1.1', 'user_agent': 'test'},
        )
        self.assertEqual(pdf_page_count(out), 2)

"""Documents and e-sign (house standard D22). Self-contained: the only host model it touches is
``settings.AUTH_USER_MODEL``. A party is a name and an email, optionally linked to a host user who may then sign while
signed in; a party with no user signs from a single-use link and never gets an account.

Seeded from an Eco-Thrift helper's draft (master, 2026-11-02); Dark Horse generalized it from one signer plus a company
countersign to any number of parties who sign in order (for example an outside signer, then two signed-in people)."""
from __future__ import annotations

from django.conf import settings
from django.db import models


def _user_fk(related_name='+'):
    return models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                             related_name=related_name)


class Template(models.Model):
    name = models.CharField(max_length=160)
    # What kind of document this is (agreement, PIP, handbook acknowledgment...): the host names the kinds.
    kind = models.SlugField(max_length=60, default='agreement')
    archived = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = _user_fk()

    class Meta:
        ordering = ['name', 'id']

    def __str__(self):
        return self.name

    @property
    def latest(self) -> 'TemplateVersion | None':
        return self.versions.order_by('-number').first()


class TemplateVersion(models.Model):
    """One saved state of a template. Never edited: every save is a new version (a used one is ``frozen``)."""
    template = models.ForeignKey(Template, on_delete=models.CASCADE, related_name='versions')
    number = models.PositiveIntegerField()
    title = models.CharField(max_length=200)
    # [{"heading": "1. Services", "body": "Text with {{blank}} fields"}]
    sections = models.JSONField(default=list)
    # [{"key", "label", "kind": text|textarea|date|choice, "required", "options": [], "default"}]
    fields = models.JSONField(default=list)
    # Statements each signer ticks one by one before signing ("I have read the 2027 handbook").
    acknowledgments = models.JSONField(default=list, blank=True)
    note = models.CharField(max_length=300, blank=True)
    frozen = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = _user_fk()

    class Meta:
        ordering = ['template_id', '-number']
        constraints = [models.UniqueConstraint(fields=['template', 'number'], name='esign_version_unique')]

    def __str__(self):
        return f'{self.template.name} v{self.number}'


class Batch(models.Model):
    """One template sent to many people at once, one document each (every staff member acknowledging a handbook)."""
    name = models.CharField(max_length=200)
    kind = models.SlugField(max_length=60, default='agreement')
    template_version = models.ForeignKey(TemplateVersion, null=True, blank=True, on_delete=models.PROTECT,
                                         related_name='batches')
    values = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = _user_fk()

    class Meta:
        ordering = ['-created_at', '-id']

    def __str__(self):
        return self.name


class Envelope(models.Model):
    """One document out for signature, with its parties. Two sources (D22 § 1):

    - ``text``: a template version, the filled values, and the frozen text;
    - ``pdf``: an uploaded PDF with boxes placed for each party, flattened onto it when everyone has signed.
    """
    DRAFT, OUT, SIGNED, VOID, ENDED = 'draft', 'out', 'signed', 'void', 'ended'
    STATUS_CHOICES = [(DRAFT, 'Draft'), (OUT, 'Out for signature'), (SIGNED, 'Signed'), (VOID, 'Void'),
                      (ENDED, 'Ended')]
    TEXT, PDF = 'text', 'pdf'

    source = models.CharField(max_length=10, choices=[(TEXT, 'Template text'), (PDF, 'Uploaded PDF')], default=TEXT)
    template_version = models.ForeignKey(TemplateVersion, null=True, blank=True, on_delete=models.PROTECT,
                                         related_name='envelopes')
    kind = models.SlugField(max_length=60, default='agreement')
    title = models.CharField(max_length=200, blank=True)
    # An uploaded PDF: where it is kept, its SHA-256 (the fingerprint signed), its pages.
    source_pdf_key = models.CharField(max_length=300, blank=True)
    source_pdf_sha256 = models.CharField(max_length=64, blank=True)
    page_count = models.PositiveSmallIntegerField(default=0)
    batch = models.ForeignKey(Batch, null=True, blank=True, on_delete=models.SET_NULL, related_name='envelopes')
    values = models.JSONField(default=dict)
    # Frozen when sent: exactly what every party reads and signs, its SHA-256, the statements ticked, the consent words.
    body_text = models.TextField(blank=True)
    body_sha256 = models.CharField(max_length=64, blank=True)
    acknowledgments = models.JSONField(default=list, blank=True)
    consent_text = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=DRAFT)
    requires_w9 = models.BooleanField(default=False)
    # What the host attaches this to (a person, a contractor...). Opaque to this app.
    attached_type = models.CharField(max_length=60, blank=True)
    attached_id = models.CharField(max_length=60, blank=True)
    end_date = models.DateField(null=True, blank=True)
    notice_given_at = models.DateTimeField(null=True, blank=True)
    void_reason = models.CharField(max_length=300, blank=True)
    final_pdf_key = models.CharField(max_length=300, blank=True)
    final_pdf_sha256 = models.CharField(max_length=64, blank=True)
    # Brought in from an older system ("mydocs:17"), and any other stored files of it, removed with it on purge.
    imported_from = models.CharField(max_length=60, blank=True)
    other_keys = models.JSONField(default=list, blank=True)
    # Deleting is never silent: asked for with a reason, purged after a wait (ESIGN_PURGE_DAYS), written to PurgeLog.
    delete_requested_at = models.DateTimeField(null=True, blank=True)
    delete_requested_by = _user_fk()
    delete_reason = models.CharField(max_length=300, blank=True)
    purge_after = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = _user_fk()

    class Meta:
        ordering = ['-created_at', '-id']

    def __str__(self):
        return self.title or str(self.template_version or self.pk)

    @property
    def fingerprint(self) -> str:
        """The SHA-256 that was signed: of the frozen text, or of the uploaded PDF."""
        return self.source_pdf_sha256 if self.source == self.PDF else self.body_sha256


class PlacedField(models.Model):
    """A box on an uploaded PDF, filled for one party when they sign. Coordinates are fractions of the page as it
    is shown (top-left origin, after the page's rotation), so they survive any screen size."""
    SIGNATURE, NAME, DATE, TITLE, INITIALS = 'signature', 'name', 'date', 'title', 'initials'
    KIND_CHOICES = [(SIGNATURE, 'Signature'), (INITIALS, 'Initials'), (NAME, 'Printed name'), (TITLE, 'Title'),
                    (DATE, 'Date signed')]

    envelope = models.ForeignKey(Envelope, on_delete=models.CASCADE, related_name='placed')
    signer = models.PositiveSmallIntegerField(help_text='The party order (1 = first to sign).')
    kind = models.CharField(max_length=12, choices=KIND_CHOICES)
    page = models.PositiveSmallIntegerField(help_text='1-based.')
    x = models.FloatField()
    y = models.FloatField()
    w = models.FloatField()
    h = models.FloatField()

    class Meta:
        ordering = ['envelope_id', 'page', 'y', 'x', 'id']


class Party(models.Model):
    """One signer, in order. ``user`` set: may sign while signed in to the host; empty: the link only, no account."""
    WAITING, READY, SIGNED = 'waiting', 'ready', 'signed'
    STATUS_CHOICES = [(WAITING, 'Waiting'), (READY, 'Ready to sign'), (SIGNED, 'Signed')]

    envelope = models.ForeignKey(Envelope, on_delete=models.CASCADE, related_name='parties')
    order = models.PositiveSmallIntegerField()
    name = models.CharField(max_length=160)
    email = models.EmailField(blank=True)
    title = models.CharField(max_length=160, blank=True)
    # Shown on the document ("Director", "Owner").
    role_label = models.CharField(max_length=80, blank=True)
    user = _user_fk(related_name='esign_parties')
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=WAITING)
    ready_at = models.DateTimeField(null=True, blank=True)
    signed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['envelope_id', 'order', 'id']
        constraints = [models.UniqueConstraint(fields=['envelope', 'order'], name='esign_party_order_unique')]

    def __str__(self):
        return f'{self.name} ({self.envelope_id}#{self.order})'


class SigningLink(models.Model):
    """A single-use, expiring link for one party. Only the SHA-256 of the token is kept; the token is in the email."""
    party = models.ForeignKey(Party, on_delete=models.CASCADE, related_name='links')
    token_hash = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class Signature(models.Model):
    VIA_LINK, VIA_SIGNED_IN = 'link', 'signed_in'
    party = models.OneToOneField(Party, on_delete=models.CASCADE, related_name='signature')
    name = models.CharField(max_length=160)
    title = models.CharField(max_length=160, blank=True)
    image = models.BinaryField()  # PNG of the drawn signature
    consent_text = models.TextField()
    consent_at = models.DateTimeField()
    acknowledged = models.JSONField(default=list, blank=True)  # the statements ticked, word for word
    signed_at = models.DateTimeField()
    via = models.CharField(max_length=10, choices=[(VIA_LINK, 'Link'), (VIA_SIGNED_IN, 'Signed in')])
    ip = models.CharField(max_length=64, blank=True)
    user_agent = models.CharField(max_length=300, blank=True)
    user = _user_fk()


class AuditEvent(models.Model):
    envelope = models.ForeignKey(Envelope, on_delete=models.CASCADE, related_name='events')
    kind = models.CharField(max_length=40)
    at = models.DateTimeField(auto_now_add=True)
    actor = models.CharField(max_length=200, blank=True)  # a name, or "system"
    ip = models.CharField(max_length=64, blank=True)
    user_agent = models.CharField(max_length=300, blank=True)
    detail = models.CharField(max_length=500, blank=True)

    class Meta:
        ordering = ['at', 'id']


class PurgeLog(models.Model):
    """What remains of a purged document: enough to say it existed, who asked for it to go, and why. No FK."""
    envelope_id = models.IntegerField()
    title = models.CharField(max_length=200)
    kind = models.CharField(max_length=60, blank=True)
    status = models.CharField(max_length=20, blank=True)
    attached_type = models.CharField(max_length=60, blank=True)
    attached_id = models.CharField(max_length=60, blank=True)
    attached_label = models.CharField(max_length=200, blank=True)
    parties = models.CharField(max_length=500, blank=True)
    fingerprint = models.CharField(max_length=64, blank=True)
    final_pdf_sha256 = models.CharField(max_length=64, blank=True)
    requested_by = models.CharField(max_length=200, blank=True)
    requested_at = models.DateTimeField(null=True, blank=True)
    reason = models.CharField(max_length=300, blank=True)
    purged_by = models.CharField(max_length=200, blank=True)  # a name, or "scheduled"
    purged_at = models.DateTimeField(auto_now_add=True)
    keys_removed = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ['-purged_at', '-id']


class Upload(models.Model):
    """A sensitive file from a signer (e.g. a W-9). Owner-only: never serialized into any list."""
    KIND_W9 = 'w9'
    envelope = models.ForeignKey(Envelope, on_delete=models.CASCADE, related_name='uploads')
    kind = models.CharField(max_length=20, default=KIND_W9)
    storage_key = models.CharField(max_length=300)
    filename = models.CharField(max_length=200)
    content_type = models.CharField(max_length=100)
    size = models.PositiveIntegerField(default=0)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    ip = models.CharField(max_length=64, blank=True)

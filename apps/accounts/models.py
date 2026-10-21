import secrets

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone


class UserManager(BaseUserManager):
    """Custom manager for User model with email as the unique identifier."""

    def create_user(self, email, first_name, last_name, password=None, **extra_fields):
        if not email:
            raise ValueError('Users must have an email address')
        email = self.normalize_email(email)
        user = self.model(email=email, first_name=first_name, last_name=last_name, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, first_name, last_name, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_active', True)

        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')

        return self.create_user(email, first_name, last_name, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """Custom user model. Staff sign in with their **username** or their email (house standard D16, T61).

    ``username``: unique, lower-case, staff only (customers sign in on the storefront). The first name, then the
    last initial on a clash (``bill``, ``carrie``; ``services/usernames.py``). ``USERNAME_FIELD`` stays ``email``:
    the login view finds the email for a username.
    """
    email = models.EmailField(unique=True)
    username = models.CharField(max_length=40, unique=True, null=True, blank=True)
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=30, blank=True, default='')
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    language = models.CharField(
        max_length=8,
        choices=[('en', 'English'), ('es', 'Spanish')],
        default='en',
    )
    date_joined = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    # Last request, login or refresh by this login (services/idle.py, the 4-hour idle sign-out). Stamped, not edited.
    last_active_at = models.DateTimeField(null=True, blank=True, editable=False)
    # Register PIN (services/register_pin.py): one per person, unique, so a PIN alone says who it is. Kept as a keyed
    # hash (HMAC with the server secret), never the PIN. Set by the person on the Me page.
    register_pin_hash = models.CharField(max_length=64, unique=True, null=True, blank=True, editable=False)
    register_pin_set_at = models.DateTimeField(null=True, blank=True, editable=False)
    # "Sign out on all devices" (Me page): tokens issued before this are refused (authentication.py).
    sessions_ended_at = models.DateTimeField(null=True, blank=True, editable=False)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['first_name', 'last_name']

    class Meta:
        ordering = ['last_name', 'first_name']

    def __str__(self):
        return f'{self.first_name} {self.last_name}'

    def save(self, *args, **kwargs):
        self.username = (self.username or '').strip().lower() or None
        super().save(*args, **kwargs)

    @property
    def full_name(self):
        return f'{self.first_name} {self.last_name}'

    def _canonical_role_set(self):
        """Group names mapped to App roles (case-insensitive, strip whitespace)."""
        canonical = {
            'admin': 'Admin',
            'manager': 'Manager',
            'employee': 'Employee',
            'consignee': 'Consignee',
            'customer': 'Customer',
        }
        present = set()
        for raw in self.groups.values_list('name', flat=True):
            key = (raw or '').strip().lower()
            if key in canonical:
                present.add(canonical[key])
        return present

    @property
    def role(self):
        """Return the user's primary role based on group membership (highest privilege first)."""
        present = self._canonical_role_set()
        for role in ['Admin', 'Manager', 'Employee', 'Consignee', 'Customer']:
            if role in present:
                return role
        return None

    @property
    def roles(self):
        """Canonical app roles (Admin…Customer), priority order. Customer is lowest."""
        present = self._canonical_role_set()
        return [r for r in ['Admin', 'Manager', 'Employee', 'Consignee', 'Customer'] if r in present]


class EmployeeProfile(models.Model):
    """Created when a user is hired. One-to-one with User."""
    EMPLOYMENT_TYPES = [
        ('full_time', 'Full Time'),
        ('part_time', 'Part Time'),
        ('seasonal', 'Seasonal'),
    ]
    TERMINATION_TYPES = [
        ('voluntary_resignation', 'Voluntary Resignation'),
        ('job_abandonment', 'Job Abandonment'),
        ('retirement', 'Retirement'),
        ('mutual_agreement', 'Mutual Agreement'),
        ('layoff', 'Layoff / Reduction in Force'),
        ('termination_for_cause', 'Termination for Cause'),
        ('termination_poor_performance', 'Termination - Poor Performance'),
        ('end_of_contract', 'End of Contract / Seasonal'),
        ('other', 'Other'),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='employee')
    employee_number = models.CharField(max_length=20, unique=True)
    department = models.ForeignKey(
        'hr.Department', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='employees',
    )
    position = models.CharField(max_length=100, blank=True, default='')
    employment_type = models.CharField(max_length=20, choices=EMPLOYMENT_TYPES, default='full_time')
    pay_rate = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    # Pay level (owner 2026-10-20): Entry, Senior, Manager. The ranges are the ``hr.pay_levels`` setting.
    LEVEL_CHOICES = [('entry', 'Entry'), ('senior', 'Senior'), ('manager', 'Manager')]
    level = models.CharField(max_length=10, choices=LEVEL_CHOICES, default='entry')
    # Hours past the weekly 40 this person is cleared to work (0 = no overtime). Over 40 + this is flagged.
    overtime_allowance_hours = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    hire_date = models.DateField()
    termination_date = models.DateField(null=True, blank=True)
    termination_type = models.CharField(
        max_length=40, choices=TERMINATION_TYPES, blank=True, default='',
    )
    termination_notes = models.TextField(blank=True, default='')
    work_location = models.ForeignKey(
        'core.WorkLocation', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='employees',
    )
    emergency_name = models.CharField(max_length=150, blank=True, default='')
    emergency_phone = models.CharField(max_length=30, blank=True, default='')
    notes = models.TextField(blank=True, default='')
    # Kiosk card. HMAC-SHA256(SECRET_KEY, token) hex; the token itself is shown once.
    badge_token_hash = models.CharField(max_length=64, unique=True, null=True, blank=True)
    badge_issued_at = models.DateTimeField(null=True, blank=True)
    badge_revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['employee_number']

    def __str__(self):
        return f'{self.employee_number} - {self.user.full_name}'

    @property
    def badge_status(self) -> str:
        if not self.badge_token_hash:
            return 'none'
        if self.badge_revoked_at:
            return 'revoked'
        return 'active'

    @staticmethod
    def generate_employee_number():
        """Generate next employee number like EMP-001."""
        last = EmployeeProfile.objects.order_by('-id').first()
        if last:
            try:
                num = int(last.employee_number.split('-')[1]) + 1
            except (IndexError, ValueError):
                num = EmployeeProfile.objects.count() + 1
        else:
            num = 1
        return f'EMP-{num:03d}'


class ConsigneeProfile(models.Model):
    """Created when someone signs up as a consignee. One-to-one with User."""
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('paused', 'Paused'),
        ('closed', 'Closed'),
    ]
    PAYOUT_METHODS = [
        ('cash', 'Cash'),
        ('check', 'Check'),
        ('store_credit', 'Store Credit'),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='consignee')
    consignee_number = models.CharField(max_length=20, unique=True)
    commission_rate = models.DecimalField(max_digits=5, decimal_places=2, default=40.00,
                                         help_text="Store's cut as %, e.g. 40.00 = store keeps 40%")
    payout_method = models.CharField(max_length=20, choices=PAYOUT_METHODS, default='cash')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    join_date = models.DateField(auto_now_add=True)
    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['consignee_number']

    def __str__(self):
        return f'{self.consignee_number} - {self.user.full_name}'

    @staticmethod
    def generate_consignee_number():
        last = ConsigneeProfile.objects.order_by('-id').first()
        if last:
            try:
                num = int(last.consignee_number.split('-')[1]) + 1
            except (IndexError, ValueError):
                num = ConsigneeProfile.objects.count() + 1
        else:
            num = 1
        return f'CON-{num:03d}'


class CustomerProfile(models.Model):
    """DEPRECATED (T62, 2026-10-20): nothing reads or writes this table any more. One customer system: a customer is a
    Thrift+ ``Person`` (``Person.user`` links their website login). Email confirmed = ``Person.email_verified_at``,
    notes = ``Account.notes``, member number = the member code, "since" = ``Account.created_at``. The rows are kept
    until a later release drops this model and its table (data migration:
    ``thriftplus.0026_carry_customer_profiles``). Do not use it in new code.
    """
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='customer')
    customer_number = models.CharField(max_length=20, unique=True)
    customer_since = models.DateField(auto_now_add=True)
    notes = models.TextField(blank=True, default='')
    email_verified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['customer_number']

    def __str__(self):
        return f'{self.customer_number} - {self.user.full_name}'

    @property
    def email_verified(self) -> bool:
        return self.email_verified_at is not None

    @staticmethod
    def generate_customer_number():
        last = CustomerProfile.objects.order_by('-id').first()
        if last:
            try:
                num = int(last.customer_number.split('-')[1]) + 1
            except (IndexError, ValueError):
                num = CustomerProfile.objects.count() + 1
        else:
            num = 1
        return f'CUS-{num:03d}'


def _magic_link_token() -> str:
    return secrets.token_urlsafe(32)


class MagicLinkToken(models.Model):
    """Single-use customer magic-link token (never echoed in API responses)."""

    PURPOSE_SIGN_IN = 'sign_in'
    PURPOSE_VERIFY_EMAIL = 'verify_email'
    PURPOSE_VERIFY_HOLD = 'verify_hold'
    PURPOSE_VERIFY_THREAD = 'verify_thread'
    PURPOSE_RESET_PASSWORD = 'reset_password'
    PURPOSE_STAFF_RESET_PASSWORD = 'staff_reset_password'
    PURPOSE_CHOICES = [
        (PURPOSE_SIGN_IN, 'Sign in'),
        (PURPOSE_VERIFY_EMAIL, 'Verify email'),
        (PURPOSE_VERIFY_HOLD, 'Verify hold'),
        (PURPOSE_VERIFY_THREAD, 'Verify thread'),
        (PURPOSE_RESET_PASSWORD, 'Reset password'),
        (PURPOSE_STAFF_RESET_PASSWORD, 'Staff reset password'),
    ]
    # Purposes that must work even when ONLINE_SALES_ACCOUNTS_ENABLED is false.
    VERIFY_PURPOSES = frozenset({PURPOSE_VERIFY_HOLD, PURPOSE_VERIFY_THREAD})
    # Staff tokens never travel the customer consume path - see services/staff_password.py.
    STAFF_PURPOSES = frozenset({PURPOSE_STAFF_RESET_PASSWORD})

    email = models.EmailField(db_index=True)
    token = models.CharField(max_length=64, unique=True, default=_magic_link_token, db_index=True)
    purpose = models.CharField(
        max_length=32, choices=PURPOSE_CHOICES, default=PURPOSE_SIGN_IN, db_index=True,
    )
    # Opaque tokens - not FKs, so accounts stays free of a webstore dependency.
    hold_token = models.CharField(max_length=48, blank=True, default='', db_index=True)
    thread_token = models.CharField(max_length=48, blank=True, default='', db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    request_ip = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.email} [{self.purpose}] ({self.token[:8]}…)'

    @property
    def is_usable(self) -> bool:
        if self.used_at is not None:
            return False
        return self.expires_at > timezone.now()


class AccountEvent(models.Model):
    """Account changes, for the record (house standard D16): created, role changed, switched off or on, username
    changed, password link issued, password set or changed, locked out. Never a password."""
    KIND_CREATED = 'created'
    KIND_ROLE = 'role_changed'
    KIND_OFF = 'switched_off'
    KIND_ON = 'switched_on'
    KIND_USERNAME = 'username_changed'
    KIND_LINK = 'password_link'
    KIND_PASSWORD_SET = 'password_set'
    KIND_PASSWORD_CHANGED = 'password_changed'
    KIND_LOCKED = 'locked_out'
    KIND_MERGED_IN = 'login_merged_in'      # on the staff login (services/login_merge.py)
    KIND_MERGED_INTO = 'merged_into_staff'  # on the customer login that merged in
    KIND_PIN_SET = 'register_pin_set'
    KIND_PIN_CLEARED = 'register_pin_cleared'
    KIND_SIGNED_OUT_ALL = 'signed_out_all'
    KIND_CHOICES = [
        (KIND_CREATED, 'Created'), (KIND_ROLE, 'Role changed'), (KIND_OFF, 'Switched off'), (KIND_ON, 'Switched on'),
        (KIND_USERNAME, 'Username changed'), (KIND_LINK, 'Set-password link issued'),
        (KIND_PASSWORD_SET, 'Password set from a link'), (KIND_PASSWORD_CHANGED, 'Password changed'),
        (KIND_LOCKED, 'Locked out (too many wrong tries)'),
        (KIND_MERGED_IN, 'A customer login merged in'), (KIND_MERGED_INTO, 'Merged into a staff login'),
        (KIND_PIN_SET, 'Register PIN set'), (KIND_PIN_CLEARED, 'Register PIN cleared'),
        (KIND_SIGNED_OUT_ALL, 'Signed out on all devices'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='account_events')
    kind = models.CharField(max_length=24, choices=KIND_CHOICES, db_index=True)
    detail = models.CharField(max_length=300, blank=True, default='')
    actor = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-at']

    @classmethod
    def log(cls, user, kind: str, *, actor=None, detail: str = '') -> 'AccountEvent':
        return cls.objects.create(
            user=user, kind=kind, detail=detail[:300], actor=actor if getattr(actor, 'pk', None) else None,
        )


class StaffThread(models.Model):
    """A staff message thread in Dash (owner 2026-10-21): never email or text. The owner or a manager starts it, to one
    person or a whole department; everyone on it can reply (``services/staff_messages.py``)."""
    subject = models.CharField(max_length=140)
    audience = models.CharField(max_length=140, blank=True, default='', help_text='Who it went to, e.g. "Retail".')
    department = models.ForeignKey('hr.Department', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    last_message_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ['-last_message_at']

    def __str__(self):
        return self.subject


class StaffThreadMember(models.Model):
    thread = models.ForeignKey(StaffThread, on_delete=models.CASCADE, related_name='members')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='staff_threads')
    last_read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['thread', 'user'], name='accounts_thread_member_unique')]


class StaffMessage(models.Model):
    """One message in a thread. A one-time secret (a PIN) rides in ``StaffMessageSecret`` until its one reader taps
    Show; then the secret row is deleted and only when and where it was shown stays here."""
    thread = models.ForeignKey(StaffThread, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    has_secret = models.BooleanField(default=False)
    secret_for = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    secret_shown_at = models.DateTimeField(null=True, blank=True)
    secret_shown_device = models.CharField(max_length=200, blank=True, default='')

    class Meta:
        ordering = ['created_at', 'id']


class StaffMessageRead(models.Model):
    """A read receipt: who read this message, and when (first time)."""
    message = models.ForeignKey(StaffMessage, on_delete=models.CASCADE, related_name='reads')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='+')
    read_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['message', 'user'], name='accounts_message_read_unique')]


class StaffMessageSecret(models.Model):
    """The one-time secret, sealed with the server key (``services/one_time_secret.py``). Deleted the moment it is
    shown. Never listed by an API, never in admin, never logged."""
    message = models.OneToOneField(StaffMessage, on_delete=models.CASCADE, related_name='secret')
    sealed = models.TextField()

    def __str__(self):
        return f'Secret for message {self.message_id}'

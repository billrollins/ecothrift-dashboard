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
    """Custom user model with email as the sole login identifier."""
    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=30, blank=True, default='')
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['first_name', 'last_name']

    class Meta:
        ordering = ['last_name', 'first_name']

    def __str__(self):
        return f'{self.first_name} {self.last_name}'

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
        ('termination_poor_performance', 'Termination – Poor Performance'),
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
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['employee_number']

    def __str__(self):
        return f'{self.employee_number} - {self.user.full_name}'

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
    """Optional. Created if a customer registers or is created at POS for tracking."""
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
    PURPOSE_CHOICES = [
        (PURPOSE_SIGN_IN, 'Sign in'),
        (PURPOSE_VERIFY_EMAIL, 'Verify email'),
        (PURPOSE_VERIFY_HOLD, 'Verify hold'),
        (PURPOSE_VERIFY_THREAD, 'Verify thread'),
        (PURPOSE_RESET_PASSWORD, 'Reset password'),
    ]
    # Purposes that must work even when ONLINE_SALES_ACCOUNTS_ENABLED is false.
    VERIFY_PURPOSES = frozenset({PURPOSE_VERIFY_HOLD, PURPOSE_VERIFY_THREAD})

    email = models.EmailField(db_index=True)
    token = models.CharField(max_length=64, unique=True, default=_magic_link_token, db_index=True)
    purpose = models.CharField(
        max_length=32, choices=PURPOSE_CHOICES, default=PURPOSE_SIGN_IN, db_index=True,
    )
    # Opaque tokens — not FKs, so accounts stays free of a webstore dependency.
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

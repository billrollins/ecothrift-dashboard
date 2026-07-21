from django.conf import settings
from django.db import models
from decimal import Decimal


class Register(models.Model):
    location = models.ForeignKey(
        'core.WorkLocation', on_delete=models.CASCADE, related_name='registers',
    )
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20, unique=True)
    starting_cash = models.DecimalField(max_digits=10, decimal_places=2, default=200)
    starting_breakdown = models.JSONField(default=dict)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['code']

    def __str__(self):
        return self.name


class Drawer(models.Model):
    STATUS_CHOICES = [
        ('open', 'Open'),
        ('closed', 'Closed'),
    ]

    register = models.ForeignKey(Register, on_delete=models.CASCADE, related_name='drawers')
    date = models.DateField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='open')
    current_cashier = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        related_name='current_drawers',
    )

    opened_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        related_name='opened_drawers',
    )
    opened_at = models.DateTimeField()
    opening_count = models.JSONField(default=dict)
    opening_total = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='closed_drawers',
    )
    closed_at = models.DateTimeField(null=True, blank=True)
    closing_count = models.JSONField(null=True, blank=True)
    closing_total = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    cash_sales_total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    expected_cash = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    variance = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    class Meta:
        unique_together = ('register', 'date')
        ordering = ['-date']

    def __str__(self):
        return f'{self.register.name} - {self.date}'


class DrawerHandoff(models.Model):
    drawer = models.ForeignKey(Drawer, on_delete=models.CASCADE, related_name='handoffs')
    outgoing_cashier = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        related_name='handoffs_out',
    )
    incoming_cashier = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        related_name='handoffs_in',
    )
    counted_at = models.DateTimeField()
    count = models.JSONField(default=dict)
    counted_total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    expected_total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    variance = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    notes = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-counted_at']

    def __str__(self):
        return f'Handoff {self.drawer} at {self.counted_at}'


class CashDrop(models.Model):
    drawer = models.ForeignKey(Drawer, on_delete=models.CASCADE, related_name='drops')
    amount = models.JSONField(default=dict)
    total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    dropped_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
    )
    dropped_at = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-dropped_at']

    def __str__(self):
        return f'Drop ${self.total} from {self.drawer}'


class SupplementalDrawer(models.Model):
    location = models.OneToOneField(
        'core.WorkLocation', on_delete=models.CASCADE,
        related_name='supplemental_drawer',
    )
    current_balance = models.JSONField(default=dict)
    current_total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    last_counted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
    )
    last_counted_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f'Supplemental - {self.location.name}'


class SupplementalTransaction(models.Model):
    TYPE_CHOICES = [
        ('draw', 'Draw'),
        ('return', 'Return'),
        ('audit_adjustment', 'Audit Adjustment'),
    ]

    supplemental = models.ForeignKey(
        SupplementalDrawer, on_delete=models.CASCADE, related_name='transactions',
    )
    transaction_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    amount = models.JSONField(default=dict)
    total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    related_drawer = models.ForeignKey(
        Drawer, on_delete=models.SET_NULL, null=True, blank=True,
    )
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
    )
    performed_at = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-performed_at']

    def __str__(self):
        return f'{self.transaction_type} ${self.total}'


class BankTransaction(models.Model):
    TYPE_CHOICES = [
        ('deposit', 'Deposit'),
        ('change_pickup', 'Change Pickup'),
    ]
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('completed', 'Completed'),
    ]

    location = models.ForeignKey(
        'core.WorkLocation', on_delete=models.CASCADE,
        related_name='bank_transactions',
    )
    transaction_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    amount = models.JSONField(default=dict)
    total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.transaction_type} ${self.total}'


class Cart(models.Model):
    STATUS_CHOICES = [
        ('open', 'Open'),
        ('completed', 'Completed'),
        ('voided', 'Voided'),
    ]
    PAYMENT_METHODS = [
        ('cash', 'Cash'),
        ('card', 'Card'),
        ('split', 'Split'),
    ]

    drawer = models.ForeignKey(Drawer, on_delete=models.CASCADE, related_name='carts')
    cashier = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        related_name='carts',
    )
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='purchases',
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=4, default=Decimal('0.0700'))
    tax_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    payment_method = models.CharField(max_length=10, choices=PAYMENT_METHODS, default='cash')
    cash_tendered = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    change_given = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    card_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'completed_at'], name='cart_dash_completed_idx'),
        ]

    def __str__(self):
        return f'Cart #{self.id} - {self.status}'

    def recalculate(self):
        """Recalculate subtotal, tax, and total from lines."""
        # Query CartLine directly so we never sum a stale prefetch_related cache on `cart.lines`.
        lines = self.lines.model.objects.filter(cart_id=self.pk)
        self.subtotal = sum((line.line_total for line in lines), Decimal('0'))
        self.tax_amount = (self.subtotal * self.tax_rate).quantize(Decimal('0.01'))
        self.total = self.subtotal + self.tax_amount
        self.save(update_fields=['subtotal', 'tax_amount', 'total'])


class CartLine(models.Model):
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name='lines')
    item = models.ForeignKey(
        'inventory.Item', on_delete=models.SET_NULL, null=True, blank=True,
    )
    description = models.CharField(max_length=300)
    quantity = models.IntegerField(default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    line_total = models.DecimalField(max_digits=10, decimal_places=2)
    resale_source_sku = models.CharField(max_length=20, blank=True, default='')
    resale_source_item_id = models.PositiveIntegerField(null=True, blank=True)
    LINE_KIND_ITEM = 'item'
    LINE_KIND_MANUAL = 'manual'
    LINE_KIND_DISCOUNT = 'discount'
    LINE_KIND_DELIVERY = 'delivery'
    LINE_KIND_CHOICES = [
        (LINE_KIND_ITEM, 'Inventory item'),
        (LINE_KIND_MANUAL, 'Manual / unscannable'),
        (LINE_KIND_DISCOUNT, 'Discount / store credit'),
        (LINE_KIND_DELIVERY, 'Delivery fee'),
    ]
    line_kind = models.CharField(
        max_length=20,
        choices=LINE_KIND_CHOICES,
        default=LINE_KIND_ITEM,
        db_index=True,
    )
    # Discount: {reason, scope, target_line_id?}. Delivery: {customer_name, phone, address, is_apt, unit, tier, fee}.
    meta = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f'{self.description} x{self.quantity}'

    def save(self, *args, **kwargs):
        self.line_total = self.unit_price * self.quantity
        super().save(*args, **kwargs)


class Receipt(models.Model):
    cart = models.OneToOneField(Cart, on_delete=models.CASCADE, related_name='receipt')
    receipt_number = models.CharField(max_length=50, unique=True)
    printed = models.BooleanField(default=False)
    emailed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.receipt_number

    @staticmethod
    def generate_receipt_number():
        """Generate receipt number like R-20260212-001."""
        from django.utils import timezone as tz
        today = tz.now().strftime('%Y%m%d')
        prefix = f'R-{today}-'
        last = Receipt.objects.filter(
            receipt_number__startswith=prefix,
        ).order_by('-receipt_number').first()
        if last:
            try:
                num = int(last.receipt_number.split('-')[-1]) + 1
            except (IndexError, ValueError):
                num = 1
        else:
            num = 1
        return f'{prefix}{num:03d}'


class RevenueGoal(models.Model):
    location = models.ForeignKey(
        'core.WorkLocation', on_delete=models.CASCADE,
        related_name='revenue_goals',
    )
    date = models.DateField()
    goal_amount = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        unique_together = ('location', 'date')
        ordering = ['-date']

    def __str__(self):
        return f'{self.location.name} - {self.date}: ${self.goal_amount}'


class DashboardSalesGoal(models.Model):
    """Singleton target line for the dashboard sales run-rate chart."""

    amount = models.DecimalField(max_digits=12, decimal_places=2)
    description = models.TextField(blank=True, default='')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='dashboard_sales_goals_created',
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='dashboard_sales_goals_updated',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return f'Dashboard sales goal: ${self.amount}'


class DashboardDepartmentGoal(models.Model):
    """Per-department target shown on the dashboard department cards.

    `value` is stored as free text so it can represent money ("10000"),
    a count ("10"), or a letter grade ("C") depending on the department.
    """

    BUYING = 'buying'
    PROCESSING = 'processing'
    RESTORATION = 'restoration'
    RETAIL = 'retail'
    DEPARTMENT_CHOICES = [
        (BUYING, 'Buying'),
        (PROCESSING, 'Processing'),
        (RESTORATION, 'Restoration'),
        (RETAIL, 'Retail QA'),
    ]

    department = models.CharField(max_length=20, choices=DEPARTMENT_CHOICES, unique=True)
    value = models.CharField(max_length=50)
    description = models.TextField(blank=True, default='')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='dashboard_department_goals_created',
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='dashboard_department_goals_updated',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['department']

    def __str__(self):
        return f'{self.get_department_display()} goal: {self.value}'


class QualityAuditForm(models.Model):
    """A configurable QA checklist form (super-admin editable)."""

    slug = models.SlugField(max_length=60, unique=True)
    title = models.CharField(max_length=120)
    intro = models.CharField(max_length=255, blank=True, default='')
    icon = models.CharField(max_length=40, blank=True, default='')
    definition = models.JSONField(default=dict)
    is_system = models.BooleanField(default=False)
    feeds_dashboard = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='quality_audit_forms_created',
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='quality_audit_forms_updated',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['title']

    def __str__(self):
        return self.title


class QualityAudit(models.Model):
    """Floor quality audit checklist (retail and future types)."""

    STATUS_DRAFT = 'draft'
    STATUS_SUBMITTED = 'submitted'
    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Draft'),
        (STATUS_SUBMITTED, 'Submitted'),
    ]

    form = models.ForeignKey(
        QualityAuditForm,
        on_delete=models.PROTECT,
        related_name='audits',
        null=True,
        blank=True,
    )
    audit_type = models.CharField(max_length=60, blank=True, default='')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    conducted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='quality_audits_conducted',
    )
    started_at = models.DateTimeField(auto_now_add=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    responses = models.JSONField(default=dict)
    overall_grade = models.CharField(max_length=4, blank=True, default='')
    summary_notes = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-started_at']
        indexes = [
            models.Index(fields=['form', 'status', '-submitted_at']),
        ]

    def __str__(self):
        label = self.form.title if self.form_id else (self.audit_type or 'QA')
        return f'{label} ({self.get_status_display()}) — {self.started_at:%Y-%m-%d}'


class HistoricalTransaction(models.Model):
    """Imported transaction records from DB1 and DB2 for historical revenue reporting.

    No FK relationships — pure data import, no referential integrity required.
    Populated by the import_historical_transactions management command.
    """
    SOURCE_CHOICES = [
        ('db1', 'DB1 Legacy'),
        ('db2', 'DB2 Production'),
    ]

    source_db      = models.CharField(max_length=10, choices=SOURCE_CHOICES)
    legacy_cart_id = models.CharField(max_length=50)
    sale_date      = models.DateField(db_index=True)
    subtotal       = models.DecimalField(max_digits=10, decimal_places=2)
    tax_amount     = models.DecimalField(max_digits=10, decimal_places=2)
    total          = models.DecimalField(max_digits=10, decimal_places=2)
    item_count     = models.IntegerField(default=0)
    payment_method = models.CharField(max_length=20, blank=True, default='')

    class Meta:
        unique_together = [('source_db', 'legacy_cart_id')]
        ordering = ['-sale_date']
        indexes = [
            models.Index(fields=['source_db', 'sale_date']),
        ]

    def __str__(self):
        return f'[{self.source_db.upper()}] {self.legacy_cart_id} — {self.sale_date} ${self.total}'


class DeliveryAvailability(models.Model):
    """A day/window when Eco-Thrift can run appliance deliveries."""

    CREW_ONE = 1
    CREW_TWO = 2
    CREW_CHOICES = [
        (CREW_ONE, '1 person'),
        (CREW_TWO, '2 people'),
    ]

    date = models.DateField(db_index=True)
    time_start = models.TimeField()
    time_end = models.TimeField()
    crew_size = models.PositiveSmallIntegerField(choices=CREW_CHOICES, default=CREW_TWO)
    assigned_to = models.CharField(
        max_length=200,
        blank=True,
        default='',
        help_text='Who is running deliveries that day (names).',
    )
    notes = models.CharField(max_length=300, blank=True, default='')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['date', 'time_start']
        verbose_name_plural = 'delivery availabilities'
        indexes = [
            models.Index(fields=['date', 'is_active']),
        ]

    def __str__(self):
        return f'{self.date} {self.time_start:%H:%M}-{self.time_end:%H:%M} ({self.crew_size}p)'


class DeliveryJob(models.Model):
    """An appliance delivery tied to a POS delivery fee line (may be unscheduled)."""

    STATUS_NEEDS_SCHEDULING = 'needs_scheduling'
    STATUS_SCHEDULED = 'scheduled'
    STATUS_COMPLETED = 'completed'
    STATUS_CANCELLED = 'cancelled'
    STATUS_FAILED = 'failed'
    STATUS_CHOICES = [
        (STATUS_NEEDS_SCHEDULING, 'Needs scheduling'),
        (STATUS_SCHEDULED, 'Scheduled'),
        (STATUS_COMPLETED, 'Completed'),
        (STATUS_CANCELLED, 'Cancelled'),
        (STATUS_FAILED, 'Failed'),
    ]

    availability = models.ForeignKey(
        DeliveryAvailability,
        on_delete=models.PROTECT,
        related_name='jobs',
        null=True,
        blank=True,
    )
    scheduled_date = models.DateField(db_index=True, null=True, blank=True)
    cart = models.ForeignKey(
        Cart,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_jobs',
    )
    cart_line = models.OneToOneField(
        CartLine,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_job',
    )
    customer_name = models.CharField(max_length=120)
    phone = models.CharField(max_length=40)
    address = models.CharField(max_length=200)
    is_apt = models.BooleanField(default=False)
    unit = models.CharField(max_length=40, blank=True, default='')
    items_delivered = models.CharField(max_length=300)
    item_count = models.PositiveSmallIntegerField(default=1)
    tier = models.CharField(max_length=10, blank=True, default='')
    fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    distance_miles = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    distance_mode = models.CharField(max_length=20, blank=True, default='')
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_SCHEDULED,
        db_index=True,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_jobs_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    notes = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['scheduled_date', 'id']
        indexes = [
            models.Index(fields=['scheduled_date', 'status']),
        ]

    def __str__(self):
        when = self.scheduled_date.isoformat() if self.scheduled_date else 'unscheduled'
        return f'{when} - {self.customer_name} ({self.items_delivered})'


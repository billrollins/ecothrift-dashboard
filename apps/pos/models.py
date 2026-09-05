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
    LINE_KIND_ASSEMBLY = 'assembly'
    LINE_KIND_CHOICES = [
        (LINE_KIND_ITEM, 'Inventory item'),
        (LINE_KIND_MANUAL, 'Manual / unscannable'),
        (LINE_KIND_DISCOUNT, 'Discount / store credit'),
        (LINE_KIND_DELIVERY, 'Delivery fee'),
        (LINE_KIND_ASSEMBLY, 'Assembly'),
    ]
    SALE_LABEL_LABOR_DAY = 'labor_day'
    SALE_LABEL_SUMMER = 'summer'
    line_kind = models.CharField(
        max_length=20,
        choices=LINE_KIND_CHOICES,
        default=LINE_KIND_ITEM,
        db_index=True,
    )
    # Discount: {reason, scope, target_line_id?}. Delivery: {customer_name, phone, address, is_apt, unit, tier, fee}.
    meta = models.JSONField(default=dict, blank=True)
    sale_label = models.CharField(max_length=20, blank=True, default='')
    sale_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0'))
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f'{self.description} x{self.quantity}'

    def is_sale_eligible(self):
        return self.line_kind in (self.LINE_KIND_ITEM, self.LINE_KIND_MANUAL)

    @property
    def list_total(self):
        return (self.unit_price * self.quantity).quantize(Decimal('0.01'))

    @property
    def sale_savings(self):
        return (self.list_total - self.line_total).quantize(Decimal('0.01'))

    def save(self, *args, **kwargs):
        pct = self.sale_percent if self.sale_percent is not None else Decimal('0')
        factor = Decimal('1') - (pct / Decimal('100'))
        self.line_total = (self.unit_price * self.quantity * factor).quantize(Decimal('0.01'))
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
    schedule = models.JSONField(
        blank=True,
        default=dict,
        help_text=(
            'Optional schedule configuration. Retail QA uses '
            '{"weekdays": [0..6], "audits_per_day": N}.'
        ),
    )
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


class HistoricalTransaction(models.Model):
    """Imported transaction records from DB1 and DB2 for historical revenue reporting.

    No FK relationships - pure data import, no referential integrity required.
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
        return f'[{self.source_db.upper()}] {self.legacy_cart_id} - {self.sale_date} ${self.total}'


class DeliveryDay(models.Model):
    """Canonical planned delivery day (physical table: pos_deliveryavailability)."""

    CREW_ONE = 1
    CREW_TWO = 2
    CREW_CHOICES = [
        (CREW_ONE, '1 person'),
        (CREW_TWO, '2 people'),
    ]

    DISPOSITION_PLANNED = 'planned'
    DISPOSITION_CANCELLED = 'cancelled'
    DISPOSITION_NOT_RUN = 'not_run'
    DISPOSITION_CHOICES = [
        (DISPOSITION_PLANNED, 'Planned'),
        (DISPOSITION_CANCELLED, 'Cancelled'),
        (DISPOSITION_NOT_RUN, 'Not run'),
    ]

    date = models.DateField(db_index=True)
    time_start = models.TimeField()
    time_end = models.TimeField()
    crew_size = models.PositiveSmallIntegerField(choices=CREW_CHOICES, default=CREW_TWO)
    assigned_to = models.CharField(
        max_length=200,
        blank=True,
        default='',
        help_text='Legacy free-text crew assignment (names).',
    )
    notes = models.CharField(max_length=300, blank=True, default='')
    # Legacy bookable flag (serializer still exposes is_active).
    is_active = models.BooleanField(default=True)
    location = models.ForeignKey(
        'core.WorkLocation',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='delivery_days',
    )
    planning_disposition = models.CharField(
        max_length=20,
        choices=DISPOSITION_CHOICES,
        default=DISPOSITION_PLANNED,
        db_index=True,
    )
    primary_driver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_days_as_primary_driver',
    )
    test_dataset = models.ForeignKey(
        'pos.DeliveryTestDataset',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='days',
    )
    archived_at = models.DateTimeField(null=True, blank=True)
    archived_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_days_archived',
    )
    archive_reason = models.CharField(max_length=300, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'pos_deliveryavailability'
        ordering = ['date', 'time_start']
        verbose_name = 'delivery day'
        verbose_name_plural = 'delivery days'
        indexes = [
            models.Index(fields=['date', 'is_active']),
            models.Index(fields=['planning_disposition', 'date']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['date'],
                condition=models.Q(archived_at__isnull=True, location__isnull=True),
                name='pos_dday_unique_date_no_loc',
            ),
            models.UniqueConstraint(
                fields=['location', 'date'],
                condition=models.Q(archived_at__isnull=True, location__isnull=False),
                name='pos_dday_unique_loc_date',
            ),
        ]

    def __str__(self):
        return f'{self.date} {self.time_start:%H:%M}-{self.time_end:%H:%M} ({self.crew_size}p)'

    @property
    def is_bookable(self) -> bool:
        return bool(self.is_active) and self.planning_disposition == self.DISPOSITION_PLANNED and not self.archived_at


# Compatibility alias - prefer DeliveryDay in new code.
DeliveryAvailability = DeliveryDay


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

    # Canonical Day FK. Physical column remains availability_id; API may expose day.
    availability = models.ForeignKey(
        DeliveryDay,
        on_delete=models.PROTECT,
        related_name='jobs',
        null=True,
        blank=True,
        db_column='availability_id',
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
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_jobs_updated',
    )
    test_dataset = models.ForeignKey(
        'pos.DeliveryTestDataset',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='jobs',
    )
    archived_at = models.DateTimeField(null=True, blank=True)
    archived_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_jobs_archived',
    )
    archive_reason = models.CharField(max_length=300, blank=True, default='')
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

    @property
    def day(self):
        """Canonical alias for the planned DeliveryDay."""
        return self.availability

    @day.setter
    def day(self, value):
        self.availability = value

    @property
    def day_id(self):
        return self.availability_id

    @day_id.setter
    def day_id(self, value):
        self.availability_id = value


class DeliveryRun(models.Model):
    """Operational delivery day session for the driver wizard (not payroll)."""

    STATUS_PREPARING = 'preparing'
    STATUS_EN_ROUTE = 'en_route'
    STATUS_COMPLETED = 'completed'
    STATUS_CHOICES = [
        (STATUS_PREPARING, 'Preparing'),
        (STATUS_EN_ROUTE, 'En route'),
        (STATUS_COMPLETED, 'Completed'),
    ]

    # Phase 2 order: contact → load → truck close → route → drive → return.
    PHASE_START = 'start'
    PHASE_CALLS = 'calls'
    PHASE_LOAD = 'load'
    PHASE_TRUCK = 'truck'
    PHASE_ROUTE = 'route'
    PHASE_ACTIVE = 'active'
    PHASE_RETURN = 'return'
    # Legacy phases (mapped at runtime)
    PHASE_REVIEW = 'review'
    PHASE_CHOICES = [
        (PHASE_START, 'Start day'),
        (PHASE_CALLS, 'Customer calls'),
        (PHASE_LOAD, 'Load items'),
        (PHASE_TRUCK, 'Close truck'),
        (PHASE_ROUTE, 'Confirmed route'),
        (PHASE_ACTIVE, 'Driving'),
        (PHASE_RETURN, 'Return to store'),
        (PHASE_REVIEW, 'Legacy: review'),
    ]

    date = models.DateField(db_index=True)
    availability = models.ForeignKey(
        DeliveryDay,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='runs',
        db_column='availability_id',
    )
    is_canonical = models.BooleanField(default=True)
    superseded_by = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='supersedes',
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_PREPARING,
        db_index=True,
    )
    phase = models.CharField(
        max_length=20,
        choices=PHASE_CHOICES,
        default=PHASE_START,
    )
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    started_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_runs_started',
    )
    active_seconds = models.PositiveIntegerField(default=0)
    route_revision = models.PositiveIntegerField(default=0)
    last_optimized_at = models.DateTimeField(null=True, blank=True)
    maps_url = models.TextField(blank=True, default='')
    route_summary = models.JSONField(default=dict, blank=True)
    notes = models.TextField(blank=True, default='')
    returned_to_store_at = models.DateTimeField(null=True, blank=True)
    truck_closed_at = models.DateTimeField(null=True, blank=True)
    truck_closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_runs_truck_closed',
    )
    truck_reopened_at = models.DateTimeField(null=True, blank=True)
    truck_reopened_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_runs_truck_reopened',
    )
    departure_override = models.BooleanField(default=False)
    departure_override_reason = models.CharField(max_length=300, blank=True, default='')
    departure_override_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_runs_departure_overridden',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date', '-id']
        indexes = [
            models.Index(fields=['date', 'status']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['availability'],
                condition=models.Q(is_canonical=True, availability__isnull=False),
                name='pos_drun_one_canonical_per_day',
            ),
        ]

    def __str__(self):
        return f'DeliveryRun {self.date} ({self.status})'

    @property
    def day(self):
        return self.availability

    @day.setter
    def day(self, value):
        self.availability = value


class DeliveryRunStop(models.Model):
    """One customer stop within a delivery run, with persisted route order."""

    STATE_QUEUED = 'queued'
    STATE_NEXT_UP = 'next_up'
    STATE_ON_HOLD = 'on_hold'
    STATE_COMPLETED = 'completed'
    STATE_FAILED = 'failed'
    STATE_RESCHEDULED = 'rescheduled'
    STATE_CHOICES = [
        (STATE_QUEUED, 'Queued'),
        (STATE_NEXT_UP, 'Next up'),
        (STATE_ON_HOLD, 'On hold'),
        (STATE_COMPLETED, 'Completed'),
        (STATE_FAILED, 'Failed'),
        (STATE_RESCHEDULED, 'Rescheduled'),
    ]

    run = models.ForeignKey(DeliveryRun, on_delete=models.CASCADE, related_name='stops')
    job = models.ForeignKey(DeliveryJob, on_delete=models.PROTECT, related_name='run_stops')
    position = models.PositiveSmallIntegerField(default=0)
    state = models.CharField(
        max_length=20,
        choices=STATE_CHOICES,
        default=STATE_QUEUED,
        db_index=True,
    )
    loaded_at = models.DateTimeField(null=True, blank=True)
    secured_at = models.DateTimeField(null=True, blank=True)
    loaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_stops_loaded',
    )
    secured_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_stops_secured',
    )
    eta_arrive_at = models.DateTimeField(null=True, blank=True)
    eta_window_end_at = models.DateTimeField(null=True, blank=True)
    drive_seconds_from_prev = models.PositiveIntegerField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_stops_completed',
    )
    proof_override = models.BooleanField(default=False)
    proof_override_reason = models.CharField(max_length=300, blank=True, default='')
    proof_override_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_stops_proof_overridden',
    )
    hold_reason = models.CharField(max_length=300, blank=True, default='')
    # Optional load scan checks: [{line_id?, sku, description, verified_at}]
    scan_verified = models.JSONField(default=list, blank=True)

    DISPOSITION_AWAITING_REPLY = 'awaiting_reply'
    DISPOSITION_CONFIRMED = 'confirmed'
    DISPOSITION_RESCHEDULE_REQUESTED = 'reschedule_requested'
    DISPOSITION_CANCEL_REQUESTED = 'cancel_requested'
    DISPOSITION_NO_ANSWER = 'no_answer'
    DISPOSITION_VOICEMAIL = 'voicemail'
    DISPOSITION_WRONG_NUMBER = 'wrong_number'
    DISPOSITION_OTHER = 'other'
    DISPOSITION_CHOICES = [
        (DISPOSITION_AWAITING_REPLY, 'Awaiting reply'),
        (DISPOSITION_CONFIRMED, 'Confirmed'),
        (DISPOSITION_RESCHEDULE_REQUESTED, 'Reschedule requested'),
        (DISPOSITION_CANCEL_REQUESTED, 'Cancel requested'),
        (DISPOSITION_NO_ANSWER, 'No answer'),
        (DISPOSITION_VOICEMAIL, 'Voicemail'),
        (DISPOSITION_WRONG_NUMBER, 'Wrong number'),
        (DISPOSITION_OTHER, 'Other'),
    ]
    contact_disposition = models.CharField(
        max_length=40,
        choices=DISPOSITION_CHOICES,
        blank=True,
        default='',
        db_index=True,
    )
    contact_disposition_at = models.DateTimeField(null=True, blank=True)
    contact_disposition_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_stops_disposition_set',
    )
    excluded_unconfirmed_at = models.DateTimeField(null=True, blank=True)
    excluded_unconfirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_stops_excluded_unconfirmed',
    )
    excluded_unconfirmed_reason = models.CharField(max_length=300, blank=True, default='')

    contact_present_at = models.DateTimeField(null=True, blank=True)
    contact_present_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_stops_contact_present',
    )
    delivered_at = models.DateTimeField(null=True, blank=True)
    delivered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_stops_delivered',
    )
    returned_unloaded_at = models.DateTimeField(null=True, blank=True)
    returned_unloaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_stops_returned_unloaded',
    )
    returned_items_stored_at = models.DateTimeField(null=True, blank=True)
    returned_items_stored_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_stops_returned_stored',
    )
    return_issue_code = models.CharField(max_length=40, blank=True, default='')
    return_issue_notes = models.CharField(max_length=500, blank=True, default='')
    return_reconciled_at = models.DateTimeField(null=True, blank=True)
    return_reconciled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_stops_return_reconciled',
    )
    rescheduled_at = models.DateTimeField(null=True, blank=True)
    rescheduled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_stops_rescheduled',
    )
    rescheduled_to_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['position', 'id']
        unique_together = [('run', 'job')]
        indexes = [
            models.Index(fields=['run', 'state']),
            models.Index(fields=['run', 'position']),
        ]

    def __str__(self):
        return f'RunStop #{self.position} job={self.job_id} ({self.state})'


class DeliveryAddressRevision(models.Model):
    """Append-only address updates for a delivery job (sale address is preserved)."""

    job = models.ForeignKey(
        DeliveryJob,
        on_delete=models.CASCADE,
        related_name='address_revisions',
    )
    address = models.CharField(max_length=200)
    is_apt = models.BooleanField(default=False)
    unit = models.CharField(max_length=40, blank=True, default='')
    reason = models.CharField(max_length=300, blank=True, default='')
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_address_revisions',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']
        indexes = [
            models.Index(fields=['job', 'is_active']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['job'],
                condition=models.Q(is_active=True),
                name='pos_daddr_one_active_per_job',
            ),
        ]

    def __str__(self):
        return f'AddressRev job={self.job_id} active={self.is_active}'


class DeliveryCallAttempt(models.Model):
    """Timestamped customer call / text attempt for a run stop."""

    RESULT_ANSWERED_WILL_BE_THERE = 'answered_will_be_there'
    RESULT_ANSWERED_NOT_AVAILABLE = 'answered_not_available'
    RESULT_NO_ANSWER = 'no_answer'
    RESULT_VOICEMAIL_LEFT = 'voicemail_left'
    RESULT_TEXT_SENT = 'text_sent'
    RESULT_WRONG_NUMBER = 'wrong_number'
    RESULT_OTHER = 'other'
    RESULT_CHOICES = [
        (RESULT_ANSWERED_WILL_BE_THERE, 'Answered - will be there'),
        (RESULT_ANSWERED_NOT_AVAILABLE, 'Answered - not available'),
        (RESULT_NO_ANSWER, 'No answer'),
        (RESULT_VOICEMAIL_LEFT, 'Voicemail left'),
        (RESULT_TEXT_SENT, 'Text sent'),
        (RESULT_WRONG_NUMBER, 'Wrong number'),
        (RESULT_OTHER, 'Other'),
    ]

    CHANNEL_CALL = 'call'
    CHANNEL_TEXT = 'text'
    CHANNEL_CHOICES = [
        (CHANNEL_CALL, 'Call'),
        (CHANNEL_TEXT, 'Text'),
    ]
    ACTION_CALL_PLACED = 'call_placed'
    ACTION_COMPOSER_OPENED = 'composer_opened'
    ACTION_TEXT_MARKED_SENT = 'text_marked_sent'
    ACTION_CHOICES = [
        (ACTION_CALL_PLACED, 'Call placed'),
        (ACTION_COMPOSER_OPENED, 'Composer opened'),
        (ACTION_TEXT_MARKED_SENT, 'Text marked sent'),
    ]

    stop = models.ForeignKey(
        DeliveryRunStop,
        on_delete=models.CASCADE,
        related_name='call_attempts',
    )
    # Attempt channel/action are independent of customer disposition (result).
    channel = models.CharField(max_length=20, choices=CHANNEL_CHOICES, blank=True, default='')
    action = models.CharField(max_length=40, choices=ACTION_CHOICES, blank=True, default='')
    result = models.CharField(max_length=40, choices=RESULT_CHOICES, blank=True, default='')
    note = models.CharField(max_length=300, blank=True, default='')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_call_attempts',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']

    def __str__(self):
        return f'Call stop={self.stop_id} {self.result}'


class DeliveryAttachment(models.Model):
    """Photo or signature proof attached to a run or stop."""

    KIND_TRUCK = 'truck'
    KIND_LOAD_ITEM = 'load_item'
    KIND_DELIVERY_PROOF = 'delivery_proof'
    KIND_SIGNATURE = 'signature'
    KIND_ISSUE = 'issue'
    KIND_CHOICES = [
        (KIND_TRUCK, 'Truck photo'),
        (KIND_LOAD_ITEM, 'In-truck item photo'),
        (KIND_DELIVERY_PROOF, 'Delivery proof'),
        (KIND_SIGNATURE, 'Signature'),
        (KIND_ISSUE, 'Issue photo'),
    ]

    run = models.ForeignKey(
        DeliveryRun,
        on_delete=models.CASCADE,
        related_name='attachments',
    )
    stop = models.ForeignKey(
        DeliveryRunStop,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='attachments',
    )
    stop_item = models.ForeignKey(
        'pos.DeliveryRunStopItem',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='attachments',
    )
    s3_file = models.ForeignKey(
        'core.S3File',
        on_delete=models.CASCADE,
        related_name='delivery_attachments',
    )
    kind = models.CharField(max_length=20, choices=KIND_CHOICES)
    client_photo_id = models.UUIDField(null=True, blank=True, db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_attachments_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['run', 'kind']),
            models.Index(fields=['stop', 'kind']),
            models.Index(fields=['run', 'client_photo_id']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['run', 'client_photo_id'],
                condition=models.Q(client_photo_id__isnull=False),
                name='pos_datt_run_client_photo',
            ),
        ]

    def __str__(self):
        return f'{self.kind} run={self.run_id} stop={self.stop_id}'


class DeliveryRunEvent(models.Model):
    """Append-only audit log for a delivery run."""

    EVENT_CHOICES = [
        ('start', 'Start'),
        ('phase', 'Phase change'),
        ('load', 'Loaded'),
        ('secure', 'Secured'),
        ('photo', 'Photo'),
        ('call', 'Call'),
        ('route', 'Route'),
        ('reorder', 'Reorder'),
        ('hold', 'Hold'),
        ('release', 'Release'),
        ('address', 'Address revision'),
        ('contact', 'Contact present'),
        ('delivered', 'Items delivered'),
        ('complete', 'Complete stop'),
        ('override', 'Proof override'),
        ('return', 'Return reconcile'),
        ('finish', 'Finish run'),
        ('note', 'Note'),
        ('issue', 'Report issue'),
        ('reschedule', 'Reschedule job'),
        ('cancel', 'Cancel job'),
    ]

    run = models.ForeignKey(DeliveryRun, on_delete=models.CASCADE, related_name='events')
    stop = models.ForeignKey(
        DeliveryRunStop,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='events',
    )
    event_type = models.CharField(max_length=20, choices=EVENT_CHOICES)
    payload = models.JSONField(default=dict, blank=True)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_run_events',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']
        indexes = [
            models.Index(fields=['run', 'event_type']),
        ]

    def __str__(self):
        return f'{self.event_type} run={self.run_id}'


class DeliveryDayAssignment(models.Model):
    """Normalized crew assignment for a DeliveryDay."""

    ROLE_LEAD = 'lead'
    ROLE_HELPER = 'helper'
    ROLE_CHOICES = [
        (ROLE_LEAD, 'Lead'),
        (ROLE_HELPER, 'Helper'),
    ]

    day = models.ForeignKey(DeliveryDay, on_delete=models.CASCADE, related_name='assignments')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='delivery_day_assignments',
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=ROLE_HELPER)
    display_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['display_order', 'id']
        unique_together = [('day', 'user')]

    def __str__(self):
        return f'DayAssignment day={self.day_id} user={self.user_id} ({self.role})'


class DeliveryJobItem(models.Model):
    """Normalized delivery content for a job (planning truth)."""

    job = models.ForeignKey(DeliveryJob, on_delete=models.CASCADE, related_name='items')
    source_cart_line = models.ForeignKey(
        CartLine,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_job_items',
    )
    source_item = models.ForeignKey(
        'inventory.Item',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_job_items',
    )
    sku = models.CharField(max_length=64, blank=True, default='')
    description = models.CharField(max_length=300)
    quantity = models.PositiveSmallIntegerField(default=1)
    position = models.PositiveSmallIntegerField(default=0)
    is_scannable = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    removed_at = models.DateTimeField(null=True, blank=True)
    removed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_job_items_removed',
    )
    remove_reason = models.CharField(max_length=300, blank=True, default='')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_job_items_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['position', 'id']
        indexes = [
            models.Index(fields=['job', 'is_active', 'position']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['job', 'position'],
                condition=models.Q(is_active=True),
                name='pos_djitem_active_position',
            ),
            models.CheckConstraint(
                check=models.Q(quantity__gte=1),
                name='pos_djitem_qty_positive',
            ),
        ]

    def __str__(self):
        return f'JobItem job={self.job_id} {self.description} x{self.quantity}'


class DeliveryRunStopItem(models.Model):
    """Immutable execution snapshot of a job item on a run stop."""

    stop = models.ForeignKey(DeliveryRunStop, on_delete=models.CASCADE, related_name='stop_items')
    job_item = models.ForeignKey(
        DeliveryJobItem,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='stop_snapshots',
    )
    sku = models.CharField(max_length=64, blank=True, default='')
    description = models.CharField(max_length=300)
    quantity = models.PositiveSmallIntegerField(default=1)
    position = models.PositiveSmallIntegerField(default=0)
    is_scannable = models.BooleanField(default=False)
    source_cart_line_id_snapshot = models.IntegerField(null=True, blank=True)
    loaded_at = models.DateTimeField(null=True, blank=True)
    loaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_stop_items_loaded',
    )
    verification_skipped_at = models.DateTimeField(null=True, blank=True)
    verification_skipped_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_stop_items_verification_skipped',
    )
    verification_skip_reason = models.CharField(max_length=300, blank=True, default='')
    photo_exception_at = models.DateTimeField(null=True, blank=True)
    photo_exception_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_stop_items_photo_exception',
    )
    photo_exception_reason = models.CharField(max_length=300, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['position', 'id']
        indexes = [
            models.Index(fields=['stop', 'position']),
        ]

    def __str__(self):
        return f'StopItem stop={self.stop_id} {self.description} x{self.quantity}'


class DeliveryItemScan(models.Model):
    """Quantity-aware scan verification against a stop item."""

    stop_item = models.ForeignKey(
        DeliveryRunStopItem,
        on_delete=models.CASCADE,
        related_name='scans',
    )
    scanned_code = models.CharField(max_length=64)
    client_scan_id = models.UUIDField(null=True, blank=True, db_index=True)
    scanned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_item_scans',
    )
    scanned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['scanned_at', 'id']
        indexes = [
            models.Index(fields=['stop_item', 'scanned_at']),
        ]

    def __str__(self):
        return f'Scan stop_item={self.stop_item_id} {self.scanned_code}'


class DeliveryChangeEvent(models.Model):
    """Append-only audit for day/job/item changes (works before a run exists)."""

    ENTITY_DAY = 'day'
    ENTITY_JOB = 'job'
    ENTITY_ITEM = 'item'
    ENTITY_CHOICES = [
        (ENTITY_DAY, 'Day'),
        (ENTITY_JOB, 'Job'),
        (ENTITY_ITEM, 'Item'),
    ]

    entity_type = models.CharField(max_length=20, choices=ENTITY_CHOICES, db_index=True)
    entity_id = models.PositiveIntegerField(db_index=True)
    day = models.ForeignKey(
        DeliveryDay,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='change_events',
    )
    job = models.ForeignKey(
        DeliveryJob,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='change_events',
    )
    action = models.CharField(max_length=40, db_index=True)
    reason = models.CharField(max_length=300, blank=True, default='')
    before = models.JSONField(default=dict, blank=True)
    after = models.JSONField(default=dict, blank=True)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_change_events',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']
        indexes = [
            models.Index(fields=['entity_type', 'entity_id']),
            models.Index(fields=['action', 'created_at']),
        ]

    def __str__(self):
        return f'{self.action} {self.entity_type}={self.entity_id}'


class DeliveryTestDataset(models.Model):
    """Named/versioned ownership record for production-safe delivery test data."""

    STATUS_ACTIVE = 'active'
    STATUS_RESETTING = 'resetting'
    STATUS_RESET = 'reset'
    STATUS_RESET_FAILED = 'reset_failed'
    STATUS_CHOICES = [
        (STATUS_ACTIVE, 'Active'),
        (STATUS_RESETTING, 'Resetting'),
        (STATUS_RESET, 'Reset'),
        (STATUS_RESET_FAILED, 'Reset failed'),
    ]

    key = models.CharField(max_length=80, db_index=True)
    generation = models.PositiveIntegerField(default=1)
    scenario_version = models.CharField(max_length=40, default='1')
    target_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
    summary = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_test_datasets_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    reset_at = models.DateTimeField(null=True, blank=True)
    reset_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_test_datasets_reset',
    )
    reset_error = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-created_at', '-id']
        unique_together = [('key', 'generation')]
        indexes = [
            models.Index(fields=['key', 'status']),
        ]

    def __str__(self):
        return f'TestDataset {self.key} gen={self.generation} ({self.status})'


class DeliveryTestArtifact(models.Model):
    """Exact owned artifact ledger for dataset reset (DB rows + storage keys)."""

    ARTIFACT_DAY = 'day'
    ARTIFACT_JOB = 'job'
    ARTIFACT_RUN = 'run'
    ARTIFACT_CART = 'cart'
    ARTIFACT_CART_LINE = 'cart_line'
    ARTIFACT_RECEIPT = 'receipt'
    ARTIFACT_S3_KEY = 's3_key'
    ARTIFACT_ATTACHMENT = 'attachment'
    ARTIFACT_CHOICES = [
        (ARTIFACT_DAY, 'Day'),
        (ARTIFACT_JOB, 'Job'),
        (ARTIFACT_RUN, 'Run'),
        (ARTIFACT_CART, 'Cart'),
        (ARTIFACT_CART_LINE, 'Cart line'),
        (ARTIFACT_RECEIPT, 'Receipt'),
        (ARTIFACT_S3_KEY, 'S3 key'),
        (ARTIFACT_ATTACHMENT, 'Attachment'),
    ]

    dataset = models.ForeignKey(
        DeliveryTestDataset,
        on_delete=models.CASCADE,
        related_name='artifacts',
    )
    artifact_type = models.CharField(max_length=20, choices=ARTIFACT_CHOICES)
    object_id = models.PositiveIntegerField(null=True, blank=True)
    storage_key = models.CharField(max_length=500, blank=True, default='')
    meta = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['id']
        indexes = [
            models.Index(fields=['dataset', 'artifact_type']),
        ]

    def __str__(self):
        return f'Artifact {self.artifact_type} dataset={self.dataset_id}'


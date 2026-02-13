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

    def __str__(self):
        return f'Cart #{self.id} - {self.status}'

    def recalculate(self):
        """Recalculate subtotal, tax, and total from lines."""
        lines = self.lines.all()
        self.subtotal = sum(line.line_total for line in lines)
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

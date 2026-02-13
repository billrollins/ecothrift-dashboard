from django.conf import settings
from django.db import models
from decimal import Decimal


class ConsignmentAgreement(models.Model):
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('paused', 'Paused'),
        ('closed', 'Closed'),
    ]

    consignee = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='agreements',
    )
    agreement_number = models.CharField(max_length=20, unique=True)
    commission_rate = models.DecimalField(
        max_digits=5, decimal_places=2, default=40.00,
        help_text="Store's cut as %, e.g. 40.00 means store keeps 40%",
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    terms = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.agreement_number} - {self.consignee.full_name}'

    @staticmethod
    def generate_agreement_number():
        last = ConsignmentAgreement.objects.order_by('-id').first()
        if last:
            try:
                num = int(last.agreement_number.split('-')[1]) + 1
            except (IndexError, ValueError):
                num = ConsignmentAgreement.objects.count() + 1
        else:
            num = 1
        return f'AGR-{num:03d}'


class ConsignmentItem(models.Model):
    STATUS_CHOICES = [
        ('pending_intake', 'Pending Intake'),
        ('listed', 'Listed'),
        ('sold', 'Sold'),
        ('expired', 'Expired'),
        ('returned', 'Returned'),
    ]

    agreement = models.ForeignKey(
        ConsignmentAgreement, on_delete=models.CASCADE, related_name='items',
    )
    item = models.OneToOneField(
        'inventory.Item', on_delete=models.CASCADE, related_name='consignment',
    )
    asking_price = models.DecimalField(max_digits=10, decimal_places=2)
    listed_price = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending_intake')
    received_at = models.DateTimeField()
    listed_at = models.DateTimeField(null=True, blank=True)
    sold_at = models.DateTimeField(null=True, blank=True)
    sale_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    store_commission = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    consignee_earnings = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    return_date = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-received_at']

    def __str__(self):
        return f'{self.item.sku} ({self.agreement.agreement_number})'


class ConsignmentPayout(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('paid', 'Paid'),
    ]
    PAYMENT_METHODS = [
        ('cash', 'Cash'),
        ('check', 'Check'),
        ('store_credit', 'Store Credit'),
    ]

    consignee = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='payouts',
    )
    payout_number = models.CharField(max_length=20, unique=True)
    period_start = models.DateField()
    period_end = models.DateField()
    items_sold = models.IntegerField(default=0)
    total_sales = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_commission = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    payout_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    paid_at = models.DateTimeField(null=True, blank=True)
    paid_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='paid_payouts',
    )
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHODS, default='cash')
    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.payout_number} - {self.consignee.full_name}'

    @staticmethod
    def generate_payout_number():
        last = ConsignmentPayout.objects.order_by('-id').first()
        if last:
            try:
                num = int(last.payout_number.split('-')[1]) + 1
            except (IndexError, ValueError):
                num = ConsignmentPayout.objects.count() + 1
        else:
            num = 1
        return f'PAY-{num:03d}'

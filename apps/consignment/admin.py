from django.contrib import admin
from .models import ConsignmentAgreement, ConsignmentItem, ConsignmentPayout


@admin.register(ConsignmentAgreement)
class ConsignmentAgreementAdmin(admin.ModelAdmin):
    list_display = ('agreement_number', 'consignee', 'commission_rate', 'status', 'start_date')
    list_filter = ('status',)
    search_fields = ('agreement_number', 'consignee__email')


@admin.register(ConsignmentItem)
class ConsignmentItemAdmin(admin.ModelAdmin):
    list_display = ('item', 'agreement', 'status', 'listed_price', 'sale_amount')
    list_filter = ('status',)


@admin.register(ConsignmentPayout)
class ConsignmentPayoutAdmin(admin.ModelAdmin):
    list_display = ('payout_number', 'consignee', 'payout_amount', 'status', 'created_at')
    list_filter = ('status',)

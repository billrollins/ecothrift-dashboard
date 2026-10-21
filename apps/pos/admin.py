from django.contrib import admin
from .models import (
    Register, Drawer, DrawerHandoff, CashDrop,
    SupplementalDrawer, SupplementalTransaction, BankTransaction,
    Cart, CartLine, Receipt, RevenueGoal,
    DeliveryDay, DeliveryJob, DeliveryTestDataset, RegisterApproval, RegisterEvent,
)


@admin.register(RegisterEvent)
class RegisterEventAdmin(admin.ModelAdmin):
    """Drawer opens (no sale), reprints and failed prints at the register: read only, never edited."""
    list_display = ('created_at', 'kind', 'register_code', 'user', 'cart', 'note')
    list_filter = ('kind', 'register_code')

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(RegisterApproval)
class RegisterApprovalAdmin(admin.ModelAdmin):
    """Manager OKs at the register (price edits, big discounts, voids): read only, never edited."""
    list_display = ('created_at', 'kind', 'register_code', 'requested_by', 'approved_by', 'reason', 'cart')
    list_filter = ('kind', 'is_training')

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Register)
class RegisterAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'location', 'starting_cash', 'is_active')


@admin.register(Drawer)
class DrawerAdmin(admin.ModelAdmin):
    list_display = ('register', 'date', 'status', 'current_cashier', 'opening_total')
    list_filter = ('status', 'date')


@admin.register(DrawerHandoff)
class DrawerHandoffAdmin(admin.ModelAdmin):
    list_display = ('drawer', 'outgoing_cashier', 'incoming_cashier', 'counted_at')


@admin.register(CashDrop)
class CashDropAdmin(admin.ModelAdmin):
    list_display = ('drawer', 'total', 'dropped_by', 'dropped_at')


@admin.register(SupplementalDrawer)
class SupplementalDrawerAdmin(admin.ModelAdmin):
    list_display = ('location', 'current_total', 'last_counted_at')


@admin.register(SupplementalTransaction)
class SupplementalTransactionAdmin(admin.ModelAdmin):
    list_display = ('transaction_type', 'total', 'performed_by', 'performed_at')


@admin.register(BankTransaction)
class BankTransactionAdmin(admin.ModelAdmin):
    list_display = ('transaction_type', 'total', 'status', 'created_at')


@admin.register(Cart)
class CartAdmin(admin.ModelAdmin):
    list_display = ('id', 'cashier', 'status', 'total', 'payment_method', 'card_type', 'created_at')
    list_filter = ('status', 'payment_method', 'card_type')


@admin.register(CartLine)
class CartLineAdmin(admin.ModelAdmin):
    list_display = (
        'cart', 'description', 'quantity', 'unit_price', 'line_total',
        'resale_source_sku', 'resale_source_item_id',
    )
    list_filter = ('cart__status',)


@admin.register(Receipt)
class ReceiptAdmin(admin.ModelAdmin):
    list_display = ('receipt_number', 'cart', 'printed', 'created_at')
    search_fields = ('receipt_number',)


@admin.register(RevenueGoal)
class RevenueGoalAdmin(admin.ModelAdmin):
    list_display = ('location', 'date', 'goal_amount')


@admin.register(DeliveryDay)
class DeliveryDayAdmin(admin.ModelAdmin):
    list_display = (
        'date', 'time_start', 'time_end', 'crew_size', 'assigned_to',
        'planning_disposition', 'is_active',
    )
    list_filter = ('is_active', 'planning_disposition', 'crew_size', 'date')


@admin.register(DeliveryTestDataset)
class DeliveryTestDatasetAdmin(admin.ModelAdmin):
    list_display = ('key', 'generation', 'status', 'target_date', 'created_at')
    list_filter = ('status',)


@admin.register(DeliveryJob)
class DeliveryJobAdmin(admin.ModelAdmin):
    list_display = (
        'scheduled_date', 'customer_name', 'items_delivered', 'status', 'tier', 'fee',
    )
    list_filter = ('status', 'scheduled_date', 'tier')
    search_fields = ('customer_name', 'phone', 'address', 'items_delivered')

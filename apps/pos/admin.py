from django.contrib import admin
from .models import (
    Register, Drawer, DrawerHandoff, CashDrop,
    SupplementalDrawer, SupplementalTransaction, BankTransaction,
    Cart, CartLine, Receipt, RevenueGoal,
)


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
    list_display = ('id', 'cashier', 'status', 'total', 'payment_method', 'created_at')
    list_filter = ('status', 'payment_method')


@admin.register(CartLine)
class CartLineAdmin(admin.ModelAdmin):
    list_display = ('cart', 'description', 'quantity', 'unit_price', 'line_total')


@admin.register(Receipt)
class ReceiptAdmin(admin.ModelAdmin):
    list_display = ('receipt_number', 'cart', 'printed', 'created_at')
    search_fields = ('receipt_number',)


@admin.register(RevenueGoal)
class RevenueGoalAdmin(admin.ModelAdmin):
    list_display = ('location', 'date', 'goal_amount')

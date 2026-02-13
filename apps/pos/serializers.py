from rest_framework import serializers
from .models import (
    Register, Drawer, DrawerHandoff, CashDrop,
    SupplementalDrawer, SupplementalTransaction, BankTransaction,
    Cart, CartLine, Receipt, RevenueGoal,
)


class RegisterSerializer(serializers.ModelSerializer):
    location_name = serializers.CharField(source='location.name', read_only=True)

    class Meta:
        model = Register
        fields = [
            'id', 'location', 'location_name', 'name', 'code',
            'starting_cash', 'starting_breakdown', 'is_active',
        ]
        read_only_fields = ['id']


class DrawerHandoffSerializer(serializers.ModelSerializer):
    outgoing_cashier_name = serializers.CharField(
        source='outgoing_cashier.full_name', read_only=True, default=None,
    )
    incoming_cashier_name = serializers.CharField(
        source='incoming_cashier.full_name', read_only=True, default=None,
    )

    class Meta:
        model = DrawerHandoff
        fields = [
            'id', 'drawer', 'outgoing_cashier', 'outgoing_cashier_name',
            'incoming_cashier', 'incoming_cashier_name',
            'counted_at', 'count', 'counted_total', 'expected_total',
            'variance', 'notes',
        ]
        read_only_fields = ['id']


class CashDropSerializer(serializers.ModelSerializer):
    dropped_by_name = serializers.CharField(source='dropped_by.full_name', read_only=True, default=None)

    class Meta:
        model = CashDrop
        fields = [
            'id', 'drawer', 'amount', 'total',
            'dropped_by', 'dropped_by_name', 'dropped_at', 'notes',
        ]
        read_only_fields = ['id', 'dropped_at']


class DrawerSerializer(serializers.ModelSerializer):
    register_name = serializers.CharField(source='register.name', read_only=True)
    register_code = serializers.CharField(source='register.code', read_only=True)
    current_cashier_name = serializers.CharField(
        source='current_cashier.full_name', read_only=True, default=None,
    )
    opened_by_name = serializers.CharField(source='opened_by.full_name', read_only=True, default=None)
    closed_by_name = serializers.CharField(source='closed_by.full_name', read_only=True, default=None)
    handoffs = DrawerHandoffSerializer(many=True, read_only=True)
    drops = CashDropSerializer(many=True, read_only=True)

    class Meta:
        model = Drawer
        fields = [
            'id', 'register', 'register_name', 'register_code', 'date', 'status',
            'current_cashier', 'current_cashier_name',
            'opened_by', 'opened_by_name', 'opened_at',
            'opening_count', 'opening_total',
            'closed_by', 'closed_by_name', 'closed_at',
            'closing_count', 'closing_total',
            'cash_sales_total', 'expected_cash', 'variance',
            'handoffs', 'drops',
        ]
        read_only_fields = ['id']


class SupplementalDrawerSerializer(serializers.ModelSerializer):
    location_name = serializers.CharField(source='location.name', read_only=True)
    last_counted_by_name = serializers.CharField(
        source='last_counted_by.full_name', read_only=True, default=None,
    )

    class Meta:
        model = SupplementalDrawer
        fields = [
            'id', 'location', 'location_name', 'current_balance',
            'current_total', 'last_counted_by', 'last_counted_by_name',
            'last_counted_at',
        ]
        read_only_fields = ['id']


class SupplementalTransactionSerializer(serializers.ModelSerializer):
    performed_by_name = serializers.CharField(
        source='performed_by.full_name', read_only=True, default=None,
    )

    class Meta:
        model = SupplementalTransaction
        fields = [
            'id', 'supplemental', 'transaction_type', 'amount', 'total',
            'related_drawer', 'performed_by', 'performed_by_name',
            'performed_at', 'notes',
        ]
        read_only_fields = ['id', 'performed_at']


class BankTransactionSerializer(serializers.ModelSerializer):
    performed_by_name = serializers.CharField(
        source='performed_by.full_name', read_only=True, default=None,
    )

    class Meta:
        model = BankTransaction
        fields = [
            'id', 'location', 'transaction_type', 'amount', 'total',
            'status', 'performed_by', 'performed_by_name',
            'created_at', 'completed_at', 'notes',
        ]
        read_only_fields = ['id', 'created_at']


class CartLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = CartLine
        fields = [
            'id', 'cart', 'item', 'description',
            'quantity', 'unit_price', 'line_total', 'created_at',
        ]
        read_only_fields = ['id', 'line_total', 'created_at']


class ReceiptSerializer(serializers.ModelSerializer):
    class Meta:
        model = Receipt
        fields = ['id', 'cart', 'receipt_number', 'printed', 'emailed', 'created_at']
        read_only_fields = ['id', 'receipt_number', 'created_at']


class CartSerializer(serializers.ModelSerializer):
    cashier_name = serializers.CharField(source='cashier.full_name', read_only=True, default=None)
    lines = CartLineSerializer(many=True, read_only=True)
    receipt = ReceiptSerializer(read_only=True)

    class Meta:
        model = Cart
        fields = [
            'id', 'drawer', 'cashier', 'cashier_name', 'customer',
            'status', 'subtotal', 'tax_rate', 'tax_amount', 'total',
            'payment_method', 'cash_tendered', 'change_given', 'card_amount',
            'completed_at', 'created_at',
            'lines', 'receipt',
        ]
        read_only_fields = [
            'id', 'subtotal', 'tax_amount', 'total', 'created_at',
        ]


class RevenueGoalSerializer(serializers.ModelSerializer):
    class Meta:
        model = RevenueGoal
        fields = '__all__'
        read_only_fields = ['id']

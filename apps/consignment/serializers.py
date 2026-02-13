from rest_framework import serializers
from .models import ConsignmentAgreement, ConsignmentItem, ConsignmentPayout


class ConsignmentAgreementSerializer(serializers.ModelSerializer):
    consignee_name = serializers.CharField(source='consignee.full_name', read_only=True)

    class Meta:
        model = ConsignmentAgreement
        fields = [
            'id', 'consignee', 'consignee_name', 'agreement_number',
            'commission_rate', 'status', 'start_date', 'end_date',
            'terms', 'created_at',
        ]
        read_only_fields = ['id', 'agreement_number', 'created_at']


class ConsignmentItemSerializer(serializers.ModelSerializer):
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    item_title = serializers.CharField(source='item.title', read_only=True)
    agreement_number = serializers.CharField(source='agreement.agreement_number', read_only=True)
    consignee_name = serializers.CharField(source='agreement.consignee.full_name', read_only=True)

    class Meta:
        model = ConsignmentItem
        fields = [
            'id', 'agreement', 'agreement_number', 'consignee_name',
            'item', 'item_sku', 'item_title',
            'asking_price', 'listed_price', 'status',
            'received_at', 'listed_at', 'sold_at',
            'sale_amount', 'store_commission', 'consignee_earnings',
            'return_date', 'notes',
        ]
        read_only_fields = ['id', 'sale_amount', 'store_commission', 'consignee_earnings']


class ConsignmentPayoutSerializer(serializers.ModelSerializer):
    consignee_name = serializers.CharField(source='consignee.full_name', read_only=True)
    paid_by_name = serializers.CharField(source='paid_by.full_name', read_only=True, default=None)

    class Meta:
        model = ConsignmentPayout
        fields = [
            'id', 'consignee', 'consignee_name', 'payout_number',
            'period_start', 'period_end', 'items_sold',
            'total_sales', 'total_commission', 'payout_amount',
            'status', 'paid_at', 'paid_by', 'paid_by_name',
            'payment_method', 'notes', 'created_at',
        ]
        read_only_fields = [
            'id', 'payout_number', 'items_sold', 'total_sales',
            'total_commission', 'payout_amount', 'created_at',
        ]


# ── Consignee Portal Serializers ──────────────────────────────────────────────

class MyConsignmentItemSerializer(serializers.ModelSerializer):
    """Consignee's view of their items."""
    sku = serializers.CharField(source='item.sku', read_only=True)
    title = serializers.CharField(source='item.title', read_only=True)
    price = serializers.DecimalField(
        source='item.price', max_digits=10, decimal_places=2, read_only=True,
    )

    class Meta:
        model = ConsignmentItem
        fields = [
            'id', 'sku', 'title', 'price', 'asking_price', 'listed_price',
            'status', 'received_at', 'listed_at', 'sold_at',
            'sale_amount', 'consignee_earnings',
        ]


class MyConsignmentPayoutSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConsignmentPayout
        fields = [
            'id', 'payout_number', 'period_start', 'period_end',
            'items_sold', 'total_sales', 'payout_amount',
            'status', 'paid_at', 'payment_method',
        ]

from django_filters import rest_framework as filters
from .models import Cart, Drawer


class DrawerFilter(filters.FilterSet):
    """NumberFilter for register avoids ModelChoice validation that returns 400 for stale IDs."""

    register = filters.NumberFilter(field_name='register_id')
    date = filters.DateFilter()
    status = filters.CharFilter()

    class Meta:
        model = Drawer
        fields = ['register', 'date', 'status']


class CartFilter(filters.FilterSet):
    receipt_number = filters.CharFilter(field_name='receipt__receipt_number', lookup_expr='icontains')
    date_from = filters.DateFilter(field_name='completed_at', lookup_expr='date__gte')
    date_to = filters.DateFilter(field_name='completed_at', lookup_expr='date__lte')

    def filter_status(self, qs, name, value):
        if value == 'all':
            return qs.filter(status__in=['completed', 'voided'])
        if value in ('completed', 'voided', 'open', 'suspended'):
            return qs.filter(status=value)
        return qs

    status = filters.CharFilter(method='filter_status')

    def filter_search(self, qs, name, value):
        """The Transactions search box: a receipt number or a Thrift+ member's name (first, last, or both)."""
        from django.db.models import Q, Value
        from django.db.models.functions import Concat
        value = (value or '').strip()
        if not value:
            return qs
        return qs.annotate(
            _tp_name=Concat('thrift_member__person__first_name', Value(' '), 'thrift_member__person__last_name'),
        ).filter(Q(receipt__receipt_number__icontains=value) | Q(_tp_name__icontains=value))

    q = filters.CharFilter(method='filter_search')

    class Meta:
        model = Cart
        fields = [
            'drawer', 'cashier', 'payment_method', 'card_type',
            'receipt_number', 'date_from', 'date_to', 'status', 'q',
        ]

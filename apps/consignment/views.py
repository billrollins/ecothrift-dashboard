from decimal import Decimal
from django.db.models import Sum, Count, Q
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes as perm_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import OrderingFilter

from apps.accounts.permissions import IsManagerOrAdmin, IsConsignee, IsStaff
from .models import ConsignmentAgreement, ConsignmentItem, ConsignmentPayout
from .serializers import (
    ConsignmentAgreementSerializer, ConsignmentItemSerializer,
    ConsignmentPayoutSerializer,
    MyConsignmentItemSerializer, MyConsignmentPayoutSerializer,
)


class ConsignmentAgreementViewSet(viewsets.ModelViewSet):
    serializer_class = ConsignmentAgreementSerializer
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['consignee', 'status']
    ordering = ['-created_at']

    def get_queryset(self):
        return ConsignmentAgreement.objects.select_related('consignee').all()

    def perform_create(self, serializer):
        serializer.save(
            agreement_number=ConsignmentAgreement.generate_agreement_number(),
        )


class ConsignmentItemViewSet(viewsets.ModelViewSet):
    serializer_class = ConsignmentItemSerializer
    permission_classes = [IsAuthenticated, IsStaff]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['agreement', 'agreement__consignee', 'status']
    ordering = ['-received_at']

    def get_queryset(self):
        return ConsignmentItem.objects.select_related(
            'agreement', 'agreement__consignee', 'item',
        ).all()


class ConsignmentPayoutViewSet(viewsets.ModelViewSet):
    serializer_class = ConsignmentPayoutSerializer
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['consignee', 'status']
    ordering = ['-created_at']

    def get_queryset(self):
        return ConsignmentPayout.objects.select_related('consignee', 'paid_by').all()

    @action(detail=False, methods=['post'])
    def generate(self, request):
        """Generate a payout for a consignee for a date range."""
        consignee_id = request.data.get('consignee')
        period_start = request.data.get('period_start')
        period_end = request.data.get('period_end')

        if not all([consignee_id, period_start, period_end]):
            return Response(
                {'detail': 'consignee, period_start, and period_end are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Find sold items in the period that haven't been paid out
        sold_items = ConsignmentItem.objects.filter(
            agreement__consignee_id=consignee_id,
            status='sold',
            sold_at__date__gte=period_start,
            sold_at__date__lte=period_end,
            sale_amount__isnull=False,
        )

        # Calculate totals
        items_count = sold_items.count()
        if items_count == 0:
            return Response(
                {'detail': 'No sold items found for this period.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        agg = sold_items.aggregate(
            total_sales=Sum('sale_amount'),
            total_commission=Sum('store_commission'),
            total_earnings=Sum('consignee_earnings'),
        )

        payout = ConsignmentPayout.objects.create(
            consignee_id=consignee_id,
            payout_number=ConsignmentPayout.generate_payout_number(),
            period_start=period_start,
            period_end=period_end,
            items_sold=items_count,
            total_sales=agg['total_sales'] or 0,
            total_commission=agg['total_commission'] or 0,
            payout_amount=agg['total_earnings'] or 0,
        )

        return Response(ConsignmentPayoutSerializer(payout).data, status=201)

    @action(detail=True, methods=['patch'])
    def pay(self, request, pk=None):
        """Mark a payout as paid."""
        payout = self.get_object()
        payout.status = 'paid'
        payout.paid_at = timezone.now()
        payout.paid_by = request.user
        payout.payment_method = request.data.get('payment_method', payout.payment_method)
        payout.notes = request.data.get('notes', payout.notes)
        payout.save()
        return Response(ConsignmentPayoutSerializer(payout).data)


# ── Consignee Portal Endpoints ────────────────────────────────────────────────

@api_view(['GET'])
@perm_classes([IsAuthenticated, IsConsignee])
def my_items(request):
    """Consignee: view their items."""
    items = ConsignmentItem.objects.filter(
        agreement__consignee=request.user,
    ).select_related('item').order_by('-received_at')
    return Response(MyConsignmentItemSerializer(items, many=True).data)


@api_view(['GET'])
@perm_classes([IsAuthenticated, IsConsignee])
def my_payouts(request):
    """Consignee: view their payouts."""
    payouts = ConsignmentPayout.objects.filter(
        consignee=request.user,
    ).order_by('-created_at')
    return Response(MyConsignmentPayoutSerializer(payouts, many=True).data)


@api_view(['GET'])
@perm_classes([IsAuthenticated, IsConsignee])
def my_summary(request):
    """Consignee: summary stats."""
    items = ConsignmentItem.objects.filter(agreement__consignee=request.user)
    total_items = items.count()
    listed_count = items.filter(status='listed').count()
    sold_items = items.filter(status='sold')
    total_earned = sold_items.aggregate(
        total=Sum('consignee_earnings'),
    )['total'] or Decimal('0')

    # Pending balance (sold but not yet paid out)
    paid_payout_amounts = ConsignmentPayout.objects.filter(
        consignee=request.user, status='paid',
    ).aggregate(total=Sum('payout_amount'))['total'] or Decimal('0')

    pending_balance = total_earned - paid_payout_amounts

    return Response({
        'total_items': total_items,
        'listed_count': listed_count,
        'sold_count': sold_items.count(),
        'total_earned': str(total_earned),
        'pending_balance': str(pending_balance),
    })

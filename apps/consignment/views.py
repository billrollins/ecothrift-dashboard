from decimal import Decimal
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db.models import Sum, Count, Q
from django.utils import timezone
from rest_framework import serializers, viewsets, status
from rest_framework.decorators import action, api_view, permission_classes as perm_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend

from apps.accounts.models import ConsigneeProfile
from apps.accounts.permissions import IsManagerOrAdmin, IsConsignee, IsStaff
from .models import ConsignmentAgreement, ConsignmentItem, ConsignmentPayout
from .serializers import (
    ConsignmentAgreementSerializer, ConsignmentItemSerializer,
    ConsignmentPayoutSerializer,
    MyConsignmentItemSerializer, MyConsignmentPayoutSerializer,
)

User = get_user_model()


# ── Consignee Account Management ──────────────────────────────────────────────

DEFAULT_COMMISSION_RATE = '40.00'

class ConsigneeAccountSerializer(serializers.Serializer):
    """Flat serializer for consignee account list/detail."""
    id = serializers.IntegerField(source='user.id', read_only=True)
    email = serializers.EmailField(source='user.email', required=False, default='')
    first_name = serializers.CharField(source='user.first_name', required=False, default='')
    last_name = serializers.CharField(source='user.last_name', required=False, default='')
    phone = serializers.CharField(source='user.phone', required=False, default='')
    full_name = serializers.CharField(source='user.full_name', read_only=True)
    consignee_number = serializers.CharField(read_only=True)
    commission_rate = serializers.DecimalField(max_digits=5, decimal_places=2, required=False)
    payout_method = serializers.ChoiceField(
        choices=['cash', 'check', 'store_credit'], required=False, default='cash',
    )
    status = serializers.ChoiceField(
        choices=['active', 'paused', 'closed'], required=False, default='active',
    )
    join_date = serializers.DateField(read_only=True)
    notes = serializers.CharField(required=False, default='')
    # For linking to existing user
    user_id = serializers.IntegerField(write_only=True, required=False)

    def create(self, validated_data):
        user_id = validated_data.pop('user_id', None)
        user_data = validated_data.pop('user', {})

        if user_id:
            # Attach ConsigneeProfile to existing user
            try:
                user = User.objects.get(id=user_id)
            except User.DoesNotExist:
                raise serializers.ValidationError({'user_id': 'User not found.'})
            if hasattr(user, 'consignee'):
                raise serializers.ValidationError({'user_id': 'User is already a consignee.'})
        else:
            # Create new user
            email = user_data.get('email', '')
            if not email:
                raise serializers.ValidationError({'email': 'Email is required for new users.'})
            first_name = user_data.get('first_name', '')
            last_name = user_data.get('last_name', '')
            if not first_name or not last_name:
                raise serializers.ValidationError(
                    {'first_name': 'First and last name are required for new users.'}
                )
            user = User.objects.create_user(
                email=email,
                first_name=first_name,
                last_name=last_name,
                phone=user_data.get('phone', ''),
                password=None,
                is_active=True,
                is_staff=False,
            )

        # Add Consignee group WITHOUT removing existing groups
        consignee_group, _ = Group.objects.get_or_create(name='Consignee')
        user.groups.add(consignee_group)

        profile = ConsigneeProfile.objects.create(
            user=user,
            consignee_number=ConsigneeProfile.generate_consignee_number(),
            commission_rate=validated_data.get('commission_rate', DEFAULT_COMMISSION_RATE),
            payout_method=validated_data.get('payout_method', 'cash'),
            notes=validated_data.get('notes', ''),
        )
        return profile

    def update(self, instance, validated_data):
        validated_data.pop('user_id', None)
        user_data = validated_data.pop('user', {})
        user = instance.user
        for attr in ('email', 'first_name', 'last_name', 'phone'):
            if attr in user_data:
                setattr(user, attr, user_data[attr])
        user.save()
        for attr in ('commission_rate', 'payout_method', 'notes', 'status'):
            if attr in validated_data:
                setattr(instance, attr, validated_data[attr])
        instance.save()
        return instance


class ConsigneeAccountViewSet(viewsets.ModelViewSet):
    """
    Consignee account management (Manager/Admin).
    Each consignee is a User + ConsigneeProfile.
    Lookup by user ID (since the serializer exposes user.id as the primary `id`).
    """
    serializer_class = ConsigneeAccountSerializer
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = [
        'user__first_name', 'user__last_name', 'user__email',
        'user__phone', 'consignee_number',
    ]
    ordering = ['consignee_number']
    lookup_field = 'user__id'
    lookup_url_kwarg = 'pk'

    def get_queryset(self):
        return ConsigneeProfile.objects.select_related('user').all()

    def perform_destroy(self, instance):
        """Soft-delete: set status to closed instead of removing."""
        instance.status = 'closed'
        instance.save(update_fields=['status'])


# ── Consignment Agreement / Item / Payout ViewSets ───────────────────────────

class ConsignmentAgreementViewSet(viewsets.ModelViewSet):
    serializer_class = ConsignmentAgreementSerializer
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['consignee', 'status']
    ordering = ['-created_at']

    def get_queryset(self):
        return ConsignmentAgreement.objects.select_related('consignee').all()

    def perform_create(self, serializer):
        defaults = {
            'agreement_number': ConsignmentAgreement.generate_agreement_number(),
        }
        # Default start_date to today if not provided
        if not serializer.validated_data.get('start_date'):
            defaults['start_date'] = timezone.now().date()
        # Default commission_rate from consignee's profile if not provided
        if not serializer.validated_data.get('commission_rate'):
            consignee = serializer.validated_data.get('consignee')
            if consignee and hasattr(consignee, 'consignee'):
                defaults['commission_rate'] = consignee.consignee.commission_rate
            else:
                defaults['commission_rate'] = DEFAULT_COMMISSION_RATE
        # Default terms if not provided
        if not serializer.validated_data.get('terms'):
            defaults['terms'] = (
                'Standard consignment terms: Store retains commission as specified. '
                'Unsold items may be returned after 90 days. '
                'Consignee is responsible for pricing accuracy. '
                'Payout processed per store schedule.'
            )
        serializer.save(**defaults)


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

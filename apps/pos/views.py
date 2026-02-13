from decimal import Decimal
from django.db.models import Sum, Q, Count
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes as perm_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import OrderingFilter

from apps.accounts.permissions import IsManagerOrAdmin, IsStaff, IsEmployee
from apps.inventory.models import Item
from .models import (
    Register, Drawer, DrawerHandoff, CashDrop,
    SupplementalDrawer, SupplementalTransaction, BankTransaction,
    Cart, CartLine, Receipt, RevenueGoal,
)
from .serializers import (
    RegisterSerializer, DrawerSerializer,
    DrawerHandoffSerializer, CashDropSerializer,
    SupplementalDrawerSerializer, SupplementalTransactionSerializer,
    BankTransactionSerializer,
    CartSerializer, CartLineSerializer, ReceiptSerializer,
    RevenueGoalSerializer,
)


class RegisterViewSet(viewsets.ModelViewSet):
    queryset = Register.objects.select_related('location').all()
    serializer_class = RegisterSerializer
    permission_classes = [IsAuthenticated, IsStaff]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['location', 'is_active']


class DrawerViewSet(viewsets.ModelViewSet):
    serializer_class = DrawerSerializer
    permission_classes = [IsAuthenticated, IsEmployee]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['register', 'date', 'status']
    ordering = ['-date', '-opened_at']

    def get_queryset(self):
        return Drawer.objects.select_related(
            'register', 'current_cashier', 'opened_by', 'closed_by',
        ).prefetch_related('handoffs', 'drops').all()

    def create(self, request, *args, **kwargs):
        """Open a new drawer."""
        data = request.data
        register_id = data.get('register')
        opening_count = data.get('opening_count', {})
        opening_total = Decimal(str(data.get('opening_total', 0)))

        today = timezone.now().date()

        # Check if drawer already exists for this register today
        if Drawer.objects.filter(register_id=register_id, date=today).exists():
            return Response(
                {'detail': 'A drawer is already open for this register today.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        drawer = Drawer.objects.create(
            register_id=register_id,
            date=today,
            status='open',
            current_cashier=request.user,
            opened_by=request.user,
            opened_at=timezone.now(),
            opening_count=opening_count,
            opening_total=opening_total,
        )
        return Response(DrawerSerializer(drawer).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def handoff(self, request, pk=None):
        """Cashier handoff."""
        drawer = self.get_object()
        incoming_cashier_id = request.data.get('incoming_cashier')
        count = request.data.get('count', {})
        counted_total = Decimal(str(request.data.get('counted_total', 0)))

        # Calculate expected
        expected = drawer.opening_total + drawer.cash_sales_total
        variance = counted_total - expected

        handoff = DrawerHandoff.objects.create(
            drawer=drawer,
            outgoing_cashier=drawer.current_cashier,
            incoming_cashier_id=incoming_cashier_id,
            counted_at=timezone.now(),
            count=count,
            counted_total=counted_total,
            expected_total=expected,
            variance=variance,
            notes=request.data.get('notes', ''),
        )

        # Update current cashier
        drawer.current_cashier_id = incoming_cashier_id
        drawer.save(update_fields=['current_cashier'])

        return Response(DrawerHandoffSerializer(handoff).data)

    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        """Close a drawer."""
        drawer = self.get_object()
        closing_count = request.data.get('closing_count', {})
        closing_total = Decimal(str(request.data.get('closing_total', 0)))

        expected = drawer.opening_total + drawer.cash_sales_total
        variance = closing_total - expected

        drawer.status = 'closed'
        drawer.closed_by = request.user
        drawer.closed_at = timezone.now()
        drawer.closing_count = closing_count
        drawer.closing_total = closing_total
        drawer.expected_cash = expected
        drawer.variance = variance
        drawer.save()

        return Response(DrawerSerializer(drawer).data)

    @action(detail=True, methods=['post'])
    def drop(self, request, pk=None):
        """Create a cash drop from a drawer."""
        drawer = self.get_object()
        amount = request.data.get('amount', {})
        total = Decimal(str(request.data.get('total', 0)))

        cash_drop = CashDrop.objects.create(
            drawer=drawer,
            amount=amount,
            total=total,
            dropped_by=request.user,
            notes=request.data.get('notes', ''),
        )

        return Response(CashDropSerializer(cash_drop).data)


class SupplementalViewSet(viewsets.GenericViewSet):
    """Supplemental drawer operations."""
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]

    def get_supplemental(self):
        return SupplementalDrawer.objects.select_related('location', 'last_counted_by').first()

    def list(self, request):
        supp = self.get_supplemental()
        if not supp:
            return Response({'detail': 'No supplemental drawer configured.'}, status=404)
        return Response(SupplementalDrawerSerializer(supp).data)

    @action(detail=False, methods=['post'])
    def draw(self, request):
        """Draw from supplemental."""
        supp = self.get_supplemental()
        amount = request.data.get('amount', {})
        total = Decimal(str(request.data.get('total', 0)))

        SupplementalTransaction.objects.create(
            supplemental=supp,
            transaction_type='draw',
            amount=amount,
            total=total,
            related_drawer_id=request.data.get('related_drawer'),
            performed_by=request.user,
            notes=request.data.get('notes', ''),
        )

        supp.current_total -= total
        supp.save(update_fields=['current_total'])
        return Response(SupplementalDrawerSerializer(supp).data)

    @action(detail=False, methods=['post'], url_path='return')
    def return_cash(self, request):
        """Return cash to supplemental."""
        supp = self.get_supplemental()
        amount = request.data.get('amount', {})
        total = Decimal(str(request.data.get('total', 0)))

        SupplementalTransaction.objects.create(
            supplemental=supp,
            transaction_type='return',
            amount=amount,
            total=total,
            related_drawer_id=request.data.get('related_drawer'),
            performed_by=request.user,
            notes=request.data.get('notes', ''),
        )

        supp.current_total += total
        supp.save(update_fields=['current_total'])
        return Response(SupplementalDrawerSerializer(supp).data)

    @action(detail=False, methods=['post'])
    def audit(self, request):
        """Audit/recount supplemental drawer."""
        supp = self.get_supplemental()
        new_balance = request.data.get('current_balance', {})
        new_total = Decimal(str(request.data.get('current_total', 0)))

        old_total = supp.current_total
        adjustment = new_total - old_total

        if adjustment != 0:
            SupplementalTransaction.objects.create(
                supplemental=supp,
                transaction_type='audit_adjustment',
                amount=new_balance,
                total=abs(adjustment),
                performed_by=request.user,
                notes=request.data.get('notes', f'Audit adjustment: {adjustment}'),
            )

        supp.current_balance = new_balance
        supp.current_total = new_total
        supp.last_counted_by = request.user
        supp.last_counted_at = timezone.now()
        supp.save()

        return Response(SupplementalDrawerSerializer(supp).data)

    @action(detail=False, methods=['get'])
    def transactions(self, request):
        """List supplemental transactions."""
        supp = self.get_supplemental()
        if not supp:
            return Response([])
        txns = SupplementalTransaction.objects.filter(
            supplemental=supp,
        ).select_related('performed_by').order_by('-performed_at')[:50]
        return Response(SupplementalTransactionSerializer(txns, many=True).data)


class BankTransactionViewSet(viewsets.ModelViewSet):
    queryset = BankTransaction.objects.select_related('location', 'performed_by').all()
    serializer_class = BankTransactionSerializer
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['location', 'transaction_type', 'status']
    ordering = ['-created_at']

    def perform_create(self, serializer):
        serializer.save(performed_by=self.request.user)

    @action(detail=True, methods=['patch'])
    def complete(self, request, pk=None):
        txn = self.get_object()
        txn.status = 'completed'
        txn.completed_at = timezone.now()
        txn.save()
        return Response(BankTransactionSerializer(txn).data)


class CartViewSet(viewsets.ModelViewSet):
    serializer_class = CartSerializer
    permission_classes = [IsAuthenticated, IsEmployee]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['drawer', 'status', 'cashier', 'payment_method']
    ordering = ['-created_at']

    def get_queryset(self):
        return Cart.objects.select_related(
            'drawer', 'cashier', 'receipt',
        ).prefetch_related('lines').all()

    def perform_create(self, serializer):
        # Get tax rate from AppSetting
        from apps.core.models import AppSetting
        try:
            tax_setting = AppSetting.objects.get(key='tax_rate')
            tax_rate = Decimal(str(tax_setting.value))
        except AppSetting.DoesNotExist:
            tax_rate = Decimal('0.07')

        serializer.save(
            cashier=self.request.user,
            tax_rate=tax_rate,
        )

    @action(detail=True, methods=['post'], url_path='add-item')
    def add_item(self, request, pk=None):
        """Add item to cart by SKU."""
        cart = self.get_object()
        sku = request.data.get('sku')
        if not sku:
            return Response({'detail': 'SKU is required.'}, status=400)

        try:
            item = Item.objects.get(sku=sku)
        except Item.DoesNotExist:
            return Response({'detail': 'Item not found.'}, status=404)

        if item.status == 'sold':
            return Response({'detail': 'Item already sold.'}, status=400)

        line = CartLine.objects.create(
            cart=cart,
            item=item,
            description=item.title,
            quantity=1,
            unit_price=item.price,
        )
        cart.recalculate()
        return Response(CartSerializer(cart).data)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Complete a cart (finalize sale)."""
        cart = self.get_object()
        if cart.status != 'open':
            return Response({'detail': 'Cart is not open.'}, status=400)

        payment_method = request.data.get('payment_method', 'cash')
        cart.payment_method = payment_method
        cart.cash_tendered = request.data.get('cash_tendered')
        cart.change_given = request.data.get('change_given')
        cart.card_amount = request.data.get('card_amount')
        cart.status = 'completed'
        cart.completed_at = timezone.now()
        cart.save()

        # Update drawer cash_sales_total
        if payment_method in ('cash', 'split'):
            cash_amount = cart.total
            if payment_method == 'split' and cart.card_amount:
                cash_amount = cart.total - cart.card_amount
            cart.drawer.cash_sales_total += cash_amount
            if cart.change_given:
                cart.drawer.cash_sales_total -= cart.change_given
            cart.drawer.save(update_fields=['cash_sales_total'])

        # Mark items as sold
        for line in cart.lines.filter(item__isnull=False):
            item = line.item
            item.status = 'sold'
            item.sold_at = timezone.now()
            item.sold_for = line.unit_price
            item.save()

            # Handle consignment items
            if item.source == 'consignment' and hasattr(item, 'consignment'):
                ci = item.consignment
                ci.status = 'sold'
                ci.sold_at = timezone.now()
                ci.sale_amount = line.unit_price
                rate = ci.agreement.commission_rate / Decimal('100')
                ci.store_commission = (ci.sale_amount * rate).quantize(Decimal('0.01'))
                ci.consignee_earnings = ci.sale_amount - ci.store_commission
                ci.save()

        # Generate receipt
        receipt = Receipt.objects.create(
            cart=cart,
            receipt_number=Receipt.generate_receipt_number(),
        )

        return Response(CartSerializer(cart).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsManagerOrAdmin])
    def void(self, request, pk=None):
        """Void a cart (manager only)."""
        cart = self.get_object()

        cart.status = 'voided'
        cart.save()

        # Revert items to on_shelf
        for line in cart.lines.filter(item__isnull=False):
            item = line.item
            if item.status == 'sold':
                item.status = 'on_shelf'
                item.sold_at = None
                item.sold_for = None
                item.save()

        return Response(CartSerializer(cart).data)

    @action(detail=True, methods=['delete'], url_path='lines/(?P<line_id>[^/.]+)')
    def remove_line(self, request, pk=None, line_id=None):
        """Remove a line from a cart."""
        cart = self.get_object()
        try:
            line = cart.lines.get(id=line_id)
        except CartLine.DoesNotExist:
            return Response({'detail': 'Line not found.'}, status=404)
        line.delete()
        cart.recalculate()
        return Response(CartSerializer(cart).data)


class ReceiptViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Receipt.objects.select_related('cart').all()
    serializer_class = ReceiptSerializer
    permission_classes = [IsAuthenticated, IsEmployee]
    lookup_field = 'receipt_number'


class RevenueGoalViewSet(viewsets.ModelViewSet):
    queryset = RevenueGoal.objects.all()
    serializer_class = RevenueGoalSerializer
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['location', 'date']


# ── Dashboard Metrics ─────────────────────────────────────────────────────────

@api_view(['GET'])
@perm_classes([IsAuthenticated])
def dashboard_metrics(request):
    """Dashboard: today's revenue, weekly summary, 4-week data."""
    from datetime import timedelta, date

    today = timezone.now().date()

    # Today's revenue
    today_carts = Cart.objects.filter(
        status='completed',
        completed_at__date=today,
    )
    todays_revenue = today_carts.aggregate(
        total=Sum('total'),
    )['total'] or Decimal('0')

    # Today's goal
    goal = RevenueGoal.objects.filter(date=today).first()
    todays_goal = goal.goal_amount if goal else Decimal('0')

    # Weekly summary (Sun-Sat)
    weekday = today.weekday()  # Mon=0, Sun=6
    days_since_sunday = (weekday + 1) % 7
    week_start = today - timedelta(days=days_since_sunday)

    weekly = []
    for i in range(7):
        day = week_start + timedelta(days=i)
        rev = Cart.objects.filter(
            status='completed', completed_at__date=day,
        ).aggregate(total=Sum('total'))['total'] or Decimal('0')
        day_goal = RevenueGoal.objects.filter(date=day).first()
        weekly.append({
            'date': day.isoformat(),
            'day': day.strftime('%A'),
            'revenue': str(rev),
            'goal': str(day_goal.goal_amount) if day_goal else '0',
        })

    # 4-week comparison (current + 3 prior weeks, Sun-Sat)
    four_weeks = []
    for w in range(4):
        w_start = week_start - timedelta(weeks=w)
        w_end = w_start + timedelta(days=6)
        w_rev = Cart.objects.filter(
            status='completed',
            completed_at__date__gte=w_start,
            completed_at__date__lte=w_end,
        ).aggregate(total=Sum('total'))['total'] or Decimal('0')
        w_goal = RevenueGoal.objects.filter(
            date__gte=w_start, date__lte=w_end,
        ).aggregate(total=Sum('goal_amount'))['total'] or Decimal('0')
        four_weeks.append({
            'week_start': w_start.isoformat(),
            'week_end': w_end.isoformat(),
            'revenue': str(w_rev),
            'goal': str(w_goal),
        })

    # Quick stats
    items_sold_today = Item.objects.filter(sold_at__date=today).count()
    active_drawers = Drawer.objects.filter(status='open', date=today).count()

    from apps.hr.models import TimeEntry
    clocked_in = TimeEntry.objects.filter(clock_out__isnull=True).count()

    return Response({
        'todays_revenue': str(todays_revenue),
        'todays_goal': str(todays_goal),
        'weekly': weekly,
        'four_weeks': four_weeks,
        'items_sold_today': items_sold_today,
        'active_drawers': active_drawers,
        'clocked_in_employees': clocked_in,
    })


@api_view(['GET'])
@perm_classes([IsAuthenticated])
def dashboard_alerts(request):
    """Dashboard alerts for managers."""
    from apps.hr.models import TimeEntry, SickLeaveRequest

    alerts = []

    # Pending time entries
    pending_time = TimeEntry.objects.filter(status='pending').count()
    if pending_time:
        alerts.append({
            'type': 'time_entries',
            'message': f'{pending_time} time entries pending approval',
            'count': pending_time,
        })

    # Pending sick leave requests
    pending_sick = SickLeaveRequest.objects.filter(status='pending').count()
    if pending_sick:
        alerts.append({
            'type': 'sick_leave',
            'message': f'{pending_sick} sick leave requests pending',
            'count': pending_sick,
        })

    # Open drawers
    today = timezone.now().date()
    open_drawers = Drawer.objects.filter(status='open', date=today).count()
    if open_drawers:
        alerts.append({
            'type': 'drawers',
            'message': f'{open_drawers} drawer(s) still open',
            'count': open_drawers,
        })

    return Response(alerts)

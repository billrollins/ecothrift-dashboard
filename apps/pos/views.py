from decimal import Decimal, InvalidOperation
from django.db import transaction
from django.db.models import Sum, Q, Count
from django.db.models.functions import TruncMonth, TruncYear, TruncWeek, Coalesce
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes as perm_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import OrderingFilter

from apps.accounts.permissions import IsManagerOrAdmin, IsStaff, IsEmployee, IsSuperAdmin
from apps.core.models import WorkLocation
from apps.inventory.models import Item, ItemScanHistory
from apps.inventory.services.resale_duplicate import duplicate_item_for_resale
from .models import (
    Register, Drawer, DrawerHandoff, CashDrop,
    SupplementalDrawer, SupplementalTransaction, BankTransaction,
    Cart, CartLine, Receipt, RevenueGoal, HistoricalTransaction, DashboardSalesGoal,
    DashboardDepartmentGoal, QualityAudit, QualityAuditForm,
    DeliveryAvailability, DeliveryDay, DeliveryJob, DeliveryJobItem,
    DeliveryRun, DeliveryRunStop, DeliveryAttachment,
)
from .serializers import (
    RegisterSerializer, DrawerSerializer,
    DrawerHandoffSerializer, CashDropSerializer,
    SupplementalDrawerSerializer, SupplementalTransactionSerializer,
    BankTransactionSerializer,
    CartSerializer, CartLineSerializer, ReceiptSerializer,
    RevenueGoalSerializer, DashboardSalesGoalSerializer,
    DashboardDepartmentGoalSerializer, QualityAuditSerializer,
    QualityAuditFormSerializer, QualityAuditFormSummarySerializer,
    DeliveryAvailabilitySerializer, DeliveryJobSerializer, DeliveryDayWriteSerializer,
)
from .filters import CartFilter, DrawerFilter


def _estimate_delivery_item_count(items_delivered: str, explicit=None) -> int:
    if explicit is not None and explicit != '':
        try:
            n = int(explicit)
            if n >= 1:
                return min(n, 99)
        except (TypeError, ValueError):
            pass
    parts = [
        p.strip()
        for p in items_delivered.replace(';', ',').split(',')
        if p.strip()
    ]
    return max(1, len(parts)) if parts else 1


_ACTIVE_DELIVERY_JOB_STATUSES = (
    DeliveryJob.STATUS_NEEDS_SCHEDULING,
    DeliveryJob.STATUS_SCHEDULED,
)


def _cancel_delivery_jobs_for_cart(cart):
    DeliveryJob.objects.filter(
        cart=cart,
        status__in=_ACTIVE_DELIVERY_JOB_STATUSES,
    ).update(status=DeliveryJob.STATUS_CANCELLED)


def _cancel_delivery_job_for_line(line):
    job = getattr(line, 'delivery_job', None)
    if job is None:
        try:
            job = DeliveryJob.objects.get(cart_line=line)
        except DeliveryJob.DoesNotExist:
            return
    if job.status in _ACTIVE_DELIVERY_JOB_STATUSES:
        job.status = DeliveryJob.STATUS_CANCELLED
        job.save(update_fields=['status', 'updated_at'])


def _customer_schedule_message(job: DeliveryJob) -> str:
    """Plain text cashiers can send after a delivery is scheduled."""
    if not job.scheduled_date:
        return ''
    day = job.scheduled_date.strftime('%A, %B %d, %Y').replace(' 0', ' ')
    window = ''
    if job.availability_id and job.availability:
        start = job.availability.time_start.strftime('%I:%M %p').lstrip('0')
        end = job.availability.time_end.strftime('%I:%M %p').lstrip('0')
        window = f' between {start} and {end}'
    return (
        f'Your delivery has now been scheduled for {day}{window}. '
        'Please be home — we call the day of delivery and again when we arrive. '
        'Signature required; drop-off only (end of driveway / apartment lot).'
    )


def _availability_queryset(include_test: bool = False):
    qs = DeliveryAvailability.objects.all()
    if not include_test:
        qs = qs.filter(test_dataset__isnull=True)
    return qs.annotate(
        delivery_count=Count(
            'jobs',
            filter=Q(
                jobs__status=DeliveryJob.STATUS_SCHEDULED,
                jobs__archived_at__isnull=True,
            ),
            distinct=True,
        ),
        items_booked=Coalesce(
            Sum(
                'jobs__items__quantity',
                filter=Q(
                    jobs__status=DeliveryJob.STATUS_SCHEDULED,
                    jobs__archived_at__isnull=True,
                    jobs__items__is_active=True,
                ),
            ),
            0,
        ),
    )


class RegisterViewSet(viewsets.ModelViewSet):
    queryset = Register.objects.select_related('location').all()
    serializer_class = RegisterSerializer
    permission_classes = [IsAuthenticated, IsStaff]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['location', 'is_active']

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), IsManagerOrAdmin()]
        return [IsAuthenticated(), IsStaff()]


class DrawerViewSet(viewsets.ModelViewSet):
    serializer_class = DrawerSerializer
    permission_classes = [IsAuthenticated, IsEmployee]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_class = DrawerFilter
    ordering = ['-date', '-opened_at']

    def get_queryset(self):
        return Drawer.objects.select_related(
            'register', 'current_cashier', 'opened_by', 'closed_by',
        ).prefetch_related('handoffs', 'drops').all()

    def create(self, request, *args, **kwargs):
        """Open a new drawer."""
        data = request.data
        register_id = data.get('register')
        if register_id is None:
            return Response(
                {'detail': 'register is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            register_id = int(register_id)
        except (TypeError, ValueError):
            return Response(
                {'detail': 'register must be a valid ID.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        opening_count = data.get('opening_count')
        if opening_count is None:
            opening_count = {}
        if not isinstance(opening_count, dict):
            return Response(
                {'detail': 'opening_count must be an object (denomination breakdown).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            opening_total = Decimal(str(data.get('opening_total', 0)))
        except (TypeError, ValueError):
            return Response(
                {'detail': 'opening_total must be a number.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        today = timezone.now().date()

        if not Register.objects.filter(id=register_id).exists():
            return Response(
                {'detail': 'Register not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        register = Register.objects.get(id=register_id)
        if not register.is_active:
            return Response(
                {'detail': 'This register is inactive.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if Drawer.objects.filter(register_id=register_id, date=today).exists():
            return Response(
                {'detail': 'A drawer is already open for this register today.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
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
        except Exception as e:
            return Response(
                {'detail': f'Could not create drawer: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(DrawerSerializer(drawer).data, status=status.HTTP_201_CREATED)

    def _drawer_expected_cash(self, drawer):
        """Expected cash in drawer: opening + cash sales - drops."""
        total_drops = drawer.drops.aggregate(s=Sum('total'))['s'] or Decimal('0')
        return drawer.opening_total + drawer.cash_sales_total - total_drops

    @action(detail=True, methods=['post'])
    def handoff(self, request, pk=None):
        """Cashier handoff (outgoing cashier initiates with count)."""
        drawer = self.get_object()
        if drawer.status != 'open':
            return Response(
                {'detail': 'Drawer is not open.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        incoming_cashier_id = request.data.get('incoming_cashier')
        if not incoming_cashier_id:
            return Response(
                {'detail': 'incoming_cashier is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        count = request.data.get('count', {})
        if not isinstance(count, dict):
            count = {}
        counted_total = Decimal(str(request.data.get('counted_total', 0)))

        expected = self._drawer_expected_cash(drawer)
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

        drawer.current_cashier_id = incoming_cashier_id
        drawer.save(update_fields=['current_cashier'])

        return Response(DrawerHandoffSerializer(handoff).data)

    @action(detail=True, methods=['post'])
    def takeover(self, request, pk=None):
        """Takeover: incoming cashier claims the drawer (optionally with a count)."""
        drawer = self.get_object()
        if drawer.status != 'open':
            return Response(
                {'detail': 'Drawer is not open.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        count = request.data.get('count', {})
        if not isinstance(count, dict):
            count = {}
        counted_total = request.data.get('counted_total')
        if counted_total is not None:
            counted_total = Decimal(str(counted_total))
        else:
            counted_total = self._drawer_expected_cash(drawer)

        expected = self._drawer_expected_cash(drawer)
        variance = counted_total - expected

        handoff = DrawerHandoff.objects.create(
            drawer=drawer,
            outgoing_cashier=drawer.current_cashier,
            incoming_cashier=request.user,
            counted_at=timezone.now(),
            count=count,
            counted_total=counted_total,
            expected_total=expected,
            variance=variance,
            notes=request.data.get('notes', '') or 'Takeover',
        )

        drawer.current_cashier = request.user
        drawer.save(update_fields=['current_cashier'])

        return Response(DrawerSerializer(drawer).data)

    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        """Close a drawer."""
        drawer = self.get_object()
        if drawer.status != 'open':
            return Response(
                {'detail': 'Drawer is not open.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        closing_count = request.data.get('closing_count', {})
        closing_total = Decimal(str(request.data.get('closing_total', 0)))

        expected = self._drawer_expected_cash(drawer)
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
    def reopen(self, request, pk=None):
        """Reopen a closed drawer (Manager/Admin only)."""
        from apps.accounts.permissions import IsManagerOrAdmin
        if not IsManagerOrAdmin().has_permission(request, self):
            return Response(
                {'detail': 'Only managers and admins can reopen a closed drawer.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        drawer = self.get_object()
        if drawer.status != 'closed':
            return Response(
                {'detail': 'Drawer is not closed.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Assign the reopening cashier (or keep whoever last had it)
        cashier_id = request.data.get('cashier')
        if cashier_id:
            drawer.current_cashier_id = cashier_id
        elif not drawer.current_cashier_id:
            drawer.current_cashier = request.user

        drawer.status = 'open'
        drawer.save(update_fields=['status', 'current_cashier'])

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

    @action(detail=False, methods=['post'], url_path='bootstrap')
    def bootstrap(self, request):
        """Create SupplementalDrawer for a WorkLocation when missing (same defaults as setup_initial_data)."""
        raw = request.data.get('location')
        if raw is None:
            loc = WorkLocation.objects.filter(is_active=True).order_by('id').first()
            if not loc:
                return Response(
                    {'detail': 'No work location exists. Create one first.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            try:
                loc = WorkLocation.objects.get(pk=int(raw))
            except (TypeError, ValueError, WorkLocation.DoesNotExist):
                return Response({'detail': 'Invalid location.'}, status=status.HTTP_400_BAD_REQUEST)

        drawer, created = SupplementalDrawer.objects.get_or_create(
            location=loc,
            defaults={
                'current_balance': {
                    'hundreds': 0, 'fifties': 2, 'twenties': 5, 'tens': 10,
                    'fives': 20, 'ones': 50, 'quarters': 80, 'dimes': 100,
                    'nickels': 80, 'pennies': 100,
                },
                'current_total': Decimal('500.00'),
                'last_counted_by': request.user,
                'last_counted_at': timezone.now(),
            },
        )
        ser = SupplementalDrawerSerializer(drawer)
        return Response(
            ser.data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


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
    filterset_class = CartFilter
    ordering = ['-created_at']

    def get_queryset(self):
        return Cart.objects.select_related(
            'drawer', 'cashier', 'receipt',
        ).prefetch_related('lines').all()

    def perform_create(self, serializer):
        from apps.core.models import AppSetting
        from rest_framework.exceptions import ValidationError as DRFValidationError

        drawer = serializer.validated_data.get('drawer')
        if drawer is not None and drawer.status != 'open':
            raise DRFValidationError(
                {'drawer': 'This drawer is not open. Sales can only be added to an open drawer.'}
            )

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
        sku = (request.data.get('sku') or '').strip()
        if not sku:
            return Response(
                {'detail': 'SKU is required.', 'code': 'SKU_REQUIRED'},
                status=400,
            )

        try:
            item = Item.objects.select_related('product').get(sku=sku)
        except Item.DoesNotExist:
            return Response(
                {'detail': 'Item not found.', 'code': 'ITEM_NOT_FOUND'},
                status=404,
            )

        if item.status == 'sold':
            ItemScanHistory.objects.create(
                item=item,
                ip_address=request.META.get('REMOTE_ADDR'),
                source='pos_terminal',
                outcome='pos_blocked_sold',
                cart=cart,
                created_by=request.user,
            )
            return Response(
                {
                    'detail': 'Item already sold.',
                    'code': 'ITEM_ALREADY_SOLD',
                    'item_id': item.pk,
                    'sku': item.sku,
                    'title': item.product.title,
                },
                status=400,
            )

        # Online Sales hold guard: block ordinary sale of actively held linked Items.
        from apps.webstore.models import Reservation
        from apps.webstore.services.reservations import active_holds_for_item

        active_holds = list(active_holds_for_item(item.pk).select_related('listing')[:5])
        override = bool(request.data.get('override_hold'))
        override_reason = (request.data.get('override_reason') or '').strip()
        reservation_id = request.data.get('reservation_id')
        matching_reservation = None
        if reservation_id not in (None, ''):
            try:
                matching_reservation = Reservation.objects.filter(
                    pk=int(reservation_id),
                    item_id=item.pk,
                    status__in=Reservation.ACTIVE_STATUSES,
                ).first()
            except (TypeError, ValueError):
                matching_reservation = None
            if matching_reservation is None:
                return Response(
                    {
                        'detail': 'Reservation does not match this held item.',
                        'code': 'HOLD_MISMATCH',
                    },
                    status=400,
                )

        if active_holds and matching_reservation is None:
            # Convenience: a single confirmed/ready hold auto-matches pickup scan.
            ready = [h for h in active_holds if h.status in ('ready_for_pickup', 'confirmed')]
            if len(ready) == 1 and not override:
                matching_reservation = ready[0]

        if active_holds and matching_reservation is None:
            if override and override_reason:
                if not IsManagerOrAdmin().has_permission(request, self):
                    return Response(
                        {
                            'detail': 'Manager override required for held items.',
                            'code': 'HOLD_OVERRIDE_DENIED',
                        },
                        status=403,
                    )
                from apps.webstore.services.reservations import release_reservation
                for hold in active_holds:
                    release_reservation(hold, 'cancelled')
                    hold.staff_note = (
                        f"{hold.staff_note}\nPOS override: {override_reason}"
                    ).strip()
                    hold.save(update_fields=['staff_note', 'updated_at'])
            else:
                hold = active_holds[0]
                can_override = IsManagerOrAdmin().has_permission(request, self)
                ItemScanHistory.objects.create(
                    item=item,
                    ip_address=request.META.get('REMOTE_ADDR'),
                    source='pos_terminal',
                    outcome='pos_blocked_hold',
                    cart=cart,
                    created_by=request.user,
                )
                return Response(
                    {
                        'detail': (
                            'Item is on an online hold. Complete the matching pickup '
                            'or a manager must override with a reason.'
                        ),
                        'code': 'ITEM_ON_HOLD',
                        'item_id': item.pk,
                        'sku': item.sku,
                        'title': item.product.title,
                        'reservation_id': hold.pk,
                        'reservation_status': hold.status,
                        'customer_name': hold.customer_name,
                        'can_override': can_override,
                    },
                    status=400,
                )

        existing = cart.lines.filter(item=item).first()
        if existing:
            existing.quantity += 1
            if matching_reservation and isinstance(getattr(existing, 'meta', None), dict):
                existing.meta = {**(existing.meta or {}), 'web_reservation_id': matching_reservation.pk}
            existing.save()
        else:
            meta = {}
            if matching_reservation:
                meta['web_reservation_id'] = matching_reservation.pk
            if override and override_reason:
                meta['hold_override_reason'] = override_reason
            create_kwargs = dict(
                cart=cart,
                item=item,
                description=item.product.title,
                quantity=1,
                unit_price=item.price,
                line_kind=CartLine.LINE_KIND_ITEM,
            )
            if hasattr(CartLine, 'meta'):
                create_kwargs['meta'] = meta
            CartLine.objects.create(**create_kwargs)

        ItemScanHistory.objects.create(
            item=item,
            ip_address=request.META.get('REMOTE_ADDR'),
            source='pos_terminal',
            outcome='added_to_cart',
            cart=cart,
            created_by=request.user,
        )

        cart.recalculate()
        cart = self.get_queryset().get(pk=cart.pk)
        return Response(CartSerializer(cart).data)

    @action(detail=True, methods=['post'], url_path='add-resale-copy')
    def add_resale_copy(self, request, pk=None):
        """Create a new on-shelf item from a sold unit and add it to this cart (atomic)."""
        cart = self.get_object()
        if cart.status != 'open':
            return Response(
                {'detail': 'Cart is not open.', 'code': 'CART_NOT_OPEN'},
                status=400,
            )

        raw_id = request.data.get('source_item_id')
        sku = (request.data.get('sku') or '').strip()
        if raw_id is not None and raw_id != '':
            try:
                src = Item.objects.select_related('product').get(pk=int(raw_id))
            except (Item.DoesNotExist, ValueError, TypeError):
                return Response(
                    {'detail': 'Item not found.', 'code': 'ITEM_NOT_FOUND'},
                    status=404,
                )
        elif sku:
            try:
                src = Item.objects.select_related('product').get(sku=sku)
            except Item.DoesNotExist:
                return Response(
                    {'detail': 'Item not found.', 'code': 'ITEM_NOT_FOUND'},
                    status=404,
                )
        else:
            return Response(
                {'detail': 'source_item_id or sku is required.', 'code': 'SOURCE_REQUIRED'},
                status=400,
            )

        if src.status != 'sold':
            return Response(
                {
                    'detail': 'Only sold items can be duplicated for resale at the register.',
                    'code': 'NOT_SOLD_FOR_RESALE',
                },
                status=400,
            )

        with transaction.atomic():
            new_item = duplicate_item_for_resale(request.user, src)
            CartLine.objects.create(
                cart=cart,
                item=new_item,
                description=new_item.product.title,
                quantity=1,
                unit_price=new_item.price,
                resale_source_sku=src.sku,
                resale_source_item_id=src.pk,
                line_kind=CartLine.LINE_KIND_ITEM,
            )
            ItemScanHistory.objects.create(
                item=new_item,
                ip_address=request.META.get('REMOTE_ADDR'),
                source='pos_terminal',
                outcome='added_to_cart',
                cart=cart,
                created_by=request.user,
            )

        cart.recalculate()
        cart = self.get_queryset().get(pk=cart.pk)
        return Response(CartSerializer(cart).data)

    @action(detail=True, methods=['post'], url_path='add-manual-line')
    def add_manual_line(self, request, pk=None):
        """Add a cart line without an inventory item (e.g. pink tag / unscannable)."""
        cart = self.get_object()
        if cart.status != 'open':
            return Response(
                {'detail': 'Cart is not open.', 'code': 'CART_NOT_OPEN'},
                status=400,
            )

        description = (request.data.get('description') or '').strip()
        if not description:
            return Response(
                {'detail': 'Description is required.', 'code': 'DESCRIPTION_REQUIRED'},
                status=400,
            )
        if len(description) > 300:
            return Response(
                {'detail': 'Description is too long.', 'code': 'DESCRIPTION_TOO_LONG'},
                status=400,
            )

        raw_price = request.data.get('unit_price', '0.50')
        try:
            unit_price = Decimal(str(raw_price))
        except InvalidOperation:
            return Response(
                {'detail': 'Invalid unit_price.', 'code': 'INVALID_UNIT_PRICE'},
                status=400,
            )
        if unit_price < 0:
            return Response(
                {'detail': 'unit_price must not be negative.', 'code': 'INVALID_UNIT_PRICE'},
                status=400,
            )

        qty_raw = request.data.get('quantity', 1)
        try:
            quantity = int(qty_raw)
        except (TypeError, ValueError):
            return Response(
                {'detail': 'Invalid quantity.', 'code': 'INVALID_QUANTITY'},
                status=400,
            )
        if quantity < 1:
            return Response(
                {'detail': 'quantity must be at least 1.', 'code': 'INVALID_QUANTITY'},
                status=400,
            )

        CartLine.objects.create(
            cart=cart,
            item=None,
            description=description,
            quantity=quantity,
            unit_price=unit_price,
            line_kind=CartLine.LINE_KIND_MANUAL,
        )

        cart.recalculate()
        cart = self.get_queryset().get(pk=cart.pk)
        return Response(CartSerializer(cart).data)

    @action(detail=True, methods=['post'], url_path='add-discount')
    def add_discount(self, request, pk=None):
        """Add a negative discount / in-store credit line (cart-wide or against one line)."""
        cart = self.get_object()
        if cart.status != 'open':
            return Response(
                {'detail': 'Cart is not open.', 'code': 'CART_NOT_OPEN'},
                status=400,
            )

        raw_amount = request.data.get('amount')
        try:
            amount = Decimal(str(raw_amount)).quantize(Decimal('0.01'))
        except (InvalidOperation, TypeError):
            return Response(
                {'detail': 'Invalid amount.', 'code': 'INVALID_AMOUNT'},
                status=400,
            )
        if amount <= 0:
            return Response(
                {'detail': 'amount must be greater than zero.', 'code': 'INVALID_AMOUNT'},
                status=400,
            )

        reason = (request.data.get('reason') or 'In-store credit (return)').strip()
        if not reason:
            reason = 'In-store credit (return)'
        if len(reason) > 200:
            return Response(
                {'detail': 'Reason is too long.', 'code': 'REASON_TOO_LONG'},
                status=400,
            )

        target_line_id = request.data.get('target_line_id')
        target_line = None
        scope = 'cart'
        if target_line_id is not None and target_line_id != '':
            try:
                target_line = cart.lines.get(pk=int(target_line_id))
            except (CartLine.DoesNotExist, TypeError, ValueError):
                return Response(
                    {'detail': 'target_line_id not found on this cart.', 'code': 'LINE_NOT_FOUND'},
                    status=404,
                )
            if target_line.line_kind in (
                CartLine.LINE_KIND_DISCOUNT,
                CartLine.LINE_KIND_DELIVERY,
            ):
                return Response(
                    {'detail': 'Cannot discount a discount or delivery line.', 'code': 'INVALID_TARGET'},
                    status=400,
                )
            scope = 'line'
            if amount > target_line.line_total:
                return Response(
                    {
                        'detail': 'Discount cannot exceed the target line total.',
                        'code': 'DISCOUNT_EXCEEDS_LINE',
                    },
                    status=400,
                )

        # Reject discounts that would make merchandise subtotal negative
        # (sum of non-discount lines minus this discount).
        positive = sum(
            (ln.line_total for ln in cart.lines.exclude(line_kind=CartLine.LINE_KIND_DISCOUNT)),
            Decimal('0'),
        )
        if amount > positive:
            return Response(
                {
                    'detail': 'Discount cannot exceed the current cart merchandise/delivery total.',
                    'code': 'DISCOUNT_EXCEEDS_CART',
                },
                status=400,
            )

        if scope == 'line' and target_line is not None:
            description = f'Discount — {reason} (on {target_line.description[:80]})'
        else:
            description = f'Discount — {reason}'
        description = description[:300]

        CartLine.objects.create(
            cart=cart,
            item=None,
            description=description,
            quantity=1,
            unit_price=-amount,
            line_kind=CartLine.LINE_KIND_DISCOUNT,
            meta={
                'reason': reason,
                'scope': scope,
                'target_line_id': target_line.pk if target_line else None,
                'amount': str(amount),
            },
        )

        cart.recalculate()
        cart = self.get_queryset().get(pk=cart.pk)
        return Response(CartSerializer(cart).data)

    @action(detail=True, methods=['post'], url_path='add-delivery')
    def add_delivery(self, request, pk=None):
        """Add a delivery fee line with customer contact/address metadata."""
        cart = self.get_object()
        if cart.status != 'open':
            return Response(
                {'detail': 'Cart is not open.', 'code': 'CART_NOT_OPEN'},
                status=400,
            )

        tier = (request.data.get('tier') or '').strip().lower()
        fee_map = {
            '5mi': (Decimal('50.00'), 'Delivery 5 miles or less'),
            '10mi': (Decimal('75.00'), 'Delivery 5 to 10 miles'),
        }
        if tier not in fee_map:
            return Response(
                {'detail': 'tier must be 5mi or 10mi.', 'code': 'INVALID_TIER'},
                status=400,
            )
        fee, label = fee_map[tier]

        customer_name = (request.data.get('customer_name') or '').strip()
        phone = (request.data.get('phone') or '').strip()
        address = (request.data.get('address') or '').strip()
        items_delivered = (request.data.get('items_delivered') or '').strip()
        if not customer_name or not phone or not address or not items_delivered:
            return Response(
                {
                    'detail': 'customer_name, phone, address, and items_delivered are required.',
                    'code': 'DELIVERY_FIELDS_REQUIRED',
                },
                status=400,
            )

        is_apt = bool(request.data.get('is_apt'))
        unit = (request.data.get('unit') or '').strip()
        if is_apt and not unit:
            return Response(
                {'detail': 'Unit # is required when Apt is checked.', 'code': 'UNIT_REQUIRED'},
                status=400,
            )

        availability = None
        availability_id = request.data.get('availability_id')
        schedule_later = bool(request.data.get('schedule_later')) or availability_id in (
            None, '', 'none', 'null',
        )
        if not schedule_later:
            try:
                availability = DeliveryAvailability.objects.get(pk=availability_id)
            except (DeliveryAvailability.DoesNotExist, ValueError, TypeError):
                return Response(
                    {'detail': 'Delivery date not found.', 'code': 'AVAILABILITY_NOT_FOUND'},
                    status=400,
                )
            today = timezone.localdate()
            if not availability.is_active or availability.date < today:
                return Response(
                    {
                        'detail': 'That delivery date is not available.',
                        'code': 'AVAILABILITY_INACTIVE',
                    },
                    status=400,
                )

        notes = (request.data.get('notes') or '')[:2000]

        for label_name, value, maxlen in (
            ('customer_name', customer_name, 120),
            ('phone', phone, 40),
            ('address', address, 200),
            ('unit', unit, 40),
            ('items_delivered', items_delivered, 300),
        ):
            if len(value) > maxlen:
                return Response(
                    {'detail': f'{label_name} is too long.', 'code': 'FIELD_TOO_LONG'},
                    status=400,
                )

        # Prefer qty sum from linked merchandise lines over client estimate / comma split.
        linked_qty = 0
        raw_line_ids_for_count = request.data.get('cart_line_ids')
        if isinstance(raw_line_ids_for_count, list):
            count_ids = []
            for raw_id in raw_line_ids_for_count:
                try:
                    count_ids.append(int(raw_id))
                except (TypeError, ValueError):
                    continue
            if count_ids:
                for ln in CartLine.objects.filter(pk__in=count_ids, cart=cart):
                    try:
                        linked_qty += max(1, int(ln.quantity or 1))
                    except (TypeError, ValueError):
                        linked_qty += 1
        item_count = (
            min(linked_qty, 99)
            if linked_qty >= 1
            else _estimate_delivery_item_count(
                items_delivered,
                request.data.get('item_count'),
            )
        )
        if availability is not None:
            date_label = availability.date.isoformat()
            description = f'{label} — {items_delivered} — {customer_name} — {date_label}'[:300]
            job_status = DeliveryJob.STATUS_SCHEDULED
            scheduled_date = availability.date
            meta = {
                'customer_name': customer_name,
                'phone': phone,
                'address': address,
                'is_apt': is_apt,
                'unit': unit,
                'tier': tier,
                'fee': str(fee),
                'items_delivered': items_delivered,
                'item_count': item_count,
                'availability_id': availability.pk,
                'scheduled_date': date_label,
                'time_start': availability.time_start.strftime('%H:%M'),
                'time_end': availability.time_end.strftime('%H:%M'),
                'schedule_later': False,
                'notes': notes,
            }
        else:
            description = f'{label} — {items_delivered} — {customer_name} — schedule later'[:300]
            job_status = DeliveryJob.STATUS_NEEDS_SCHEDULING
            scheduled_date = None
            meta = {
                'customer_name': customer_name,
                'phone': phone,
                'address': address,
                'is_apt': is_apt,
                'unit': unit,
                'tier': tier,
                'fee': str(fee),
                'items_delivered': items_delivered,
                'item_count': item_count,
                'availability_id': None,
                'scheduled_date': None,
                'schedule_later': True,
                'notes': notes,
            }
        for key in ('distance_miles', 'distance_mode', 'lat', 'lon', 'display_name'):
            raw = request.data.get(key)
            if raw is None or raw == '':
                continue
            meta[key] = raw

        raw_line_ids = request.data.get('cart_line_ids')
        if isinstance(raw_line_ids, list):
            cleaned_ids = []
            for raw_id in raw_line_ids:
                try:
                    cleaned_ids.append(int(raw_id))
                except (TypeError, ValueError):
                    continue
            if cleaned_ids:
                meta['cart_line_ids'] = cleaned_ids

        distance_miles = None
        raw_miles = request.data.get('distance_miles')
        if raw_miles not in (None, ''):
            try:
                distance_miles = Decimal(str(raw_miles))
            except (InvalidOperation, ValueError, TypeError):
                distance_miles = None

        replace_line_id = request.data.get('replace_line_id')
        replace_line = None
        if replace_line_id not in (None, ''):
            try:
                replace_line = cart.lines.get(
                    pk=int(replace_line_id),
                    line_kind=CartLine.LINE_KIND_DELIVERY,
                )
            except (CartLine.DoesNotExist, ValueError, TypeError):
                return Response(
                    {'detail': 'Delivery line to update was not found.', 'code': 'LINE_NOT_FOUND'},
                    status=400,
                )

        with transaction.atomic():
            if replace_line is not None:
                line = replace_line
                line.description = description
                line.quantity = 1
                line.unit_price = fee
                line.meta = meta
                line.save()
                job = DeliveryJob.objects.filter(cart_line=line).first()
                if job is None:
                    job = DeliveryJob(
                        cart=cart,
                        cart_line=line,
                        created_by=request.user if request.user.is_authenticated else None,
                    )
                job.availability = availability
                job.scheduled_date = scheduled_date
                job.cart = cart
                job.customer_name = customer_name
                job.phone = phone
                job.address = address
                job.is_apt = is_apt
                job.unit = unit
                job.items_delivered = items_delivered
                job.item_count = item_count
                job.tier = tier
                job.fee = fee
                job.distance_miles = distance_miles
                job.distance_mode = (request.data.get('distance_mode') or '')[:20]
                job.notes = notes
                job.status = job_status
                job.save()
                from apps.pos.services.delivery_crud import ensure_job_items
                ensure_job_items(job, user=request.user if request.user.is_authenticated else None)
            else:
                line = CartLine.objects.create(
                    cart=cart,
                    item=None,
                    description=description,
                    quantity=1,
                    unit_price=fee,
                    line_kind=CartLine.LINE_KIND_DELIVERY,
                    meta=meta,
                )
                job = DeliveryJob.objects.create(
                    availability=availability,
                    scheduled_date=scheduled_date,
                    cart=cart,
                    cart_line=line,
                    customer_name=customer_name,
                    phone=phone,
                    address=address,
                    is_apt=is_apt,
                    unit=unit,
                    items_delivered=items_delivered,
                    item_count=item_count,
                    tier=tier,
                    fee=fee,
                    distance_miles=distance_miles,
                    distance_mode=(request.data.get('distance_mode') or '')[:20],
                    notes=notes,
                    status=job_status,
                    created_by=request.user if request.user.is_authenticated else None,
                )
                from apps.pos.services.delivery_crud import ensure_job_items
                ensure_job_items(job, user=request.user if request.user.is_authenticated else None)

        cart.recalculate()
        cart = self.get_queryset().get(pk=cart.pk)
        return Response(CartSerializer(cart).data)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Complete a cart (finalize sale)."""
        cart = self.get_object()
        if cart.status != 'open':
            return Response({'detail': 'Cart is not open.'}, status=400)
        if cart.total < 0:
            return Response(
                {'detail': 'Cart total cannot be negative.', 'code': 'NEGATIVE_TOTAL'},
                status=400,
            )

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

            # Complete matching Online Sales reservation (pickup).
            reservation_id = None
            if isinstance(getattr(line, 'meta', None), dict):
                reservation_id = line.meta.get('web_reservation_id')
            if reservation_id:
                from apps.webstore.models import Reservation
                from apps.webstore.services.reservations import complete_reservation
                try:
                    reservation = Reservation.objects.get(pk=int(reservation_id))
                    complete_reservation(reservation, user=request.user, pos_cart=cart)
                except (Reservation.DoesNotExist, TypeError, ValueError):
                    pass

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
        Receipt.objects.create(
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

        _cancel_delivery_jobs_for_cart(cart)

        # Revert items to on_shelf
        for line in cart.lines.filter(item__isnull=False):
            item = line.item
            if item.status == 'sold':
                item.status = 'on_shelf'
                item.sold_at = None
                item.sold_for = None
                item.save()

        return Response(CartSerializer(cart).data)

    @action(detail=True, methods=['patch', 'delete'], url_path='lines/(?P<line_id>[^/.]+)')
    def manage_line(self, request, pk=None, line_id=None):
        """Update (PATCH) or remove (DELETE) a cart line."""
        cart = self.get_object()
        try:
            line = cart.lines.get(id=line_id)
        except CartLine.DoesNotExist:
            return Response({'detail': 'Line not found.'}, status=404)

        if request.method == 'DELETE':
            if line.line_kind == CartLine.LINE_KIND_DELIVERY:
                _cancel_delivery_job_for_line(line)
            line.delete()
        else:
            for field in ('quantity', 'description', 'unit_price'):
                if field in request.data:
                    setattr(line, field, request.data[field])
            line.save()

        cart.recalculate()
        cart = self.get_queryset().get(pk=cart.pk)
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


class QualityAuditViewSet(viewsets.ModelViewSet):
    serializer_class = QualityAuditSerializer
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]
    http_method_names = ['get', 'post', 'patch', 'head', 'options']
    pagination_class = None

    def get_queryset(self):
        qs = QualityAudit.objects.select_related('conducted_by', 'form').all()
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        form_slug = self.request.query_params.get('form')
        if form_slug:
            qs = qs.filter(form__slug=form_slug)
        audit_type = self.request.query_params.get('audit_type')
        if audit_type:
            qs = qs.filter(audit_type=audit_type)
        # Submitted history: newest finalization first for hub review list.
        if status_filter == QualityAudit.STATUS_SUBMITTED:
            qs = qs.order_by('-submitted_at', '-started_at', '-id')
        return qs

    def create(self, request, *args, **kwargs):
        form_ref = request.data.get('form') or request.data.get('form_slug') or request.data.get('audit_type')
        if not form_ref:
            return Response(
                {'detail': 'form (slug or id) is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        form = None
        if isinstance(form_ref, int):
            form = QualityAuditForm.objects.filter(pk=form_ref).first()
        else:
            form = QualityAuditForm.objects.filter(slug=str(form_ref)).first()
        if form is None:
            return Response(
                {'detail': 'Form not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not form.is_active:
            return Response(
                {'detail': 'This form is inactive and cannot be used.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from apps.pos.quality_audit_controls import build_responses_from_definition

        audit = QualityAudit.objects.create(
            form=form,
            audit_type=form.slug,
            status=QualityAudit.STATUS_DRAFT,
            conducted_by=request.user,
            responses=build_responses_from_definition(form.definition or {'sections': []}),
        )
        return Response(
            QualityAuditSerializer(audit).data,
            status=status.HTTP_201_CREATED,
        )

    def partial_update(self, request, *args, **kwargs):
        audit = self.get_object()
        if audit.status != QualityAudit.STATUS_DRAFT:
            return Response(
                {'detail': 'Submitted audits cannot be edited.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from apps.pos.services.quality_audit import normalize_responses

        data = {}
        if 'responses' in request.data:
            data['responses'] = normalize_responses(request.data['responses'])
        if 'summary_notes' in request.data:
            data['summary_notes'] = (request.data.get('summary_notes') or '').strip()
        if not data:
            return Response(
                {'detail': 'No updatable fields provided.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        for field, value in data.items():
            setattr(audit, field, value)
        audit.save(update_fields=[*data.keys()])
        return Response(QualityAuditSerializer(audit).data)

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        audit = self.get_object()
        if audit.status != QualityAudit.STATUS_DRAFT:
            return Response(
                {'detail': 'This audit has already been submitted.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from apps.pos.services.dashboard_metrics import invalidate_dashboard_metrics_cache
        from apps.pos.services.quality_audit import compute_overall_grade, validate_responses_complete

        if 'responses' in request.data:
            from apps.pos.services.quality_audit import normalize_responses
            audit.responses = normalize_responses(request.data['responses'])
        if 'summary_notes' in request.data:
            audit.summary_notes = (request.data.get('summary_notes') or '').strip()

        errors = validate_responses_complete(audit.responses)
        if errors:
            return Response({'detail': errors[0], 'errors': errors}, status=status.HTTP_400_BAD_REQUEST)

        audit.overall_grade = compute_overall_grade(audit.responses)
        audit.status = QualityAudit.STATUS_SUBMITTED
        audit.submitted_at = timezone.now()
        audit.save(
            update_fields=['responses', 'summary_notes', 'overall_grade', 'status', 'submitted_at'],
        )
        invalidate_dashboard_metrics_cache()
        return Response(QualityAuditSerializer(audit).data)


class QualityAuditFormViewSet(viewsets.ModelViewSet):
    queryset = QualityAuditForm.objects.select_related('created_by', 'updated_by').all()
    pagination_class = None
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_serializer_class(self):
        if self.action == 'list':
            return QualityAuditFormSummarySerializer
        return QualityAuditFormSerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [IsAuthenticated(), IsManagerOrAdmin()]
        return [IsAuthenticated(), IsSuperAdmin()]

    def get_queryset(self):
        qs = QualityAuditForm.objects.select_related('created_by', 'updated_by').all()
        active = self.request.query_params.get('active')
        if active is not None:
            qs = qs.filter(is_active=(active.lower() in ('1', 'true', 'yes')))
        return qs

    def _validate(self, data, instance=None):
        from apps.pos.quality_audit_controls import validate_definition

        errors: dict[str, str] = {}
        slug = (data.get('slug') or '').strip().lower()
        if not slug:
            errors['slug'] = 'Slug is required.'
        else:
            qs = QualityAuditForm.objects.filter(slug=slug)
            if instance is not None:
                qs = qs.exclude(pk=instance.pk)
            if qs.exists():
                errors['slug'] = 'That slug is already in use.'
        title = (data.get('title') or '').strip()
        if not title:
            errors['title'] = 'Title is required.'
        definition = data.get('definition')
        if not isinstance(definition, dict):
            errors['definition'] = 'Definition is required.'
        else:
            def_errors = validate_definition(definition)
            if def_errors:
                errors['definition'] = ' '.join(def_errors)
        return errors

    def create(self, request, *args, **kwargs):
        data = request.data
        errors = self._validate(data)
        feeds_dashboard = bool(data.get('feeds_dashboard'))
        if feeds_dashboard and QualityAuditForm.objects.filter(feeds_dashboard=True).exists():
            errors['feeds_dashboard'] = 'Another form already feeds the dashboard (only one allowed).'
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        form = QualityAuditForm.objects.create(
            slug=(data.get('slug') or '').strip().lower(),
            title=(data.get('title') or '').strip(),
            intro=(data.get('intro') or '').strip(),
            icon=(data.get('icon') or '').strip(),
            definition=data.get('definition') or {'sections': []},
            is_system=False,
            feeds_dashboard=feeds_dashboard,
            is_active=bool(data.get('is_active', True)),
            created_by=request.user,
            updated_by=request.user,
        )
        return Response(QualityAuditFormSerializer(form).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        form = self.get_object()
        data = request.data
        # System form: slug + is_system + feeds_dashboard are locked.
        if form.is_system and ('slug' in data or 'is_system' in data or 'feeds_dashboard' in data):
            return Response(
                {'detail': 'System form slug and dashboard binding cannot be changed.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        merged = {**QualityAuditFormSerializer(form).data, **data}
        errors = self._validate(merged, instance=form)
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        for field in ('title', 'intro', 'icon', 'definition', 'is_active'):
            if field in data:
                setattr(form, field, data[field] if field != 'definition' else (data[field] or {'sections': []}))
        form.updated_by = request.user
        form.save()
        return Response(QualityAuditFormSerializer(form).data)

    def destroy(self, request, *args, **kwargs):
        form = self.get_object()
        if form.is_system:
            return Response(
                {'detail': 'System forms cannot be deleted.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if form.audits.exists():
            return Response(
                {'detail': 'Cannot delete a form that has audits. Deactivate it instead.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        form.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class DeliveryAvailabilityViewSet(viewsets.ModelViewSet):
    """Manage delivery date windows (who / when / crew) and see booking counts."""

    serializer_class = DeliveryAvailabilitySerializer
    permission_classes = [IsAuthenticated, IsEmployee]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['date', 'is_active', 'crew_size']
    ordering_fields = ['date', 'time_start']
    ordering = ['date', 'time_start']
    pagination_class = None

    def get_queryset(self):
        qs = _availability_queryset(
            include_test=_parse_request_bool(self.request.query_params.get('include_test')),
        )
        upcoming = self.request.query_params.get('upcoming')
        if upcoming in ('1', 'true', 'yes'):
            qs = qs.filter(is_active=True, date__gte=timezone.localdate())
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if date_from:
            qs = qs.filter(date__gte=date_from)
        if date_to:
            qs = qs.filter(date__lte=date_to)
        return qs

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), IsManagerOrAdmin()]
        return [IsAuthenticated(), IsEmployee()]

    def destroy(self, request, *args, **kwargs):
        """Soft-deactivate so existing jobs keep a protected availability row."""
        instance = self.get_object()
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class DeliveryJobViewSet(viewsets.ModelViewSet):
    """List / create / update appliance deliveries (including needs-scheduling)."""

    serializer_class = DeliveryJobSerializer
    permission_classes = [IsAuthenticated, IsEmployee]
    http_method_names = ['get', 'post', 'patch', 'head', 'options']
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['scheduled_date', 'status', 'availability']
    ordering_fields = ['scheduled_date', 'id']
    ordering = ['scheduled_date', 'id']
    pagination_class = None

    def get_queryset(self):
        from django.db.models import Q

        qs = DeliveryJob.objects.select_related(
            'availability', 'cart', 'cart__receipt', 'cart_line', 'created_by',
        ).prefetch_related('address_revisions').all()
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if date_from or date_to:
            in_range = Q()
            if date_from:
                in_range &= Q(scheduled_date__gte=date_from)
            if date_to:
                in_range &= Q(scheduled_date__lte=date_to)
            # Always include unscheduled jobs so the board can warn/schedule them.
            qs = qs.filter(Q(status=DeliveryJob.STATUS_NEEDS_SCHEDULING) | in_range)
        return qs

    def get_permissions(self):
        if self.action in ('create', 'partial_update', 'update'):
            return [IsAuthenticated(), IsManagerOrAdmin()]
        return [IsAuthenticated(), IsEmployee()]

    def create(self, request, *args, **kwargs):
        """Board/manual create: past sale items, inventory SKU text, or free-text description."""
        from apps.pos.services.delivery_run import create_delivery_job

        availability = None
        availability_id = request.data.get('availability_id') or request.data.get('availability')
        schedule_later = bool(request.data.get('schedule_later')) or availability_id in (
            None, '', 'none', 'null',
        )
        if not schedule_later:
            try:
                availability = DeliveryAvailability.objects.get(pk=availability_id)
            except (DeliveryAvailability.DoesNotExist, ValueError, TypeError):
                return Response(
                    {'detail': 'Delivery date not found.', 'code': 'AVAILABILITY_NOT_FOUND'},
                    status=400,
                )
            if not availability.is_active:
                return Response(
                    {
                        'detail': 'That delivery date is not available.',
                        'code': 'AVAILABILITY_INACTIVE',
                    },
                    status=400,
                )

        cart = None
        cart_id = request.data.get('cart_id') or request.data.get('cart')
        if cart_id not in (None, ''):
            try:
                cart = Cart.objects.get(pk=int(cart_id))
            except (Cart.DoesNotExist, ValueError, TypeError):
                return Response(
                    {'detail': 'Sale/cart not found.', 'code': 'CART_NOT_FOUND'},
                    status=400,
                )

        source_line_ids = []
        raw_line_ids = request.data.get('cart_line_ids')
        if isinstance(raw_line_ids, list):
            for raw_id in raw_line_ids:
                try:
                    source_line_ids.append(int(raw_id))
                except (TypeError, ValueError):
                    continue

        try:
            job = create_delivery_job(
                user=request.user,
                customer_name=str(request.data.get('customer_name') or ''),
                phone=str(request.data.get('phone') or ''),
                address=str(request.data.get('address') or ''),
                items_delivered=str(request.data.get('items_delivered') or ''),
                is_apt=bool(request.data.get('is_apt')),
                unit=str(request.data.get('unit') or ''),
                notes=str(request.data.get('notes') or ''),
                availability=availability,
                schedule_later=schedule_later,
                tier=str(request.data.get('tier') or ''),
                fee=request.data.get('fee'),
                distance_miles=request.data.get('distance_miles'),
                distance_mode=str(request.data.get('distance_mode') or ''),
                item_count=request.data.get('item_count'),
                cart=cart,
                source_cart_line_ids=source_line_ids or None,
            )
        except ValueError as exc:
            return Response({'detail': str(exc), 'code': 'DELIVERY_CREATE_INVALID'}, status=400)

        payload = DeliveryJobSerializer(job).data
        if job.status == DeliveryJob.STATUS_SCHEDULED and job.scheduled_date:
            payload['customer_schedule_message'] = _customer_schedule_message(job)
        return Response(payload, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        """Managers may update status / notes / availability (schedule or reschedule)."""
        from apps.pos.services.delivery_run import (
            cancel_job_with_run_sync,
            open_stop_for_job,
            reschedule_job_from_run,
        )

        job = self.get_object()
        was_unscheduled = job.status == DeliveryJob.STATUS_NEEDS_SCHEDULING or not job.scheduled_date

        if 'status' in request.data:
            status_val = (request.data.get('status') or '').strip().lower()
            valid = {c[0] for c in DeliveryJob.STATUS_CHOICES}
            if status_val not in valid:
                return Response(
                    {'detail': 'Invalid status.', 'code': 'INVALID_STATUS'},
                    status=400,
                )
            if status_val == DeliveryJob.STATUS_COMPLETED:
                stop = open_stop_for_job(job)
                if stop and stop.state != DeliveryRunStop.STATE_COMPLETED:
                    return Response(
                        {
                            'detail': (
                                'Complete the delivery stop on the day run before marking the job completed.'
                            ),
                            'code': 'OPEN_RUN_STOP_INCOMPLETE',
                        },
                        status=400,
                    )
            if status_val == DeliveryJob.STATUS_CANCELLED:
                cancel_job_with_run_sync(job, user=request.user)
                return Response(DeliveryJobSerializer(job).data)

        availability = None
        availability_requested = 'availability' in request.data or 'availability_id' in request.data
        if availability_requested:
            avail_id = request.data.get('availability') or request.data.get('availability_id')
            try:
                availability = DeliveryAvailability.objects.get(pk=avail_id)
            except (DeliveryAvailability.DoesNotExist, ValueError, TypeError):
                return Response(
                    {'detail': 'Delivery date not found.', 'code': 'AVAILABILITY_NOT_FOUND'},
                    status=400,
                )
            if not availability.is_active:
                return Response(
                    {
                        'detail': 'That delivery date is not available.',
                        'code': 'AVAILABILITY_INACTIVE',
                    },
                    status=400,
                )

        allowed = {}
        if 'status' in request.data:
            status_val = (request.data.get('status') or '').strip().lower()
            allowed['status'] = status_val
        if 'notes' in request.data:
            allowed['notes'] = (request.data.get('notes') or '')[:2000]
        if 'customer_name' in request.data:
            name = (request.data.get('customer_name') or '').strip()
            if not name:
                return Response(
                    {'detail': 'Customer name is required.', 'code': 'CUSTOMER_NAME_REQUIRED'},
                    status=400,
                )
            allowed['customer_name'] = name[:120]
        if 'phone' in request.data:
            phone = (request.data.get('phone') or '').strip()
            if not phone:
                return Response(
                    {'detail': 'Phone is required.', 'code': 'PHONE_REQUIRED'},
                    status=400,
                )
            allowed['phone'] = phone[:40]

        if availability_requested:
            notes = allowed.get('notes', job.notes)
            try:
                reschedule_job_from_run(
                    job,
                    user=request.user,
                    availability=availability,
                    notes=notes if 'notes' in request.data else '',
                )
            except ValueError as exc:
                return Response({'detail': str(exc), 'code': 'RESCHEDULE_BLOCKED'}, status=400)
            job.refresh_from_db()
            payload = DeliveryJobSerializer(job).data
            if was_unscheduled and job.status == DeliveryJob.STATUS_SCHEDULED and job.scheduled_date:
                payload['customer_schedule_message'] = _customer_schedule_message(job)
                payload['just_scheduled'] = True
            return Response(payload)

        for key, value in allowed.items():
            setattr(job, key, value)
        job.save()

        # Keep cart-line meta in sync when contact / notes change.
        if job.cart_line_id and (
            'notes' in allowed or 'customer_name' in allowed or 'phone' in allowed
        ):
            line = job.cart_line
            meta = dict(line.meta or {})
            if 'notes' in allowed:
                meta['notes'] = allowed['notes']
            if 'customer_name' in allowed:
                meta['customer_name'] = allowed['customer_name']
            if 'phone' in allowed:
                meta['phone'] = allowed['phone']
            line.meta = meta
            line.save(update_fields=['meta'])

        payload = DeliveryJobSerializer(job).data
        if was_unscheduled and job.status == DeliveryJob.STATUS_SCHEDULED and job.scheduled_date:
            payload['customer_schedule_message'] = _customer_schedule_message(job)
            payload['just_scheduled'] = True
        return Response(payload)


# ── Dashboard Metrics ─────────────────────────────────────────────────────────

@api_view(['GET'])
@perm_classes([IsAuthenticated, IsEmployee])
def delivery_address_suggest(request):
    """Suggest addresses near Omaha and compute distance/tier to Eco-Thrift."""
    from apps.pos.services.delivery_distance import suggest_addresses

    q = (request.query_params.get('q') or '').strip()
    if len(q) < 3:
        return Response({'results': [], 'detail': 'Type at least 3 characters.'})
    try:
        results = suggest_addresses(q, limit=5)
    except RuntimeError as exc:
        return Response({'detail': str(exc), 'code': 'GEOCODER_UNAVAILABLE'}, status=503)
    return Response({'results': results})


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsEmployee])
def delivery_distance_quote(request):
    """Quote delivery tier from lat/lon (or re-check a picked suggestion)."""
    from apps.pos.services.delivery_distance import quote_coordinates

    try:
        lat = float(request.data.get('lat'))
        lon = float(request.data.get('lon'))
    except (TypeError, ValueError):
        return Response(
            {'detail': 'lat and lon are required numbers.', 'code': 'COORDS_REQUIRED'},
            status=400,
        )
    return Response(quote_coordinates(lat, lon))


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsEmployee])
def delivery_optimize_route(request):
    """Reorder delivery stops for fastest drive; return store→stops→store Maps URL."""
    from apps.pos.services.delivery_distance import build_optimized_delivery_route

    raw = request.data.get('addresses')
    if not isinstance(raw, list):
        return Response(
            {'detail': 'addresses must be a list of strings.', 'code': 'ADDRESSES_REQUIRED'},
            status=400,
        )
    addresses = [str(a) for a in raw if a is not None and str(a).strip()]
    if not addresses:
        return Response(
            {'detail': 'At least one address is required.', 'code': 'ADDRESSES_REQUIRED'},
            status=400,
        )
    return Response(build_optimized_delivery_route(addresses))


def _delivery_run_error(exc: Exception, code: str = 'DELIVERY_RUN_ERROR'):
    return Response({'detail': str(exc), 'code': code}, status=400)


def _parse_request_bool(raw, default: bool = False) -> bool:
    """Truthy parsing that treats string 'false'/'0'/'no' as False."""
    if raw is None:
        return default
    if isinstance(raw, bool):
        return raw
    text = str(raw).strip().lower()
    if text in ('1', 'true', 'yes', 'on'):
        return True
    if text in ('0', 'false', 'no', 'off', ''):
        return False
    return default


@api_view(['GET', 'POST'])
@perm_classes([IsAuthenticated, IsEmployee])
def delivery_runs(request):
    """GET open/completed run for a date; POST starts or resumes the day wizard."""
    from datetime import date as date_cls

    from apps.pos.services.delivery_run import (
        get_open_run_for_date,
        serialize_run,
        start_or_resume_run,
    )

    raw_date = request.data.get('date') if request.method == 'POST' else request.query_params.get('date')
    if not raw_date:
        raw_date = timezone.localdate().isoformat()
    try:
        run_date = date_cls.fromisoformat(str(raw_date)[:10])
    except ValueError:
        return Response({'detail': 'Invalid date.', 'code': 'INVALID_DATE'}, status=400)

    if request.method == 'GET':
        run = get_open_run_for_date(run_date)
        if run is None:
            # Fall back to latest completed for the date
            run = (
                DeliveryRun.objects.filter(date=run_date)
                .order_by('-id')
                .first()
            )
        if run is None:
            return Response(None)
        return Response(serialize_run(run))

    availability_id = request.data.get('availability_id')
    try:
        availability_id = int(availability_id) if availability_id not in (None, '') else None
    except (TypeError, ValueError):
        availability_id = None
    try:
        run = start_or_resume_run(
            date=run_date,
            user=request.user,
            availability_id=availability_id,
        )
    except ValueError as exc:
        return _delivery_run_error(exc, 'DAY_RUN_FINAL')
    return Response(serialize_run(run), status=status.HTTP_201_CREATED)


@api_view(['GET'])
@perm_classes([IsAuthenticated, IsEmployee])
def delivery_run_detail(request, pk: int):
    from apps.pos.services.delivery_run import serialize_run

    try:
        run = DeliveryRun.objects.get(pk=pk)
    except DeliveryRun.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    return Response(serialize_run(run))


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsEmployee])
def delivery_run_set_phase(request, pk: int):
    from apps.pos.services.delivery_run import serialize_run, set_phase

    try:
        run = DeliveryRun.objects.get(pk=pk)
    except DeliveryRun.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    try:
        set_phase(run, str(request.data.get('phase') or ''), user=request.user)
    except ValueError as exc:
        return _delivery_run_error(exc, 'INVALID_PHASE')
    return Response(serialize_run(run))


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsEmployee])
def delivery_run_begin_route(request, pk: int):
    from apps.pos.services.delivery_run import begin_route, serialize_run

    try:
        run = DeliveryRun.objects.get(pk=pk)
    except DeliveryRun.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    try:
        begin_route(run, user=request.user)
    except ValueError as exc:
        return _delivery_run_error(exc, 'BEGIN_ROUTE_BLOCKED')
    return Response(serialize_run(run))


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsEmployee])
def delivery_run_optimize(request, pk: int):
    from apps.pos.services.delivery_run import StaleRouteRevision, apply_route_plan, serialize_run

    try:
        run = DeliveryRun.objects.get(pk=pk)
    except DeliveryRun.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    optimize = request.data.get('optimize', True)
    base_revision = request.data.get('base_revision')
    try:
        apply_route_plan(
            run,
            user=request.user,
            optimize=bool(optimize),
            base_revision=int(base_revision) if base_revision is not None else None,
        )
    except StaleRouteRevision as exc:
        return Response({'detail': str(exc), 'code': 'STALE_ROUTE_REVISION'}, status=409)
    except ValueError as exc:
        return _delivery_run_error(exc, 'OPTIMIZE_FAILED')
    return Response(serialize_run(run))


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsEmployee])
def delivery_run_reorder(request, pk: int):
    from apps.pos.services.delivery_run import StaleRouteRevision, reorder_stops, serialize_run

    try:
        run = DeliveryRun.objects.get(pk=pk)
    except DeliveryRun.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    stop_ids = request.data.get('stop_ids')
    if not isinstance(stop_ids, list):
        return Response({'detail': 'stop_ids required.', 'code': 'STOP_IDS_REQUIRED'}, status=400)
    base_revision = request.data.get('base_revision')
    try:
        reorder_stops(
            run,
            [int(x) for x in stop_ids],
            user=request.user,
            base_revision=int(base_revision) if base_revision is not None else None,
        )
    except StaleRouteRevision as exc:
        return Response({'detail': str(exc), 'code': 'STALE_ROUTE_REVISION'}, status=409)
    except (TypeError, ValueError) as exc:
        return _delivery_run_error(exc, 'REORDER_FAILED')
    return Response(serialize_run(run))


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsEmployee])
def delivery_run_finish(request, pk: int):
    from apps.pos.services.delivery_run import finish_run, serialize_run

    try:
        run = DeliveryRun.objects.get(pk=pk)
    except DeliveryRun.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    force = _parse_request_bool(request.data.get('force'))
    if force and not IsManagerOrAdmin().has_permission(request, None):
        return Response({'detail': 'Manager access required to force-finish.'}, status=403)
    try:
        finish_run(
            run,
            user=request.user,
            force=force,
            reason=str(request.data.get('reason') or ''),
        )
    except ValueError as exc:
        return _delivery_run_error(exc, 'FINISH_BLOCKED')
    return Response(serialize_run(run))


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsEmployee])
def delivery_run_upload(request, pk: int):
    from apps.pos.services.delivery_run import save_attachment, serialize_run

    try:
        run = DeliveryRun.objects.get(pk=pk)
    except DeliveryRun.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    uploaded = request.FILES.get('file')
    if not uploaded:
        return Response({'detail': 'file required.', 'code': 'FILE_REQUIRED'}, status=400)
    kind = str(request.data.get('kind') or '')
    stop = None
    stop_item = None
    stop_id = request.data.get('stop_id')
    stop_item_id = request.data.get('stop_item_id')
    if stop_id not in (None, ''):
        try:
            stop = DeliveryRunStop.objects.get(pk=int(stop_id), run=run)
        except (DeliveryRunStop.DoesNotExist, TypeError, ValueError):
            return Response({'detail': 'Invalid stop_id.', 'code': 'INVALID_STOP'}, status=400)
    if stop_item_id not in (None, ''):
        from apps.pos.models import DeliveryRunStopItem

        try:
            stop_item = DeliveryRunStopItem.objects.select_related('stop').get(
                pk=int(stop_item_id), stop__run=run
            )
        except (DeliveryRunStopItem.DoesNotExist, TypeError, ValueError):
            return Response(
                {'detail': 'Invalid stop_item_id.', 'code': 'INVALID_STOP_ITEM'},
                status=400,
            )
    try:
        save_attachment(
            run=run,
            user=request.user,
            uploaded_file=uploaded,
            kind=kind,
            stop=stop,
            stop_item=stop_item,
            client_photo_id=request.data.get('client_photo_id'),
        )
    except ValueError as exc:
        return _delivery_run_error(exc, 'UPLOAD_FAILED')
    return Response(serialize_run(run), status=status.HTTP_201_CREATED)


@api_view(['DELETE'])
@perm_classes([IsAuthenticated, IsEmployee])
def delivery_run_delete_attachment(request, pk: int, attachment_id: int):
    from apps.pos.services.delivery_run import delete_attachment, serialize_run

    try:
        run = DeliveryRun.objects.get(pk=pk)
        att = DeliveryAttachment.objects.get(pk=attachment_id, run=run)
    except (DeliveryRun.DoesNotExist, DeliveryAttachment.DoesNotExist):
        return Response({'detail': 'Not found.'}, status=404)
    delete_attachment(att, user=request.user)
    return Response(serialize_run(run))


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsEmployee])
def delivery_stop_load(request, pk: int):
    from apps.pos.services.delivery_run import mark_loaded, serialize_run

    try:
        stop = DeliveryRunStop.objects.select_related('run').get(pk=pk)
    except DeliveryRunStop.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    loaded = request.data.get('loaded', True)
    try:
        mark_loaded(stop, user=request.user, loaded=bool(loaded))
    except ValueError as exc:
        return _delivery_run_error(exc, 'LOAD_BLOCKED')
    return Response(serialize_run(stop.run))


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsEmployee])
def delivery_stop_secure(request, pk: int):
    from apps.pos.services.delivery_run import mark_secured, serialize_run

    try:
        stop = DeliveryRunStop.objects.select_related('run').get(pk=pk)
    except DeliveryRunStop.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    secured = request.data.get('secured', True)
    try:
        mark_secured(stop, user=request.user, secured=bool(secured))
    except ValueError as exc:
        return _delivery_run_error(exc, 'SECURE_BLOCKED')
    return Response(serialize_run(stop.run))


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsEmployee])
def delivery_stop_call(request, pk: int):
    """Legacy adapter — prefer /contact-attempt/ and /disposition/."""
    from apps.pos.services.delivery_run import add_call_attempt, serialize_run

    try:
        stop = DeliveryRunStop.objects.select_related('run').get(pk=pk)
    except DeliveryRunStop.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    try:
        add_call_attempt(
            stop,
            user=request.user,
            result=str(request.data.get('result') or ''),
            note=str(request.data.get('note') or ''),
            channel=str(request.data.get('channel') or ''),
            action=str(request.data.get('action') or ''),
        )
    except ValueError as exc:
        return _delivery_run_error(exc, 'INVALID_CALL_RESULT')
    return Response(serialize_run(stop.run))


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsEmployee])
def delivery_stop_contact_attempt(request, pk: int):
    from apps.pos.services.delivery_phase2 import record_contact_attempt
    from apps.pos.services.delivery_run import serialize_run

    try:
        stop = DeliveryRunStop.objects.select_related('run').get(pk=pk)
    except DeliveryRunStop.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    try:
        record_contact_attempt(
            stop,
            user=request.user,
            channel=str(request.data.get('channel') or ''),
            action=str(request.data.get('action') or ''),
            note=str(request.data.get('note') or ''),
        )
    except ValueError as exc:
        return _delivery_run_error(exc, 'INVALID_CONTACT_ATTEMPT')
    return Response(serialize_run(stop.run))


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsEmployee])
def delivery_stop_disposition(request, pk: int):
    from apps.pos.services.delivery_phase2 import set_contact_disposition
    from apps.pos.services.delivery_run import serialize_run

    try:
        stop = DeliveryRunStop.objects.select_related('run').get(pk=pk)
    except DeliveryRunStop.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    try:
        set_contact_disposition(
            stop,
            user=request.user,
            disposition=str(request.data.get('disposition') or ''),
            note=str(request.data.get('note') or ''),
        )
    except ValueError as exc:
        return _delivery_run_error(exc, 'INVALID_DISPOSITION')
    return Response(serialize_run(stop.run))


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsEmployee])
def delivery_stop_exclude_unconfirmed(request, pk: int):
    from apps.pos.services.delivery_phase2 import clear_unconfirmed_exclusion, exclude_unconfirmed_stop
    from apps.pos.services.delivery_run import serialize_run

    try:
        stop = DeliveryRunStop.objects.select_related('run').get(pk=pk)
    except DeliveryRunStop.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    clear = _parse_request_bool(request.data.get('clear'))
    try:
        if clear:
            clear_unconfirmed_exclusion(stop, user=request.user)
        else:
            exclude_unconfirmed_stop(
                stop,
                user=request.user,
                reason=str(request.data.get('reason') or ''),
            )
    except ValueError as exc:
        return _delivery_run_error(exc, 'EXCLUDE_UNCONFIRMED_FAILED')
    return Response(serialize_run(stop.run))


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsEmployee])
def delivery_stop_item_scan(request, pk: int):
    from apps.pos.models import DeliveryRunStopItem
    from apps.pos.services.delivery_phase2 import scan_stop_item
    from apps.pos.services.delivery_run import serialize_run

    try:
        item = DeliveryRunStopItem.objects.select_related('stop__run').get(pk=pk)
    except DeliveryRunStopItem.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    try:
        scan_stop_item(
            item,
            user=request.user,
            scanned_code=str(request.data.get('scanned_code') or request.data.get('sku') or ''),
            client_scan_id=request.data.get('client_scan_id'),
        )
    except ValueError as exc:
        return _delivery_run_error(exc, 'SCAN_FAILED')
    return Response(serialize_run(item.stop.run))


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsEmployee])
def delivery_stop_item_skip(request, pk: int):
    from apps.pos.models import DeliveryRunStopItem
    from apps.pos.services.delivery_phase2 import skip_stop_item_verification
    from apps.pos.services.delivery_run import serialize_run

    try:
        item = DeliveryRunStopItem.objects.select_related('stop__run').get(pk=pk)
    except DeliveryRunStopItem.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    try:
        skip_stop_item_verification(
            item,
            user=request.user,
            reason=str(request.data.get('reason') or ''),
        )
    except ValueError as exc:
        return _delivery_run_error(exc, 'SKIP_FAILED')
    return Response(serialize_run(item.stop.run))


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsEmployee])
def delivery_stop_item_load(request, pk: int):
    from apps.pos.models import DeliveryRunStopItem
    from apps.pos.services.delivery_phase2 import set_stop_item_loaded
    from apps.pos.services.delivery_run import serialize_run

    try:
        item = DeliveryRunStopItem.objects.select_related('stop__run').get(pk=pk)
    except DeliveryRunStopItem.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    loaded = request.data.get('loaded', True)
    try:
        set_stop_item_loaded(item, user=request.user, loaded=_parse_request_bool(loaded, default=True))
    except ValueError as exc:
        return _delivery_run_error(exc, 'ITEM_LOAD_FAILED')
    return Response(serialize_run(item.stop.run))


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsEmployee])
def delivery_stop_item_photo_exception(request, pk: int):
    from apps.pos.models import DeliveryRunStopItem
    from apps.pos.services.delivery_phase2 import set_stop_item_photo_exception
    from apps.pos.services.delivery_run import serialize_run

    try:
        item = DeliveryRunStopItem.objects.select_related('stop__run').get(pk=pk)
    except DeliveryRunStopItem.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    try:
        set_stop_item_photo_exception(
            item,
            user=request.user,
            reason=str(request.data.get('reason') or ''),
        )
    except ValueError as exc:
        return _delivery_run_error(exc, 'PHOTO_EXCEPTION_FAILED')
    return Response(serialize_run(item.stop.run))


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsEmployee])
def delivery_run_close_truck(request, pk: int):
    from apps.pos.services.delivery_phase2 import close_truck
    from apps.pos.services.delivery_run import serialize_run

    try:
        run = DeliveryRun.objects.get(pk=pk)
    except DeliveryRun.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    try:
        close_truck(run, user=request.user)
    except ValueError as exc:
        return _delivery_run_error(exc, 'TRUCK_CLOSE_BLOCKED')
    return Response(serialize_run(run))


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsEmployee])
def delivery_run_departure_override(request, pk: int):
    from apps.pos.services.delivery_phase2 import set_departure_override
    from apps.pos.services.delivery_run import serialize_run

    try:
        run = DeliveryRun.objects.get(pk=pk)
    except DeliveryRun.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    try:
        set_departure_override(
            run,
            user=request.user,
            reason=str(request.data.get('reason') or ''),
        )
    except PermissionError as exc:
        return Response({'detail': str(exc), 'code': 'MANAGER_REQUIRED'}, status=403)
    except ValueError as exc:
        return _delivery_run_error(exc, 'DEPARTURE_OVERRIDE_FAILED')
    return Response(serialize_run(run))


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsEmployee])
def delivery_stop_hold(request, pk: int):
    from apps.pos.services.delivery_run import hold_stop, serialize_run

    try:
        stop = DeliveryRunStop.objects.select_related('run').get(pk=pk)
    except DeliveryRunStop.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    hold_stop(stop, user=request.user, reason=str(request.data.get('reason') or ''))
    return Response(serialize_run(stop.run))


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsEmployee])
def delivery_stop_release(request, pk: int):
    from apps.pos.services.delivery_run import release_stop, serialize_run

    try:
        stop = DeliveryRunStop.objects.select_related('run').get(pk=pk)
    except DeliveryRunStop.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    release_stop(stop, user=request.user)
    return Response(serialize_run(stop.run))


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsEmployee])
def delivery_stop_complete(request, pk: int):
    from apps.pos.services.delivery_run import complete_stop, serialize_run

    try:
        stop = DeliveryRunStop.objects.select_related('run', 'job').get(pk=pk)
    except DeliveryRunStop.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    try:
        complete_stop(
            stop,
            user=request.user,
            override=_parse_request_bool(request.data.get('override')),
            override_reason=str(request.data.get('override_reason') or ''),
        )
    except PermissionError as exc:
        return Response({'detail': str(exc), 'code': 'MANAGER_REQUIRED'}, status=403)
    except ValueError as exc:
        return _delivery_run_error(exc, 'COMPLETE_BLOCKED')
    return Response(serialize_run(stop.run))


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsEmployee])
def delivery_stop_contact_present(request, pk: int):
    from apps.pos.services.delivery_run import mark_contact_present, serialize_run

    try:
        stop = DeliveryRunStop.objects.select_related('run').get(pk=pk)
    except DeliveryRunStop.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    present = request.data.get('present', True)
    mark_contact_present(stop, user=request.user, present=bool(present))
    return Response(serialize_run(stop.run))


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsEmployee])
def delivery_stop_delivered(request, pk: int):
    from apps.pos.services.delivery_run import mark_delivered, serialize_run

    try:
        stop = DeliveryRunStop.objects.select_related('run').get(pk=pk)
    except DeliveryRunStop.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    delivered = request.data.get('delivered', True)
    mark_delivered(stop, user=request.user, delivered=bool(delivered))
    return Response(serialize_run(stop.run))


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsEmployee])
def delivery_run_return_store(request, pk: int):
    from apps.pos.services.delivery_run import mark_returned_to_store, serialize_run

    try:
        run = DeliveryRun.objects.get(pk=pk)
    except DeliveryRun.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    mark_returned_to_store(run, user=request.user)
    return Response(serialize_run(run))


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsEmployee])
def delivery_stop_return_reconcile(request, pk: int):
    from apps.pos.services.delivery_run import serialize_run, update_return_checklist

    try:
        stop = DeliveryRunStop.objects.select_related('run', 'job').get(pk=pk)
    except DeliveryRunStop.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    try:
        update_return_checklist(
            stop,
            user=request.user,
            unloaded=(
                bool(request.data['unloaded']) if 'unloaded' in request.data else None
            ),
            items_stored=(
                bool(request.data['items_stored'])
                if 'items_stored' in request.data
                else None
            ),
            issue_code=(
                str(request.data.get('issue_code') or '')
                if 'issue_code' in request.data
                else None
            ),
            issue_notes=(
                str(request.data.get('issue_notes') or '')
                if 'issue_notes' in request.data
                else None
            ),
            reconcile=_parse_request_bool(request.data.get('reconcile')),
        )
    except ValueError as exc:
        return _delivery_run_error(exc, 'RETURN_RECONCILE_BLOCKED')
    return Response(serialize_run(stop.run))


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsEmployee])
def delivery_stop_notes(request, pk: int):
    """Update job notes from the driver wizard stop card."""
    from apps.pos.services.delivery_run import log_event, serialize_run

    try:
        stop = DeliveryRunStop.objects.select_related('run', 'job').get(pk=pk)
    except DeliveryRunStop.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    notes = str(request.data.get('notes') or '')
    job = stop.job
    job.notes = notes
    job.save(update_fields=['notes', 'updated_at'])
    log_event(stop.run, 'note', actor=request.user, stop=stop, payload={'len': len(notes)})
    return Response(serialize_run(stop.run))


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsEmployee])
def delivery_stop_scan_verify(request, pk: int):
    """Optional load scan: match SKU to a linked cart item on this stop."""
    from apps.pos.services.delivery_run import serialize_run, verify_stop_scan

    try:
        stop = DeliveryRunStop.objects.select_related(
            'run', 'job', 'job__cart_line', 'job__cart_line__item'
        ).get(pk=pk)
    except DeliveryRunStop.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    try:
        verify_stop_scan(stop, user=request.user, sku=str(request.data.get('sku') or ''))
    except ValueError as exc:
        return _delivery_run_error(exc, 'SCAN_MISMATCH')
    return Response(serialize_run(stop.run))


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsEmployee])
def delivery_stop_report_issue(request, pk: int):
    from apps.pos.services.delivery_run import report_issue, serialize_run

    try:
        stop = DeliveryRunStop.objects.select_related('run').get(pk=pk)
    except DeliveryRunStop.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    try:
        report_issue(
            stop,
            user=request.user,
            issue_code=str(request.data.get('issue_code') or ''),
            note=str(request.data.get('note') or ''),
            hold=_parse_request_bool(request.data.get('hold'), default=True),
        )
    except ValueError as exc:
        return _delivery_run_error(exc, 'REPORT_ISSUE_BLOCKED')
    return Response(serialize_run(stop.run))


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsManagerOrAdmin])
def delivery_job_reschedule(request, pk: int):
    from apps.pos.services.delivery_run import get_open_run_for_date, reschedule_job_from_run, serialize_run

    try:
        job = DeliveryJob.objects.get(pk=pk)
    except DeliveryJob.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    avail_id = request.data.get('availability') or request.data.get('availability_id')
    try:
        availability = DeliveryAvailability.objects.get(pk=avail_id)
    except (DeliveryAvailability.DoesNotExist, ValueError, TypeError):
        return Response(
            {'detail': 'Delivery date not found.', 'code': 'AVAILABILITY_NOT_FOUND'},
            status=400,
        )
    old_date = job.scheduled_date
    try:
        reschedule_job_from_run(
            job,
            user=request.user,
            availability=availability,
            notes=str(request.data.get('notes') or ''),
        )
    except ValueError as exc:
        return Response({'detail': str(exc), 'code': 'RESCHEDULE_BLOCKED'}, status=400)
    job.refresh_from_db()
    payload = {'job': DeliveryJobSerializer(job).data}
    old_run = get_open_run_for_date(old_date) if old_date else None
    new_run = get_open_run_for_date(job.scheduled_date) if job.scheduled_date else None
    if old_run:
        payload['run'] = serialize_run(old_run)
    elif new_run:
        payload['run'] = serialize_run(new_run)
    return Response(payload)


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsEmployee])
def delivery_job_append_address(request, pk: int):
    from apps.pos.services.delivery_run import append_address, get_open_run_for_date, serialize_run

    try:
        job = DeliveryJob.objects.get(pk=pk)
    except DeliveryJob.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    try:
        append_address(
            job,
            user=request.user,
            address=str(request.data.get('address') or ''),
            is_apt=bool(request.data.get('is_apt')),
            unit=str(request.data.get('unit') or ''),
            reason=str(request.data.get('reason') or ''),
        )
    except ValueError as exc:
        return _delivery_run_error(exc, 'ADDRESS_REQUIRED')
    run = None
    if job.scheduled_date:
        run = get_open_run_for_date(job.scheduled_date)
    if run is None:
        return Response({'ok': True, 'job_id': job.id})
    return Response(serialize_run(run))


@api_view(['GET'])
@perm_classes([IsAuthenticated])
def dashboard_metrics(request):
    """Dashboard: sales overview and department metric stat cards."""
    from apps.pos.services.dashboard_metrics import get_dashboard_metrics

    return Response(get_dashboard_metrics())


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


@api_view(['GET', 'POST'])
@perm_classes([IsAuthenticated])
def dashboard_sales_goal(request):
    """Read or upsert the singleton dashboard sales chart goal."""
    if request.method == 'GET':
        goal = DashboardSalesGoal.objects.order_by('-updated_at').first()
        if goal is None:
            return Response(None)
        return Response(DashboardSalesGoalSerializer(goal).data)

    if not IsSuperAdmin().has_permission(request, None):
        return Response({'detail': 'Superuser access required.'}, status=status.HTTP_403_FORBIDDEN)

    goal = DashboardSalesGoal.objects.order_by('-updated_at').first()
    serializer = DashboardSalesGoalSerializer(instance=goal, data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save(
        created_by=request.user if goal is None else goal.created_by,
        updated_by=request.user,
    )
    return Response(serializer.data, status=status.HTTP_200_OK if goal else status.HTTP_201_CREATED)


@api_view(['GET', 'POST'])
@perm_classes([IsAuthenticated])
def dashboard_department_goals(request):
    """Read all department goals, or upsert one (superuser only)."""
    if request.method == 'GET':
        goals = DashboardDepartmentGoal.objects.all()
        return Response(DashboardDepartmentGoalSerializer(goals, many=True).data)

    if not IsSuperAdmin().has_permission(request, None):
        return Response({'detail': 'Superuser access required.'}, status=status.HTTP_403_FORBIDDEN)

    department = request.data.get('department')
    existing = DashboardDepartmentGoal.objects.filter(department=department).first()
    serializer = DashboardDepartmentGoalSerializer(instance=existing, data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save(
        created_by=request.user if existing is None else existing.created_by,
        updated_by=request.user,
    )
    # Goal value/schedule affects computed department progress and celebration state.
    from apps.pos.services.dashboard_metrics import invalidate_dashboard_metrics_cache
    invalidate_dashboard_metrics_cache()
    return Response(
        serializer.data,
        status=status.HTTP_200_OK if existing else status.HTTP_201_CREATED,
    )


@api_view(['GET'])
@perm_classes([IsAuthenticated, IsManagerOrAdmin])
def historical_revenue(request):
    """Aggregate revenue across all three database generations for reporting charts.

    Query params:
        period: 'monthly' (default) | 'yearly' | 'weekly'
        sources: 'all' (default) | 'db3_only' | 'db1_db2_only'
        years:   comma-separated list of years to include (default: all)

    Returns aggregated totals grouped by period, broken out by source_db.
    """
    period = request.query_params.get('period', 'monthly')
    sources_filter = request.query_params.get('sources', 'all')
    years_str = request.query_params.get('years', '')

    trunc_fn = {
        'monthly': TruncMonth,
        'yearly': TruncYear,
        'weekly': TruncWeek,
    }.get(period, TruncMonth)

    db3_summary_qs = Cart.objects.filter(status='completed', completed_at__isnull=False)
    db3_qs = Cart.objects.filter(status='completed', completed_at__isnull=False)
    if years_str:
        years = [int(y.strip()) for y in years_str.split(',') if y.strip().isdigit()]
        db3_qs = db3_qs.filter(completed_at__year__in=years)

    db3_data = (
        db3_qs
        .annotate(period=trunc_fn('completed_at'))
        .values('period')
        .annotate(total=Sum('total'), count=Count('id'))
        .order_by('period')
    )

    # Build historical (DB1 + DB2) from HistoricalTransaction
    hist_qs = HistoricalTransaction.objects.all()
    if sources_filter == 'db3_only':
        hist_qs = hist_qs.none()
    if years_str:
        years = [int(y.strip()) for y in years_str.split(',') if y.strip().isdigit()]
        hist_qs = hist_qs.filter(sale_date__year__in=years)

    hist_data = (
        hist_qs
        .annotate(period=trunc_fn('sale_date'))
        .values('period', 'source_db')
        .annotate(total=Sum('total'), count=Count('id'))
        .order_by('period', 'source_db')
    )

    # Combine all into a flat list of {period, source_db, total, count}
    result = []
    if sources_filter != 'db1_db2_only':
        for row in db3_data:
            result.append({
                'period': row['period'].date().isoformat() if row['period'] else None,
                'source_db': 'db3',
                'total': str(row['total'] or 0),
                'transaction_count': row['count'],
            })
    if sources_filter != 'db3_only':
        for row in hist_data:
            result.append({
                'period': row['period'].isoformat() if row['period'] else None,
                'source_db': row['source_db'],
                'total': str(row['total'] or 0),
                'transaction_count': row['count'],
            })

    # Summary totals
    summary = {
        'db1_total': str(
            HistoricalTransaction.objects.filter(source_db='db1').aggregate(t=Sum('total'))['t'] or 0
        ),
        'db2_total': str(
            HistoricalTransaction.objects.filter(source_db='db2').aggregate(t=Sum('total'))['t'] or 0
        ),
        'db3_total': str(db3_summary_qs.aggregate(t=Sum('total'))['t'] or 0),
        'db1_transactions': HistoricalTransaction.objects.filter(source_db='db1').count(),
        'db2_transactions': HistoricalTransaction.objects.filter(source_db='db2').count(),
        'db3_transactions': db3_summary_qs.count(),
    }

    return Response({
        'period': period,
        'data': result,
        'summary': summary,
    })


def _parse_bool_param(raw, default=False) -> bool:
    return _parse_request_bool(raw, default=default)


class DeliveryDayViewSet(viewsets.ViewSet):
    """Canonical paginated Days list/detail + planning actions."""

    permission_classes = [IsAuthenticated, IsEmployee]

    def list(self, request):
        from apps.pos.services.delivery_day import day_list_queryset, serialize_day_summary
        from ecothrift.pagination import ConfigurablePageSizePagination

        qs = day_list_queryset(
            bucket=request.query_params.get('bucket'),
            date_from=request.query_params.get('date_from'),
            date_to=request.query_params.get('date_to'),
            disposition=request.query_params.get('disposition'),
            driver_id=int(request.query_params['driver']) if request.query_params.get('driver') else None,
            search=request.query_params.get('search') or request.query_params.get('q'),
            include_test=_parse_bool_param(request.query_params.get('include_test')),
            include_archived=_parse_bool_param(request.query_params.get('include_archived')),
        )
        paginator = ConfigurablePageSizePagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        data = [serialize_day_summary(d) for d in page]
        return paginator.get_paginated_response(data)

    def retrieve(self, request, pk=None):
        from apps.pos.services.delivery_day import annotate_day_queryset, serialize_day_detail

        try:
            day = annotate_day_queryset(
                DeliveryDay.objects.select_related('location', 'primary_driver', 'test_dataset')
            ).get(pk=pk)
        except DeliveryDay.DoesNotExist:
            return Response({'detail': 'Day not found.', 'code': 'DAY_NOT_FOUND'}, status=404)
        return Response(serialize_day_detail(day))

    def create(self, request):
        from apps.accounts.models import User
        from apps.pos.services.delivery_day import create_day, serialize_day_detail, annotate_day_queryset

        if not (request.user.is_superuser or request.user.groups.filter(name__in=['Manager', 'Admin']).exists()):
            return Response({'detail': 'Manager required.'}, status=403)
        ser = DeliveryDayWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        driver = None
        if data.get('primary_driver'):
            try:
                driver = User.objects.get(pk=data['primary_driver'], is_active=True)
            except User.DoesNotExist:
                return Response({'detail': 'Driver not found.'}, status=400)
        try:
            day = create_day(
                user=request.user,
                day_date=data['date'],
                time_start=data['time_start'],
                time_end=data['time_end'],
                crew_size=data.get('crew_size') or 2,
                assigned_to=data.get('assigned_to') or '',
                notes=data.get('notes') or '',
                primary_driver=driver,
                location_id=data.get('location'),
            )
        except ValueError as exc:
            return Response({'detail': str(exc), 'code': 'DAY_CREATE_INVALID'}, status=400)
        day = annotate_day_queryset(DeliveryDay.objects.filter(pk=day.id)).get()
        return Response(serialize_day_detail(day), status=201)

    def partial_update(self, request, pk=None):
        from apps.accounts.models import User
        from apps.pos.services.delivery_day import (
            annotate_day_queryset, serialize_day_detail, update_day,
        )

        if not (request.user.is_superuser or request.user.groups.filter(name__in=['Manager', 'Admin']).exists()):
            return Response({'detail': 'Manager required.'}, status=403)
        try:
            day = DeliveryDay.objects.get(pk=pk)
        except DeliveryDay.DoesNotExist:
            return Response({'detail': 'Day not found.', 'code': 'DAY_NOT_FOUND'}, status=404)
        ser = DeliveryDayWriteSerializer(data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        kwargs = {
            'day': day,
            'user': request.user,
            'reason': data.get('reason') or '',
        }
        for key in ('time_start', 'time_end', 'crew_size', 'assigned_to', 'notes', 'is_active', 'planning_disposition'):
            if key in data:
                kwargs[key] = data[key]
        if 'primary_driver' in data:
            if data['primary_driver']:
                try:
                    kwargs['primary_driver'] = User.objects.get(pk=data['primary_driver'], is_active=True)
                except User.DoesNotExist:
                    return Response({'detail': 'Driver not found.'}, status=400)
            else:
                kwargs['primary_driver'] = None
        try:
            update_day(**kwargs)
        except ValueError as exc:
            return Response({'detail': str(exc), 'code': 'DAY_UPDATE_INVALID'}, status=400)
        day = annotate_day_queryset(DeliveryDay.objects.filter(pk=day.id)).get()
        return Response(serialize_day_detail(day))

    def destroy(self, request, pk=None):
        from apps.pos.services.delivery_day import archive_day

        if not (request.user.is_superuser or request.user.groups.filter(name__in=['Manager', 'Admin']).exists()):
            return Response({'detail': 'Manager required.'}, status=403)
        try:
            day = DeliveryDay.objects.get(pk=pk)
        except DeliveryDay.DoesNotExist:
            return Response({'detail': 'Day not found.', 'code': 'DAY_NOT_FOUND'}, status=404)
        archive_day(day=day, user=request.user, reason=str(request.data.get('reason') or ''))
        return Response(status=204)

    @action(detail=True, methods=['get'], url_path='run')
    def run(self, request, pk=None):
        """Day-scoped canonical run (active or completed)."""
        from apps.pos.services.delivery_run import serialize_run

        try:
            day = DeliveryDay.objects.get(pk=pk)
        except DeliveryDay.DoesNotExist:
            return Response({'detail': 'Day not found.', 'code': 'DAY_NOT_FOUND'}, status=404)
        run = day.runs.filter(is_canonical=True).order_by('-id').first()
        if run is None:
            return Response({'detail': 'No run for this day.', 'code': 'DAY_RUN_MISSING'}, status=404)
        return Response(serialize_run(run))

    @action(detail=True, methods=['post'], url_path='start-run')
    def start_run(self, request, pk=None):
        from apps.pos.services.delivery_day import start_or_resume_day_run
        from apps.pos.services.delivery_run import serialize_run

        try:
            day = DeliveryDay.objects.get(pk=pk)
        except DeliveryDay.DoesNotExist:
            return Response({'detail': 'Day not found.', 'code': 'DAY_NOT_FOUND'}, status=404)
        try:
            run = start_or_resume_day_run(day=day, user=request.user)
        except PermissionError:
            return Response(
                {'detail': 'This day already has a completed run.', 'code': 'DAY_RUN_FINAL'},
                status=409,
            )
        except ValueError as exc:
            return Response({'detail': str(exc), 'code': 'DAY_START_INVALID'}, status=400)
        return Response(serialize_run(run))


class DeliveryViewSet(viewsets.ViewSet):
    """Canonical paginated Total Deliveries search + CRUD actions."""

    permission_classes = [IsAuthenticated, IsEmployee]

    def list(self, request):
        from apps.pos.services.delivery_crud import delivery_search_queryset
        from ecothrift.pagination import ConfigurablePageSizePagination

        qs = delivery_search_queryset(
            search=request.query_params.get('search') or request.query_params.get('q'),
            status=request.query_params.get('status'),
            date_from=request.query_params.get('date_from'),
            date_to=request.query_params.get('date_to'),
            day_id=int(request.query_params['day']) if request.query_params.get('day') else None,
            include_test=_parse_bool_param(request.query_params.get('include_test')),
            include_archived=_parse_bool_param(request.query_params.get('include_archived')),
        )
        paginator = ConfigurablePageSizePagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(DeliveryJobSerializer(page, many=True).data)

    def retrieve(self, request, pk=None):
        try:
            job = DeliveryJob.objects.select_related(
                'availability', 'cart', 'cart__receipt', 'cart_line', 'created_by',
            ).prefetch_related('address_revisions', 'items').get(pk=pk)
        except DeliveryJob.DoesNotExist:
            return Response({'detail': 'Delivery not found.', 'code': 'DELIVERY_NOT_FOUND'}, status=404)
        return Response(DeliveryJobSerializer(job).data)

    def create(self, request):
        from apps.pos.services.delivery_crud import create_delivery

        if not (request.user.is_superuser or request.user.groups.filter(name__in=['Manager', 'Admin']).exists()):
            return Response({'detail': 'Manager required.'}, status=403)
        day = None
        day_id = request.data.get('day') or request.data.get('day_id') or request.data.get('availability')
        schedule_later = _parse_bool_param(request.data.get('schedule_later')) or day_id in (None, '', 'none')
        if not schedule_later:
            try:
                day = DeliveryDay.objects.get(pk=int(day_id))
            except (DeliveryDay.DoesNotExist, ValueError, TypeError):
                return Response({'detail': 'Day not found.', 'code': 'DAY_NOT_FOUND'}, status=400)
        try:
            job = create_delivery(
                user=request.user,
                customer_name=str(request.data.get('customer_name') or ''),
                phone=str(request.data.get('phone') or ''),
                address=str(request.data.get('address') or ''),
                items_delivered=str(request.data.get('items_delivered') or ''),
                is_apt=_parse_bool_param(request.data.get('is_apt')),
                unit=str(request.data.get('unit') or ''),
                notes=str(request.data.get('notes') or ''),
                day=day,
                schedule_later=schedule_later,
                tier=str(request.data.get('tier') or ''),
                fee=request.data.get('fee'),
                item_count=request.data.get('item_count'),
                item_rows=request.data.get('items') if isinstance(request.data.get('items'), list) else None,
            )
        except ValueError as exc:
            return Response({'detail': str(exc), 'code': 'DELIVERY_CREATE_INVALID'}, status=400)
        job = DeliveryJob.objects.prefetch_related('items', 'address_revisions').get(pk=job.id)
        return Response(DeliveryJobSerializer(job).data, status=201)

    def partial_update(self, request, pk=None):
        from apps.pos.services.delivery_crud import update_delivery

        if not (request.user.is_superuser or request.user.groups.filter(name__in=['Manager', 'Admin']).exists()):
            return Response({'detail': 'Manager required.'}, status=403)
        try:
            job = DeliveryJob.objects.get(pk=pk)
        except DeliveryJob.DoesNotExist:
            return Response({'detail': 'Delivery not found.', 'code': 'DELIVERY_NOT_FOUND'}, status=404)
        try:
            update_delivery(
                job=job,
                user=request.user,
                reason=str(request.data.get('reason') or ''),
                customer_name=request.data.get('customer_name'),
                phone=request.data.get('phone'),
                notes=request.data.get('notes'),
                items_delivered=request.data.get('items_delivered'),
                is_apt=request.data.get('is_apt') if 'is_apt' in request.data else None,
                unit=request.data.get('unit'),
            )
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)
        job = DeliveryJob.objects.prefetch_related('items', 'address_revisions').get(pk=job.id)
        return Response(DeliveryJobSerializer(job).data)

    def destroy(self, request, pk=None):
        from apps.pos.services.delivery_crud import archive_delivery

        if not (request.user.is_superuser or request.user.groups.filter(name__in=['Manager', 'Admin']).exists()):
            return Response({'detail': 'Manager required.'}, status=403)
        try:
            job = DeliveryJob.objects.get(pk=pk)
        except DeliveryJob.DoesNotExist:
            return Response({'detail': 'Delivery not found.', 'code': 'DELIVERY_NOT_FOUND'}, status=404)
        archive_delivery(job=job, user=request.user, reason=str(request.data.get('reason') or ''))
        return Response(status=204)

    @action(detail=True, methods=['post'], url_path='restore')
    def restore(self, request, pk=None):
        from apps.pos.services.delivery_crud import restore_delivery

        if not (request.user.is_superuser or request.user.groups.filter(name__in=['Manager', 'Admin']).exists()):
            return Response({'detail': 'Manager required.'}, status=403)
        try:
            job = DeliveryJob.objects.get(pk=pk)
        except DeliveryJob.DoesNotExist:
            return Response({'detail': 'Delivery not found.', 'code': 'DELIVERY_NOT_FOUND'}, status=404)
        restore_delivery(job=job, user=request.user, reason=str(request.data.get('reason') or ''))
        return Response(DeliveryJobSerializer(job).data)

    @action(detail=True, methods=['post'], url_path='assign-day')
    def assign_day(self, request, pk=None):
        from apps.pos.services.delivery_crud import assign_delivery_to_day

        if not (request.user.is_superuser or request.user.groups.filter(name__in=['Manager', 'Admin']).exists()):
            return Response({'detail': 'Manager required.'}, status=403)
        try:
            job = DeliveryJob.objects.get(pk=pk)
        except DeliveryJob.DoesNotExist:
            return Response({'detail': 'Delivery not found.', 'code': 'DELIVERY_NOT_FOUND'}, status=404)
        try:
            day = DeliveryDay.objects.get(pk=int(request.data.get('day') or request.data.get('day_id')))
        except (DeliveryDay.DoesNotExist, ValueError, TypeError):
            return Response({'detail': 'Day not found.', 'code': 'DAY_NOT_FOUND'}, status=400)
        assign_delivery_to_day(
            job=job,
            day=day,
            user=request.user,
            reason=str(request.data.get('reason') or ''),
        )
        return Response(DeliveryJobSerializer(job).data)

    @action(detail=True, methods=['post'], url_path='items')
    def add_item(self, request, pk=None):
        from apps.pos.services.delivery_crud import add_job_item
        from apps.pos.serializers import DeliveryJobItemSerializer

        if not (request.user.is_superuser or request.user.groups.filter(name__in=['Manager', 'Admin']).exists()):
            return Response({'detail': 'Manager required.'}, status=403)
        try:
            job = DeliveryJob.objects.get(pk=pk)
        except DeliveryJob.DoesNotExist:
            return Response({'detail': 'Delivery not found.', 'code': 'DELIVERY_NOT_FOUND'}, status=404)
        item = add_job_item(
            job=job,
            user=request.user,
            description=str(request.data.get('description') or ''),
            quantity=int(request.data.get('quantity') or 1),
            sku=str(request.data.get('sku') or ''),
            reason=str(request.data.get('reason') or ''),
        )
        return Response(DeliveryJobItemSerializer(item).data, status=201)

    @action(detail=True, methods=['post'], url_path=r'items/(?P<item_id>[^/.]+)/remove')
    def remove_item(self, request, pk=None, item_id=None):
        from apps.pos.services.delivery_crud import remove_job_item
        from apps.pos.serializers import DeliveryJobItemSerializer

        if not (request.user.is_superuser or request.user.groups.filter(name__in=['Manager', 'Admin']).exists()):
            return Response({'detail': 'Manager required.'}, status=403)
        try:
            item = DeliveryJobItem.objects.select_related('job').get(pk=item_id, job_id=pk)
        except DeliveryJobItem.DoesNotExist:
            return Response({'detail': 'Item not found.', 'code': 'ITEM_NOT_FOUND'}, status=404)
        remove_job_item(item=item, user=request.user, reason=str(request.data.get('reason') or ''))
        return Response(DeliveryJobItemSerializer(item).data)

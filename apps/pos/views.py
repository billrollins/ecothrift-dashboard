from decimal import Decimal, InvalidOperation
from django.db import transaction
from django.db.models import Sum, Q, Count
from django.db.models.functions import TruncMonth, TruncYear, TruncWeek
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
)
from .filters import CartFilter, DrawerFilter


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

        existing = cart.lines.filter(item=item).first()
        if existing:
            existing.quantity += 1
            existing.save()
        else:
            CartLine.objects.create(
                cart=cart,
                item=item,
                description=item.product.title,
                quantity=1,
                unit_price=item.price,
            )

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
        )

        cart.recalculate()
        cart = self.get_queryset().get(pk=cart.pk)
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

    @action(detail=True, methods=['patch', 'delete'], url_path='lines/(?P<line_id>[^/.]+)')
    def manage_line(self, request, pk=None, line_id=None):
        """Update (PATCH) or remove (DELETE) a cart line."""
        cart = self.get_object()
        try:
            line = cart.lines.get(id=line_id)
        except CartLine.DoesNotExist:
            return Response({'detail': 'Line not found.'}, status=404)

        if request.method == 'DELETE':
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


# ── Dashboard Metrics ─────────────────────────────────────────────────────────

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

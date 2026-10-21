from datetime import date
from decimal import Decimal, InvalidOperation
from django.db import IntegrityError, transaction
from django.db.models import F, Sum, Q, Count
from django.db.models.functions import Coalesce
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes as perm_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import OrderingFilter

from apps.accounts.permissions import IsManagerOrAdmin, IsStaff, IsEmployee, IsSuperAdmin, IsTeamMember
from apps.core.models import WorkLocation
from apps.inventory.models import Item, ItemScanHistory
from apps.inventory.services.resale_duplicate import duplicate_item_for_resale
from .models import (
    Register, Drawer, DrawerHandoff, CashDrop,
    SupplementalDrawer, SupplementalTransaction, BankTransaction,
    Cart, CartLine, Receipt, RevenueGoal, DashboardSalesGoal,
    DashboardDepartmentGoal,
    DeliveryAvailability, DeliveryDay, DeliveryJob, DeliveryJobItem,
    DeliveryRun, DeliveryRunStop, DeliveryAttachment,
)
from .serializers import thrift_earned_on
from .serializers import (
    RegisterSerializer, DrawerSerializer,
    DrawerHandoffSerializer, CashDropSerializer,
    SupplementalDrawerSerializer, SupplementalTransactionSerializer,
    BankTransactionSerializer,
    CartSerializer, CartLineSerializer, ReceiptSerializer,
    RevenueGoalSerializer, DashboardSalesGoalSerializer,
    DashboardDepartmentGoalSerializer,
    DeliveryAvailabilitySerializer, DeliveryJobSerializer, DeliveryDayWriteSerializer,
)
from .filters import CartFilter, DrawerFilter
from .services import suspend as suspend_service
from .services.cash_counts import CashCountError, clean_amount, clean_count, count_and_total, count_total
from .services.discounts import (
    REASON_GOOGLE_REVIEW,
    REASON_STORE_CREDIT,
    DiscountError,
    assert_google_review_available,
    list_google_review_usernames,
    resolve_discount_amount,
)
from .services.sale_mode import (
    ASSEMBLY_PRICE,
    apply_sale_to_line,
    sale_mode_payload,
    set_labor_day_override,
    set_line_sale as apply_line_sale,
    sync_cart_sale,
)


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


def _sale_cash(cart) -> Decimal:
    """The cash a paid sale put in its drawer: what cash covered (less a split's card part).
    Complete adds it to the drawer's cash sales; void takes the same amount back out.

    The change handed back is not taken off again: the amount due is already the cash kept (tendered less change).
    Until 2026-10-21 the register never sent change, so this was the same; now the server records it."""
    if cart.payment_method not in ('cash', 'split'):
        return Decimal('0')
    cash = cart.total - (cart.thrift_credit or Decimal('0'))
    if cart.payment_method == 'split' and cart.card_amount:
        cash -= cart.card_amount
    return cash


class TenderError(ValueError):
    def __init__(self, message: str, code: str):
        super().__init__(message)
        self.code = code


def _tender_fields(payment_method, amount_due, cash_tendered, change_given, card_amount):
    """What the sale stores for cash, change and card (2026-10-21, lock the till). The server works out the change
    from the cash handed over; a change or card amount sent by the screen must match it, or the sale is refused."""
    due = amount_due.quantize(Decimal('0.01'))
    if payment_method == 'cash':
        if cash_tendered < due:
            raise TenderError(f'Cash tendered ${cash_tendered} is less than the ${due} due.', 'CASH_SHORT')
        change = cash_tendered - due
        if change_given is not None and change_given != change:
            raise TenderError(f'Change given ${change_given} does not match ${change} (cash less the total).',
                              'CHANGE_MISMATCH')
        return cash_tendered, change, None
    if payment_method == 'split':
        if cash_tendered <= 0 or cash_tendered >= due:
            raise TenderError('A split sale takes some cash and the rest on card. Cash that covers it all is a '
                              'cash sale.', 'SPLIT_MISMATCH')
        if change_given:
            raise TenderError('A split sale gives no change.', 'CHANGE_MISMATCH')
        if card_amount is None or card_amount != due - cash_tendered:
            raise TenderError(f'The card part must be ${due - cash_tendered} (the ${due} due less the cash).',
                              'SPLIT_MISMATCH')
        return cash_tendered, Decimal('0.00'), card_amount
    if payment_method == 'card':
        if card_amount is not None and card_amount != due:
            raise TenderError(f'The card amount ${card_amount} does not match the ${due} due.', 'CARD_MISMATCH')
        return None, None, card_amount
    return None, None, None  # payroll: nothing in the drawer, nothing on a card


def _cash_count_error(exc):
    return Response({'detail': str(exc), 'code': 'INVALID_COUNT'}, status=status.HTTP_400_BAD_REQUEST)


def _staff_user(raw):
    """An active staff login (Employee, Manager or Admin) from a request id, or None."""
    from apps.accounts.models import User

    if isinstance(raw, bool):
        return None
    try:
        pk = int(raw)
    except (TypeError, ValueError, OverflowError):
        return None
    if not 0 < pk < 2**31:
        return None
    user = User.objects.filter(pk=pk, is_active=True).first()
    if user is None or not (user.is_superuser or user.role in ('Employee', 'Manager', 'Admin')):
        return None
    return user


def _finished_sale_response(cart):
    """A sale that is no longer open takes no changes (2026-10-21): a paid one is changed only by a manager's Void."""
    if cart.status == 'suspended':
        return Response({'detail': 'This sale is set aside. Bring it back first.', 'code': 'SALE_SET_ASIDE'}, status=400)
    if cart.status != 'open':
        return Response({'detail': 'This sale is finished and cannot be changed.', 'code': 'SALE_FINISHED'}, status=400)
    return None


def _is_training_cart(cart) -> bool:
    """The sale is on a training register (owner, 2026-10-10): practice only, nothing real is written."""
    drawer = getattr(cart, 'drawer', None)
    return bool(getattr(getattr(drawer, 'register', None), 'is_training', False))


# A training register's rows stay out of lists unless they are asked for (2026-10-14): the cash and
# transaction lists show real money only. Asking for one register, drawer or ?include_training=1 shows them.
_TRUE_PARAM = ('1', 'true', 'yes', 'on')


def _include_training_rows(params, *keys: str) -> bool:
    if str(params.get('include_training', '')).strip().lower() in _TRUE_PARAM:
        return True
    return any(params.get(key) not in (None, '') for key in keys)


TRAINING_REFUSED = 'TRAINING_REGISTER'


def _create_training_receipt(cart):
    """A TRAIN- receipt. The test terminal (2026-10-16) runs on several computers at once, so two practice sales
    can finish together and pick the same next number: the second one tries the number after."""
    for attempt in range(5):
        try:
            with transaction.atomic():
                return Receipt.objects.create(cart=cart, receipt_number=Receipt.generate_training_number())
        except IntegrityError:
            if attempt == 4:
                raise
    return None


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
        'Please be home - we call the day of delivery and again when we arrive. '
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

    def get_permissions(self):
        # Lock the till (2026-10-21): drawers change only through open, handoff, takeover, close and drop.
        # Editing or deleting the drawer record itself is for managers.
        if self.action in ('update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), IsManagerOrAdmin()]
        return super().get_permissions()

    def destroy(self, request, *args, **kwargs):
        drawer = self.get_object()
        if drawer.carts.exclude(status='open').exists() or drawer.drops.exists() or drawer.handoffs.exists():
            return Response(
                {'detail': 'This drawer has sales or cash records and cannot be deleted.', 'code': 'DRAWER_HAS_RECORDS'},
                status=status.HTTP_409_CONFLICT,
            )
        return super().destroy(request, *args, **kwargs)

    def get_queryset(self):
        qs = Drawer.objects.select_related(
            'register', 'current_cashier', 'opened_by', 'closed_by',
        ).prefetch_related('handoffs', 'drops').all()
        # The training register's drawer is practice money: left out of drawer lists (and so out of the
        # manager terminal's open-drawer pick) unless its register is asked for. Detail routes still find it.
        if self.action == 'list' and not _include_training_rows(self.request.query_params, 'register'):
            qs = qs.exclude(register__is_training=True)
        return qs

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

        try:
            opening_count, opening_total = count_and_total(
                data, 'opening_count', 'opening_total', 'Opening count', required=False,
            )
        except CashCountError as exc:
            return _cash_count_error(exc)

        # The store's day (America/Chicago), not the UTC day: after ~7 PM UTC is tomorrow (REG-09).
        today = timezone.localdate()

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

    @action(detail=False, methods=['post'], url_path='open-training')
    def open_training(self, request):
        """The test terminal (owner, 2026-10-16): always usable, on the training register only.

        Today's training drawer, opened (zero opening count, for the signed-in user) or reopened if needed.
        Every computer on /pos/test shares this one practice drawer. A real register is refused: its drawer is
        opened by a cashier counting real cash (create above), never automatically.
        """
        try:
            register = Register.objects.get(pk=int(request.data.get('register')))
        except (TypeError, ValueError, Register.DoesNotExist):
            return Response({'detail': 'Register not found.'}, status=status.HTTP_404_NOT_FOUND)
        if not register.is_training:
            return Response(
                {
                    'detail': 'Only the training register opens a drawer by itself. '
                              'A real register needs a cashier to count and open its drawer.',
                    'code': 'NOT_TRAINING_REGISTER',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not register.is_active:
            return Response({'detail': 'The training register is inactive.'}, status=status.HTTP_400_BAD_REQUEST)

        today = timezone.localdate()
        created = False
        drawer = Drawer.objects.filter(register=register, date=today).first()
        if drawer is None:
            try:
                with transaction.atomic():
                    drawer = Drawer.objects.create(
                        register=register,
                        date=today,
                        status='open',
                        current_cashier=request.user,
                        opened_by=request.user,
                        opened_at=timezone.now(),
                        opening_count={},
                        opening_total=Decimal('0'),
                    )
                created = True
            except IntegrityError:
                # Another computer opened it a moment ago: share that one.
                drawer = Drawer.objects.get(register=register, date=today)
        if drawer.status != 'open':
            Drawer.objects.filter(pk=drawer.pk).update(status='open')
            drawer.refresh_from_db()
        return Response(
            DrawerSerializer(drawer).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

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
        incoming = _staff_user(request.data.get('incoming_cashier'))
        if incoming is None:
            return Response(
                {'detail': 'Pick the staff member taking the drawer.', 'code': 'INVALID_CASHIER'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if incoming.pk == drawer.current_cashier_id:
            return Response(
                {'detail': 'That person already has this drawer.', 'code': 'INVALID_CASHIER'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        incoming_cashier_id = incoming.pk
        try:
            count, counted_total = count_and_total(request.data, 'count', 'counted_total', 'Handoff count')
        except CashCountError as exc:
            return _cash_count_error(exc)

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
        try:
            count = clean_count(request.data.get('count'), 'Takeover count')
            sent = clean_amount(request.data.get('counted_total'), 'Takeover count total')
        except CashCountError as exc:
            return _cash_count_error(exc)
        if count:
            counted_total = count_total(count)
            if sent is not None and sent != counted_total:
                return _cash_count_error(CashCountError(
                    f'Takeover count total ${sent} does not match the bills and coins counted (${counted_total}).'))
        elif sent is not None:
            counted_total = sent
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
        # Sales set aside at this register (Suspend, owner 2026-10-20) do not survive the day: warn first, and the
        # close that says so voids them (nothing was sold, so no item or cash changes).
        set_aside = list(suspend_service.suspended_in_drawer(drawer.pk))
        void_suspended = str(request.data.get('void_suspended', '')).strip().lower() in _TRUE_PARAM
        if set_aside and not void_suspended:
            return Response(
                {
                    'detail': (
                        f'{len(set_aside)} sale{"s" if len(set_aside) != 1 else ""} set aside at this register '
                        'will be deleted when the drawer closes.'
                    ),
                    'code': 'SUSPENDED_SALES',
                    'suspended_count': len(set_aside),
                    'suspended': [suspend_service.tab_payload(c) for c in set_aside],
                },
                status=status.HTTP_409_CONFLICT,
            )
        try:
            closing_count, closing_total = count_and_total(
                request.data, 'closing_count', 'closing_total', 'Closing count',
            )
        except CashCountError as exc:
            return _cash_count_error(exc)

        with transaction.atomic():
            if set_aside:
                suspend_service.void_all_for_drawer(drawer.pk, request.user)

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
        if drawer.register.is_training:
            return Response(
                {
                    'detail': 'This is the training register: practice only. Cash drops are not recorded.',
                    'code': TRAINING_REFUSED,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if drawer.status != 'open':
            return Response(
                {'detail': 'This drawer is closed. A drop comes from an open drawer.', 'code': 'DRAWER_CLOSED'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            amount, total = count_and_total(request.data, 'amount', 'total', 'Drop')
        except CashCountError as exc:
            return _cash_count_error(exc)
        if total <= 0:
            return _cash_count_error(CashCountError('Enter the cash being dropped.'))

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

    def _move(self, request, kind: str, sign: int):
        """A draw (sign -1) or return (+1): a checked count, an existing drawer if one is named."""
        supp = self.get_supplemental()
        if not supp:
            return Response({'detail': 'No supplemental drawer configured.'}, status=404)
        try:
            amount, total = count_and_total(request.data, 'amount', 'total', 'Amount')
        except CashCountError as exc:
            return _cash_count_error(exc)
        if total <= 0:
            return _cash_count_error(CashCountError('Enter the cash being moved.'))
        related = request.data.get('related_drawer')
        if related not in (None, ''):
            try:
                related = Drawer.objects.get(pk=int(related)).pk
            except (TypeError, ValueError, OverflowError, Drawer.DoesNotExist):
                return Response({'detail': 'That drawer was not found.', 'code': 'INVALID_DRAWER'}, status=400)
        else:
            related = None

        with transaction.atomic():
            SupplementalTransaction.objects.create(
                supplemental=supp,
                transaction_type=kind,
                amount=amount,
                total=total,
                related_drawer_id=related,
                performed_by=request.user,
                notes=request.data.get('notes', '') or '',
            )
            SupplementalDrawer.objects.filter(pk=supp.pk).update(current_total=F('current_total') + sign * total)
        supp.refresh_from_db()
        return Response(SupplementalDrawerSerializer(supp).data)

    @action(detail=False, methods=['post'])
    def draw(self, request):
        """Draw from supplemental."""
        return self._move(request, 'draw', -1)

    @action(detail=False, methods=['post'], url_path='return')
    def return_cash(self, request):
        """Return cash to supplemental."""
        return self._move(request, 'return', 1)

    @action(detail=False, methods=['post'])
    def audit(self, request):
        """Audit/recount supplemental drawer.

        The page sends the recount as ``count`` and ``total`` (older callers: ``current_balance`` and
        ``current_total``). Until 2026-10-21 the server read only the old names, so every recount from the page
        recorded $0. The adjustment keeps its sign: negative is short, positive is over.
        """
        supp = self.get_supplemental()
        if not supp:
            return Response({'detail': 'No supplemental drawer configured.'}, status=404)
        count_key = 'count' if 'count' in request.data else 'current_balance'
        total_key = 'total' if 'total' in request.data or 'count' in request.data else 'current_total'
        try:
            new_balance, new_total = count_and_total(request.data, count_key, total_key, 'Recount')
        except CashCountError as exc:
            return _cash_count_error(exc)

        old_total = supp.current_total
        adjustment = new_total - old_total

        if adjustment != 0:
            word = 'over' if adjustment > 0 else 'short'
            auto = f'Recount: ${abs(adjustment)} {word} (was ${old_total}, counted ${new_total}).'
            note = (request.data.get('notes') or '').strip()
            SupplementalTransaction.objects.create(
                supplemental=supp,
                transaction_type='audit_adjustment',
                amount=new_balance,
                total=adjustment,
                performed_by=request.user,
                notes=f'{auto} {note}'.strip(),
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

    def get_permissions(self):
        # Lock the till (2026-10-21): staff view sales and ring them through the register's own actions; editing or
        # deleting a sale record itself is for managers, and a paid sale changes only by Void.
        if self.action in ('update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), IsManagerOrAdmin()]
        return super().get_permissions()

    def destroy(self, request, *args, **kwargs):
        cart = self.get_object()
        if cart.status != 'open':
            return Response(
                {'detail': 'Only an open, unpaid sale can be deleted. Void a paid sale instead.',
                 'code': 'SALE_FINISHED'},
                status=status.HTTP_409_CONFLICT,
            )
        return super().destroy(request, *args, **kwargs)

    def get_queryset(self):
        qs = Cart.objects.select_related(
            'drawer', 'cashier', 'receipt', 'card_type_fixed_by',
        ).prefetch_related('lines').all()
        # Practice sales on the training register stay out of the Transactions list (they showed as
        # "Completed" under All). The terminal still finds its own open cart by asking for its drawer.
        if self.action in ('list', 'summary') and not _include_training_rows(self.request.query_params, 'drawer'):
            qs = qs.exclude(drawer__register__is_training=True)
        if self.action == 'list':
            qs = qs.select_related('thrift_member__person').annotate(tp_earned=thrift_earned_on())
        return qs

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Totals for the Transactions page: the same filters as the list, money from completed sales only."""
        qs = self.filter_queryset(self.get_queryset()).order_by()
        voided = qs.filter(status='voided').count()
        thrift_count = qs.filter(status='completed', thrift_member__isnull=False).count()
        done = qs.filter(status='completed')
        totals = done.aggregate(count=Count('id'), total=Sum('total'))
        by_method = {
            row['payment_method']: str(row['total'] or Decimal('0'))
            for row in done.values('payment_method').annotate(total=Sum('total'))
        }
        count = totals['count'] or 0
        total = totals['total'] or Decimal('0')
        average = (total / count).quantize(Decimal('0.01')) if count else Decimal('0')
        return Response({
            'count': count,
            'total': str(total),
            'average': str(average),
            'voided_count': voided,
            'thrift_count': thrift_count,
            'by_method': by_method,
            'sales_numbers': self._sales_numbers(qs),
        })

    def _sales_numbers(self, qs):
        """The Transactions block (owner 10-20): item sales, returns, Thrift+ revenue, tax, fees and how it was paid, for
        the page's filters. Returns count by return day inside the date filter (and only the other filters that can be
        read off a sale: register, cashier, how paid, search); expired ThriftBucks are Thrift+ revenue inside the dates."""
        from apps.pos.filters import CartFilter
        from apps.pos.services import sales_numbers
        from apps.thriftplus.models import ReturnRecord

        params = self.request.query_params
        lo, hi = parse_date(params.get('date_from') or ''), parse_date(params.get('date_to') or '')
        other = {k: v for k, v in params.items()
                 if k in ('drawer', 'cashier', 'payment_method', 'card_type', 'receipt_number', 'q') and v}
        returns = ReturnRecord.objects.all()
        if lo:
            returns = returns.filter(created_at__date__gte=lo)
        if hi:
            returns = returns.filter(created_at__date__lte=hi)
        if other:
            sold_to = CartFilter(data=other, queryset=Cart.objects.all()).qs
            returns = returns.filter(cart_line__cart__in=sold_to.values('pk'))
        expired = None  # ThriftBucks that ran out are the store's, not any one sale's: only when nothing narrows the sales
        if params.get('status') in ('voided', 'open'):
            returns = returns.none()
        elif not other:
            expired = (lo or date(2000, 1, 1), hi or timezone.localdate())
        return sales_numbers.for_carts(qs, returns, expired=expired)

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
        refused = _finished_sale_response(cart)
        if refused is not None:
            return refused
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

        # A sale set aside holds its items (any register): this one cannot take them until that sale is back or gone.
        if not _is_training_cart(cart):
            holder = suspend_service.held_elsewhere(item, exclude_cart_id=cart.pk)
            if holder is not None:
                return Response(
                    {
                        'detail': suspend_service.held_message(holder),
                        'code': suspend_service.HELD_CODE,
                        'item_id': item.pk,
                        'sku': item.sku,
                        'title': item.product.title,
                    },
                    status=400,
                )

        # A sold tag in hand means two items shared one tag: the one here is real. Its old sale moves to a new item
        # number and this one rings up as usual (owner, 2026-10-06: the register always adds). Only consignment
        # and online-listed items still stop, for a person to sort out.
        # The training register (2026-10-14) never moves a real sale: a sold tag rings up for practice as it is
        # (the item stays sold, its old sale stays put; completing a practice sale changes no item).
        training = _is_training_cart(cart)

        # One tag on more than one unit (an extra Quick Reprice copy, a tag stuck on two of the same thing): when the
        # scanned item is already sold, or already on this sale, the register rings the next unsold unit of that
        # check-in instead, never the same item twice. The sold-tag move and the "already sold" stop below only
        # happen when no other unit is left. The training register keeps its own rules (nothing is sold there).
        scanned_item = item
        if not training:
            on_this_sale = cart.lines.filter(item=item).exists()
            if item.status == 'sold' or on_this_sale:
                from apps.pos.services.next_unit import next_unit

                spare = next_unit(item, cart)
                if spare is not None:
                    item = spare
                elif on_this_sale:
                    return Response(
                        {
                            'detail': (
                                f'{item.sku} is already on this sale and there is no other unit of it on the shelf. '
                                'If you are holding a second one, ring it as an unscannable item or ask a lead.'
                            ),
                            'code': 'ITEM_ALREADY_IN_CART',
                            'item_id': item.pk,
                            'sku': item.sku,
                            'title': item.product.title,
                        },
                        status=400,
                    )

        if item.status == 'sold' and not training:
            from apps.inventory.services.duplicate_tag import move_sale_to_new_item, why_not

            if why_not(item) is None:
                move_sale_to_new_item(item, request.user, where='register')
                item.refresh_from_db()
                ItemScanHistory.objects.create(
                    item=item,
                    ip_address=request.META.get('REMOTE_ADDR'),
                    source='pos_terminal',
                    outcome='pos_sold_tag_moved',
                    cart=cart,
                    created_by=request.user,
                )
        if item.status == 'sold' and not training:
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

        # Thrift+ (live registers only): an 18+ item needs a member verified 18+ on the sale.
        from apps.thriftplus.services.register import RegisterError, check_item
        try:
            check_item(cart, item)
        except RegisterError as exc:
            return Response(
                {'detail': str(exc), 'code': exc.code, 'item_id': item.pk, 'sku': item.sku, 'title': item.product.title},
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
                # The training register practises the override but never cancels a real online hold.
                for hold in ([] if training else active_holds):
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
            line = CartLine.objects.create(**create_kwargs)
            apply_sale_to_line(line)

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
        data = CartSerializer(cart).data
        if item.pk != scanned_item.pk:
            data['unit_swapped'] = {'scanned_sku': scanned_item.sku, 'added_sku': item.sku}
        return Response(data)

    @action(detail=True, methods=['post'], url_path='add-resale-copy')
    def add_resale_copy(self, request, pk=None):
        """Create a new on-shelf item from a sold unit and add it to this cart (atomic)."""
        cart = self.get_object()
        if cart.status != 'open':
            return Response(
                {'detail': 'Cart is not open.', 'code': 'CART_NOT_OPEN'},
                status=400,
            )
        if _is_training_cart(cart):
            # A copy is a real new item. The training register rings a sold tag as it is instead (add-item).
            return Response(
                {
                    'detail': 'This is the training register: practice only. No copy is made; scan the tag '
                              'again and it rings up for practice.',
                    'code': TRAINING_REFUSED,
                },
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

        # Thrift+ (live registers only): the copy is the same product, so the same 18+ rule.
        from apps.thriftplus.services.register import RegisterError, check_item
        try:
            check_item(cart, src)
        except RegisterError as exc:
            return Response({'detail': str(exc), 'code': exc.code}, status=400)

        with transaction.atomic():
            new_item = duplicate_item_for_resale(request.user, src)
            line = CartLine.objects.create(
                cart=cart,
                item=new_item,
                description=new_item.product.title,
                quantity=1,
                unit_price=new_item.price,
                resale_source_sku=src.sku,
                resale_source_item_id=src.pk,
                line_kind=CartLine.LINE_KIND_ITEM,
            )
            apply_sale_to_line(line)
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

        line = CartLine.objects.create(
            cart=cart,
            item=None,
            description=description,
            quantity=quantity,
            unit_price=unit_price,
            line_kind=CartLine.LINE_KIND_MANUAL,
        )
        apply_sale_to_line(line)

        cart.recalculate()
        cart = self.get_queryset().get(pk=cart.pk)
        return Response(CartSerializer(cart).data)

    @action(detail=True, methods=['post'], url_path='add-assembly')
    def add_assembly(self, request, pk=None):
        """Add or bump a $35 Assembly line (never sale-discounted)."""
        cart = self.get_object()
        if cart.status != 'open':
            return Response(
                {'detail': 'Cart is not open.', 'code': 'CART_NOT_OPEN'},
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

        existing = cart.lines.filter(line_kind=CartLine.LINE_KIND_ASSEMBLY).first()
        if existing:
            existing.quantity += quantity
            existing.save()
        else:
            CartLine.objects.create(
                cart=cart,
                item=None,
                description='Assembly',
                quantity=quantity,
                unit_price=ASSEMBLY_PRICE,
                line_kind=CartLine.LINE_KIND_ASSEMBLY,
            )

        cart.recalculate()
        cart = self.get_queryset().get(pk=cart.pk)
        return Response(CartSerializer(cart).data)

    @action(detail=True, methods=['post'], url_path='lines/(?P<line_id>[^/.]+)/sale')
    def set_line_sale(self, request, pk=None, line_id=None):
        """Mark a line summer / labor_day / none (none follows current Labor Day mode)."""
        cart = self.get_object()
        if cart.status != 'open':
            return Response(
                {'detail': 'Cart is not open.', 'code': 'CART_NOT_OPEN'},
                status=400,
            )
        try:
            line = cart.lines.get(id=line_id)
        except CartLine.DoesNotExist:
            return Response({'detail': 'Line not found.'}, status=404)
        sale = request.data.get('sale')
        try:
            apply_line_sale(line, sale)
        except ValueError as exc:
            code = str(exc) if str(exc) in ('INVALID_TARGET', 'INVALID_SALE', 'SALE_OFF') else 'INVALID_SALE'
            detail = {
                'INVALID_TARGET': 'Cannot apply that sale to this line.',
                'SALE_OFF': 'That sale is off. The owner turns it on in Settings.',
            }.get(code, 'Invalid sale.')
            return Response({'detail': detail, 'code': code}, status=400)
        cart.recalculate()
        cart = self.get_queryset().get(pk=cart.pk)
        return Response(CartSerializer(cart).data)

    @action(detail=True, methods=['post'], url_path='sync-sale')
    def sync_sale(self, request, pk=None):
        """Re-apply Labor Day to eligible lines (summer lines stay)."""
        cart = self.get_object()
        if cart.status != 'open':
            return Response(
                {'detail': 'Cart is not open.', 'code': 'CART_NOT_OPEN'},
                status=400,
            )
        sync_cart_sale(cart)
        cart = self.get_queryset().get(pk=cart.pk)
        return Response(CartSerializer(cart).data)

    @action(detail=True, methods=['post'], url_path='refresh')
    def refresh(self, request, pk=None):
        """Reload the sale from the server (the register's Refresh button, owner 2026-10-20). An open sale is worked out
        again, so the Thrift+ member's ThriftBucks, credit and status are today's, whatever changed while it was open
        or set aside. Any other sale is answered as it is."""
        cart = self.get_object()
        if cart.status == 'open':
            cart.recalculate()
        cart = self.get_queryset().get(pk=cart.pk)
        return Response(CartSerializer(cart).data)

    @action(detail=False, methods=['get'], url_path='google-review-usernames')
    def google_review_usernames(self, request):
        q = (request.query_params.get('q') or '').strip()
        return Response({'results': list_google_review_usernames(q)})

    @action(detail=True, methods=['post'], url_path='add-discount')
    def add_discount(self, request, pk=None):
        """Add a negative discount / in-store credit line (cart-wide or against one line)."""
        cart = self.get_object()
        if cart.status != 'open':
            return Response(
                {'detail': 'Cart is not open.', 'code': 'CART_NOT_OPEN'},
                status=400,
            )

        reason = (request.data.get('reason') or REASON_STORE_CREDIT).strip()
        if not reason:
            reason = REASON_STORE_CREDIT
        if len(reason) > 200:
            return Response(
                {'detail': 'Reason is too long.', 'code': 'REASON_TOO_LONG'},
                status=400,
            )

        review_name = None
        review_stars = None
        review_key = None
        if reason == REASON_GOOGLE_REVIEW:
            try:
                review_name, review_stars, review_key = assert_google_review_available(
                    cart,
                    request.data.get('google_review_username'),
                    request.data.get('google_review_stars'),
                )
            except DiscountError as exc:
                return Response(
                    {'detail': exc.detail, 'code': exc.code},
                    status=exc.http_status,
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

        positive = sum(
            (ln.line_total for ln in cart.lines.exclude(line_kind=CartLine.LINE_KIND_DISCOUNT)),
            Decimal('0'),
        )
        base = target_line.line_total if target_line is not None else positive
        mode = (request.data.get('mode') or 'amount')

        try:
            amount, percent = resolve_discount_amount(
                mode=mode,
                raw_amount=request.data.get('amount'),
                raw_percent=request.data.get('percent'),
                base=base,
                reason=reason,
            )
        except DiscountError as exc:
            return Response(
                {'detail': exc.detail, 'code': exc.code},
                status=exc.http_status,
            )

        if scope == 'line' and target_line is not None and amount > target_line.line_total:
            return Response(
                {
                    'detail': 'Discount cannot exceed the target line total.',
                    'code': 'DISCOUNT_EXCEEDS_LINE',
                },
                status=400,
            )
        if amount > positive:
            return Response(
                {
                    'detail': 'Discount cannot exceed the current cart merchandise/delivery total.',
                    'code': 'DISCOUNT_EXCEEDS_CART',
                },
                status=400,
            )

        if reason == REASON_GOOGLE_REVIEW and review_name:
            description = f'Discount - {reason} ({review_name}, {review_stars} stars)'
        elif scope == 'line' and target_line is not None:
            description = f'Discount - {reason} (on {target_line.description[:80]})'
        else:
            description = f'Discount - {reason}'
        if scope == 'line' and target_line is not None and reason == REASON_GOOGLE_REVIEW:
            description = f'{description} (on {target_line.description[:80]})'
        description = description[:300]

        meta = {
            'reason': reason,
            'scope': scope,
            'target_line_id': target_line.pk if target_line else None,
            'amount': str(amount),
            'mode': (str(mode) or 'amount').strip().lower(),
            'percent': str(percent) if percent is not None else None,
        }
        if review_name is not None:
            meta['google_review_username'] = review_name
            meta['google_review_username_key'] = review_key
            meta['google_review_stars'] = review_stars

        CartLine.objects.create(
            cart=cart,
            item=None,
            description=description,
            quantity=1,
            unit_price=-amount,
            line_kind=CartLine.LINE_KIND_DISCOUNT,
            meta=meta,
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
        if _is_training_cart(cart):
            # A delivery is a real job on the delivery board; practice sales never book one (2026-10-14).
            return Response(
                {
                    'detail': 'This is the training register: practice only. Deliveries cannot be booked here, '
                              'so nothing goes on the real delivery board.',
                    'code': TRAINING_REFUSED,
                },
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
            description = f'{label} - {items_delivered} - {customer_name} - {date_label}'[:300]
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
            description = f'{label} - {items_delivered} - {customer_name} - schedule later'[:300]
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

    @action(detail=True, methods=['get'], url_path='card-preview', filter_backends=[])
    def card_preview(self, request, pk=None):
        """Server-computed CardX totals for the two-button match step."""
        from apps.pos.services.card_surcharge import (
            CardSurchargeError,
            preview_payload,
            resolve_card_base,
        )

        cart = self.get_object()
        payment_method = request.query_params.get('payment_method', 'card')
        allowed = {choice[0] for choice in Cart.PAYMENT_METHODS}
        if payment_method not in allowed:
            return Response({'detail': 'Invalid payment method.'}, status=400)
        try:
            card_base = resolve_card_base(
                payment_method=payment_method if payment_method != 'cash' else 'card',
                cart_total=cart.total - (cart.thrift_credit or Decimal('0')),  # Thrift+ credit covers the rest
                card_amount=request.query_params.get('card_amount'),
            )
        except CardSurchargeError as exc:
            return Response({'detail': str(exc)}, status=400)
        return Response(preview_payload(card_base))

    @action(detail=True, methods=['post'], url_path='card-type', filter_backends=[])
    def set_card_type(self, request, pk=None):
        """Correct card_type on a completed card/split sale and recompute surcharge."""
        from apps.pos.services.card_surcharge import (
            CardSurchargeError,
            apply_card_surcharge,
            card_type_fix_deadline,
        )

        cart = self.get_object()
        if cart.status != 'completed':
            return Response(
                {'detail': 'Only completed sales can change card type.'},
                status=400,
            )
        if cart.payment_method == 'cash':
            return Response(
                {'detail': 'Cash sales have no card type.'},
                status=400,
            )
        if cart.payment_method not in ('card', 'split'):
            return Response(
                {'detail': 'Only card or split sales can change card type.'},
                status=400,
            )

        card_type = (request.data.get('card_type') or '').strip()
        if card_type not in ('credit', 'debit'):
            return Response(
                {'detail': 'card_type must be credit or debit.'},
                status=400,
            )
        if card_type == cart.card_type:
            return Response(
                {'detail': 'card_type is already set to that value.'},
                status=400,
            )

        now = timezone.now()
        deadline = card_type_fix_deadline(cart)
        locked = deadline is None or now > deadline
        if locked and not request.user.is_superuser:
            return Response(
                {
                    'detail': (
                        'This sale is past the 15 minute window. '
                        'Ask Bill Rollins to change it.'
                    ),
                    'code': 'CARD_TYPE_FIX_LOCKED',
                },
                status=403,
            )

        try:
            surcharge_fields = apply_card_surcharge(
                payment_method=cart.payment_method,
                card_type=card_type,
                cart_total=cart.total,
                card_amount=cart.card_amount,
            )
        except CardSurchargeError as exc:
            return Response({'detail': str(exc)}, status=400)

        cart.card_type = surcharge_fields['card_type']
        cart.card_surcharge_rate = surcharge_fields['card_surcharge_rate']
        cart.card_surcharge_amount = surcharge_fields['card_surcharge_amount']
        cart.card_charged_total = surcharge_fields['card_charged_total']
        cart.card_type_fixed_at = now
        cart.card_type_fixed_by = request.user
        cart.save(update_fields=[
            'card_type',
            'card_surcharge_rate',
            'card_surcharge_amount',
            'card_charged_total',
            'card_type_fixed_at',
            'card_type_fixed_by',
        ])
        cart = self.get_queryset().get(pk=cart.pk)
        return Response(CartSerializer(cart).data)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Complete a cart (finalize sale)."""
        from apps.pos.services.card_surcharge import (
            CardSurchargeError,
            apply_card_surcharge,
            parse_money,
        )

        from apps.thriftplus.services import register as thrift_register

        cart = self.get_object()
        if cart.status != 'open':
            return Response({'detail': 'Cart is not open.'}, status=400)
        if cart.drawer_id and cart.drawer.status != 'open':
            return Response(
                {'detail': 'This drawer is closed. Open a drawer to take payment.', 'code': 'DRAWER_CLOSED'},
                status=400,
            )
        if not hasattr(request.data, 'get'):
            return Response({'detail': 'Send the payment as a set of fields.', 'code': 'INVALID_PAYLOAD'}, status=400)
        if not _is_training_cart(cart):
            for line in cart.lines.filter(item__isnull=False).select_related('item'):
                holder = suspend_service.held_elsewhere(line.item, exclude_cart_id=cart.pk)
                if holder is not None:
                    return Response(
                        {'detail': suspend_service.held_message(holder), 'code': suspend_service.HELD_CODE,
                         'sku': line.item.sku},
                        status=400,
                    )
        if cart.total < 0:
            return Response(
                {'detail': 'Cart total cannot be negative.', 'code': 'NEGATIVE_TOTAL'},
                status=400,
            )

        # A training register (owner, 2026-10-10): the same checks, then nothing real is written.
        training = _is_training_cart(cart)

        # Thrift+: a member, spent credit or a live register. Dark registers skip all of it.
        thrift = thrift_register.touches(cart)
        if thrift:
            try:
                thrift_register.before_complete(cart)
            except thrift_register.RegisterError as exc:
                return Response({'detail': str(exc), 'code': exc.code}, status=400)
        # What cash or card must cover: the total less Thrift+ credit and banked rewards (0 when dark).
        amount_due = cart.total - (cart.thrift_credit or Decimal('0'))

        payment_method = request.data.get('payment_method', 'cash')
        allowed = {choice[0] for choice in Cart.PAYMENT_METHODS}
        if not isinstance(payment_method, str) or payment_method not in allowed:
            return Response({'detail': 'Invalid payment method.'}, status=400)

        # Every money field is checked before anything is written: a bad one is a plain 400, never a server error.
        try:
            cash_tendered = parse_money(
                request.data.get('cash_tendered'), 'Cash tendered', required=payment_method in ('cash', 'split'),
            )
            change_given = parse_money(request.data.get('change_given'), 'Change given')
            card_amount = parse_money(request.data.get('card_amount'), 'Card amount')
            card_charged_total = parse_money(request.data.get('card_charged_total'), 'Card charged total')
        except CardSurchargeError as exc:
            return Response({'detail': str(exc), 'code': 'INVALID_AMOUNT'}, status=400)
        raw_card_type = request.data.get('card_type') or ''
        if not isinstance(raw_card_type, str):
            return Response({'detail': 'card_type must be credit or debit.', 'code': 'INVALID_AMOUNT'}, status=400)

        # Payroll deduction (staff only): the owner's switch, the cap and the rules, before anything is written.
        payroll_employee = None
        if payment_method == 'payroll':
            from apps.accounts.models import User
            from apps.pos.services.staff_purchases import StaffPurchaseError, check_floor_day, eligibility

            try:
                payroll_pk = int(request.data.get('payroll_employee') or 0)
            except (TypeError, ValueError, OverflowError):
                payroll_pk = 0
            payroll_employee = User.objects.filter(pk=payroll_pk).first() if 0 < payroll_pk < 2**31 else None
            check = eligibility(payroll_employee, cashier=request.user, amount=amount_due)
            if not check['eligible']:
                return Response({'detail': check['reason'], 'code': 'PAYROLL_NOT_ALLOWED'}, status=400)
            try:
                check_floor_day(cart)
            except StaffPurchaseError as exc:
                return Response({'detail': str(exc), 'code': exc.code}, status=400)

        try:
            cash_tendered, change_given, card_amount = _tender_fields(
                payment_method, amount_due, cash_tendered, change_given, card_amount,
            )
        except TenderError as exc:
            return Response({'detail': str(exc), 'code': exc.code}, status=400)

        card_type = raw_card_type.strip()
        try:
            surcharge_fields = apply_card_surcharge(
                payment_method=payment_method,
                card_type=card_type,
                cart_total=amount_due,
                card_amount=card_amount,
                client_charged_total=card_charged_total,
            )
        except CardSurchargeError as exc:
            return Response({'detail': str(exc)}, status=400)

        if training:
            with transaction.atomic():
                if not self._lock_open_cart(cart):
                    return self._already_finished()
                cart.payment_method = payment_method
                cart.cash_tendered = cash_tendered
                cart.change_given = change_given
                cart.card_amount = card_amount
                cart.card_type = surcharge_fields['card_type']
                cart.card_surcharge_rate = surcharge_fields['card_surcharge_rate']
                cart.card_surcharge_amount = surcharge_fields['card_surcharge_amount']
                cart.card_charged_total = surcharge_fields['card_charged_total']
                cart.status = 'training'  # not 'completed': every report counts completed sales only
                cart.completed_at = timezone.now()
                cart.save()
                # No drawer cash, no item sold, no hold or consignment closed, no Thrift+ money: practice only.
                # No delivery either: add-delivery refuses on this register; any job left from before is cancelled.
                _cancel_delivery_jobs_for_cart(cart)
                _create_training_receipt(cart)
            return Response(CartSerializer(cart).data)

        with transaction.atomic():
            # A double tap (or two screens) sends Complete twice: the second waits here, then finds it finished.
            if not self._lock_open_cart(cart):
                return self._already_finished()
            cart.payment_method = payment_method
            cart.cash_tendered = cash_tendered
            cart.change_given = change_given
            cart.card_amount = card_amount
            cart.card_type = surcharge_fields['card_type']
            cart.card_surcharge_rate = surcharge_fields['card_surcharge_rate']
            cart.card_surcharge_amount = surcharge_fields['card_surcharge_amount']
            cart.card_charged_total = surcharge_fields['card_charged_total']
            cart.payroll_employee = payroll_employee
            cart.status = 'completed'
            cart.completed_at = timezone.now()
            cart.save()

            # Update drawer cash_sales_total (void takes the same amount back out). Added in the database, so two
            # registers' sales on one drawer at the same moment both count.
            if payment_method in ('cash', 'split'):
                Drawer.objects.filter(pk=cart.drawer_id).update(
                    cash_sales_total=F('cash_sales_total') + _sale_cash(cart),
                )

            # Mark items as sold
            for line in cart.lines.filter(item__isnull=False):
                item = line.item
                item.status = 'sold'
                item.sold_at = timezone.now()
                qty = line.quantity or 1
                item.sold_for = (line.line_total / qty).quantize(Decimal('0.01'))
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
                    ci.sale_amount = item.sold_for
                    rate = ci.agreement.commission_rate / Decimal('100')
                    ci.store_commission = (ci.sale_amount * rate).quantize(Decimal('0.01'))
                    ci.consignee_earnings = ci.sale_amount - ci.store_commission
                    ci.save()

            if thrift:
                thrift_register.after_complete(cart, user=request.user)

            # Generate receipt
            Receipt.objects.create(
                cart=cart,
                receipt_number=Receipt.generate_receipt_number(),
            )

        return Response(CartSerializer(cart).data)

    @staticmethod
    def _lock_open_cart(cart) -> bool:
        """Lock the sale's row until the transaction ends; False when it is no longer open (finished a moment ago)."""
        return Cart.objects.select_for_update().filter(pk=cart.pk, status='open').exists()

    @staticmethod
    def _already_finished():
        return Response(
            {'detail': 'This sale was already completed.', 'code': 'SALE_ALREADY_COMPLETED'},
            status=status.HTTP_409_CONFLICT,
        )

    # ── Suspend (owner 2026-10-20): set a sale aside, ring another, bring it back ─────────────────────────────

    @action(detail=False, methods=['get'], url_path='suspended')
    def suspended(self, request):
        """The bookmark tabs: sales set aside on a drawer (``?drawer=``; ``?cashier=`` narrows it, as the shared test
        terminal needs). Oldest first."""
        try:
            drawer_id = int(request.query_params.get('drawer') or 0)
        except (TypeError, ValueError):
            drawer_id = 0
        if not drawer_id:
            return Response({'detail': 'drawer is required.'}, status=400)
        cashier = request.query_params.get('cashier')
        carts = suspend_service.suspended_in_drawer(drawer_id, int(cashier) if str(cashier or '').isdigit() else None)
        return Response({'results': [suspend_service.tab_payload(c) for c in carts]})

    def _suspend_error(self, exc):
        return Response({'detail': str(exc), 'code': exc.code}, status=400)

    @action(detail=True, methods=['post'], url_path='suspend')
    def suspend(self, request, pk=None):
        """Set this open sale aside. Its items stay held; nothing is sold."""
        cart = self.get_object()
        try:
            suspend_service.suspend(cart.pk)
        except suspend_service.SuspendError as exc:
            return self._suspend_error(exc)
        return Response(suspend_service.tab_payload(self.get_queryset().get(pk=cart.pk)))

    @action(detail=True, methods=['post'], url_path='resume')
    def resume(self, request, pk=None):
        """Bring a set-aside sale back as the open one. ``current`` (optional) is the sale on screen: it is set aside
        in its place when it has items, and dropped when it is empty. Answers the fresh cart."""
        cart = self.get_object()
        try:
            suspend_service.resume(cart.pk, request.data.get('current'))
        except suspend_service.SuspendError as exc:
            return self._suspend_error(exc)
        return Response(CartSerializer(self.get_queryset().get(pk=cart.pk)).data)

    @action(detail=True, methods=['post'], url_path='delete-suspended')
    def delete_suspended(self, request, pk=None):
        """Delete a set-aside sale (any cashier; the manager-only Void is for paid sales). Voids it; the items were
        never sold, so they are simply free for the next sale."""
        cart = self.get_object()
        try:
            suspend_service.delete_suspended(cart.pk, request.user)
        except suspend_service.SuspendError as exc:
            return self._suspend_error(exc)
        return Response(CartSerializer(self.get_queryset().get(pk=cart.pk)).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsManagerOrAdmin])
    def void(self, request, pk=None):
        """Void a cart (manager only).

        A paid sale takes its cash back out of the drawer and puts its items back on the shelf.
        A sale voided before payment touches neither: it never sold anything, and its items may be on
        the sale that was paid (a slow register can open the same scan in two carts, 2026-10-06).
        """
        from apps.thriftplus.services.register import after_void

        cart = self.get_object()
        with transaction.atomic():
            cart = Cart.objects.select_for_update().get(pk=cart.pk)
            if cart.status == 'voided':
                return Response({'detail': 'This sale is already voided.'}, status=400)
            was_paid = cart.status == 'completed'

            if was_paid and cart.payment_method in ('cash', 'split'):
                drawer = Drawer.objects.select_for_update().get(pk=cart.drawer_id)
                if drawer.status == 'open':
                    drawer.cash_sales_total -= _sale_cash(cart)
                    drawer.save(update_fields=['cash_sales_total'])

            cart.status = 'voided'
            cart.save()

            _cancel_delivery_jobs_for_cart(cart)

            if was_paid:
                # Back on the shelf, unless another paid sale holds the item.
                for line in cart.lines.filter(item__isnull=False).select_related('item'):
                    item = line.item
                    sold_elsewhere = CartLine.objects.filter(item=item, cart__status='completed').exclude(
                        cart=cart).exists()
                    if item.status == 'sold' and not sold_elsewhere:
                        item.status = 'on_shelf'
                        item.sold_at = None
                        item.sold_for = None
                        item.save()

            # Thrift+: give back what the sale wrote to the member's cover, bank and credit.
            after_void(cart, user=request.user)

        return Response(CartSerializer(cart).data)

    @action(detail=True, methods=['patch', 'delete'], url_path='lines/(?P<line_id>[^/.]+)')
    def manage_line(self, request, pk=None, line_id=None):
        """Update (PATCH) or remove (DELETE) a cart line."""
        cart = self.get_object()
        refused = _finished_sale_response(cart)
        if refused is not None:
            return refused
        try:
            line = cart.lines.get(id=line_id)
        except CartLine.DoesNotExist:
            return Response({'detail': 'Line not found.'}, status=404)

        if request.method == 'DELETE':
            if line.line_kind == CartLine.LINE_KIND_DELIVERY:
                _cancel_delivery_job_for_line(line)
            line.delete()
        else:
            extra_units = []
            keep_qty = 1
            if 'quantity' in request.data:
                try:
                    target_qty = int(request.data['quantity'])
                except (TypeError, ValueError, OverflowError):
                    return Response({'detail': 'Quantity must be a whole number.', 'code': 'INVALID_QUANTITY'}, status=400)
                # One item is one unit: asking for more of an item line rings the next unsold units of it
                # as their own lines (the same item is never sold twice). The training register sells nothing.
                if (line.item_id and line.line_kind == CartLine.LINE_KIND_ITEM and not _is_training_cart(cart)
                        and target_qty > max(line.quantity or 1, 1)):
                    from apps.pos.services.next_unit import next_units

                    need = target_qty - max(line.quantity or 1, 1)
                    extra_units = next_units(line.item, cart, need)
                    if len(extra_units) < need:
                        have = len(extra_units) + max(line.quantity or 1, 1)
                        return Response(
                            {
                                'detail': (
                                    f'Only {have} of {line.item.sku} {"is" if have == 1 else "are"} on the shelf. '
                                    'The quantity was not changed.'
                                ),
                                'code': 'NOT_ENOUGH_UNITS',
                            },
                            status=400,
                        )
                    keep_qty = max(line.quantity or 1, 1)
            for field in ('quantity', 'description', 'unit_price'):
                if field in request.data:
                    setattr(line, field, keep_qty if (field == 'quantity' and extra_units) else request.data[field])
            line.save()
            for unit in extra_units:
                extra = CartLine.objects.create(
                    cart=cart,
                    item=unit,
                    description=unit.product.title,
                    quantity=1,
                    unit_price=line.unit_price,
                    line_kind=CartLine.LINE_KIND_ITEM,
                    sale_label=line.sale_label,
                )
                apply_sale_to_line(extra)

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


@api_view(['GET', 'POST'])
@perm_classes([IsAuthenticated, IsTeamMember])
def sale_mode(request):
    """The register's sales (GET, any staff). POST turns the store sale on or off: the owner only (REG-21)."""
    if request.method == 'GET':
        return Response(sale_mode_payload())
    if not (request.user.is_superuser or getattr(request.user, 'role', None) == 'Admin'):
        return Response({'detail': 'Only the owner turns the store sale on or off.', 'code': 'OWNER_ONLY'}, status=403)
    if 'override' not in request.data:
        return Response(
            {'detail': 'override is required (true, false, or null).', 'code': 'OVERRIDE_REQUIRED'},
            status=400,
        )
    raw = request.data.get('override')
    if raw is None:
        value = None
    elif raw is True or raw == 'true':
        value = True
    elif raw is False or raw == 'false':
        value = False
    else:
        return Response(
            {'detail': 'override must be true, false, or null.', 'code': 'INVALID_OVERRIDE'},
            status=400,
        )
    user = request.user if request.user.is_authenticated else None
    set_labor_day_override(value, user=user)
    return Response(sale_mode_payload())


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
def delivery_run_preview_insert(request, pk: int):
    from apps.pos.services.delivery_run import StaleRouteRevision, preview_insert_stop

    try:
        run = DeliveryRun.objects.get(pk=pk)
    except DeliveryRun.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    stop_id = request.data.get('stop_id')
    if stop_id is None:
        return Response({'detail': 'stop_id required.', 'code': 'STOP_ID_REQUIRED'}, status=400)
    base_revision = request.data.get('base_revision')
    try:
        preview = preview_insert_stop(
            run,
            int(stop_id),
            base_revision=int(base_revision) if base_revision is not None else None,
        )
    except StaleRouteRevision as exc:
        return Response({'detail': str(exc), 'code': 'STALE_ROUTE_REVISION'}, status=409)
    except (TypeError, ValueError) as exc:
        return _delivery_run_error(exc, 'PREVIEW_INSERT_FAILED')
    return Response(preview)


@api_view(['POST'])
@perm_classes([IsAuthenticated, IsEmployee])
def delivery_run_commit_insert(request, pk: int):
    from apps.pos.services.delivery_run import (
        StaleRouteRevision,
        commit_insert_stop,
        serialize_run,
    )

    try:
        run = DeliveryRun.objects.get(pk=pk)
    except DeliveryRun.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    stop_id = request.data.get('stop_id')
    if stop_id is None:
        return Response({'detail': 'stop_id required.', 'code': 'STOP_ID_REQUIRED'}, status=400)
    base_revision = request.data.get('base_revision')
    position = request.data.get('position')
    try:
        commit_insert_stop(
            run,
            int(stop_id),
            user=request.user,
            base_revision=int(base_revision) if base_revision is not None else None,
            position=int(position) if position is not None else None,
        )
    except StaleRouteRevision as exc:
        return Response({'detail': str(exc), 'code': 'STALE_ROUTE_REVISION'}, status=409)
    except (TypeError, ValueError) as exc:
        return _delivery_run_error(exc, 'COMMIT_INSERT_FAILED')
    run.refresh_from_db()
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
    reason = str(request.data.get('reason') or '')
    try:
        mark_loaded(
            stop,
            user=request.user,
            loaded=_parse_request_bool(loaded, default=True),
            reason=reason,
        )
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
    """Legacy adapter - prefer /contact-attempt/ and /disposition/."""
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
    from apps.pos.services.delivery_phase2 import ScanMismatchError, scan_stop_item
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
            allow_mismatch=_parse_request_bool(request.data.get('allow_mismatch')),
        )
    except ScanMismatchError as exc:
        return Response(exc.as_api_payload(), status=409)
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
    reason = str(request.data.get('reason') or '')
    try:
        set_stop_item_loaded(
            item,
            user=request.user,
            loaded=_parse_request_bool(loaded, default=True),
            reason=reason,
        )
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
def delivery_run_reopen_truck(request, pk: int):
    from apps.pos.services.delivery_phase2 import reopen_truck
    from apps.pos.services.delivery_run import serialize_run

    try:
        run = DeliveryRun.objects.get(pk=pk)
    except DeliveryRun.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    try:
        reopen_truck(
            run,
            user=request.user,
            reason=str(request.data.get('reason') or ''),
        )
    except ValueError as exc:
        return _delivery_run_error(exc, 'TRUCK_REOPEN_BLOCKED')
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
    try:
        mark_delivered(stop, user=request.user, delivered=bool(delivered))
    except ValueError as exc:
        return Response({'detail': str(exc)}, status=400)
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
@perm_classes([IsAuthenticated, IsTeamMember])
def dashboard_metrics(request):
    """Dashboard: sales overview and department metric stat cards.

    Query params:
        weeks: department daily-grid lookback (2-12, default 8).
    """
    from apps.pos.services.dashboard_metrics import clamp_department_weeks, get_dashboard_metrics

    weeks_back = clamp_department_weeks(request.query_params.get('weeks'))
    return Response(get_dashboard_metrics(weeks_back=weeks_back))


@api_view(['GET'])
@perm_classes([IsAuthenticated, IsTeamMember])
def dashboard_alerts(request):
    """Dashboard alerts for managers."""
    from apps.hr.models import TimeEntry

    alerts = []

    # Pending time entries
    pending_time = TimeEntry.objects.filter(status='pending').count()
    if pending_time:
        alerts.append({
            'type': 'time_entries',
            'message': f'{pending_time} time entries pending approval',
            'count': pending_time,
        })

    # Open drawers (real registers only: the training register's practice drawer is not real cash)
    today = timezone.localdate()
    open_drawers = Drawer.objects.filter(status='open', date=today).exclude(register__is_training=True).count()
    if open_drawers:
        alerts.append({
            'type': 'drawers',
            'message': f'{open_drawers} drawer(s) still open',
            'count': open_drawers,
        })

    return Response(alerts)


@api_view(['GET', 'POST'])
@perm_classes([IsAuthenticated, IsTeamMember])
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
@perm_classes([IsAuthenticated, IsTeamMember])
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

    @action(detail=True, methods=['get'], url_path='route-map')
    def route_map(self, request, pk=None):
        """PNG of the day's real route. Rendered server-side to keep the Maps key private."""
        from django.http import HttpResponse

        from apps.pos.services.delivery_distance import STORE_MAPS_ADDRESS
        from apps.pos.services.delivery_route_map import fetch_route_map_png
        from apps.pos.services.delivery_run import format_stop_address, routable_stops_in_order

        try:
            day = DeliveryDay.objects.get(pk=pk)
        except DeliveryDay.DoesNotExist:
            return Response({'detail': 'Day not found.', 'code': 'DAY_NOT_FOUND'}, status=404)

        run = day.runs.filter(is_canonical=True).order_by('-id').first()
        polyline = None
        if run is not None:
            summary = run.route_summary if isinstance(run.route_summary, dict) else {}
            polyline = summary.get('polyline') or None
            addresses = [format_stop_address(s.job) for s in routable_stops_in_order(run)]
        else:
            addresses = [
                format_stop_address(job)
                for job in day.jobs.filter(archived_at__isnull=True)
                .exclude(status=DeliveryJob.STATUS_CANCELLED)
                .order_by('id')
            ]

        png = fetch_route_map_png(
            stop_addresses=addresses,
            store_address=STORE_MAPS_ADDRESS,
            polyline=polyline,
        )
        if png is None:
            return Response(
                {'detail': 'Route map unavailable.', 'code': 'ROUTE_MAP_UNAVAILABLE'},
                status=404,
            )
        response = HttpResponse(png, content_type='image/png')
        response['Cache-Control'] = 'private, max-age=300'
        return response

    @action(detail=True, methods=['get'], url_path='history')
    def history(self, request, pk=None):
        """Audit timeline for the day and the deliveries currently on it."""
        from apps.pos.services.delivery_audit import (
            HISTORY_PAGE_LIMIT,
            day_history_queryset,
            serialize_change_event,
        )

        if not DeliveryDay.objects.filter(pk=pk).exists():
            return Response({'detail': 'Day not found.', 'code': 'DAY_NOT_FOUND'}, status=404)
        events = day_history_queryset(int(pk))[:HISTORY_PAGE_LIMIT]
        return Response({'results': [serialize_change_event(e) for e in events]})

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

        source_line_ids: list[int] = []
        raw_line_ids = request.data.get('cart_line_ids')
        if isinstance(raw_line_ids, list):
            for raw_id in raw_line_ids:
                try:
                    source_line_ids.append(int(raw_id))
                except (TypeError, ValueError):
                    continue

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
                cart=cart,
                source_cart_line_ids=source_line_ids or None,
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

    @action(detail=True, methods=['get'], url_path='history')
    def history(self, request, pk=None):
        """Audit timeline for one delivery, including its items."""
        from apps.pos.services.delivery_audit import (
            HISTORY_PAGE_LIMIT,
            job_history_queryset,
            serialize_change_event,
        )

        if not DeliveryJob.objects.filter(pk=pk).exists():
            return Response({'detail': 'Delivery not found.', 'code': 'DELIVERY_NOT_FOUND'}, status=404)
        events = job_history_queryset(int(pk))[:HISTORY_PAGE_LIMIT]
        return Response({'results': [serialize_change_event(e) for e in events]})

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
        try:
            assign_delivery_to_day(
                job=job,
                day=day,
                user=request.user,
                reason=str(request.data.get('reason') or ''),
            )
        except ValueError as exc:
            return Response({'detail': str(exc), 'code': 'ASSIGN_DAY_BLOCKED'}, status=400)
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

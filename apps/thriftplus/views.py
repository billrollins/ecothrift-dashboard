"""
Thrift+ staff API: members, their people and cards, and blank-card batches (Phase 1); the reward
engine's dry run, item log and nightly runs (Phase 2); the register's member actions and 18+ products
(Phase 3).

The register (Phase 3) and the signup flow (Phase 4) build on the same services. Until launch the
Dash screens are superuser-only in the nav; the API itself is staff-level, like the rest of Dash.
"""
from __future__ import annotations

import base64
from datetime import date
from decimal import Decimal, InvalidOperation

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsEmployee, IsManagerOrAdmin, IsStaff
from apps.thriftplus.models import (
    Account,
    Card,
    CardBatch,
    LedgerEntry,
    Person,
    RestrictedProduct,
    ReturnRecord,
    RewardRun,
    SalePhoto,
)
from apps.thriftplus.serializers import (
    AccountDetailSerializer,
    AccountSerializer,
    CardBatchSerializer,
    CardSerializer,
    PersonSerializer,
)
from apps.thriftplus.services import calculator, card_pdf, cards, floor_plan, ledger, members, register, returns, rewards
from apps.thriftplus.services import emails as email_consent
from apps.thriftplus.services.members import MemberError


def _truthy(value) -> bool:
    return str(value).lower() in ('1', 'true', 'yes', 'on')


def _error(exc: Exception) -> Response:
    return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)


def _emails(d) -> dict:
    """The sign-up's two email boxes (``emails_thriftplus``, ``emails_news``); unticked or missing means no."""
    return {kind: _truthy(d.get(f'emails_{kind}')) for kind in email_consent.KINDS}


class AccountViewSet(viewsets.ReadOnlyModelViewSet):
    """Find (``?q=`` card, phone or name), sign up, add a second adult, revoke."""

    permission_classes = [IsAuthenticated, IsStaff]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    pagination_class = None

    def get_queryset(self):
        qs = members.find(self.request.query_params.get('q', '')) if self.action == 'list' else Account.objects.all()
        return qs.prefetch_related('people__cards')[:100] if self.action == 'list' else qs.prefetch_related('people__cards')

    def get_serializer_class(self):
        return AccountDetailSerializer if self.action == 'retrieve' else AccountSerializer

    def create(self, request, *args, **kwargs):
        d = request.data
        try:
            account = members.create_account(
                first_name=d.get('first_name', ''), last_name=d.get('last_name', ''), phone=d.get('phone', ''),
                id_checked=_truthy(d.get('id_checked')), verified_18=_truthy(d.get('verified_18')),
                photo=request.FILES.get('photo'), card_code=d.get('card_code', ''), email=d.get('email', ''), emails=_emails(d),
                user=request.user,
            )
        except MemberError as exc:
            return _error(exc)
        return Response(AccountDetailSerializer(account).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='email-wording')
    def email_wording(self, request):
        """The two email boxes' words (T73), so every sign-up screen shows exactly what is recorded."""
        return Response(email_consent.wordings())

    @action(detail=True, methods=['post'], url_path='second-adult')
    def second_adult(self, request, pk=None):
        d = request.data
        try:
            members.add_second_adult(
                self.get_object(), both_present=_truthy(d.get('both_present')), primary_approves=_truthy(d.get('primary_approves')),
                first_name=d.get('first_name', ''), last_name=d.get('last_name', ''), phone=d.get('phone', ''),
                id_checked=_truthy(d.get('id_checked')), verified_18=_truthy(d.get('verified_18')),
                photo=request.FILES.get('photo'), card_code=d.get('card_code', ''), email=d.get('email', ''), emails=_emails(d),
                user=request.user,
            )
        except MemberError as exc:
            return _error(exc)
        return Response(AccountDetailSerializer(self.get_object()).data)

    @action(detail=True, methods=['get'])
    def money(self, request, pk=None):
        """The membership's cover, banked rewards and store credit, and its last 50 ledger rows (Phase 4)."""
        account = self.get_object()
        rows = account.ledger.select_related('actor', 'item').order_by('-created_at', '-pk')[:50]
        return Response({
            **ledger.balances(account),
            'entries': [
                {'id': e.pk, 'kind': e.kind, 'amount': str(e.amount), 'month': e.month, 'reason': e.reason,
                 'cart': e.cart_id, 'sku': e.item.sku if e.item_id else '', 'note': e.note,
                 'actor': e.actor.full_name if e.actor_id else '', 'created_at': e.created_at}
                for e in rows
            ],
        })

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsManagerOrAdmin])
    def adjust(self, request, pk=None):
        """A manager's correction to store credit or banked rewards, with a note. Never below zero."""
        account = self.get_object()
        kind = request.data.get('kind')
        if kind not in (LedgerEntry.KIND_CREDIT, LedgerEntry.KIND_BANK):
            return Response({'detail': 'Adjust credit or bank.'}, status=status.HTTP_400_BAD_REQUEST)
        note = str(request.data.get('note') or '').strip()
        if not note:
            return Response({'detail': 'Say why.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            amount = Decimal(str(request.data.get('amount'))).quantize(Decimal('0.01'))
        except (InvalidOperation, TypeError):
            return Response({'detail': 'The amount must be dollars, like 5.00 or -5.00.'}, status=status.HTTP_400_BAD_REQUEST)
        if not amount or ledger.balance(account, kind) + amount < 0:
            return Response({'detail': 'That would take the balance below zero.'}, status=status.HTTP_400_BAD_REQUEST)
        ledger.record(account, kind, amount, 'adjust', actor=request.user, note=note)
        members.log('adjust', account=account, actor=request.user, kind=kind, amount=str(amount), note=note[:200])
        return self.money(request, pk)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsManagerOrAdmin])
    def staff(self, request, pk=None):
        """Mark this membership as a staff member's own ({user: id}), or not ({user: null}). With the owner's
        "Thrift+ free for staff" on, it pays no monthly cover while that person is active staff."""
        from apps.accounts.models import User
        from apps.pos.services.staff_purchases import is_staff_member

        account = self.get_object()
        raw = request.data.get('user')
        user = None
        if raw not in (None, ''):
            user = User.objects.filter(pk=raw).first()
            if not is_staff_member(user):
                return Response({'detail': 'Pick an active staff member.'}, status=status.HTTP_400_BAD_REQUEST)
            other = Account.objects.filter(staff_user=user).exclude(pk=account.pk).first()
            if other:
                return Response({'detail': f'{user.full_name} already has Thrift+ membership {other.pk}.'},
                                status=status.HTTP_400_BAD_REQUEST)
        account.staff_user = user
        account.save(update_fields=['staff_user', 'updated_at'])
        members.log('staff', account=account, actor=request.user, staff_user=user.pk if user else None)
        return Response(AccountDetailSerializer(account).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsManagerOrAdmin])
    def revoke(self, request, pk=None):
        try:
            account = members.revoke(self.get_object(), reason=request.data.get('reason', ''), user=request.user)
        except MemberError as exc:
            return _error(exc)
        return Response(AccountDetailSerializer(account).data)


class PersonViewSet(viewsets.GenericViewSet):
    """Verify ID, set the photo, issue a card, take a second adult off."""

    permission_classes = [IsAuthenticated, IsStaff]
    queryset = Person.objects.select_related('account')
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def _done(self, person: Person) -> Response:
        return Response(AccountDetailSerializer(person.account).data)

    @action(detail=True, methods=['post'])
    def verify(self, request, pk=None):
        try:
            return self._done(members.verify(self.get_object(), verified_18=_truthy(request.data.get('verified_18')), user=request.user))
        except MemberError as exc:
            return _error(exc)

    @action(detail=True, methods=['post'])
    def photo(self, request, pk=None):
        upload = request.FILES.get('photo')
        if not upload:
            return _error(MemberError('Attach a photo.'))
        return self._done(members.set_photo(self.get_object(), upload, user=request.user))

    @action(detail=True, methods=['post'])
    def emails(self, request, pk=None):
        """Change one email choice when the member asks ({kind: 'thriftplus' | 'news', opted_in})."""
        person = self.get_object()
        name = (request.user.full_name or '').strip() or request.user.email
        try:
            email_consent.set_choice(person, str(request.data.get('kind') or ''), _truthy(request.data.get('opted_in')),
                                     how=f'Staff: {name} (they asked)', user=request.user)
        except MemberError as exc:
            return _error(exc)
        return self._done(person)

    @action(detail=True, methods=['post'])
    def email(self, request, pk=None):
        """Add or change a member's email address ({email}); blank removes it."""
        person = self.get_object()
        try:
            email_consent.set_address(person, str(request.data.get('email') or ''), user=request.user)
        except MemberError as exc:
            return _error(exc)
        return self._done(person)

    @action(detail=True, methods=['post'], url_path='issue-card')
    def issue_card(self, request, pk=None):
        person = self.get_object()
        try:
            members.issue_card(person, request.data.get('code', ''), user=request.user)
        except MemberError as exc:
            return _error(exc)
        return self._done(person)

    @action(detail=True, methods=['post'])
    def remove(self, request, pk=None):
        person = self.get_object()
        try:
            members.remove_second_adult(person, removed_by=request.data.get('removed_by', ''), user=request.user)
        except MemberError as exc:
            return _error(exc)
        return self._done(person)


class CardViewSet(viewsets.GenericViewSet):
    """Look a card up by what was scanned or typed, or kill one (lost or stolen)."""

    permission_classes = [IsAuthenticated, IsStaff]
    queryset = Card.objects.select_related('person__account')

    @action(detail=False, methods=['get'])
    def lookup(self, request):
        try:
            card = members.card_by_code(request.query_params.get('code', ''))
        except MemberError as exc:
            return _error(exc)
        data = CardSerializer(card).data
        data['person'] = PersonSerializer(card.person).data if card.person_id else None
        data['account_id'] = card.person.account_id if card.person_id else None
        data['account_status'] = card.person.account.status if card.person_id else None
        return Response(data)

    @action(detail=True, methods=['post'])
    def kill(self, request, pk=None):
        card = members.kill_card(self.get_object(), reason=request.data.get('reason', 'lost'), user=request.user)
        return Response(CardSerializer(card).data)


class CardBatchViewSet(viewsets.ReadOnlyModelViewSet):
    """Blank-card batches: generate codes, print their backs through the print server, mark printed."""

    permission_classes = [IsAuthenticated, IsManagerOrAdmin]
    serializer_class = CardBatchSerializer
    queryset = CardBatch.objects.all()

    def create(self, request, *args, **kwargs):
        try:
            batch = cards.generate_batch(int(request.data.get('size') or 0), user=request.user, note=request.data.get('note', ''))
        except (TypeError, ValueError) as exc:
            return _error(exc)
        return Response(CardBatchSerializer(batch).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def backs(self, request, pk=None):
        """The backs as one PDF (download), or ``?jobs=1`` as print-server jobs of 10 pages (base64)."""
        batch = get_object_or_404(CardBatch, pk=pk)
        codes = list(batch.cards.filter(status=Card.STATUS_UNISSUED).values_list('code', flat=True))
        if not codes:
            return _error(ValueError('No blank cards left in this batch.'))
        if _truthy(request.query_params.get('jobs')):
            jobs = [base64.b64encode(chunk).decode('ascii') for chunk in card_pdf.pdf_chunks(codes)]
            return Response({'cards': len(codes), 'jobs': jobs})
        response = HttpResponse(card_pdf.card_backs_pdf(codes), content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="thrift-plus-card-backs-{batch.pk}.pdf"'
        return response

    @action(detail=True, methods=['post'], url_path='mark-printed')
    def mark_printed(self, request, pk=None):
        batch = get_object_or_404(CardBatch, pk=pk)
        batch.printed_at = timezone.now()
        batch.save(update_fields=['printed_at'])
        members.log('batch_printed', actor=request.user, batch=batch.pk, size=batch.size)
        return Response(CardBatchSerializer(batch).data)


class RewardsViewSet(viewsets.ViewSet):
    """
    The reward engine, read-only (Phase 2):
    - ``preview``: what members would pay on a day (default tomorrow), the dry run;
    - ``item``: one item's reward and its log;
    - ``runs``: the nightly runs.
    """

    permission_classes = [IsAuthenticated, IsManagerOrAdmin]

    @action(detail=False, methods=['get'])
    def preview(self, request):
        day = None
        if request.query_params.get('day'):
            try:
                day = date.fromisoformat(request.query_params['day'])
            except ValueError:
                return Response({'detail': 'day must be YYYY-MM-DD'}, status=status.HTTP_400_BAD_REQUEST)
        report = rewards.summarize(rewards.plan(day))
        report['switch_on'] = members.is_enabled()
        last = RewardRun.objects.first()
        report['last_run'] = _run_payload(last) if last else None
        return Response(report)

    @action(detail=False, methods=['get'])
    def item(self, request):
        from apps.inventory.models import Item

        sku = (request.query_params.get('sku') or '').strip()
        found = Item.objects.select_related('product').filter(sku__iexact=sku).first() if sku else None
        if found is None:
            return Response({'detail': 'No item with that SKU.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(rewards.item_detail(found))

    @action(detail=False, methods=['get'])
    def overview(self, request):
        """The owner's Thrift+ numbers (Phase 4): members, sales, rewards, what is owed, returns, scans."""
        from apps.thriftplus.services.overview import overview
        return Response(overview())

    @action(detail=False, methods=['get'], url_path='floor-plan')
    def floor_plan(self, request):
        """What members would pay for the stock on the floor under the choices in the query (nothing is changed)."""
        scenario, error = _floor_scenario(request)
        if error:
            return error
        result = floor_plan.simulate(scenario)
        current = rewards.rules()
        result['current_settings'] = {'start': current.start.isoformat() if current.start else None,
                                      'floor_share': str(current.floor_share), 'switch_on': members.is_enabled()}
        return Response(result)

    @action(detail=False, methods=['get'], url_path='floor-plan/compare')
    def floor_compare(self, request):
        """The usual options side by side, at launch and a few weeks after."""
        scenario, error = _floor_scenario(request)
        if error:
            return error
        return Response(floor_plan.compare(scenario))

    @action(detail=False, methods=['get'])
    def runs(self, request):
        return Response([_run_payload(r) for r in RewardRun.objects.all()[:30]])

    @action(detail=False, methods=['get'])
    def calculator(self, request):
        """The rewards calculator (owner, 2026-10-07): the last inventory's stock under the rules in the query.
        What-if only: nothing is changed."""
        params, error = _calculator_params(request)
        if error:
            return error
        result = calculator.simulate(params)
        current = rewards.rules()
        result['current_settings'] = {'start': current.start.isoformat() if current.start else None,
                                      'floor_share': str(current.floor_share), 'switch_on': members.is_enabled()}
        return Response(result)


def _calculator_params(request):
    """Read the calculator's inputs. Returns (Params, None) or (None, error Response). Blank = the default."""
    q = request.query_params
    d = calculator.Params()

    def bad(msg):
        return None, Response({'detail': msg}, status=status.HTTP_400_BAD_REQUEST)

    def num(key, default, lo, hi, cast=float):
        raw = q.get(key)
        if raw in (None, ''):
            return default
        value = cast(raw)
        if not lo <= value <= hi:
            raise ValueError(f'{key} must be {lo} to {hi}')
        return value

    try:
        launch = date.fromisoformat(q['launch']) if q.get('launch') else d.launch
        population = q.get('population') or d.population
        if population not in ('counted', 'shelf'):
            return bad('population must be counted or shelf')
        curve = q.get('curve') or d.curve
        if curve not in calculator.CURVES:
            return bad(f'curve must be one of {", ".join(calculator.CURVES)}')
        params = calculator.Params(
            population=population, launch=launch,
            offset=num('offset', d.offset, 0, 365, int),
            wait_days=num('wait_days', d.wait_days, 0, 60, int),
            pct_per_day=num('pct_per_day', d.pct_per_day, 0, 20),
            step_days=num('step_days', d.step_days, 1, 60, int),
            curve=curve,
            floor_share=num('floor_share', d.floor_share, 0, 1),
            same_slowdown=num('same_slowdown', d.same_slowdown, 0, 100),
            count_back_stock=_truthy(q.get('count_back_stock', '1')),
            similar_slowdown=num('similar_slowdown', d.similar_slowdown, 0, 100),
            max_slowdown=num('max_slowdown', d.max_slowdown, 0, 95),
            demand=_truthy(q.get('demand', '')),
            demand_strength=num('demand_strength', d.demand_strength, 0, 2),
            max_age=num('max_age', None, 1, 3650, int),
            age_factor=num('age_factor', d.age_factor, 0, 1),
            max_start_pct=num('max_start_pct', None, 0, 100),
        )
    except ValueError as exc:
        return bad(str(exc) if 'must be' in str(exc) else 'The inputs must be numbers (dates as YYYY-MM-DD).')
    return params, None


def _floor_scenario(request):
    """Read the planner's choices from the query. Returns (Scenario, None) or (None, error Response)."""
    from decimal import Decimal, InvalidOperation

    q = request.query_params

    def bad(msg):
        return None, Response({'detail': msg}, status=status.HTTP_400_BAD_REQUEST)

    try:
        launch = date.fromisoformat(q.get('launch') or '2026-10-20')
    except ValueError:
        return bad('launch must be YYYY-MM-DD')
    try:
        offset = int(q.get('offset') or 0)
        max_age = int(q['max_age']) if q.get('max_age') not in (None, '') else None
        wait_days = int(q.get('wait_days') or rewards.WAIT_DAYS)
        horizon = int(q.get('horizon') or rewards.HORIZON)
        share = Decimal(q['floor_share']) if q.get('floor_share') not in (None, '') else rewards.rules().floor_share
    except (ValueError, InvalidOperation):
        return bad('The numbers must be whole numbers, and floor_share a number between 0 and 1.')
    if not 0 <= offset <= 365:
        return bad('offset must be 0 to 365')
    if max_age is not None and not 1 <= max_age <= 365:
        return bad('max_age must be 1 to 365')
    if not 0 <= wait_days <= 30:
        return bad('wait_days must be 0 to 30')
    if not 10 <= horizon <= 365:
        return bad('horizon must be 10 to 365')
    if not Decimal('0') <= share <= Decimal('1'):
        return bad('floor_share must be between 0 and 1')
    return floor_plan.Scenario(launch=launch, offset=offset, max_age=max_age, floor_share=share, wait_days=wait_days, horizon=horizon), None


def _run_payload(run: RewardRun) -> dict:
    return {
        'id': run.pk, 'day': run.day.isoformat(), 'started_at': run.started_at, 'finished_at': run.finished_at,
        'counts': run.counts, 'error': run.error.splitlines()[0] if run.error else '',
    }


class RegisterViewSet(viewsets.ViewSet):
    """
    Thrift+ at the register (Phase 3). Each action takes ``cart`` (the POS cart id) and answers with
    the POS cart, so the terminal can take it as its new state:
    - ``attach``: scan a member's card onto the sale;
    - ``detach``;
    - ``choice``: bank or instant;
    - ``balance``: spend store credit and banked rewards;
    - ``rering``: a card on a sale finished in the last 30 minutes.

    Every action refuses while Thrift+ is dark at that register.
    """

    permission_classes = [IsAuthenticated, IsEmployee]

    def _cart(self, request):
        from apps.pos.models import Cart

        return get_object_or_404(Cart, pk=request.data.get('cart'))

    def _done(self, cart) -> Response:
        from apps.pos.models import Cart
        from apps.pos.serializers import CartSerializer

        return Response(CartSerializer(Cart.objects.get(pk=cart.pk)).data)

    def _run(self, request, fn):
        cart = self._cart(request)
        try:
            fn(cart)
        except register.RegisterError as exc:
            return Response({'detail': str(exc), 'code': exc.code}, status=status.HTTP_400_BAD_REQUEST)
        return self._done(cart)

    @action(detail=False, methods=['get'])
    def status(self, request):
        """Whether Thrift+ is live at a register (``?register=<code>``), before any sale exists."""
        code = str(request.query_params.get('register') or '').strip().upper()
        return Response({'live': members.is_enabled() or code in register.live_register_codes()})

    @action(detail=False, methods=['post'])
    def attach(self, request):
        return self._run(request, lambda cart: register.attach(cart, str(request.data.get('code') or ''), user=request.user))

    @action(detail=False, methods=['post'])
    def detach(self, request):
        return self._run(request, lambda cart: register.detach(cart, user=request.user))

    @action(detail=False, methods=['post'])
    def choice(self, request):
        return self._run(request, lambda cart: register.set_choice(cart, str(request.data.get('choice') or '')))

    @action(detail=False, methods=['post'])
    def balance(self, request):
        def spend(cart):
            try:
                credit = Decimal(str(request.data.get('credit') or '0'))
                bank = Decimal(str(request.data.get('bank') or '0'))
            except InvalidOperation as exc:
                raise register.RegisterError('BAD_AMOUNT', 'Amounts must be dollars, like 5.00.') from exc
            register.use_balance(cart, credit=credit, bank=bank)
        return self._run(request, spend)

    @action(detail=False, methods=['post'])
    def rering(self, request):
        return self._run(request, lambda cart: register.rering(cart, str(request.data.get('code') or ''), user=request.user))


class RestrictedProductViewSet(viewsets.ViewSet):
    """18+ products (Phase 3): list, mark by SKU, unmark. Manager or Admin."""

    permission_classes = [IsAuthenticated, IsManagerOrAdmin]

    def list(self, request):
        rows = RestrictedProduct.objects.select_related('product', 'marked_by').order_by('-marked_at')[:500]
        return Response([
            {'product_id': r.product_id, 'title': r.product.title, 'reason': r.reason, 'marked_at': r.marked_at,
             'marked_by': r.marked_by.full_name if r.marked_by else ''}
            for r in rows
        ])

    def create(self, request):
        from apps.inventory.models import Item

        sku = (request.data.get('sku') or '').strip()
        item = Item.objects.filter(sku__iexact=sku).first() if sku else None
        if item is None:
            return Response({'detail': 'No item with that SKU.'}, status=status.HTTP_404_NOT_FOUND)
        row, _ = RestrictedProduct.objects.get_or_create(
            product_id=item.product_id,
            defaults={'reason': (request.data.get('reason') or '')[:120], 'marked_by': request.user},
        )
        members.log('restricted_marked', actor=request.user, product=item.product_id, sku=item.sku)
        return Response({'product_id': row.product_id, 'title': item.product.title}, status=status.HTTP_201_CREATED)

    def destroy(self, request, pk=None):
        deleted, _ = RestrictedProduct.objects.filter(product_id=pk).delete()
        if deleted:
            members.log('restricted_unmarked', actor=request.user, product=pk)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ReturnsViewSet(viewsets.ViewSet):
    """
    Member returns at the register (Phase 3):
    - ``lookup``: a card's recent purchases, each with whether it can come back;
    - ``create``: take one back as store credit;
    - ``photo``: the serial and condition photo of a $100+ item at the sale;
    - ``list`` and ``done``: returned items waiting for staff.
    """

    permission_classes = [IsAuthenticated, IsEmployee]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def list(self, request):
        rows = ReturnRecord.objects.select_related('person', 'cart_line', 'item').order_by('status', '-created_at')[:200]
        return Response([
            {'id': r.pk, 'status': r.status, 'member': f'{r.person.first_name} {r.person.last_name}'.strip(),
             'sku': r.item.sku if r.item_id else '', 'title': r.cart_line.description, 'paid': str(r.paid), 'note': r.note,
             'created_at': r.created_at}
            for r in rows
        ])

    @action(detail=False, methods=['get'])
    def lookup(self, request):
        try:
            return Response(returns.purchases(str(request.query_params.get('code') or '')))
        except register.RegisterError as exc:
            return Response({'detail': str(exc), 'code': exc.code}, status=status.HTTP_400_BAD_REQUEST)

    def create(self, request):
        from apps.pos.models import CartLine

        line = get_object_or_404(CartLine.objects.select_related('cart', 'item__product'), pk=request.data.get('cart_line'))
        try:
            record = returns.do_return(
                line, str(request.data.get('code') or ''), confirmed=_truthy(request.data.get('confirmed')),
                note=str(request.data.get('note') or ''), user=request.user,
            )
        except register.RegisterError as exc:
            return Response({'detail': str(exc), 'code': exc.code}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'id': record.pk, 'credit': str(record.paid), **ledger.balances(record.account)}, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'])
    def photo(self, request):
        from apps.pos.models import CartLine

        line = get_object_or_404(CartLine, pk=request.data.get('cart_line'))
        upload = request.FILES.get('photo')
        if upload is None:
            return Response({'detail': 'Attach a photo.'}, status=status.HTTP_400_BAD_REQUEST)
        SalePhoto.objects.create(cart_line=line, photo=upload, taken_by=request.user)
        return Response({'cart_line': line.pk, 'photos': SalePhoto.objects.filter(cart_line=line).count()}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def done(self, request, pk=None):
        ReturnRecord.objects.filter(pk=pk).update(status=ReturnRecord.STATUS_DONE)
        return Response(status=status.HTTP_204_NO_CONTENT)

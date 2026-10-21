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
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsEmployee, IsManagerOrAdmin, IsStaff, IsSuperAdmin, IsTeamMember
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
from apps.thriftplus.services import (
    calculator,
    card_pdf,
    cards,
    floor_plan,
    ledger,
    members,
    owner_pin,
    register,
    returns,
    returns_find,
    rewards,
)
from apps.thriftplus.services import emails as member_email
from apps.thriftplus.services.members import MemberError


def _truthy(value) -> bool:
    return str(value).lower() in ('1', 'true', 'yes', 'on')


def _public_base() -> str:
    """Where emailed links point (the public site), built like the password reset's."""
    from django.conf import settings

    return getattr(settings, 'ONLINE_SALES_PUBLIC_BASE_URL', '') or 'https://ecothrift.us'


def _error(exc: Exception) -> Response:
    return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)



class AccountViewSet(viewsets.ReadOnlyModelViewSet):
    """Find (``?q=`` member code, phone, email or name; ``?status=pending`` the online joins still to finish at a
    register), sign up, add a second adult, revoke."""

    permission_classes = [IsAuthenticated, IsStaff]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    pagination_class = None

    def get_queryset(self):
        if self.action != 'list':
            return Account.objects.all().prefetch_related('people__cards')
        qs = members.find(self.request.query_params.get('q', ''))
        wanted = self.request.query_params.get('status')
        if wanted in dict(Account.STATUS_CHOICES):
            qs = qs.filter(status=wanted)
        return qs.prefetch_related('people__cards')[:100]

    def get_serializer_class(self):
        return AccountDetailSerializer if self.action == 'retrieve' else AccountSerializer

    def create(self, request, *args, **kwargs):
        d = request.data
        if _truthy(d.get('practice')):  # a sign-up on the training register (2026-10-10)
            try:
                account = members.make_practice_member(
                    first_name=d.get('first_name', ''), last_name=d.get('last_name', ''), card_code=d.get('card_code', ''),
                    photo=request.FILES.get('photo'), user=request.user,
                )
            except MemberError as exc:
                return _error(exc)
            return Response(AccountDetailSerializer(account).data, status=status.HTTP_201_CREATED)
        try:
            account = members.create_account(
                first_name=d.get('first_name', ''), last_name=d.get('last_name', ''), phone=d.get('phone', ''),
                id_checked=_truthy(d.get('id_checked')), verified_18=_truthy(d.get('verified_18')),
                photo=request.FILES.get('photo'), card_code=d.get('card_code', ''), email=d.get('email', ''),
                user=request.user,
            )
        except MemberError as exc:
            return _error(exc)
        return Response(AccountDetailSerializer(account).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'])
    def practice(self, request):
        """Make a practice member for training (owner, 2026-10-10). Optional: first_name, card_code (a blank card)."""
        try:
            account = members.make_practice_member(first_name=request.data.get('first_name', ''),
                                                   card_code=request.data.get('card_code', ''), user=request.user)
        except MemberError as exc:
            return _error(exc)
        return Response(AccountDetailSerializer(account).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='email-note')
    def email_note(self, request):
        """The one line under the sign-up's email field (T74: no boxes)."""
        return Response({'note': member_email.NOTE})

    @action(detail=True, methods=['post'], url_path='second-adult')
    def second_adult(self, request, pk=None):
        d = request.data
        try:
            members.add_second_adult(
                self.get_object(), both_present=_truthy(d.get('both_present')), primary_approves=_truthy(d.get('primary_approves')),
                first_name=d.get('first_name', ''), last_name=d.get('last_name', ''), phone=d.get('phone', ''),
                id_checked=_truthy(d.get('id_checked')), verified_18=_truthy(d.get('verified_18')),
                photo=request.FILES.get('photo'), card_code=d.get('card_code', ''), email=d.get('email', ''),
                user=request.user,
            )
        except MemberError as exc:
            return _error(exc)
        return Response(AccountDetailSerializer(self.get_object()).data)

    @action(detail=True, methods=['get'])
    def money(self, request, pk=None):
        """The membership's ThriftBucks (with each lot's use-by date) and Thrift+ credit, and its last 50 ledger rows."""
        account = self.get_object()
        rows = account.ledger.select_related('actor', 'item').order_by('-created_at', '-pk')[:50]
        return Response({
            **ledger.balances(account),
            'lots': ledger.reward_lots(account),
            'entries': [
                {'id': e.pk, 'kind': e.kind, 'amount': str(e.amount), 'month': e.month, 'reason': e.reason,
                 'cart': e.cart_id, 'sku': e.item.sku if e.item_id else '', 'note': e.note,
                 'actor': e.actor.full_name if e.actor_id else '', 'created_at': e.created_at}
                for e in rows
            ],
        })

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsManagerOrAdmin])
    def adjust(self, request, pk=None):
        """A manager's correction to Thrift+ credit or ThriftBucks, with a note. Never below zero. ThriftBucks added
        here are usable at once, for 30 days."""
        account = self.get_object()
        kind = request.data.get('kind')
        if kind not in (LedgerEntry.KIND_CREDIT, LedgerEntry.KIND_BANK):
            return Response({'detail': 'Adjust Thrift+ credit or ThriftBucks.'}, status=status.HTTP_400_BAD_REQUEST)
        note = str(request.data.get('note') or '').strip()
        if not note:
            return Response({'detail': 'Say why.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            amount = Decimal(str(request.data.get('amount'))).quantize(Decimal('0.01'))
        except (InvalidOperation, TypeError):
            return Response({'detail': 'The amount must be dollars, like 5.00 or -5.00.'}, status=status.HTTP_400_BAD_REQUEST)
        have = ledger.credit_balance(account) if kind == LedgerEntry.KIND_CREDIT else ledger.bucks_total(account)
        if not amount or have + amount < 0:
            return Response({'detail': 'That would take the balance below zero.'}, status=status.HTTP_400_BAD_REQUEST)
        ledger.record(account, kind, amount, 'adjust', actor=request.user, note=note)
        members.log('adjust', account=account, actor=request.user, kind=kind, amount=str(amount), note=note[:200])
        return self.money(request, pk)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsManagerOrAdmin])
    def staff(self, request, pk=None):
        """Mark this membership as a staff member's own ({user: id}), or not ({user: null}) (J6). Staff memberships
        are free, like every membership."""
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
                # Owner 2026-10-15: every staff member has their own now; a customer membership of theirs merges in.
                return Response({'detail': f'{user.full_name} already has Thrift+ membership {other.pk}. To bring this '
                                           'one into it, use Merge on the Staff tab.'},
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

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsManagerOrAdmin])
    def deactivate(self, request, pk=None):
        """The normal way to take a member off (owner 2026-10-16); Reactivate undoes it."""
        try:
            account = members.deactivate(self.get_object(), reason=request.data.get('reason', ''), user=request.user)
        except MemberError as exc:
            return _error(exc)
        return Response(AccountDetailSerializer(account).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsManagerOrAdmin])
    def reactivate(self, request, pk=None):
        try:
            account = members.reactivate(self.get_object(), user=request.user)
        except MemberError as exc:
            return _error(exc)
        return Response(AccountDetailSerializer(account).data)

    @action(detail=True, methods=['get'], url_path='delete-preview', permission_classes=[IsAuthenticated, IsSuperAdmin])
    def delete_preview(self, request, pk=None):
        """Everything a delete would remove (owner 2026-10-16: testing only). Changes nothing."""
        from apps.thriftplus.services import delete_member

        return Response(delete_member.preview(self.get_object()))

    @action(detail=True, methods=['post'], url_path='delete', permission_classes=[IsAuthenticated, IsSuperAdmin])
    def delete_forever(self, request, pk=None):
        """Delete the member and everything they left, as if they never existed. Body: {name} typed to match."""
        from apps.thriftplus.services import delete_member

        try:
            result = delete_member.delete(self.get_object(), typed_name=str(request.data.get('name') or ''),
                                          actor=request.user)
        except MemberError as exc:
            return _error(exc)
        return Response(result)


class StaffMembershipsViewSet(viewsets.ViewSet):
    """
    Staff memberships (owner 2026-10-15; ``services/staff_members.py``). Every active staff member has their own
    Thrift+ membership; the owner fills in the missing ones and merges a staff member's older customer membership in:
    - GET ``staff-memberships/`` (manager+): one row per active staff member, their membership (or none), and up to 3
      customer memberships that may be theirs; their website customer account (owner 2026-10-15) and customer logins
      that may be theirs (merged with ``/api/accounts/login-merge/``);
    - POST ``staff-memberships/create-missing/`` (superuser): a membership and a website customer account for every
      staff member missing one;
    - GET ``staff-memberships/merge-preview/?staff_user=&source_account=`` (superuser): what a merge would move, or why
      it is refused (nothing changes);
    - POST ``staff-memberships/merge/ {staff_user, source_account}`` (superuser): merge the customer membership into
      the staff member's own, which survives.
    """

    permission_classes = [IsAuthenticated, IsManagerOrAdmin]

    def list(self, request):
        from apps.thriftplus.services import staff_members

        return Response({**staff_members.staff_list(), 'can_merge': bool(request.user.is_superuser)})

    @action(detail=False, methods=['post'], url_path='create-missing', permission_classes=[IsAuthenticated, IsSuperAdmin])
    def create_missing(self, request):
        """Both halves for every staff member missing one: the website customer account (owner 2026-10-15) and the
        Thrift+ membership."""
        from apps.accounts.services.staff_customer import create_missing_customers
        from apps.thriftplus.services import staff_members

        # Memberships first: adding the Customer group fires the Thrift+ signal, which would make them uncounted.
        result = staff_members.create_missing(actor=request.user)
        customers = create_missing_customers()
        listing = staff_members.staff_list()
        return Response({**listing, **result, **customers, 'can_merge': True})

    @staticmethod
    def _pair(data):
        """(staff user, source membership), or an error Response."""
        from django.contrib.auth import get_user_model

        from apps.thriftplus.services import staff_members

        User = get_user_model()
        raw_user, raw_source = str(data.get('staff_user') or ''), str(data.get('source_account') or '')
        user = User.objects.filter(pk=raw_user).first() if raw_user.isdigit() else None
        if not staff_members.is_active_staff(user):
            return None, None, Response({'detail': 'Pick an active staff member.'}, status=status.HTTP_400_BAD_REQUEST)
        source = Account.objects.filter(pk=raw_source).first() if raw_source.isdigit() else None
        if source is None:
            return None, None, Response({'detail': 'Pick the membership to merge in.'}, status=status.HTTP_400_BAD_REQUEST)
        return user, source, None

    @action(detail=False, methods=['get'], url_path='merge-preview', permission_classes=[IsAuthenticated, IsSuperAdmin])
    def merge_preview(self, request):
        from apps.thriftplus.services import staff_members

        user, source, error = self._pair(request.query_params)
        if error:
            return error
        try:
            return Response(staff_members.preview(user, source))
        except MemberError as exc:
            return _error(exc)

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated, IsSuperAdmin])
    def merge(self, request):
        from apps.thriftplus.services import staff_members

        user, source, error = self._pair(request.data)
        if error:
            return error
        try:
            result = staff_members.merge(user, source, actor=request.user)
        except MemberError as exc:
            return _error(exc)
        return Response(result)

    @action(detail=False, methods=['get', 'post'], url_path='start-fresh', permission_classes=[IsAuthenticated, IsSuperAdmin])
    def start_fresh(self, request):
        """Owner 2026-10-16: GET = what the wipe would delete; POST {typed: "START FRESH"} = delete every staff
        membership (and staff customer test memberships), then make each staff member a fresh, empty one."""
        from apps.thriftplus.services import delete_member, staff_members

        if request.method == 'GET':
            return Response({**delete_member.staff_wipe_preview(), 'words': delete_member.WIPE_WORDS})
        try:
            result = delete_member.staff_wipe(typed=str(request.data.get('typed') or ''), actor=request.user)
        except MemberError as exc:
            return _error(exc)
        return Response({**staff_members.staff_list(), **result, 'can_merge': True})


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
    def news(self, request, pk=None):
        """Turn store news emails off or back on when the member asks ({on})."""
        person = self.get_object()
        name = (request.user.full_name or '').strip() or request.user.email
        try:
            member_email.set_news(person, _truthy(request.data.get('on')), how=f'Staff: {name} (they asked)',
                                  user=request.user)
        except MemberError as exc:
            return _error(exc)
        return self._done(person)

    @action(detail=True, methods=['post'])
    def email(self, request, pk=None):
        """Add or change a member's email address ({email}); blank removes it."""
        person = self.get_object()
        try:
            member_email.set_address(person, str(request.data.get('email') or ''), user=request.user)
        except MemberError as exc:
            return _error(exc)
        return self._done(person)

    @action(detail=True, methods=['post'], url_path='email-link')
    def email_link(self, request, pk=None):
        """Send the Thrift+ app link (owner 2026-10-15, J12): ``{email?}`` sets the email first, then a join email (or
        a sign-in email when the address is already confirmed). Also at ``members/<person_id>/email-link/``."""
        from apps.thriftplus.services import member_auth

        person = self.get_object()
        try:
            purpose = member_auth.send_link_for(person, base_url=_public_base(), email=str(request.data.get('email') or ''),
                                                user=request.user)
        except member_auth.LimitError as exc:
            body = {'detail': str(exc), 'code': exc.code}
            if exc.retry_after:
                body['retry_after'] = exc.retry_after
            return Response(body, status=status.HTTP_429_TOO_MANY_REQUESTS)
        except MemberError as exc:
            return _error(exc)
        person.refresh_from_db()
        return Response({**AccountDetailSerializer(person.account).data, 'sent': purpose,
                         'sent_to': member_auth.mask(person.email)})

    @action(detail=True, methods=['post'])
    def details(self, request, pk=None):
        """Thrift+ Staff quick fix (owner 2026-10-20): ``{first_name, last_name, phone}``; a blank phone removes it."""
        try:
            person = members.set_details(self.get_object(), first_name=str(request.data.get('first_name') or ''),
                                         last_name=str(request.data.get('last_name') or ''),
                                         phone=str(request.data.get('phone') or ''), user=request.user)
        except MemberError as exc:
            return _error(exc)
        return Response(register.finalize_row(person))

    @action(detail=True, methods=['post'], url_path='sign-in-qr')
    def sign_in_qr(self, request, pk=None):
        """Thrift+ Staff (owner 2026-10-20): ``{link, expires_at}``, a one-use link for five minutes, shown as a QR."""
        from apps.thriftplus.services import member_auth

        try:
            link, row = member_auth.staff_sign_in_link(self.get_object(), base_url=_public_base(), user=request.user)
        except member_auth.AuthError as exc:
            return _error(MemberError(str(exc)))
        return Response({'link': link, 'expires_at': row.expires_at})

    @action(detail=True, methods=['post'], url_path='text-link')
    def text_link(self, request, pk=None):
        """Thrift+ Staff "Text sign-in link" (Phase 4, owner 2026-10-20): texts the person a one-use sign-in link, good
        for 15 minutes. Only with the ``thrift_plus.own_number_codes`` switch on, a phone on file and no STOP."""
        from apps.thriftplus.services import member_auth

        try:
            member_auth.text_sign_in_link(self.get_object(), base_url=_public_base(), user=request.user)
        except member_auth.LimitError as exc:
            body = {'detail': str(exc), 'code': exc.code}
            if exc.retry_after:
                body['retry_after'] = exc.retry_after
            return Response(body, status=status.HTTP_429_TOO_MANY_REQUESTS)
        except member_auth.AuthError as exc:
            return _error(MemberError(str(exc)))
        return Response({'sent': True})

    @action(detail=True, methods=['post'], url_path='photo-fix', parser_classes=[MultiPartParser, FormParser])
    def photo_fix(self, request, pk=None):
        """Thrift+ Staff "Retake photo" (owner 2026-10-20): the new photo, answered as Find's row."""
        upload = request.FILES.get('photo')
        if not upload:
            return _error(MemberError('Attach a photo.'))
        return Response(register.finalize_row(members.set_photo(self.get_object(), upload, user=request.user)))

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


# Retired (owner 2026-10-14: no physical card; Dash's tab is gone). Kept, unused, for the old batches' data.
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


class OverstockViewSet(viewsets.ViewSet):
    """
    Thrift+ → Overstock (rulebook P6, owner 2026-10-19): products with 10+ floor units and more than a year of supply,
    for the owner's weekly look. Managers can look; the owner marks.
    - GET ``overstock/?show=undecided|all|<action>&q=…&offset=0`` the list, not yet marked first, then tag dollars;
    - POST ``overstock/<product_id>/mark/ {action: back_stock|bundle|dollar_bin|liquidate|donate|keep|clear, note?}``.
    """

    permission_classes = [IsAuthenticated, IsManagerOrAdmin]

    def list(self, request):
        from apps.thriftplus.services import overstock

        q = request.query_params
        try:
            offset = max(0, int(q.get('offset') or 0))
        except ValueError:
            offset = 0
        try:
            return Response(overstock.listing(show=q.get('show') or overstock.UNDECIDED, q=(q.get('q') or '').strip(),
                                              offset=offset))
        except overstock.OverstockError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsSuperAdmin])
    def mark(self, request, pk=None):
        from apps.thriftplus.services import overstock

        try:
            m = overstock.mark(int(pk), str(request.data.get('action') or ''), by=request.user,
                               note=str(request.data.get('note') or ''))
        except (ValueError, overstock.OverstockError) as exc:
            return Response({'detail': str(exc) or 'No such product.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'product_id': int(pk), 'action': m.action if m else None})


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

    @action(detail=False, methods=['get', 'post'], url_path='engine')
    def engine(self, request):
        """GET: the saved engine setting (or none) and what the engine runs on. POST (superuser): save the
        calculator's setting (owner 2026-10-13); with the Thrift+ switch off, every floor item's ThriftBucks are rebuilt
        for launch day as an approved request (Superuser → Requests), so staff see launch-day ThriftBucks."""
        if request.method == 'POST':
            if not request.user.is_superuser:
                return Response({'detail': 'Only the owner can change the engine.'}, status=status.HTTP_403_FORBIDDEN)
            try:
                saved = rewards.save_engine(request.data, user=request.user)
            except ValueError as exc:
                return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
            rebuild = None
            if not members.is_enabled():
                from apps.core.services import approval_requests

                staged = approval_requests.stage(
                    'thriftplus.rebuild_rewards', title=f"Rebuild ThriftBucks for launch day ({saved['launch']})",
                    summary='Saved from the Calculator tab.', params={'day': saved['launch']},
                    requested_by=getattr(request.user, 'email', '') or '',
                )
                approval_requests.approve(staged, request.user, note='Saved from the Calculator tab.')
                rebuild = {'id': staged.pk}
            return Response({'saved': saved, 'rebuild': rebuild, 'live': rewards.rules().as_dict()})
        return Response({'saved': rewards.saved_engine(), 'live': rewards.rules().as_dict(), 'switch_on': members.is_enabled()})

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
    Thrift+ at the register (the 10-12 policy; ``workspace/register-contract.md``). There is no Thrift+ card (owner
    2026-10-14): a member shows the member QR in the Thrift+ app (``code``, ``TP`` + their member code) or gives their
    phone number (``find``, then ``person``). Each action takes ``cart`` (the POS cart id) and answers with the POS
    cart, so the terminal can take it as its new state:
    - ``find`` ``{phone}``: the people on the memberships that phone is on, to pick by photo. No cart;
    - ``attach`` ``{code}`` or ``{person}``: put the member on the sale;
    - ``detach``;
    - ``choice`` ``{choice: 'bank'|'instant'}``: kept (the Default) or redeemed instantly; 400 when instant isn't
      offered. Logged;
    - ``bucks`` ``{use: bool}``: use the member's kept ThriftBucks automatically on this trip, or not today;
    - ``rering`` ``{code}`` or ``{person}``: the member on a sale finished in the last 30 minutes;
    - ``pending`` ``{q}``: joined online and not finished yet (owner 2026-10-15, J8), by name, email or member code;
    - ``finish`` ``{person, phone, id_checked, verified_18, photo, signature?, finalize?, cart?}``: finish joining (the
      phone read back, the ID, the photo, the signature); with ``cart``, the member goes on that sale after.

    A pending member's QR (attach, re-ring) answers 400 ``MEMBER_PENDING`` with the person to finish. Thrift+ credit is
    used first, automatically (no action). Every sale action refuses while Thrift+ is dark there.
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
            return Response(exc.payload(), status=status.HTTP_400_BAD_REQUEST)
        return self._done(cart)

    @action(detail=False, methods=['get'])
    def status(self, request):
        """Whether Thrift+ is live at a register (``?register=<code>``), before any sale exists."""
        from apps.pos.models import Register

        code = str(request.query_params.get('register') or '').strip().upper()
        training = bool(code) and Register.objects.filter(code__iexact=code, is_training=True).exists()
        return Response({'live': members.is_enabled() or code in register.live_register_codes() or training})

    @action(detail=False, methods=['post'])
    def find(self, request):
        """Find a member by phone (owner 2026-10-14): ``{phone}`` in any format, matched on the digits (a POST, so the
        number stays out of the request logs). ``{people: [...]}``, each with what the cashier needs to pick the person
        by their photo."""
        try:
            people = members.people_by_phone(str(request.data.get('phone') or ''))
        except MemberError as exc:
            return Response({'detail': str(exc), 'code': 'PHONE_SHORT'}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'people': [_found_person(p) for p in people]})

    @action(detail=False, methods=['post'])
    def attach(self, request):
        return self._run(request, lambda cart: register.attach(cart, str(request.data.get('code') or ''),
                                                               person=request.data.get('person'), user=request.user))

    @action(detail=False, methods=['post'])
    def here(self, request):
        """The cashier's "Member is here" tap: a member found by name or phone may now use their kept ThriftBucks."""
        return self._run(request, lambda cart: register.confirm_here(cart, user=request.user))

    @action(detail=False, methods=['post'])
    def detach(self, request):
        return self._run(request, lambda cart: register.detach(cart, user=request.user))

    @action(detail=False, methods=['post'])
    def choice(self, request):
        return self._run(request, lambda cart: register.set_choice(cart, str(request.data.get('choice') or ''),
                                                                   user=request.user))

    @action(detail=False, methods=['post'])
    def bucks(self, request):
        use = request.data.get('use', True)
        use = use if isinstance(use, bool) else _truthy(use)
        return self._run(request, lambda cart: register.set_bucks(cart, use, user=request.user))

    @action(detail=False, methods=['post'])
    def rering(self, request):
        return self._run(request, lambda cart: register.rering(cart, str(request.data.get('code') or ''),
                                                               person=request.data.get('person'), user=request.user))

    @action(detail=False, methods=['post'])
    def pending(self, request):
        """Joined online, not finished (J8): ``{q}`` a name, email or member code; newest first, at most 10. A POST,
        so names and emails stay out of the request logs. A member code that is no pending join also answers ``member``
        ``{status, first_name}`` (``active``, ``revoked``, ``removed`` or ``unknown``), so Finalize Thrift+ can say
        "already a member". ``{recent: true}`` with nothing typed (Finalize, owner 2026-10-16): the newest 50 online
        joins, pending and finished, each with its ``status``."""
        q = str(request.data.get('q') or '')
        if request.data.get('recent'):
            # Finalize (owner 2026-10-16): the newest 50 with nothing typed; a search's pending joins with the same detail.
            if not q.strip():
                return Response({'people': register.recent_joins()})
            # Find (owner 2026-10-20): everyone, still to finish or a member, by name, phone, email or member code.
            people = register.find_people(q)
        else:
            people = register.pending(q)
        body = {'people': people}
        if not people:
            who = register.code_member(q)
            if who is not None:
                body['member'] = who
        return Response(body)

    @action(detail=False, methods=['get'])
    def member(self, request):
        """The member card (owner 2026-10-20): ``?person=<id>`` (or ``?code=<member QR>``). Their photo and status
        (pending / member / off), ThriftBucks earned, used and left, Thrift+ credit, recent trips and the people on the
        membership. The register's Thrift+ member button and Dash's Members page show it."""
        from apps.thriftplus.services import member_card

        person = None
        if str(request.query_params.get('person') or '').isdigit():
            person = Person.objects.select_related('account').filter(pk=int(request.query_params['person'])).first()
        elif request.query_params.get('code'):
            from apps.thriftplus.services.cards import parse

            code = parse(str(request.query_params['code']).strip())
            person = Person.objects.select_related('account').filter(cards__code=code).first() if code else None
        if person is None:
            return Response({'detail': 'That member is not in the system.', 'code': 'MEMBER_UNKNOWN'}, status=status.HTTP_404_NOT_FOUND)
        return Response(member_card.card(person))

    @action(detail=False, methods=['post'], parser_classes=[JSONParser, MultiPartParser, FormParser])
    def finish(self, request):
        """Finish joining at the register (J8): the phone the cashier read back, the ID check, 18+ and the photo, as at
        a sign-up. 409 ``PHONE_TAKEN`` when another active or pending person has that phone. With ``cart`` (an open
        sale), the member goes on it after; a refusal there comes back as ``attach_error`` (they are still joined).

        ``signature`` (optional, owner 2026-10-16, J5): a PNG of the customer's signature, stored with ``signed_at`` and
        the terms version. ``finalize=true`` (Finalize Thrift+, the cashier's phone, no cart): the signature and the ID
        check are required (400 ``SIGNATURE_NEEDED`` / ``ID_NEEDED``).

        Join v2 (owner 2026-10-19): ``phone`` is optional for everyone. When the selfie and the signature were taken in
        the app, ``finalize=true`` needs only ``id_checked`` and ``face_matches`` (400 ``FACE_NEEDED``), with
        ``verified_18``; a new ``photo`` (Retake) replaces the selfie."""
        from apps.pos.models import Cart
        from apps.pos.serializers import CartSerializer

        d = request.data
        cart = Cart.objects.filter(pk=d.get('cart')).first() if str(d.get('cart') or '').isdigit() else None
        try:
            if cart is not None and register.is_training(cart):
                raise register.RegisterError('TRAINING', 'This is the training register. Finish joining on a real register.')
            person = register.finish_join(d.get('person'), phone=str(d.get('phone') or ''), id_checked=_truthy(d.get('id_checked')),
                                          verified_18=_truthy(d.get('verified_18')), photo=request.FILES.get('photo'),
                                          signature=request.FILES.get('signature'),
                                          require_signature=_truthy(d.get('finalize')),
                                          face_matches=_truthy(d.get('face_matches')), user=request.user)
        except register.RegisterError as exc:
            code = status.HTTP_409_CONFLICT if exc.code == 'PHONE_TAKEN' else status.HTTP_400_BAD_REQUEST
            return Response(exc.payload(), status=code)
        body = {'person_id': person.pk, 'account_id': person.account_id, 'first_name': person.first_name,
                'last_name': person.last_name, 'status': person.account.status, 'signed': bool(person.signature),
                'cart': None}
        if cart is not None:
            try:
                register.attach(cart, person=person.pk, user=request.user, here=True)  # finishing here: they're here
                body['cart'] = CartSerializer(Cart.objects.get(pk=cart.pk)).data
            except register.RegisterError as exc:
                body['attach_error'] = exc.payload()
        return Response(body)


def _found_person(person: Person) -> dict:
    """One person found by phone at the register: enough to pick them by their photo, and no more."""
    return {
        'person_id': person.pk, 'account_id': person.account_id, 'first_name': person.first_name,
        'last_initial': (person.last_name or '')[:1].upper(), 'role': person.role,
        'photo_url': person.photo.url if person.photo else None, 'verified_18': person.verified_18,
        'practice': bool(person.account.is_practice), 'account_status': person.account.status,
        # Join v2: the selfie and signature taken in the app ("Ready" for Finalize when both are there).
        'selfie': bool(person.photo), 'signed': bool(person.signature),
    }


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
    Thrift+ 3-day returns at the register (the 10-12 policy; ``workspace/register-contract.md``). The member is their
    QR scanned (``code``) or found by phone (``person``, from ``register/find/``; owner 2026-10-14):
    - ``lookup`` ``?code=`` or ``?person=`` (and optional ``register=``): the member's recent purchases, each with its
      mark, what a return gives back and takes back, its deadline, and why not when it can't come back;
    - ``create`` ``{code | person, cart_line, note?, register}``: take one back as Thrift+ credit. On the training
      register the result is worked out and nothing is written (``training: true``). ``late_ok`` (the owner signed in or
      the owner PIN as ``pin``, O1; owner 2026-10-20) lets a return past the 3 days through, with the note saying why;
    - The Returns page (owner 2026-10-20, ``returns_find.py``): ``find`` ``{q | person, register?}`` (a POST, so names stay
      out of the logs), ``receipt`` ``?cart=`` (one ticket, Returnable and AS IS), ``preview`` ``{cart, cart_lines}`` (the
      summary), ``batch`` ``{cart, cart_lines, late?: {reason, note}, pin?}`` (several lines in one go; past the 3 days it
      needs the owner signed in or ``pin``, a reason, and is marked against Retail) and ``late`` (the Late returns list,
      managers);
    - ``photo``: the serial and condition photo of a $100+ item at the sale;
    - ``list`` and ``done``: returned items waiting for staff.
    """

    permission_classes = [IsAuthenticated, IsEmployee]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def list(self, request):
        rows = ReturnRecord.objects.select_related('person', 'cart_line', 'item').order_by('status', '-created_at')[:200]
        return Response([
            {'id': r.pk, 'status': r.status, 'member': f'{r.person.first_name} {r.person.last_name}'.strip(),
             'sku': r.item.sku if r.item_id else '', 'title': r.cart_line.description, 'paid': str(r.paid),
             'credit': str(r.credit), 'bucks_back': str(r.bucks_back), 'bucks_taken': str(r.bucks_taken),
             'shortfall': str(r.shortfall), 'note': r.note, 'created_at': r.created_at}
            for r in rows
        ])

    @staticmethod
    def _training(code) -> bool:
        """The terminal's register is the training register (its code TRAIN, or marked training)."""
        from apps.pos.models import Register

        code = str(code or '').strip()
        if not code:
            return False
        return code.upper() == 'TRAIN' or Register.objects.filter(code__iexact=code, is_training=True).exists()

    @action(detail=False, methods=['get'])
    def lookup(self, request):
        q = request.query_params
        try:
            return Response(returns.purchases(str(q.get('code') or ''), person=q.get('person'),
                                              training=self._training(q.get('register'))))
        except register.RegisterError as exc:
            return Response(exc.payload(), status=status.HTTP_400_BAD_REQUEST)

    def create(self, request):
        from apps.pos.models import CartLine

        line = get_object_or_404(CartLine.objects.select_related('cart', 'item__product__profile'), pk=request.data.get('cart_line'))
        late_ok = _truthy(request.data.get('late_ok'))
        note = str(request.data.get('note') or '')
        training = self._training(request.data.get('register'))
        by_pin = False
        if late_ok and not note.strip():
            return Response({'detail': 'Say why the late return is allowed (the store was closed).', 'code': 'SAY_WHY'},
                            status=status.HTTP_400_BAD_REQUEST)
        if late_ok and not training:  # the owner signed in, or the owner PIN (owner 2026-10-20)
            try:
                by_pin = owner_pin.authorize(request.user, str(request.data.get('pin') or ''), 'late return', cart_line=line.pk)
            except owner_pin.PinError as exc:
                return Response(exc.payload(), status=exc.http)
        try:
            result = returns.do_return(line, str(request.data.get('code') or ''), person=request.data.get('person'),
                                       note=note, user=request.user, training=training, late_ok=late_ok, by_pin=by_pin)
        except register.RegisterError as exc:
            return Response(exc.payload(), status=status.HTTP_400_BAD_REQUEST)
        return Response(result, status=status.HTTP_200_OK if training else status.HTTP_201_CREATED)

    # ── The Returns page (owner 2026-10-20) ───────────────────────────────────

    @action(detail=False, methods=['post'])
    def find(self, request):
        """Step 1: ``{q, person?, register?}``. A single ticket comes back already open as ``receipt``."""
        d = request.data
        return Response(returns_find.find(str(d.get('q') or ''), person=d.get('person'), training=self._training(d.get('register'))))

    @action(detail=False, methods=['get'])
    def receipt(self, request):
        """Step 2: ``?cart=<id>&register=``: one ticket, Returnable (with late ones marked) and AS IS."""
        cart = str(request.query_params.get('cart') or '')
        body = returns_find.receipt(int(cart), training=self._training(request.query_params.get('register'))) if cart.isdigit() else None
        if body is None:
            return Response({'detail': 'No finished sale with that number.', 'code': 'NO_TICKET'}, status=status.HTTP_404_NOT_FOUND)
        return Response(body)

    def _ticket_lines(self, request):
        """The ticket and its ticked lines for ``preview`` and ``batch``: (cart member, lines, error response)."""
        from apps.pos.models import CartLine
        from apps.thriftplus.models import CartMember

        d = request.data
        cart_id = str(d.get('cart') or '')
        ids = [int(i) for i in (d.get('cart_lines') or []) if str(i).isdigit()]
        member = CartMember.objects.select_related('person', 'account').filter(cart_id=cart_id).first() if cart_id.isdigit() else None
        if member is None:
            return None, [], Response({'detail': 'Not sold to a Thrift+ member. All sales final.', 'code': 'NOT_RETURNABLE'},
                                      status=status.HTTP_400_BAD_REQUEST)
        lines = list(CartLine.objects.filter(cart_id=cart_id, pk__in=ids, line_kind='item')
                     .select_related('cart', 'cart__cashier', 'item__product__profile').order_by('pk'))
        if not lines or len(lines) != len(set(ids)):
            return None, [], Response({'detail': 'Tick the lines that are coming back.', 'code': 'NO_LINES'},
                                      status=status.HTTP_400_BAD_REQUEST)
        return member, lines, None

    @action(detail=False, methods=['post'])
    def preview(self, request):
        """Step 3's summary: per line and in all, what Confirm would give and take back."""
        member, lines, error = self._ticket_lines(request)
        if error is not None:
            return error
        body = returns.preview(lines, member.account, training=self._training(request.data.get('register')))
        body.update(pin_set=owner_pin.status()['set'], owner_signed_in=bool(request.user.is_superuser),
                    reasons=[{'value': k, 'label': v} for k, v in returns.LATE_REASONS.items()])
        return Response(body)

    @action(detail=False, methods=['post'])
    def batch(self, request):
        """Step 3's Confirm: every ticked line back in one go (all or none). Past the 3 days it needs ``late``
        ``{reason, note?}`` and the owner signed in or ``pin``; each late line is marked against Retail."""
        member, lines, error = self._ticket_lines(request)
        if error is not None:
            return error
        d = request.data
        training = self._training(d.get('register'))
        late = any(returns.is_late(line) for line in lines)
        info = d.get('late') if isinstance(d.get('late'), dict) else {}
        reason, note = str(info.get('reason') or ''), str(info.get('note') or d.get('note') or '').strip()
        by_pin = False
        if late:
            if reason not in returns.LATE_REASONS:
                return Response({'detail': 'Pick why the late return is allowed.', 'code': 'SAY_WHY'}, status=status.HTTP_400_BAD_REQUEST)
            note = f'Late return: {returns.LATE_REASONS[reason]}.{" " + note if note else ""}'
            if not training:
                try:
                    by_pin = owner_pin.authorize(request.user, str(d.get('pin') or ''), 'late return',
                                                 cart=member.cart_id, cart_lines=[l.pk for l in lines], reason=reason)
                except owner_pin.PinError as exc:
                    return Response(exc.payload(), status=exc.http)
        person = returns_find.acting_person(member, d.get('person'))
        try:
            result = returns.batch(lines, person=person, note=note, user=request.user, training=training, late_ok=late,
                                   late_reason=reason, by_pin=by_pin)
        except register.RegisterError as exc:
            return Response(exc.payload(), status=status.HTTP_400_BAD_REQUEST)
        return Response(result, status=status.HTTP_200_OK if training else status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated, IsManagerOrAdmin])
    def late(self, request):
        """The Late returns list: marks against Retail, newest first (managers and the owner)."""
        return Response(returns.late_list())

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


class OwnerPinViewSet(viewsets.ViewSet):
    """
    The owner PIN (owner 2026-10-20), in Dash Settings. ``GET`` says whether one is set (and, for the owner, when and by
    whom); ``POST {pin}`` sets or resets it: the owner (a superuser) only, 4 to 8 digits. The PIN is never sent back.
    """

    permission_classes = [IsAuthenticated, IsTeamMember]

    def list(self, request):
        body = owner_pin.status()
        if not request.user.is_superuser:
            body = {'set': body['set'], 'locked': body['locked']}
        return Response(body)

    def create(self, request):
        if not request.user.is_superuser:
            return Response({'detail': 'Only the owner can set the PIN.', 'code': 'OWNER_ONLY'}, status=status.HTTP_403_FORBIDDEN)
        try:
            return Response(owner_pin.set_pin(request.user, str(request.data.get('pin') or '')))
        except owner_pin.PinError as exc:
            return Response(exc.payload(), status=exc.http)


class MemberDirectoryViewSet(viewsets.ViewSet):
    """
    Dash → Users → Members (owner 2026-10-16; ``services/member_list.py``). Rows are keyed ``a<account>`` (a member) or
    ``c<user>`` (an old ecothrift.us customer not yet made a member by the legacy cleanup).

    - GET ``member-directory/`` (manager+): every member, newest first.
    - PATCH ``member-directory/<key>/`` ``{first_name, last_name, email, phone, notes}``.
    - POST ``<key>/send-link/``: the emailed sign-in (a join email when the address isn't confirmed yet).
    - POST ``<key>/deactivate/`` and ``<key>/reactivate/``.
    - GET ``<key>/delete-preview/`` and POST ``<key>/delete/ {name}`` (superuser): delete the account, its links, its
      transactions and their payments, after the full name is typed.
    """

    permission_classes = [IsAuthenticated, IsManagerOrAdmin]
    lookup_value_regex = '[ac][0-9]+'

    @staticmethod
    def _resolve(key: str):
        """(account, user): one of them, or a 404."""
        from django.contrib.auth import get_user_model
        from django.http import Http404

        from apps.thriftplus.services.member_list import _legacy_users

        if key.startswith('a'):
            return get_object_or_404(Account, pk=int(key[1:]), is_practice=False), None
        user = get_object_or_404(get_user_model(), pk=int(key[1:]))
        if user.pk not in {u.pk for u in _legacy_users()}:
            raise Http404
        return None, user

    @staticmethod
    def _row(key: str) -> dict | None:
        from apps.thriftplus.services.member_list import rows

        return next((r for r in rows() if r['key'] == key), None)

    def list(self, request):
        from apps.thriftplus.services.member_list import STAGES, rows

        return Response({'results': rows(), 'stages': STAGES})

    def retrieve(self, request, pk=None):
        self._resolve(pk)
        row = self._row(pk)
        return Response(row) if row else Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    def partial_update(self, request, pk=None):
        from apps.thriftplus.services import emails as member_email
        from apps.thriftplus.services.member_list import primary

        account, user = self._resolve(pk)
        d = request.data
        try:
            if account is not None:
                person = primary(account)
                if person is None:
                    return _error(MemberError('This membership has no one on it.'))
                if 'first_name' in d or 'last_name' in d:
                    from apps.accounts.services.names import OLD_DEFAULTS, clean_name

                    first = str(d.get('first_name', person.first_name) or '')
                    last = str(d.get('last_name', person.last_name) or '')
                    if not first.strip() or not last.strip() or last.strip().lower() in OLD_DEFAULTS:
                        raise MemberError('A first and last name are required.')  # owner 2026-10-16
                    person.first_name, person.last_name = clean_name(first, last)
                    if person.user_id:  # one account: the member's login carries the same name
                        person.user.first_name, person.user.last_name = person.first_name, person.last_name
                        person.user.save(update_fields=['first_name', 'last_name', 'updated_at'])
                if 'phone' in d:
                    person.phone = members.normalize_phone(str(d['phone']))
                person.save()
                if 'email' in d and str(d['email']).strip().lower() != person.email:
                    member_email.set_address(person, str(d['email']), user=request.user)
                if 'notes' in d:
                    account.notes = str(d['notes'])
                    account.save(update_fields=['notes', 'updated_at'])
            else:
                for f in ('first_name', 'last_name', 'email', 'phone'):
                    if f in d:
                        setattr(user, f, str(d[f]).strip())
                user.save()
                if 'notes' in d:  # the note lives on their membership (one customer system, T62): made pending if none
                    from apps.thriftplus.services import one_account

                    try:
                        one_account.save_customer_notes(user, str(d['notes']))
                    except ValueError as exc:
                        raise MemberError(str(exc))
        except MemberError as exc:
            return _error(exc)
        return Response(self._row(pk))

    @action(detail=True, methods=['post'], url_path='send-link')
    def send_link(self, request, pk=None):
        from apps.thriftplus.services import member_auth
        from apps.thriftplus.services.member_list import primary

        account, user = self._resolve(pk)
        try:
            if account is not None:
                person = primary(account)
                if person is None:
                    return _error(MemberError('This membership has no one on it.'))
                member_auth.send_link_for(person, base_url=_public_base(), user=request.user)
            else:
                from apps.accounts.models import MagicLinkToken
                from apps.accounts.services.magic_link import issue_magic_link
                from apps.webstore.emails import send_sign_in_link

                row = issue_magic_link(email=user.email, purpose=MagicLinkToken.PURPOSE_SIGN_IN)
                send_sign_in_link(email=row.email, magic_link=f"{_public_base().rstrip('/')}/verify?token={row.token}")
        except member_auth.LimitError as exc:
            return Response({'detail': str(exc), 'code': exc.code}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        except Exception as exc:  # noqa: BLE001 - a MemberError or a refused link: say why
            return _error(exc)
        return Response({'detail': 'Sign-in link emailed.'})

    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        account, user = self._resolve(pk)
        try:
            if account is not None:
                members.deactivate(account, reason=str(request.data.get('reason') or ''), user=request.user)
            else:
                user.is_active = False
                user.save(update_fields=['is_active'])
        except MemberError as exc:
            return _error(exc)
        return Response(self._row(pk))

    @action(detail=True, methods=['post'])
    def reactivate(self, request, pk=None):
        account, user = self._resolve(pk)
        try:
            if account is not None:
                members.reactivate(account, user=request.user)
            else:
                user.is_active = True
                user.save(update_fields=['is_active'])
        except MemberError as exc:
            return _error(exc)
        return Response(self._row(pk))

    @action(detail=True, methods=['get'], url_path='delete-preview', permission_classes=[IsAuthenticated, IsSuperAdmin])
    def delete_preview(self, request, pk=None):
        from apps.thriftplus.services import delete_member

        account, user = self._resolve(pk)
        try:
            return Response(delete_member.preview(account) if account is not None else delete_member.preview_customer(user))
        except MemberError as exc:
            return _error(exc)

    @action(detail=True, methods=['post'], url_path='delete', permission_classes=[IsAuthenticated, IsSuperAdmin])
    def delete_forever(self, request, pk=None):
        from apps.thriftplus.services import delete_member

        account, user = self._resolve(pk)
        name = str(request.data.get('name') or '')
        try:
            if account is not None:
                result = delete_member.delete(account, typed_name=name, actor=request.user)
            else:
                result = delete_member.delete_customer(user, typed_name=name, actor=request.user)
        except MemberError as exc:
            return _error(exc)
        return Response(result)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsTeamMember])
def staff_tag(request, sku: str):
    """
    The Thrift+ Staff app's test scanner (owner 2026-10-16): the item card a member's scanner shows for one tag
    (``TagLookup``, the same shape as ``public/tag/<sku>/``), for a signed-in staff member. It logs no scan and moves no
    item's numbers, and it answers while Thrift+ is still off for customers.
    """
    from apps.thriftplus.services import scanner

    item = scanner.find_item(sku)
    if item is None:
        return Response({'status': 'not_found', 'sku': sku})
    return Response({'status': 'found', 'item': scanner.item_card(item)})

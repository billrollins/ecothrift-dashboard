"""
Thrift+ staff API: members, their people and cards, and blank-card batches (Phase 1); the reward
engine's dry run, item log and nightly runs (Phase 2).

The register (Phase 3) and the signup flow (Phase 4) build on the same services. Until launch the
Dash screens are superuser-only in the nav; the API itself is staff-level, like the rest of Dash.
"""
from __future__ import annotations

import base64
from datetime import date

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsManagerOrAdmin, IsStaff
from apps.thriftplus.models import Account, Card, CardBatch, Person, RewardRun
from apps.thriftplus.serializers import (
    AccountDetailSerializer,
    AccountSerializer,
    CardBatchSerializer,
    CardSerializer,
    PersonSerializer,
)
from apps.thriftplus.services import card_pdf, cards, members, rewards
from apps.thriftplus.services.members import MemberError


def _truthy(value) -> bool:
    return str(value).lower() in ('1', 'true', 'yes', 'on')


def _error(exc: Exception) -> Response:
    return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)


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
                photo=request.FILES.get('photo'), card_code=d.get('card_code', ''), user=request.user,
            )
        except MemberError as exc:
            return _error(exc)
        return Response(AccountDetailSerializer(account).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='second-adult')
    def second_adult(self, request, pk=None):
        d = request.data
        try:
            members.add_second_adult(
                self.get_object(), both_present=_truthy(d.get('both_present')), primary_approves=_truthy(d.get('primary_approves')),
                first_name=d.get('first_name', ''), last_name=d.get('last_name', ''), phone=d.get('phone', ''),
                id_checked=_truthy(d.get('id_checked')), verified_18=_truthy(d.get('verified_18')),
                photo=request.FILES.get('photo'), card_code=d.get('card_code', ''), user=request.user,
            )
        except MemberError as exc:
            return _error(exc)
        return Response(AccountDetailSerializer(self.get_object()).data)

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
    def runs(self, request):
        return Response([_run_payload(r) for r in RewardRun.objects.all()[:30]])


def _run_payload(run: RewardRun) -> dict:
    return {
        'id': run.pk, 'day': run.day.isoformat(), 'started_at': run.started_at, 'finished_at': run.finished_at,
        'counts': run.counts, 'error': run.error.splitlines()[0] if run.error else '',
    }

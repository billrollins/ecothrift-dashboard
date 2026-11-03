"""The safe (Retail 5 step 1, Bill 2026-11-02): owner and managers only.

GET  /api/pos/safe/         the safe and the office by bill and coin, the office target, whether a swap is needed
                            (the bell's alert), the suggested swap and the last lines
POST /api/pos/safe/swap/    {put_in_safe, take_from_safe, note}
POST /api/pos/safe/count/   {count, note}: blind; the difference comes back to the owner only
PUT  /api/pos/safe/target/  {count, cap}: the owner's target for the office cash
"""
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsManagerOrAdmin

from .register_card import money, name
from .services import bank as bank_service
from .services import safe as safe_service
from .services.cash_counts import CashCountError


def _owner(user) -> bool:
    """The owner, as the register reads it: a superuser or the Admin role, or a grant (People → Permissions)."""
    from apps.accounts.services.access import admin_or

    return admin_or(user, 'pos.cash:owner')


def _line(line, *, owner: bool) -> dict:
    return {
        'id': line.pk, 'kind': line.kind, 'at': line.performed_at.isoformat(), 'who': name(line.performed_by),
        # A count's pieces are the safe's balance: the owner's only, like the balance.
        'into_safe': line.into_safe if owner or line.kind != 'count' else None, 'into_total': money(line.into_total),
        'out_of_safe': line.out_of_safe, 'out_total': money(line.out_total),
        'difference': money(line.difference) if owner and line.difference is not None else None,
        'note': line.note,
    }


def _payload(request) -> dict:
    owner = _owner(request.user)
    the_office = safe_service.office()
    safe = safe_service.get_safe(the_office.location if the_office else None)
    return {
        'owner': owner,
        # By bill and coin for the owner only, so a manager's count of the safe stays blind; managers see the total.
        'safe': {'balance': {k: v for k, v in (safe.balance or {}).items() if v} if owner else None,
                 'total': money(safe.total),
                 'last_counted_at': safe.last_counted_at.isoformat() if safe.last_counted_at else None,
                 'last_counted_by': name(safe.last_counted_by)},
        'office': None if the_office is None else {
            'balance': {k: v for k, v in (the_office.current_balance or {}).items() if v},
            'total': money(the_office.current_total)},
        **safe_service.status(the_office, safe, owner=owner),
        'lines': [_line(x, owner=owner) for x in safe.lines.select_related('performed_by')[:10]],
    }


def _refused(exc) -> Response:
    return Response({'detail': str(exc), 'code': 'SAFE_REFUSED'}, status=400)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def safe_view(request):
    return Response(_payload(request))


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def safe_swap_view(request):
    try:
        safe_service.swap(request.data.get('put_in_safe'), request.data.get('take_from_safe'), request.user,
                          note=str(request.data.get('note') or ''))
    except (safe_service.SafeError, CashCountError) as exc:
        return _refused(exc)
    return Response(_payload(request))


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def safe_count_view(request):
    try:
        line = safe_service.count(request.data.get('count'), request.user, note=str(request.data.get('note') or ''))
    except CashCountError as exc:
        return _refused(exc)
    data = _payload(request)
    data['counted'] = _line(line, owner=_owner(request.user))
    return Response(data)


@api_view(['PUT'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def safe_target_view(request):
    if not _owner(request.user):
        return Response({'detail': 'Only the owner sets what the office should hold.', 'code': 'OWNER_ONLY'}, status=403)
    try:
        safe_service.set_office_target(request.data.get('count'), request.data.get('cap'), request.user)
    except CashCountError as exc:
        return _refused(exc)
    return Response(_payload(request))


def _deposit(t) -> dict:
    return {'id': t.pk, 'at': t.created_at.isoformat(), 'who': name(t.performed_by), 'total': money(t.total),
            'status': t.status, 'source': t.source, 'bags_total': money(t.bags_total) if t.bags_total is not None else None,
            'difference': money(t.difference) if t.difference is not None else None, 'bags': t.bags.count()}


def _bank_payload() -> dict:
    from .models import BankTransaction

    pending = (BankTransaction.objects.filter(transaction_type='deposit', status='pending')
               .select_related('performed_by').order_by('-created_at'))
    return {'bags': bank_service.open_bags(), 'pending': [_deposit(t) for t in pending]}


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def bank_deposit_view(request):
    """Bank deposits (Retail 5 step 2): GET the open bags and the deposits waiting for the bank; POST {bags: [{kind,
    ref}], count, source: office|safe, note} records one."""
    if request.method == 'POST':
        try:
            txn = bank_service.deposit(request.data.get('bags'), request.data.get('count'),
                                       str(request.data.get('source') or ''), request.user,
                                       note=str(request.data.get('note') or ''))
        except bank_service.BankError as exc:
            return Response({'detail': str(exc), 'code': exc.code}, status=400)
        except CashCountError as exc:
            return _refused(exc)
        data = _bank_payload()
        data['deposit'] = _deposit(txn)
        return Response(data, status=201)
    return Response(_bank_payload())


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def bank_change_view(request):
    """Change from the bank (Retail 5 step 3): POST {count, into: office|safe, note}."""
    try:
        txn = bank_service.change(request.data.get('count'), str(request.data.get('into') or ''), request.user,
                                  note=str(request.data.get('note') or ''))
    except bank_service.BankError as exc:
        return Response({'detail': str(exc), 'code': exc.code}, status=400)
    except CashCountError as exc:
        return _refused(exc)
    return Response({'id': txn.pk, 'total': money(txn.total), 'into': txn.source}, status=201)

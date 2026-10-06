import csv

from django.http import HttpResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsEmployee, IsManagerOrAdmin

from .models import Cart, CountScan, InventoryCount, Issue, Run, Section
from .services import counting, fixit, inventories, report, shrink

STAFF = [IsAuthenticated, IsEmployee]
MANAGERS = [IsAuthenticated, IsManagerOrAdmin]


def _err(detail, code, status=400):
    return Response({'detail': detail, 'code': code}, status=status)


def _not_found(what='Count'):
    return _err(f'{what} not found.', 'NOT_FOUND', 404)


def _is_manager(user) -> bool:
    return bool(user.is_superuser or user.role in ('Manager', 'Admin'))


def _get(model, pk, *related):
    qs = model.objects.select_related(*related) if related else model.objects
    return qs.filter(pk=pk).first()


# --- sections (the Super User adds and edits them) ------------------------------------------------

@api_view(['GET', 'POST'])
@permission_classes(STAFF)
def sections(request):
    if request.method == 'POST':
        if not request.user.is_superuser:
            return _err('Only the Super User adds sections.', 'SUPERUSER_ONLY', 403)
        name = str(request.data.get('name') or '').strip()[:60]
        if not name:
            return _err('Give the section a name.', 'NAME_REQUIRED')
        if Section.objects.filter(name__iexact=name).exists():
            return _err('A section with that name already exists.', 'NAME_TAKEN', 409)
        last = Section.objects.order_by('-order').first()
        s = Section.objects.create(name=name, order=(last.order + 1) if last else 1, created_by=request.user)
        return Response(counting.section_payload(s), status=201)
    return Response([counting.section_payload(s) for s in Section.objects.all()])


@api_view(['PATCH'])
@permission_classes(STAFF)
def section_detail(request, pk):
    if not request.user.is_superuser:
        return _err('Only the Super User edits sections.', 'SUPERUSER_ONLY', 403)
    s = _get(Section, pk)
    if s is None:
        return _not_found('Section')
    if 'name' in request.data:
        name = str(request.data.get('name') or '').strip()[:60]
        if not name:
            return _err('Give the section a name.', 'NAME_REQUIRED')
        if Section.objects.filter(name__iexact=name).exclude(pk=s.pk).exists():
            return _err('A section with that name already exists.', 'NAME_TAKEN', 409)
        s.name = name
    if 'order' in request.data:
        s.order = max(0, int(request.data.get('order') or 0))
    if 'is_active' in request.data:
        s.is_active = bool(request.data.get('is_active'))
    s.save()
    return Response(counting.section_payload(s))


# --- the scan screen ------------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes(STAFF)
def today(request):
    """The open inventory, my open run, the sections, my unanswered problems and my carts."""
    return Response(counting.bootstrap(request.user))


@api_view(['POST'])
@permission_classes(STAFF)
def runs(request):
    """Body: ``{"section_id"}``. Starts a run in the inventory in progress (a manager starts the inventory)."""
    section = _get(Section, request.data.get('section_id'))
    if section is None or not section.is_active:
        return _err('Pick a section.', 'SECTION_REQUIRED')
    try:
        run = counting.start_run(user=request.user, section=section)
    except counting.NoInventory:
        return _err('No inventory is in progress. A manager starts one on Run count.', 'NO_INVENTORY', 409)
    except counting.CountClosed:
        return _err('This inventory is closed. A manager can reopen it.', 'COUNT_CLOSED', 409)
    return Response({'run': counting.run_summary(run), 'day': counting.day_summary(run.count)}, status=201)


def _run_for(request, pk, *, write=True):
    """The run, if this person may change it: their own, or any run for a manager."""
    run = _get(Run, pk, 'section', 'count', 'user')
    if run is None:
        return None, _not_found('Run')
    if write and run.user_id != request.user.pk and not _is_manager(request.user):
        return None, _err("This is someone else's run.", 'NOT_YOUR_RUN', 403)
    return run, None


@api_view(['GET', 'PATCH', 'DELETE'])
@permission_classes(STAFF)
def run_detail(request, pk):
    """PATCH: ``note``, ``bad`` (true/false), ``section_complete`` (true/false). DELETE: Super User only."""
    run, err = _run_for(request, pk, write=request.method != 'GET')
    if err:
        return err
    if request.method == 'DELETE':
        if not request.user.is_superuser:
            return _err('Only the Super User deletes a session.', 'SUPERUSER_ONLY', 403)
        counting.delete_run(run)
        return Response(status=204)
    if request.method == 'PATCH':
        try:
            counting.update_run(
                run,
                note=request.data.get('note'),
                bad=request.data.get('bad'),
                section_complete=request.data.get('section_complete'),
            )
        except counting.PendingIssues as e:
            return _err(f'{e.n} problems in this run still need an answer.', 'PENDING_ISSUES', 409)
    return Response(counting.run_summary(run))


@api_view(['GET', 'POST'])
@permission_classes(STAFF)
def run_scans(request, pk):
    """POST ``{"scans": [{"client_id", "code", "seq", "scanned_at"}]}``: one result per scan, in order.

    GET: the run's scans, newest first (for review and undo).
    """
    run, err = _run_for(request, pk, write=request.method == 'POST')
    if err:
        return err
    if request.method == 'GET':
        return Response({'run': counting.run_summary(run), 'scans': counting.run_scans(run)})
    scans = request.data.get('scans')
    if not isinstance(scans, list) or not scans:
        return _err('scans must be a non-empty list.', 'SCANS_REQUIRED')
    try:
        results = counting.record_scans(run, scans)
    except counting.RunClosed:
        return _err('This run was stopped. Start a new one.', 'RUN_CLOSED', 409)
    except counting.CountClosed:
        return _err("Today's count is closed.", 'COUNT_CLOSED', 409)
    return Response({'results': results, 'run': counting.run_summary(run), 'day': counting.day_summary(run.count)})


@api_view(['POST'])
@permission_classes(STAFF)
def run_stop(request, pk):
    """Body: ``{"outcome": "complete" | "partial" | "bad", "note"}``."""
    run, err = _run_for(request, pk)
    if err:
        return err
    try:
        counting.stop_run(run, outcome=str(request.data.get('outcome') or ''), note=request.data.get('note'))
    except counting.PendingIssues as e:
        return _err(f'{e.n} problems still need an answer before this section is complete.', 'PENDING_ISSUES', 409)
    except counting.BadRequest as e:
        return _err(str(e), 'BAD_REQUEST')
    return Response({'run': counting.run_summary(run), 'day': counting.day_summary(run.count)})


@api_view(['POST'])
@permission_classes(STAFF)
def scan_remove(request, pk):
    return _scan_toggle(request, pk, remove=True)


@api_view(['POST'])
@permission_classes(STAFF)
def scan_restore(request, pk):
    return _scan_toggle(request, pk, remove=False)


def _scan_toggle(request, pk, *, remove: bool):
    scan = _get(CountScan, pk, 'run', 'item__product')
    if scan is None or scan.run is None:
        return _not_found('Scan')
    if scan.run.user_id != request.user.pk and not _is_manager(request.user):
        return _err("This is someone else's scan.", 'NOT_YOUR_RUN', 403)
    if remove:
        counting.remove_scan(scan, user=request.user)
    else:
        counting.restore_scan(scan)
    return Response(counting.scan_payload(scan, issue=scan.issues.first()))


@api_view(['GET', 'POST'])
@permission_classes(STAFF)
def carts(request):
    """GET: my open carts. POST ``{"kind": "pr" | "relocate"}``: my cart is full, start the next one."""
    if request.method == 'POST':
        try:
            cart = counting.new_cart(request.user, str(request.data.get('kind') or ''))
        except counting.BadRequest as e:
            return _err(str(e), 'BAD_REQUEST')
        return Response(counting.cart_payload(cart), status=201)
    return Response({
        'pr': counting.cart_payload(counting.current_cart(request.user, Cart.KIND_PR, create=False)),
        'relocate': counting.cart_payload(counting.current_cart(request.user, Cart.KIND_RELOCATE, create=False)),
    })


# --- problems -------------------------------------------------------------------------------------

@api_view(['GET', 'POST'])
@permission_classes(STAFF)
def issues(request):
    """GET: the PR Fix-it list. ``?show=open`` (default), ``fixed`` or ``all``; ``?kind=pr|relocate``.

    POST: report a problem on an item: ``{"run_id", "kind", "action", "scan_id"?, "detail"?, "target_section_id"?}``.
    """
    if request.method == 'POST':
        run, err = _run_for(request, request.data.get('run_id'))
        if err:
            return err
        scan = None
        if request.data.get('scan_id'):
            scan = CountScan.objects.select_related('item').filter(pk=request.data['scan_id'], count=run.count).first()
        try:
            issue = counting.report_issue(
                run, user=request.user, kind=str(request.data.get('kind') or ''),
                action=str(request.data.get('action') or ''), scan=scan,
                detail=str(request.data.get('detail') or ''), target_section_id=request.data.get('target_section_id'),
            )
        except counting.BadRequest as e:
            return _err(str(e), 'BAD_REQUEST')
        return Response(counting.issue_payload(counting.issues_qs().get(pk=issue.pk)), status=201)

    qs = counting.issues_qs().filter(action__in=[Issue.ACTION_PR_CART, Issue.ACTION_RELOCATE])
    # ``?count=<id>`` one inventory, ``all`` every one; by default the latest (owner, 2026-10-06).
    which = request.query_params.get('count') or ''
    if which != 'all':
        count = _get(InventoryCount, which) if which.isdigit() else counting.latest_count()
        qs = qs.filter(count=count) if count else qs.none()
    show = request.query_params.get('show') or 'open'
    if show == 'open':
        qs = qs.filter(fixed_at__isnull=True)
    elif show == 'fixed':
        qs = qs.filter(fixed_at__isnull=False).order_by('-fixed_at')
    kind = request.query_params.get('kind')
    if kind in (Cart.KIND_PR, Cart.KIND_RELOCATE):
        qs = qs.filter(action=Issue.ACTION_PR_CART if kind == Cart.KIND_PR else Issue.ACTION_RELOCATE)
    rows = []
    for issue in qs[:400]:
        row = counting.issue_payload(issue)
        row['label'] = counting.label_for(issue.new_item or issue.item)
        rows.append(row)
    return Response(rows)


@api_view(['PATCH'])
@permission_classes(STAFF)
def issue_detail(request, pk):
    """Answer a problem (or change the answer): ``{"action", "detail"?, "target_section_id"?}``."""
    issue = counting.issues_qs().filter(pk=pk).first()
    if issue is None:
        return _not_found('Problem')
    if issue.created_by_id != request.user.pk and not _is_manager(request.user):
        return _err("This is someone else's problem to answer.", 'NOT_YOUR_RUN', 403)
    try:
        counting.answer_issue(
            issue, user=request.user, action=str(request.data.get('action') or ''),
            detail=request.data.get('detail'), target_section_id=request.data.get('target_section_id'),
        )
    except counting.BadRequest as e:
        return _err(str(e), 'BAD_REQUEST')
    return Response(counting.issue_payload(issue))


@api_view(['POST'])
@permission_classes(STAFF)
def issue_fix(request, pk):
    """PR Fix-it. Body: ``{"fix", ...}``. Returns the problem and the ``label`` to print (or null)."""
    issue = counting.issues_qs().filter(pk=pk).first()
    if issue is None:
        return _not_found('Problem')
    try:
        label = fixit.fix_issue(issue, user=request.user, fix=str(request.data.get('fix') or ''), data=request.data)
    except counting.BadRequest as e:
        return _err(str(e), 'BAD_REQUEST')
    issue = counting.issues_qs().get(pk=pk)
    return Response({'issue': counting.issue_payload(issue), 'label': label})


@api_view(['POST'])
@permission_classes(STAFF)
def issue_reopen(request, pk):
    issue = counting.issues_qs().filter(pk=pk).first()
    if issue is None:
        return _not_found('Problem')
    fixit.reopen_issue(issue)
    return Response(counting.issue_payload(issue))


@api_view(['POST'])
@permission_classes(STAFF)
def fixit_scan(request):
    """PR Fix-it scan: ``{"code"}``. Fixes the item when the fix is certain (and returns the tag to print);
    otherwise names the problem that needs an answer."""
    try:
        which = str(request.data.get('count') or '')
        count_id = int(which) if which.isdigit() else None
        return Response(fixit.scan_fix(str(request.data.get('code') or ''), user=request.user, count_id=count_id))
    except counting.BadRequest as e:
        return _err(str(e), 'BAD_REQUEST')


@api_view(['GET'])
@permission_classes(STAFF)
def fixit_inventories(request):
    """PR Fix-it's picker: the latest inventory first, then any earlier one with problems still open."""
    latest = counting.latest_count()
    rows = []
    for c in InventoryCount.objects.filter(day__isnull=False).order_by('-started_at', '-pk')[:20]:
        open_n = c.issues.filter(action__in=[Issue.ACTION_PR_CART, Issue.ACTION_RELOCATE], fixed_at__isnull=True).count()
        if c == latest or open_n:
            rows.append({'id': c.pk, 'name': c.name, 'day': c.day, 'days_active': counting.days_active(c),
                         'stage': inventories.stage(c), 'open': open_n, 'latest': latest is not None and c.pk == latest.pk})
    return Response(rows)


@api_view(['GET'])
@permission_classes(STAFF)
def fixit_products(request):
    """``?q=`` words, ``&issue=`` the problem: products, each with the items of it the inventory has not found."""
    issue = Issue.objects.select_related('count').filter(pk=request.query_params.get('issue') or 0).first()
    return Response(fixit.product_options(request.query_params.get('q') or '', issue=issue))


@api_view(['GET'])
@permission_classes(STAFF)
def search(request):
    """``?q=`` any words on the item: SKU, title, brand, product number."""
    return Response(counting.search_items(request.query_params.get('q') or ''))


# --- overview and report (managers) ---------------------------------------------------------------

@api_view(['GET'])
@permission_classes(MANAGERS)
def counts(request):
    """Every inventory, newest first."""
    return Response(counting.days())


@api_view(['GET'])
@permission_classes(MANAGERS)
def inventory_list(request):
    """The Inventories list: every real inventory, newest first, with its key numbers."""
    return Response(inventories.inventories())


@api_view(['POST'])
@permission_classes(MANAGERS)
def count_start(request):
    """A manager starts an inventory: ``{"name"?}``. Refused while one is in progress."""
    try:
        count = counting.start_inventory(request.user, str(request.data.get('name') or ''))
    except counting.BadRequest as e:
        return _err(str(e), 'ANOTHER_OPEN', 409)
    return Response(counting.day_summary(count), status=201)


@api_view(['GET'])
@permission_classes(MANAGERS)
def order_estimates(request, pk):
    count = _get(InventoryCount, pk)
    return Response(inventories.order_estimates(count)) if count else _not_found()


@api_view(['GET', 'DELETE'])
@permission_classes(MANAGERS)
def count_detail(request, pk):
    """DELETE removes the whole inventory (Super User only)."""
    count = _get(InventoryCount, pk)
    if count is None:
        return _not_found()
    if request.method == 'DELETE':
        if not request.user.is_superuser:
            return _err('Only the Super User deletes an inventory.', 'SUPERUSER_ONLY', 403)
        counting.delete_count(count)
        return Response(status=204)
    return Response(counting.day_detail(count))


@api_view(['POST'])
@permission_classes(MANAGERS)
def count_close(request, pk):
    count = _get(InventoryCount, pk)
    if count is None:
        return _not_found()
    counting.close_count(count, request.user)
    return Response(counting.day_summary(count))


@api_view(['POST'])
@permission_classes(MANAGERS)
def count_reopen(request, pk):
    count = _get(InventoryCount, pk)
    if count is None:
        return _not_found()
    try:
        counting.reopen_count(count)
    except counting.BadRequest as e:
        return _err(str(e), 'ANOTHER_OPEN', 409)
    return Response(counting.day_summary(count))


@api_view(['GET'])
@permission_classes(MANAGERS)
def count_report(request, pk):
    count = _get(InventoryCount, pk)
    return Response(counting.report(count)) if count else _not_found()


@api_view(['GET'])
@permission_classes(MANAGERS)
def count_report_csv(request, pk):
    count = _get(InventoryCount, pk)
    if count is None:
        return _not_found()
    data = counting.report(count)
    resp = HttpResponse(content_type='text/csv')
    resp['Content-Disposition'] = f'attachment; filename="count-{count.pk}-missing.csv"'
    w = csv.writer(resp)
    w.writerow(['sku', 'title', 'location', 'price', 'retail', 'cost', 'listed_at'])
    for r in data['missing']:
        w.writerow([r['sku'], r['title'], r['location'], r['price'], r['retail'] or '', r['cost'] or '', r['listed_at'] or ''])
    return resp


# --- potential shrink (inventory_effort Phase 3, managers) ----------------------------------------

def _shrink_count(pk):
    return _get(InventoryCount, pk)


@api_view(['GET'])
@permission_classes(MANAGERS)
def shrink_list(request, pk):
    """Items the inventory expected and did not find. ``?q= outcome= vendor= order= category= product= age=
    price_band= sort= page= page_size=``; ``outcome`` is ``open`` (default), ``marked``, ``all`` or one outcome."""
    count = _shrink_count(pk)
    if count is None:
        return _not_found()
    try:
        return Response(shrink.worklist(count, request.query_params.dict()))
    except (ValueError, counting.BadRequest) as e:
        return _err(str(e), 'BAD_REQUEST')


@api_view(['GET'])
@permission_classes(MANAGERS)
def shrink_groups(request, pk):
    """``?by=order|product|vendor|category``: not found / expected per group, sorted by % not found."""
    count = _shrink_count(pk)
    if count is None:
        return _not_found()
    try:
        return Response(shrink.groups(count, request.query_params.get('by') or 'order'))
    except counting.BadRequest as e:
        return _err(str(e), 'BAD_REQUEST')


@api_view(['POST'])
@permission_classes(MANAGERS)
def shrink_mark(request, pk):
    """``{"outcome", "note"?, and one of "item_ids", "filter" {...list params}, "group" {"by", "key"}}``."""
    count = _shrink_count(pk)
    if count is None:
        return _not_found()
    try:
        return Response(shrink.mark(count, user=request.user, body=request.data))
    except (ValueError, counting.BadRequest) as e:
        return _err(str(e), 'BAD_REQUEST')


@api_view(['POST'])
@permission_classes(MANAGERS)
def shrink_unmark(request, pk):
    """Undo: ``{"batch"}`` (one bulk action) or ``{"item_ids"}``."""
    count = _shrink_count(pk)
    if count is None:
        return _not_found()
    try:
        return Response(shrink.unmark(count, body=request.data))
    except (ValueError, counting.BadRequest) as e:
        return _err(str(e), 'BAD_REQUEST')


@api_view(['GET'])
@permission_classes(MANAGERS)
def shrink_csv(request, pk):
    """The filtered list as CSV (same filters as the list, every row)."""
    count = _shrink_count(pk)
    if count is None:
        return _not_found()
    params = {**request.query_params.dict(), 'page': 1, 'page_size': shrink.MAX_PAGE}
    resp = HttpResponse(content_type='text/csv')
    scope = 'counted' if request.query_params.get('scope') == 'counted' else 'not-found'
    resp['Content-Disposition'] = f'attachment; filename="inventory-{count.pk}-{scope}.csv"'
    w = csv.writer(resp)
    w.writerow(['sku', 'title', 'order', 'vendor', 'category', 'subcategory', 'price', 'retail', 'pct_of_retail',
                'checked_in', 'last_seen', 'outcome', 'note', 'location'])
    page = 1
    while True:
        data = shrink.worklist(count, {**params, 'page': page})
        for r in data['rows']:
            pct = round(100 * float(r['price']) / float(r['retail'])) if r['retail'] and float(r['retail']) > 0 else ''
            w.writerow([r['sku'], r['title'], r['order'], r['vendor'], r['category'], r['subcategory'], r['price'],
                        r['retail'] or '', pct, r['checked_in'] or '', r['last_seen'] or '', r['outcome'], r['note'], r['location']])
        if page >= data['pages']:
            break
        page += 1
    return resp


# --- the inventory report (inventory_effort Phase 4, managers) ------------------------------------

@api_view(['GET'])
@permission_classes(MANAGERS)
def inventory_summary(request, pk):
    """Totals, coverage and the per-person breakout of one inventory."""
    count = _get(InventoryCount, pk)
    return Response(report.summary(count)) if count else _not_found()


@api_view(['GET'])
@permission_classes(MANAGERS)
def inventory_breakdown(request, pk):
    """``?by=category|subcategory|vendor|order|age|pct|price_band|person``: counted and not found per group."""
    count = _get(InventoryCount, pk)
    if count is None:
        return _not_found()
    try:
        return Response(report.breakdown(count, request.query_params.get('by') or 'category'))
    except counting.BadRequest as e:
        return _err(str(e), 'BAD_REQUEST')


@api_view(['GET'])
@permission_classes(MANAGERS)
def inventory_histogram(request, pk):
    """Price as % of retail in 1% steps, counted and not found."""
    count = _get(InventoryCount, pk)
    return Response(report.histogram(count)) if count else _not_found()

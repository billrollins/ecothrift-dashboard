"""Custom pagination classes for DRF."""
from django.core.cache import cache
from django.core.paginator import Paginator as DjangoPaginator
from rest_framework.pagination import PageNumberPagination

ITEM_LIST_TOTAL_COUNT_CACHE_KEY = 'item_list_total_count'
ITEM_LIST_TOTAL_COUNT_TTL = 300


def item_list_request_is_unfiltered(request) -> bool:
    """True when ItemViewSet list has no q/search, filters, or filterset narrowing (matches list behavior)."""
    # DRF Request uses query_params; Django HttpRequest only has GET.
    qp = getattr(request, 'query_params', request.GET)
    if (qp.get('q') or '').strip():
        return False
    if (qp.get('search') or '').strip():
        return False
    if (qp.get('updated_after') or '').strip():
        return False

    def _csv_vals(key: str) -> list[str]:
        out: list[str] = []
        for part in qp.getlist(key):
            for x in part.split(','):
                t = x.strip()
                if t:
                    out.append(t)
        return out

    if _csv_vals('status') or _csv_vals('condition') or _csv_vals('source'):
        return False

    for fk in ('sku', 'purchase_order', 'category', 'processing_tier', 'batch_group'):
        v = qp.get(fk)
        if v is not None and str(v).strip() != '':
            return False
    return True


class CachedTotalCountPaginator(DjangoPaginator):
    """Paginator that can use a precomputed total count (avoids duplicate COUNT on large tables)."""

    def __init__(self, object_list, per_page, cached_total=None, **kwargs):
        super().__init__(object_list, per_page, **kwargs)
        self._cached_total = cached_total

    @property
    def count(self):
        if self._cached_total is not None:
            return self._cached_total
        return super().count


class ConfigurablePageSizePagination(PageNumberPagination):
    """PageNumberPagination that allows clients to override page size via query param."""
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 200


class ItemListPagination(ConfigurablePageSizePagination):
    """Item list: TTL cache for total row count when the request has no filters (expensive COUNT on ~all items)."""

    def paginate_queryset(self, queryset, request, view=None):
        cached_total = None
        if item_list_request_is_unfiltered(request):
            cached_total = cache.get_or_set(
                ITEM_LIST_TOTAL_COUNT_CACHE_KEY,
                lambda: queryset.count(),
                ITEM_LIST_TOTAL_COUNT_TTL,
            )
        original = self.django_paginator_class

        def _paginator_factory(qs, per_page):
            return CachedTotalCountPaginator(qs, per_page, cached_total=cached_total)

        self.django_paginator_class = _paginator_factory
        try:
            return super().paginate_queryset(queryset, request, view)
        finally:
            self.django_paginator_class = original

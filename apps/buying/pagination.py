"""Pagination for buying API."""

from rest_framework.pagination import PageNumberPagination


class ManifestRowsPagination(PageNumberPagination):
    """Fixed page size 50 for auction manifest line items (GET .../manifest_rows/)."""

    page_size = 50
    page_size_query_param = None


class SnapshotPagination(PageNumberPagination):
    """Fixed page size 200 for auction price history (GET .../snapshots/)."""

    page_size = 200
    page_size_query_param = None

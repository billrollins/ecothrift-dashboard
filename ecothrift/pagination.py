"""Custom pagination classes for DRF."""
from rest_framework.pagination import PageNumberPagination


class ConfigurablePageSizePagination(PageNumberPagination):
    """PageNumberPagination that allows clients to override page size via query param."""
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 1000

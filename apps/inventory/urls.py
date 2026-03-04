from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    VendorViewSet, CategoryViewSet, PurchaseOrderViewSet, CSVTemplateViewSet,
    ProductViewSet, VendorProductRefViewSet, BatchGroupViewSet,
    ItemViewSet, ItemHistoryViewSet, item_lookup,
    classify_item_view, store_report_view,
    verify_present_view, quick_reprice_view, estimate_price_view,
    retag_lookup_view, retag_create_view,
    retag_v2_lookup_view, retag_v2_create_view, retag_v2_stats_view, retag_v2_history_view,
)

router = DefaultRouter()
router.register(r'vendors', VendorViewSet, basename='vendor')
router.register(r'categories', CategoryViewSet, basename='category')
router.register(r'orders', PurchaseOrderViewSet, basename='purchaseorder')
router.register(r'templates', CSVTemplateViewSet, basename='csvtemplate')
router.register(r'products', ProductViewSet, basename='product')
router.register(r'product-refs', VendorProductRefViewSet, basename='vendorproductref')
router.register(r'batch-groups', BatchGroupViewSet, basename='batchgroup')
router.register(r'items', ItemViewSet, basename='item')
router.register(r'item-history', ItemHistoryViewSet, basename='itemhistory')

urlpatterns = [
    path('', include(router.urls)),
    path('items/lookup/<str:sku>/', item_lookup, name='item-lookup'),
    path('classify/', classify_item_view, name='classify-item'),
    path('store-report/', store_report_view, name='store-report'),
    path('items/<int:pk>/verify-present/', verify_present_view, name='item-verify-present'),
    path('items/<int:pk>/quick-reprice/', quick_reprice_view, name='item-quick-reprice'),
    path('estimate-price/', estimate_price_view, name='estimate-price'),
    path('retag/lookup/', retag_lookup_view, name='retag-lookup'),
    path('retag/create/', retag_create_view, name='retag-create'),
    path('retag/v2/lookup/', retag_v2_lookup_view, name='retag-v2-lookup'),
    path('retag/v2/create/', retag_v2_create_view, name='retag-v2-create'),
    path('retag/v2/stats/', retag_v2_stats_view, name='retag-v2-stats'),
    path('retag/v2/history/', retag_v2_history_view, name='retag-v2-history'),
]

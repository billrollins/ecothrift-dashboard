from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    VendorViewSet, CategoryViewSet, PurchaseOrderViewSet, CSVTemplateViewSet,
    ProductViewSet, VendorProductRefViewSet, BatchGroupViewSet,
    ItemViewSet, ItemCheckInViewSet, ItemHistoryViewSet, ItemNoteViewSet, RestorationJobViewSet,
    RestorationOutputViewSet,
    RestorationPartViewSet,
    RestorationPartsOrderViewSet,
    RestorationGradeScaleViewSet,
    manifest_field_metadata_view, item_lookup,
    classify_item_view, store_report_view,
    verify_present_view, quick_reprice_view, duplicate_item_for_resale_view,
    mark_sold_item_on_shelf_view, estimate_price_view,
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
router.register(r'item-check-ins', ItemCheckInViewSet, basename='itemcheckin')
router.register(r'item-history', ItemHistoryViewSet, basename='itemhistory')
router.register(r'item-notes', ItemNoteViewSet, basename='itemnote')
router.register(r'restoration-jobs', RestorationJobViewSet, basename='restorationjob')
router.register(r'restoration-outputs', RestorationOutputViewSet, basename='restorationoutput')
router.register(r'restoration-parts', RestorationPartViewSet, basename='restorationpart')
router.register(r'restoration-parts-orders', RestorationPartsOrderViewSet, basename='restorationpartsorder')
router.register(r'grade-scales', RestorationGradeScaleViewSet, basename='restorationgradescale')

urlpatterns = [
    path('manifest-fields/', manifest_field_metadata_view, name='inventory-manifest-fields'),
    path('', include(router.urls)),
    path('items/lookup/<str:sku>/', item_lookup, name='item-lookup'),
    path('classify/', classify_item_view, name='classify-item'),
    path('store-report/', store_report_view, name='store-report'),
    path('items/<int:pk>/verify-present/', verify_present_view, name='item-verify-present'),
    path('items/<int:pk>/quick-reprice/', quick_reprice_view, name='item-quick-reprice'),
    path('items/<int:pk>/duplicate-for-resale/', duplicate_item_for_resale_view, name='item-duplicate-for-resale'),
    path('items/<int:pk>/mark-on-shelf/', mark_sold_item_on_shelf_view, name='item-mark-on-shelf'),
    path('estimate-price/', estimate_price_view, name='estimate-price'),
]

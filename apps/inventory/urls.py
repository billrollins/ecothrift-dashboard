from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    VendorViewSet, CategoryViewSet, PurchaseOrderViewSet, CSVTemplateViewSet,
    ProductViewSet, VendorProductRefViewSet, BatchGroupViewSet,
    ItemViewSet, ItemHistoryViewSet, item_lookup,
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
]

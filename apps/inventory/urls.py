from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    VendorViewSet, PurchaseOrderViewSet, CSVTemplateViewSet,
    ProductViewSet, ItemViewSet, item_lookup,
)

router = DefaultRouter()
router.register(r'vendors', VendorViewSet, basename='vendor')
router.register(r'orders', PurchaseOrderViewSet, basename='purchaseorder')
router.register(r'templates', CSVTemplateViewSet, basename='csvtemplate')
router.register(r'products', ProductViewSet, basename='product')
router.register(r'items', ItemViewSet, basename='item')

urlpatterns = [
    path('', include(router.urls)),
    path('items/lookup/<str:sku>/', item_lookup, name='item-lookup'),
]

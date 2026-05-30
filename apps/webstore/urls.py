from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    OrderViewSet,
    WebListingViewSet,
    checkout,
    listing_image,
    order_status,
    public_catalog,
    public_categories,
    public_listing_detail,
)

router = DefaultRouter()
router.register(r'listings', WebListingViewSet, basename='weblisting')
router.register(r'orders', OrderViewSet, basename='weborder')

urlpatterns = [
    # Public storefront (AllowAny). `catalog/categories/` must precede the slug route.
    path('catalog/', public_catalog, name='webstore-public-catalog'),
    path('catalog/categories/', public_categories, name='webstore-public-categories'),
    path('catalog/<slug:slug>/', public_listing_detail, name='webstore-public-detail'),
    path('images/<int:image_id>/', listing_image, name='webstore-image'),
    path('checkout/', checkout, name='webstore-checkout'),
    path('order-status/<str:order_number>/', order_status, name='webstore-order-status'),
    # Staff CRUD + order management (auth + IsStaff).
    path('', include(router.urls)),
]

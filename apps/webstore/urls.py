from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    OrderViewSet,
    ReservationViewSet,
    WebListingViewSet,
    checkout,
    hold_status,
    listing_image,
    order_status,
    public_catalog,
    public_categories,
    public_listing_detail,
    request_hold,
    sales_log,
    work_queue,
)

router = DefaultRouter()
router.register(r'listings', WebListingViewSet, basename='weblisting')
router.register(r'orders', OrderViewSet, basename='weborder')
router.register(r'reservations', ReservationViewSet, basename='webreservation')

urlpatterns = [
    path('catalog/', public_catalog, name='webstore-public-catalog'),
    path('catalog/categories/', public_categories, name='webstore-public-categories'),
    path('catalog/<slug:slug>/', public_listing_detail, name='webstore-public-detail'),
    path('images/<int:image_id>/', listing_image, name='webstore-image'),
    path('checkout/', checkout, name='webstore-checkout'),
    path('order-status/<str:order_number>/', order_status, name='webstore-order-status'),
    path('holds/', request_hold, name='webstore-request-hold'),
    path('holds/<str:token>/', hold_status, name='webstore-hold-status'),
    path('work-queue/', work_queue, name='webstore-work-queue'),
    path('sales-log/', sales_log, name='webstore-sales-log'),
    path('', include(router.urls)),
]

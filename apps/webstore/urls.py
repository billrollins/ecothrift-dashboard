from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ConversationViewSet,
    OrderViewSet,
    ReservationViewSet,
    WebListingViewSet,
    catalog_ask,
    checkout,
    hold_status,
    listing_image,
    order_status,
    public_catalog,
    public_categories,
    public_config,
    public_listing_detail,
    request_hold,
    sales_log,
    thread_mark_read,
    thread_post_message,
    my_conversations,
    my_holds,
    work_queue,
)

router = DefaultRouter()
router.register(r'listings', WebListingViewSet, basename='weblisting')
router.register(r'orders', OrderViewSet, basename='weborder')
router.register(r'reservations', ReservationViewSet, basename='webreservation')
router.register(r'conversations', ConversationViewSet, basename='webconversation')

urlpatterns = [
    path('config/', public_config, name='webstore-public-config'),
    path('catalog/', public_catalog, name='webstore-public-catalog'),
    path('catalog/categories/', public_categories, name='webstore-public-categories'),
    path('catalog/<slug:slug>/ask/', catalog_ask, name='webstore-catalog-ask'),
    path('catalog/<slug:slug>/', public_listing_detail, name='webstore-public-detail'),
    path('images/<int:image_id>/', listing_image, name='webstore-image'),
    path('checkout/', checkout, name='webstore-checkout'),
    path('order-status/<str:order_number>/', order_status, name='webstore-order-status'),
    path('holds/', request_hold, name='webstore-request-hold'),
    path('holds/<str:token>/', hold_status, name='webstore-hold-status'),
    path('threads/<str:token>/messages/', thread_post_message, name='webstore-thread-message'),
    path('threads/<str:token>/read/', thread_mark_read, name='webstore-thread-read'),
    path('my/holds/', my_holds, name='webstore-my-holds'),
    path('my/conversations/', my_conversations, name='webstore-my-conversations'),
    path('work-queue/', work_queue, name='webstore-work-queue'),
    path('sales-log/', sales_log, name='webstore-sales-log'),
    path('', include(router.urls)),
]

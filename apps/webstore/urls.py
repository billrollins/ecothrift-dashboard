from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ConversationViewSet,
    OrderViewSet,
    ReservationViewSet,
    WebListingViewSet,
    catalog_ask,
    checkout,
    confirm_hold_code,
    confirm_hold_link,
    create_hold_confirmation,
    hold_confirmation_status,
    hold_status,
    listing_image,
    order_status,
    public_catalog,
    public_categories,
    public_config,
    public_listing_detail,
    change_hold_email,
    request_hold,
    sales_log,
    thread_mark_read,
    thread_post_message,
    my_conversation_delete,
    my_conversation_detail,
    my_conversation_mark_unread,
    my_conversations,
    my_hold_archive,
    my_hold_unarchive,
    my_holds,
    work_queue,
    work_queue_remove_item,
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
    # Literal path before holds/<token>/ so "confirm" is not swallowed as a token.
    path('holds/confirm/', confirm_hold_link, name='webstore-hold-confirm-link'),
    path(
        'holds/<str:token>/confirmations/',
        create_hold_confirmation,
        name='webstore-hold-confirmations',
    ),
    path(
        'holds/<str:token>/confirm/',
        confirm_hold_code,
        name='webstore-hold-confirm-code',
    ),
    path(
        'holds/<str:token>/confirmation-status/',
        hold_confirmation_status,
        name='webstore-hold-confirmation-status',
    ),
    path(
        'holds/<str:token>/resend-verification/',
        create_hold_confirmation,
        name='webstore-hold-resend-verification',
    ),
    path(
        'holds/<str:token>/change-email/',
        change_hold_email,
        name='webstore-hold-change-email',
    ),
    path('holds/<str:token>/', hold_status, name='webstore-hold-status'),
    path('threads/<str:token>/messages/', thread_post_message, name='webstore-thread-message'),
    path('threads/<str:token>/read/', thread_mark_read, name='webstore-thread-read'),
    path('my/holds/', my_holds, name='webstore-my-holds'),
    path(
        'my/holds/<str:token>/archive/',
        my_hold_archive,
        name='webstore-my-hold-archive',
    ),
    path(
        'my/holds/<str:token>/unarchive/',
        my_hold_unarchive,
        name='webstore-my-hold-unarchive',
    ),
    path('my/conversations/', my_conversations, name='webstore-my-conversations'),
    path(
        'my/conversations/<str:token>/',
        my_conversation_detail,
        name='webstore-my-conversation-detail',
    ),
    path(
        'my/conversations/<str:token>/unread/',
        my_conversation_mark_unread,
        name='webstore-my-conversation-unread',
    ),
    path(
        'my/conversations/<str:token>/delete/',
        my_conversation_delete,
        name='webstore-my-conversation-delete',
    ),
    path('work-queue/', work_queue, name='webstore-work-queue'),
    path(
        'work-queue/<int:item_id>/remove/',
        work_queue_remove_item,
        name='webstore-work-queue-remove',
    ),
    path('sales-log/', sales_log, name='webstore-sales-log'),
    path('', include(router.urls)),
]

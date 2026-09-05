from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    RegisterViewSet, DrawerViewSet, SupplementalViewSet,
    BankTransactionViewSet, CartViewSet, ReceiptViewSet,
    RevenueGoalViewSet,
    DeliveryAvailabilityViewSet, DeliveryJobViewSet,
    DeliveryDayViewSet, DeliveryViewSet,
    dashboard_metrics, dashboard_alerts, dashboard_sales_goal,
    dashboard_department_goals, historical_revenue,
    sale_mode,
    delivery_address_suggest, delivery_distance_quote, delivery_optimize_route,
    delivery_runs, delivery_run_detail, delivery_run_set_phase,
    delivery_run_begin_route, delivery_run_optimize, delivery_run_reorder,
    delivery_run_preview_insert, delivery_run_commit_insert,
    delivery_run_finish, delivery_run_upload, delivery_run_delete_attachment,
    delivery_run_return_store,
    delivery_stop_load, delivery_stop_secure, delivery_stop_call,
    delivery_stop_contact_attempt, delivery_stop_disposition,
    delivery_stop_exclude_unconfirmed,
    delivery_stop_hold, delivery_stop_release, delivery_stop_complete,
    delivery_stop_contact_present, delivery_stop_delivered,
    delivery_stop_return_reconcile,
    delivery_stop_notes, delivery_stop_scan_verify, delivery_stop_report_issue,
    delivery_stop_item_scan, delivery_stop_item_skip, delivery_stop_item_load,
    delivery_stop_item_photo_exception,
    delivery_run_close_truck, delivery_run_reopen_truck, delivery_run_departure_override,
    delivery_job_append_address, delivery_job_reschedule,
)

router = DefaultRouter()
router.register(r'registers', RegisterViewSet, basename='register')
router.register(r'drawers', DrawerViewSet, basename='drawer')
router.register(r'supplemental', SupplementalViewSet, basename='supplemental')
router.register(r'bank-transactions', BankTransactionViewSet, basename='banktransaction')
router.register(r'carts', CartViewSet, basename='cart')
router.register(r'receipts', ReceiptViewSet, basename='receipt')
router.register(r'revenue-goals', RevenueGoalViewSet, basename='revenuegoal')
router.register(r'delivery-availabilities', DeliveryAvailabilityViewSet, basename='deliveryavailability')
router.register(r'delivery-jobs', DeliveryJobViewSet, basename='deliveryjob')
router.register(r'delivery-days', DeliveryDayViewSet, basename='deliveryday')
router.register(r'deliveries', DeliveryViewSet, basename='delivery')

urlpatterns = [
    path('', include(router.urls)),
    path('delivery/address-suggest/', delivery_address_suggest, name='delivery-address-suggest'),
    path('delivery/quote/', delivery_distance_quote, name='delivery-distance-quote'),
    path('delivery/optimize-route/', delivery_optimize_route, name='delivery-optimize-route'),
    path('delivery-runs/', delivery_runs, name='delivery-runs'),
    path('delivery-runs/<int:pk>/', delivery_run_detail, name='delivery-run-detail'),
    path('delivery-runs/<int:pk>/phase/', delivery_run_set_phase, name='delivery-run-phase'),
    path('delivery-runs/<int:pk>/begin-route/', delivery_run_begin_route, name='delivery-run-begin-route'),
    path('delivery-runs/<int:pk>/optimize/', delivery_run_optimize, name='delivery-run-optimize'),
    path('delivery-runs/<int:pk>/reorder/', delivery_run_reorder, name='delivery-run-reorder'),
    path(
        'delivery-runs/<int:pk>/preview-insert/',
        delivery_run_preview_insert,
        name='delivery-run-preview-insert',
    ),
    path(
        'delivery-runs/<int:pk>/commit-insert/',
        delivery_run_commit_insert,
        name='delivery-run-commit-insert',
    ),
    path('delivery-runs/<int:pk>/finish/', delivery_run_finish, name='delivery-run-finish'),
    path(
        'delivery-runs/<int:pk>/return-store/',
        delivery_run_return_store,
        name='delivery-run-return-store',
    ),
    path('delivery-runs/<int:pk>/attachments/', delivery_run_upload, name='delivery-run-upload'),
    path(
        'delivery-runs/<int:pk>/attachments/<int:attachment_id>/',
        delivery_run_delete_attachment,
        name='delivery-run-delete-attachment',
    ),
    path('delivery-stops/<int:pk>/load/', delivery_stop_load, name='delivery-stop-load'),
    path('delivery-stops/<int:pk>/secure/', delivery_stop_secure, name='delivery-stop-secure'),
    path('delivery-stops/<int:pk>/call/', delivery_stop_call, name='delivery-stop-call'),
    path(
        'delivery-stops/<int:pk>/contact-attempt/',
        delivery_stop_contact_attempt,
        name='delivery-stop-contact-attempt',
    ),
    path(
        'delivery-stops/<int:pk>/disposition/',
        delivery_stop_disposition,
        name='delivery-stop-disposition',
    ),
    path(
        'delivery-stops/<int:pk>/exclude-unconfirmed/',
        delivery_stop_exclude_unconfirmed,
        name='delivery-stop-exclude-unconfirmed',
    ),
    path('delivery-stops/<int:pk>/hold/', delivery_stop_hold, name='delivery-stop-hold'),
    path('delivery-stops/<int:pk>/release/', delivery_stop_release, name='delivery-stop-release'),
    path('delivery-stops/<int:pk>/complete/', delivery_stop_complete, name='delivery-stop-complete'),
    path(
        'delivery-stops/<int:pk>/contact-present/',
        delivery_stop_contact_present,
        name='delivery-stop-contact-present',
    ),
    path(
        'delivery-stops/<int:pk>/delivered/',
        delivery_stop_delivered,
        name='delivery-stop-delivered',
    ),
    path(
        'delivery-stops/<int:pk>/return-reconcile/',
        delivery_stop_return_reconcile,
        name='delivery-stop-return-reconcile',
    ),
    path('delivery-stops/<int:pk>/notes/', delivery_stop_notes, name='delivery-stop-notes'),
    path(
        'delivery-stops/<int:pk>/scan-verify/',
        delivery_stop_scan_verify,
        name='delivery-stop-scan-verify',
    ),
    path(
        'delivery-stops/<int:pk>/report-issue/',
        delivery_stop_report_issue,
        name='delivery-stop-report-issue',
    ),
    path(
        'delivery-stop-items/<int:pk>/scan/',
        delivery_stop_item_scan,
        name='delivery-stop-item-scan',
    ),
    path(
        'delivery-stop-items/<int:pk>/skip/',
        delivery_stop_item_skip,
        name='delivery-stop-item-skip',
    ),
    path(
        'delivery-stop-items/<int:pk>/load/',
        delivery_stop_item_load,
        name='delivery-stop-item-load',
    ),
    path(
        'delivery-stop-items/<int:pk>/photo-exception/',
        delivery_stop_item_photo_exception,
        name='delivery-stop-item-photo-exception',
    ),
    path(
        'delivery-runs/<int:pk>/close-truck/',
        delivery_run_close_truck,
        name='delivery-run-close-truck',
    ),
    path(
        'delivery-runs/<int:pk>/reopen-truck/',
        delivery_run_reopen_truck,
        name='delivery-run-reopen-truck',
    ),
    path(
        'delivery-runs/<int:pk>/departure-override/',
        delivery_run_departure_override,
        name='delivery-run-departure-override',
    ),
    path(
        'delivery-jobs/<int:pk>/append-address/',
        delivery_job_append_address,
        name='delivery-job-append-address',
    ),
    path(
        'delivery-jobs/<int:pk>/reschedule/',
        delivery_job_reschedule,
        name='delivery-job-reschedule',
    ),
    path('sale-mode/', sale_mode, name='sale-mode'),
    path('dashboard/metrics/', dashboard_metrics, name='dashboard-metrics'),
    path('dashboard/alerts/', dashboard_alerts, name='dashboard-alerts'),
    path('dashboard/sales-goal/', dashboard_sales_goal, name='dashboard-sales-goal'),
    path('dashboard/department-goals/', dashboard_department_goals, name='dashboard-department-goals'),
    path('historical-revenue/', historical_revenue, name='historical-revenue'),
]

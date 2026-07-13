from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    RegisterViewSet, DrawerViewSet, SupplementalViewSet,
    BankTransactionViewSet, CartViewSet, ReceiptViewSet,
    RevenueGoalViewSet, QualityAuditViewSet, QualityAuditFormViewSet,
    DeliveryAvailabilityViewSet, DeliveryJobViewSet,
    dashboard_metrics, dashboard_alerts, dashboard_sales_goal,
    dashboard_department_goals, historical_revenue,
    delivery_address_suggest, delivery_distance_quote,
)

router = DefaultRouter()
router.register(r'registers', RegisterViewSet, basename='register')
router.register(r'drawers', DrawerViewSet, basename='drawer')
router.register(r'supplemental', SupplementalViewSet, basename='supplemental')
router.register(r'bank-transactions', BankTransactionViewSet, basename='banktransaction')
router.register(r'carts', CartViewSet, basename='cart')
router.register(r'receipts', ReceiptViewSet, basename='receipt')
router.register(r'revenue-goals', RevenueGoalViewSet, basename='revenuegoal')
router.register(r'quality-audits', QualityAuditViewSet, basename='qualityaudit')
router.register(r'quality-audit-forms', QualityAuditFormViewSet, basename='qualityauditform')
router.register(r'delivery-availabilities', DeliveryAvailabilityViewSet, basename='deliveryavailability')
router.register(r'delivery-jobs', DeliveryJobViewSet, basename='deliveryjob')

urlpatterns = [
    path('', include(router.urls)),
    path('delivery/address-suggest/', delivery_address_suggest, name='delivery-address-suggest'),
    path('delivery/quote/', delivery_distance_quote, name='delivery-distance-quote'),
    path('dashboard/metrics/', dashboard_metrics, name='dashboard-metrics'),
    path('dashboard/alerts/', dashboard_alerts, name='dashboard-alerts'),
    path('dashboard/sales-goal/', dashboard_sales_goal, name='dashboard-sales-goal'),
    path('dashboard/department-goals/', dashboard_department_goals, name='dashboard-department-goals'),
    path('historical-revenue/', historical_revenue, name='historical-revenue'),
]

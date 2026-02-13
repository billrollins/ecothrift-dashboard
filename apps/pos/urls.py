from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    RegisterViewSet, DrawerViewSet, SupplementalViewSet,
    BankTransactionViewSet, CartViewSet, ReceiptViewSet,
    RevenueGoalViewSet,
    dashboard_metrics, dashboard_alerts,
)

router = DefaultRouter()
router.register(r'registers', RegisterViewSet, basename='register')
router.register(r'drawers', DrawerViewSet, basename='drawer')
router.register(r'supplemental', SupplementalViewSet, basename='supplemental')
router.register(r'bank-transactions', BankTransactionViewSet, basename='banktransaction')
router.register(r'carts', CartViewSet, basename='cart')
router.register(r'receipts', ReceiptViewSet, basename='receipt')
router.register(r'revenue-goals', RevenueGoalViewSet, basename='revenuegoal')

urlpatterns = [
    path('', include(router.urls)),
    path('dashboard/metrics/', dashboard_metrics, name='dashboard-metrics'),
    path('dashboard/alerts/', dashboard_alerts, name='dashboard-alerts'),
]

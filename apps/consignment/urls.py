from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ConsigneeAccountViewSet,
    ConsignmentAgreementViewSet, ConsignmentItemViewSet,
    ConsignmentPayoutViewSet,
    my_items, my_payouts, my_summary,
)

router = DefaultRouter()
router.register(r'accounts', ConsigneeAccountViewSet, basename='consignee-account')
router.register(r'agreements', ConsignmentAgreementViewSet, basename='agreement')
router.register(r'items', ConsignmentItemViewSet, basename='consignmentitem')
router.register(r'payouts', ConsignmentPayoutViewSet, basename='payout')

urlpatterns = [
    path('', include(router.urls)),
    path('my/items/', my_items, name='my-consignment-items'),
    path('my/payouts/', my_payouts, name='my-consignment-payouts'),
    path('my/summary/', my_summary, name='my-consignment-summary'),
]

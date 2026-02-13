from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    DepartmentViewSet, TimeEntryViewSet,
    SickLeaveBalanceViewSet, SickLeaveRequestViewSet,
)

router = DefaultRouter()
router.register(r'departments', DepartmentViewSet, basename='department')
router.register(r'time-entries', TimeEntryViewSet, basename='timeentry')
router.register(r'sick-leave/balances', SickLeaveBalanceViewSet, basename='sickleavebalance')
router.register(r'sick-leave/requests', SickLeaveRequestViewSet, basename='sickleaverequest')

urlpatterns = [
    path('', include(router.urls)),
]

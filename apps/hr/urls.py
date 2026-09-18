from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    DepartmentViewSet, TimeEntryViewSet, TimeEntryModificationRequestViewSet,
    SickLeaveBalanceViewSet, SickLeaveRequestViewSet,
    ShiftViewSet, ShiftAssignmentViewSet,
)

router = DefaultRouter()
router.register(r'departments', DepartmentViewSet, basename='department')
router.register(r'time-entries', TimeEntryViewSet, basename='timeentry')
router.register(r'modification-requests', TimeEntryModificationRequestViewSet, basename='modrequest')
router.register(r'sick-leave/balances', SickLeaveBalanceViewSet, basename='sickleavebalance')
router.register(r'sick-leave/requests', SickLeaveRequestViewSet, basename='sickleaverequest')
router.register(r'shifts', ShiftViewSet, basename='shift')
router.register(r'shift-assignments', ShiftAssignmentViewSet, basename='shiftassignment')

urlpatterns = [
    path('', include(router.urls)),
]

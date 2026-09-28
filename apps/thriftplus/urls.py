from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.thriftplus.views import AccountViewSet, CardBatchViewSet, CardViewSet, PersonViewSet, RewardsViewSet

router = DefaultRouter()
router.register(r'accounts', AccountViewSet, basename='thriftplus-account')
router.register(r'people', PersonViewSet, basename='thriftplus-person')
router.register(r'cards', CardViewSet, basename='thriftplus-card')
router.register(r'card-batches', CardBatchViewSet, basename='thriftplus-card-batch')
router.register(r'rewards', RewardsViewSet, basename='thriftplus-rewards')

urlpatterns = [path('', include(router.urls))]

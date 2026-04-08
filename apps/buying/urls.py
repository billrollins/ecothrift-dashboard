from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.buying import views
from apps.buying.api_views import AuctionViewSet, MarketplaceViewSet, SweepView, WatchlistAuctionViewSet

router = DefaultRouter()
router.register(r'auctions', AuctionViewSet, basename='buying-auction')
router.register(r'watchlist', WatchlistAuctionViewSet, basename='buying-watchlist')
router.register(r'marketplaces', MarketplaceViewSet, basename='buying-marketplace')

urlpatterns = [
    path('token/', views.receive_bstock_token, name='buying_bstock_token'),
    path('sweep/', SweepView.as_view(), name='buying-sweep'),
    path('', include(router.urls)),
]

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.thriftplus import public_views

from apps.thriftplus.views import (
    AccountViewSet,
    CardBatchViewSet,
    CardViewSet,
    PersonViewSet,
    RegisterViewSet,
    RestrictedProductViewSet,
    ReturnsViewSet,
    RewardsViewSet,
)

router = DefaultRouter()
router.register(r'accounts', AccountViewSet, basename='thriftplus-account')
router.register(r'people', PersonViewSet, basename='thriftplus-person')
router.register(r'cards', CardViewSet, basename='thriftplus-card')
router.register(r'card-batches', CardBatchViewSet, basename='thriftplus-card-batch')
router.register(r'rewards', RewardsViewSet, basename='thriftplus-rewards')
router.register(r'register', RegisterViewSet, basename='thriftplus-register')
router.register(r'restricted', RestrictedProductViewSet, basename='thriftplus-restricted')
router.register(r'returns', ReturnsViewSet, basename='thriftplus-returns')

def _gated(view):
    """Thrift+ is off: the scanner and portal say "opens soon", except to a phone with the staff preview code."""
    from functools import wraps

    from django.http import JsonResponse

    from apps.thriftplus.services import members

    @wraps(view)
    def inner(request, *args, **kwargs):
        if not members.open_to(request):
            return JsonResponse({'detail': 'Thrift+ opens soon. Ask at the register.', 'code': 'THRIFT_PLUS_OFF'}, status=403)
        return view(request, *args, **kwargs)

    inner.csrf_exempt = getattr(view, 'csrf_exempt', False)
    return inner


public = [
    path('session/', public_views.session),
    path('session/password/', public_views.sign_in_password),
    path('session/card/', public_views.sign_in_card),
    path('session/sign-out/', public_views.sign_out),
    path('session/reset/', public_views.password_reset),
    path('session/reset/confirm/', public_views.password_reset_confirm),
    path('login/', public_views.set_up_login),
    path('tag/<str:sku>/', public_views.tag),
    path('pass/', public_views.pass_item),
    path('added/', public_views.guest_added),
    path('feel/', public_views.price_feel),
    path('cart/', public_views.cart),
    path('cart/add/', public_views.cart_add),
    path('cart/qty/', public_views.cart_qty),
    path('cart/clear/', public_views.cart_clear),
    path('cart/choice/', public_views.cart_choice),
    path('history/', public_views.history),
    path('me/', public_views.me),
    path('me/card-lost/', public_views.card_lost),
    path('me/remove-person/', public_views.remove_person),
]

# Every public route is behind the Thrift+ switch (owner, 2026-10-07).
public = [path(str(p.pattern), _gated(p.callback), name=p.name) for p in public]

urlpatterns = [
    path('public/', include(public)),  # the scanner app and portal: member sessions only (public_views.py)
    path('', include(router.urls)),
]

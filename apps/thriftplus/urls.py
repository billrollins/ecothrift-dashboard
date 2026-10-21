from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.thriftplus import public_views

from apps.thriftplus.views import (
    AccountViewSet,
    CardViewSet,
    MemberDirectoryViewSet,
    OverstockViewSet,
    OwnerPinViewSet,
    PersonViewSet,
    RegisterViewSet,
    RestrictedProductViewSet,
    ReturnsViewSet,
    RewardsViewSet,
    StaffMembershipsViewSet,
    staff_tag,
)

router = DefaultRouter()
router.register(r'accounts', AccountViewSet, basename='thriftplus-account')
router.register(r'people', PersonViewSet, basename='thriftplus-person')
router.register(r'cards', CardViewSet, basename='thriftplus-card')
router.register(r'rewards', RewardsViewSet, basename='thriftplus-rewards')
router.register(r'overstock', OverstockViewSet, basename='thriftplus-overstock')
router.register(r'register', RegisterViewSet, basename='thriftplus-register')
router.register(r'restricted', RestrictedProductViewSet, basename='thriftplus-restricted')
router.register(r'returns', ReturnsViewSet, basename='thriftplus-returns')
# Owner 2026-10-20: the owner PIN (set in Dash Settings; anyone may type it where it is asked).
router.register(r'owner-pin', OwnerPinViewSet, basename='thriftplus-owner-pin')
# Owner 2026-10-15: every staff member's own membership, made, linked or merged from Dash.
router.register(r'staff-memberships', StaffMembershipsViewSet, basename='thriftplus-staff-memberships')
# Owner 2026-10-16: Dash -> Users -> Members (every member, the drawer's actions).
router.register(r'member-directory', MemberDirectoryViewSet, basename='thriftplus-member-directory')

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
    # Owner 2026-10-15 (J8, J11): join online with a name and email; the emailed link or 6-digit code signs in.
    path('join/', public_views.join),
    path('session/email/', public_views.session_email),
    path('session/link/', public_views.session_link),
    path('session/code/', public_views.session_code),
    # Join v2 (owner 2026-10-19): Google, and one "Phone or email" box with a texted or emailed code.
    path('sign-in-options/', public_views.sign_in_options),
    path('google/', public_views.google),
    path('code/send/', public_views.code_send),
    path('code/check/', public_views.code_check),
    path('session/password/', public_views.sign_in_password),
    path('session/card/', public_views.sign_in_card),
    path('session/sign-out/', public_views.sign_out),
    path('session/reset/', public_views.password_reset),
    path('session/reset/confirm/', public_views.password_reset_confirm),
    path('login/', public_views.set_up_login),
    path('tag/<str:sku>/', public_views.tag),
    path('test-tags/', public_views.test_tags),
    path('pass/', public_views.pass_item),
    path('added/', public_views.guest_added),
    path('feel/', public_views.price_feel),
    path('cart/', public_views.cart),
    path('cart/add/', public_views.cart_add),
    path('cart/qty/', public_views.cart_qty),
    path('cart/clear/', public_views.cart_clear),
    path('history/', public_views.history),
    path('history/clear/', public_views.history_clear),
    path('me/', public_views.me),
    path('me/card/', public_views.my_card),
    path('me/card-lost/', public_views.card_lost),
    path('me/emails/', public_views.emails),
    path('me/remove-person/', public_views.remove_person),
    # Join v2: a pending member's selfie and signature, taken in the app before the register.
    path('me/selfie/', public_views.selfie),
    path('me/signature/', public_views.signature),
    # Phone first (owner 2026-10-20): a member with no phone adds one with a texted code.
    path('me/phone/send/', public_views.phone_send),
    path('me/phone/', public_views.phone_save),
]

# Every public route is behind the Thrift+ switch (owner, 2026-10-07), except signing in: while it is off, only staff
# and practice members get through, checked in the view (staff test mode, 2026-10-10). An emailed link or code is
# checked there too, before it is used (a link may open in a browser without the preview code). Join v2: Google and a
# checked code the same way (a new join is refused there while off); the sign-in options are only which buttons show.
SIGN_IN = {'session/password/', 'session/card/', 'session/link/', 'session/code/', 'google/', 'code/check/',
           'sign-in-options/'}
public = [path(str(p.pattern), p.callback if str(p.pattern) in SIGN_IN else _gated(p.callback), name=p.name) for p in public]

urlpatterns = [
    path('public/', include(public)),  # the scanner app and portal: member sessions only (public_views.py)
    # Staff send a member the Thrift+ app link (owner 2026-10-15, J12); the same as people/<id>/email-link/.
    # The Thrift+ Staff app's test scanner (owner 2026-10-16): a tag's item card, never counted as a scan.
    path('staff-tag/<str:sku>/', staff_tag, name='thriftplus-staff-tag'),
    path('members/<int:pk>/email-link/', PersonViewSet.as_view({'post': 'email_link'}), name='thriftplus-member-email-link'),
    path('', include(router.urls)),
]

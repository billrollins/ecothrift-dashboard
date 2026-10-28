"""
URL configuration for ecothrift project.
"""
from django.contrib import admin
from django.urls import path, include, re_path
from django.views.generic import TemplateView, RedirectView
from django.conf import settings

from apps.core.views import i_link, robots_txt, sitemap_xml
from apps.inventory import views_public_dispute as dispute_views

# Django contrib.admin must not use /admin/ — React SPA routes live at /admin/* (settings, users, etc.).
urlpatterns = [
    path('db-admin/', admin.site.urls),
    # Public storefront SEO (PublicSiteMiddleware lets these through on the apex).
    path('robots.txt', robots_txt, name='robots-txt'),
    # ecothrift.us/qr (owner 2026-10-14, APP D5 and D6): the scanner opened on the Member QR; the home-screen app starts
    # here. /card was the first address: it stays as a quiet redirect, never printed (no card).
    re_path(r'^qr/?$', RedirectView.as_view(url='/scan?view=qr', permanent=False), name='thriftplus-qr'),
    re_path(r'^card/?$', RedirectView.as_view(url='/scan?view=qr', permanent=False), name='thriftplus-card'),
    # ecothrift.us/join (owner 2026-10-15, J8; poster 1's join QR and terms 1.3): the scanner opened on Join Thrift+.
    re_path(r'^join/?$', RedirectView.as_view(url='/scan?view=join', permanent=False), name='thriftplus-join'),
    # The Thrift+ sign-in screen with its text-message line, for Twilio's toll-free review (2026-10-20); the file is
    # frontend-public/public/sms-opt-in.png, served with the public site's files.
    path('sms-opt-in.png', RedirectView.as_view(url='/static/site/sms-opt-in.png', permanent=False), name='sms-opt-in'),
    # ecothrift.us/i/<code>: the interview short link in texts (owner 2026-10-12), and the Thrift+ Perks price tag's QR,
    # HTTPS://ECOTHRIFT.US/I/<SKU> in capitals (2026-10-28), which opens the item in the Thrift+ app (core.views.i_link).
    re_path(r'^[iI]/(?P<code>[A-Za-z0-9-]{1,20})/?$', i_link, name='hiring-short-link'),
    path('sitemap.xml', sitemap_xml, name='sitemap-xml'),
    # The B-Stock dispute page (E2b): no sign-in, the unguessable link is the key; sent to B-Stock with a dispute.
    path('dispute/<str:token>/', dispute_views.dispute_page, name='bstock-dispute'),
    path('dispute/<str:token>/dispute.xlsx', dispute_views.dispute_xlsx, name='bstock-dispute-xlsx'),
    path('dispute/<str:token>/items.csv', dispute_views.dispute_csv, name='bstock-dispute-csv'),
    path('dispute/<str:token>/dispute.zip', dispute_views.dispute_zip, name='bstock-dispute-zip'),
    path('dispute/<str:token>/photo/<int:attachment_id>/', dispute_views.dispute_photo, name='bstock-dispute-photo'),
    re_path(
        r'^admin/?$',
        RedirectView.as_view(url='/db-admin/', permanent=False),
        name='legacy_django_admin_root_redirect',
    ),
    path('api/auth/', include('apps.accounts.auth_urls')),
    path('api/accounts/', include('apps.accounts.urls')),
    path('api/core/', include('apps.core.urls')),
    path('api/hr/', include('apps.hr.urls')),
    path('api/inventory/', include('apps.inventory.urls')),
    path('api/pos/', include('apps.pos.urls')),
    path('api/consignment/', include('apps.consignment.urls')),
    path('api/ai/', include('apps.ai.urls')),
    path('api/buying/', include('apps.buying.urls')),
    path('api/webstore/', include('apps.webstore.urls')),
    path('api/mailbox/', include('apps.mailbox.urls')),
    path('api/blog/', include('apps.blog.urls')),
    path('api/floorplan/', include('apps.floorplan.urls')),
    path('api/labels/', include('apps.labels.urls')),
    path('api/routines/', include('apps.routines.urls')),
    path('api/documents/', include('apps.documents.urls')),
    path('api/thriftplus/', include('apps.thriftplus.urls')),
    path('api/texting/', include('apps.texting.urls')),  # Twilio's STOP / HELP webhook (Phase 4)
    path('api/qa/', include('apps.qa.urls')),
    path('api/stocktake/', include('apps.stocktake.urls')),
    path('api/hiring/', include('apps.hiring.urls')),
    path('api/marketing/', include('apps.marketing.urls')),  # Social Studio
    path('api/keys/', include('apps.keys.urls')),  # Keys and key rings (owner and Admin)
    path('api/supplies/', include('apps.supplies.urls')),  # supply lists, weekly count, the order
]

# Serve the React SPA for all non-API routes in production
if not settings.DEBUG:
    urlpatterns += [
        re_path(r'^(?!api/|db-admin/|static/|assets/).*$',
                TemplateView.as_view(template_name='index.html'),
                name='spa-fallback'),
    ]

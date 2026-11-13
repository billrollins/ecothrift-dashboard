from django.urls import path

from apps.texting import inbox_views, views

urlpatterns = [
    # Twilio's "a message comes in" webhook for the toll-free number (STOP and HELP; every text kept, #132).
    path('inbound/', views.inbound, name='texting-inbound'),
    # The Texts inbox and staff texts from our number (#132). Owner and managers.
    path('status/', inbox_views.texting_status, name='texting-status'),
    path('inbox/', inbox_views.inbox, name='texting-inbox'),
    path('inbox/<str:number>/', inbox_views.conversation, name='texting-conversation'),
    path('inbox/<str:number>/reply/', inbox_views.reply, name='texting-reply'),
    path('set-password-link/', inbox_views.text_set_password_link, name='texting-set-password-link'),
]

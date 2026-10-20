from django.urls import path

from apps.texting import views

urlpatterns = [
    # Twilio's "a message comes in" webhook for the toll-free number (STOP and HELP).
    path('inbound/', views.inbound, name='texting-inbound'),
]

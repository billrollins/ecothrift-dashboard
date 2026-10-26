from django.urls import path

from . import views

urlpatterns = [
    path('keys/', views.keys, name='keys-list'),
    path('keys/<int:pk>/', views.key_detail, name='keys-detail'),
    path('keys/<int:pk>/read/', views.key_read, name='keys-read'),
    path('rings/', views.rings, name='keys-rings'),
    path('rings/<int:pk>/', views.ring_detail, name='keys-ring'),
    path('rings/<int:pk>/move/', views.ring_move, name='keys-ring-move'),
    path('where/', views.where, name='keys-where'),
    path('find/', views.find, name='keys-find'),
    path('people/', views.people, name='keys-people'),
]

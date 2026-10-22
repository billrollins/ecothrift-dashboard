from django.urls import path

from . import views

urlpatterns = [
    path('week/', views.week, name='marketing-week'),
    path('today/', views.today, name='marketing-today'),
    path('posts/<int:pk>/', views.post_detail, name='marketing-post'),
    path('posts/<int:pk>/photos/', views.post_photos, name='marketing-post-photos'),
    path('posts/<int:pk>/swap/', views.post_swap, name='marketing-post-swap'),
    path('posts/<int:pk>/ready/', views.post_ready, name='marketing-post-ready'),
    path('posts/<int:pk>/posted/', views.post_posted, name='marketing-post-posted'),
    path('posts/<int:pk>/rating/', views.post_rating, name='marketing-post-rating'),
    path('photos/', views.photos, name='marketing-photos'),
    path('photos/<int:pk>/', views.photo_detail, name='marketing-photo'),
    path('photos/<int:pk>/image/', views.photo_image, name='marketing-photo-image'),
]

from django.urls import path

from . import views

urlpatterns = [
    path('lists/', views.lists, name='supplies-lists'),
    path('lists/<int:pk>/', views.list_detail, name='supplies-list'),
    path('lists/<int:pk>/items/', views.list_items, name='supplies-list-items'),
    path('lists/<int:pk>/import/', views.list_import, name='supplies-list-import'),
    path('lists/<int:pk>/count/', views.list_count, name='supplies-list-count'),
    path('items/<int:pk>/', views.item_detail, name='supplies-item'),
    path('import-template/', views.import_template, name='supplies-import-template'),
    path('ai-fill/', views.ai_fill_view, name='supplies-ai-fill'),
    path('order/', views.order_latest, name='supplies-order'),
    path('order/build/', views.order_build, name='supplies-order-build'),
    path('order/<int:pk>/ordered/', views.order_ordered, name='supplies-order-ordered'),
]

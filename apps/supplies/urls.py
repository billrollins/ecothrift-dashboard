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
    path('receive/', views.receive_list, name='supplies-receive'),
    path('lines/<int:pk>/received/', views.line_received, name='supplies-line-received'),
    path('spend/', views.spend_view, name='supplies-spend'),
    path('requests/', views.requests_view, name='supplies-requests'),
    path('requests/<int:pk>/approve/', views.request_approve, name='supplies-request-approve'),
    path('requests/<int:pk>/decline/', views.request_decline, name='supplies-request-decline'),
]

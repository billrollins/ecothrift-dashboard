from django.urls import path

from . import views

urlpatterns = [
    path('orders/', views.orders_view),
    path('orders/<int:order_id>/', views.run_view),
    path('orders/<int:order_id>/lines/', views.lines_view),
    path('orders/<int:order_id>/lines/<int:line_id>/', views.line_view),
    path('orders/<int:order_id>/start/', views.start_view),
    path('orders/<int:order_id>/step/', views.step_view),
    path('orders/<int:order_id>/rule/', views.rule_view),
    path('orders/<int:order_id>/edit/', views.edit_view),
    path('orders/<int:order_id>/accept/', views.accept_view),
    path('orders/<int:order_id>/target/', views.target_view),
    path('orders/<int:order_id>/ai/', views.ai_view),
    path('orders/<int:order_id>/send/', views.send_view),
    path('actions/<int:action_id>/', views.action_view),
    path('actions/<int:action_id>/apply/', views.apply_view),
    path('actions/<int:action_id>/discard/', views.discard_view),
    path('actions/<int:action_id>/undo/', views.undo_view),
]

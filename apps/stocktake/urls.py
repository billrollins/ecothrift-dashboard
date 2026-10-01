from django.urls import path

from . import views

urlpatterns = [
    path('counts/', views.counts, name='stocktake-counts'),
    path('counts/<int:pk>/', views.count_detail, name='stocktake-count'),
    path('counts/<int:pk>/scans/', views.count_scans, name='stocktake-scans'),
    path('counts/<int:pk>/close/', views.count_close, name='stocktake-close'),
    path('counts/<int:pk>/restart/', views.count_restart, name='stocktake-restart'),
    path('counts/<int:pk>/report/', views.count_report, name='stocktake-report'),
    path('counts/<int:pk>/report.csv', views.count_report_csv, name='stocktake-report-csv'),
]

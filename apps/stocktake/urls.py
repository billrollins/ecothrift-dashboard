from django.urls import path

from . import views

urlpatterns = [
    path('today/', views.today, name='stocktake-today'),
    path('sections/', views.sections, name='stocktake-sections'),
    path('sections/<int:pk>/', views.section_detail, name='stocktake-section'),
    path('runs/', views.runs, name='stocktake-runs'),
    path('runs/<int:pk>/', views.run_detail, name='stocktake-run'),
    path('runs/<int:pk>/scans/', views.run_scans, name='stocktake-run-scans'),
    path('runs/<int:pk>/stop/', views.run_stop, name='stocktake-run-stop'),
    path('scans/<int:pk>/remove/', views.scan_remove, name='stocktake-scan-remove'),
    path('scans/<int:pk>/restore/', views.scan_restore, name='stocktake-scan-restore'),
    path('carts/', views.carts, name='stocktake-carts'),
    path('issues/', views.issues, name='stocktake-issues'),
    path('issues/<int:pk>/', views.issue_detail, name='stocktake-issue'),
    path('issues/<int:pk>/fix/', views.issue_fix, name='stocktake-issue-fix'),
    path('issues/<int:pk>/reopen/', views.issue_reopen, name='stocktake-issue-reopen'),
    path('fixit/scan/', views.fixit_scan, name='stocktake-fixit-scan'),
    path('fixit/products/', views.fixit_products, name='stocktake-fixit-products'),
    path('search/', views.search, name='stocktake-search'),
    path('counts/', views.counts, name='stocktake-counts'),
    path('counts/<int:pk>/', views.count_detail, name='stocktake-count'),
    path('counts/<int:pk>/close/', views.count_close, name='stocktake-close'),
    path('counts/<int:pk>/reopen/', views.count_reopen, name='stocktake-reopen'),
    path('counts/<int:pk>/report/', views.count_report, name='stocktake-report'),
    path('counts/<int:pk>/report.csv', views.count_report_csv, name='stocktake-report-csv'),
    path('counts/<int:pk>/shrink/', views.shrink_list, name='stocktake-shrink'),
    path('counts/<int:pk>/shrink/groups/', views.shrink_groups, name='stocktake-shrink-groups'),
    path('counts/<int:pk>/shrink/mark/', views.shrink_mark, name='stocktake-shrink-mark'),
    path('counts/<int:pk>/shrink/unmark/', views.shrink_unmark, name='stocktake-shrink-unmark'),
    path('counts/<int:pk>/shrink.csv', views.shrink_csv, name='stocktake-shrink-csv'),
]

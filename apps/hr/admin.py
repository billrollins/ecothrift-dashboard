from django.contrib import admin
from .models import Department, TimeEntry, SickLeaveBalance, SickLeaveRequest


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ('name', 'location', 'manager', 'is_active')
    search_fields = ('name',)


@admin.register(TimeEntry)
class TimeEntryAdmin(admin.ModelAdmin):
    list_display = ('employee', 'date', 'clock_in', 'clock_out', 'total_hours', 'status')
    list_filter = ('status', 'date')
    search_fields = ('employee__email', 'employee__first_name', 'employee__last_name')


@admin.register(SickLeaveBalance)
class SickLeaveBalanceAdmin(admin.ModelAdmin):
    list_display = ('employee', 'year', 'hours_earned', 'hours_used')
    list_filter = ('year',)


@admin.register(SickLeaveRequest)
class SickLeaveRequestAdmin(admin.ModelAdmin):
    list_display = ('employee', 'start_date', 'end_date', 'hours_requested', 'status')
    list_filter = ('status',)

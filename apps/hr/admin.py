from django.contrib import admin
from .models import (
    CallIn, Department, IncidentNote, IncidentPhoto, IncidentReport, PayPeriodClose, ScheduledShift, Shift,
    ShiftAssignment, TimeEntry, TimeEntryChange,
)


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ('name', 'location', 'manager', 'is_active')
    search_fields = ('name',)


@admin.register(TimeEntry)
class TimeEntryAdmin(admin.ModelAdmin):
    list_display = ('employee', 'date', 'shift', 'clock_in', 'clock_out', 'total_hours', 'status')
    list_filter = ('status', 'date', 'shift')
    search_fields = ('employee__email', 'employee__first_name', 'employee__last_name')


@admin.register(PayPeriodClose)
class PayPeriodCloseAdmin(admin.ModelAdmin):
    list_display = ('date_from', 'date_to', 'is_closed', 'closed_by', 'closed_at', 'reopened_by', 'reopened_at')


@admin.register(TimeEntryChange)
class TimeEntryChangeAdmin(admin.ModelAdmin):
    """The time-edit trail is a record: read only, here too."""
    list_display = ('entry', 'action', 'actor', 'at')
    list_filter = ('action',)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Shift)
class ShiftAdmin(admin.ModelAdmin):
    list_display = ('name', 'department', 'time_in', 'time_out', 'is_active')
    list_filter = ('department', 'is_active')


@admin.register(ShiftAssignment)
class ShiftAssignmentAdmin(admin.ModelAdmin):
    list_display = ('employee', 'shift', 'weekdays')
    search_fields = ('employee__email', 'shift__name')


@admin.register(ScheduledShift)
class ScheduledShiftAdmin(admin.ModelAdmin):
    list_display = ('employee', 'date', 'start_time', 'end_time', 'department')
    list_filter = ('department', 'date')


@admin.register(CallIn)
class CallInAdmin(admin.ModelAdmin):
    list_display = ('employee', 'shift_date', 'kind', 'called_at', 'reason', 'recorded_by')
    list_filter = ('kind',)


class _NoDelete(admin.ModelAdmin):
    """Incident reports are a record (#131): nothing is ever deleted, here too."""

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(IncidentReport)
class IncidentReportAdmin(_NoDelete):
    list_display = ('id', 'occurred_at', 'kind', 'place', 'status', 'reported_by')
    list_filter = ('status', 'kind', 'place')
    search_fields = ('what_happened', 'place_detail', 'witnesses')
    raw_id_fields = ('map_pin', 'reported_by', 'closed_by')


@admin.register(IncidentNote)
class IncidentNoteAdmin(_NoDelete):
    list_display = ('report', 'kind', 'author', 'created_at')
    list_filter = ('kind',)
    raw_id_fields = ('report', 'author')


@admin.register(IncidentPhoto)
class IncidentPhotoAdmin(_NoDelete):
    list_display = ('report', 'position', 'added_by', 'created_at')
    raw_id_fields = ('report', 'file', 'added_by')

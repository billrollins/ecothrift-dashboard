from django.contrib import admin

from .models import Routine, RoutineRun, RoutineSubmission, Section, WorkCyclePrompt


@admin.register(Section)
class SectionAdmin(admin.ModelAdmin):
    list_display = ('name', 'department', 'owner', 'sort_order', 'is_active')
    list_filter = ('department', 'is_active')
    search_fields = ('name',)


@admin.register(Routine)
class RoutineAdmin(admin.ModelAdmin):
    list_display = ('title', 'trigger', 'assignment', 'is_blocking', 'is_active')
    list_filter = ('trigger', 'assignment', 'is_active')
    search_fields = ('title',)


@admin.register(RoutineRun)
class RoutineRunAdmin(admin.ModelAdmin):
    list_display = ('routine', 'period_key', 'assigned_to', 'status', 'due_at', 'subject')
    list_filter = ('status',)


@admin.register(RoutineSubmission)
class RoutineSubmissionAdmin(admin.ModelAdmin):
    list_display = ('routine', 'submitted_by', 'status', 'failed_count', 'submitted_at')
    list_filter = ('status',)


@admin.register(WorkCyclePrompt)
class WorkCyclePromptAdmin(admin.ModelAdmin):
    list_display = ('user', 'register', 'outcome', 'idle_seconds', 'shown_at')
    list_filter = ('outcome',)

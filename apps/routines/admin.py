from django.contrib import admin

from .models import (
    CheckerFlag,
    QaCallIn,
    QaDayExclusion,
    QaDayOverride,
    QaNudge,
    Routine,
    RoutineRun,
    RoutineSubmission,
    Section,
    SectionAssignmentEvent,
    SectionBaselineSnapshot,
    SectionObservation,
    WeekScoreSnapshot,
    WorkCyclePrompt,
)


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


@admin.register(SectionObservation)
class SectionObservationAdmin(admin.ModelAdmin):
    list_display = ('section', 'kind', 'total', 'actor', 'observed_at', 'in_baseline')
    list_filter = ('kind', 'in_baseline')


@admin.register(CheckerFlag)
class CheckerFlagAdmin(admin.ModelAdmin):
    list_display = ('user', 'kind', 'status', 'raised_at')
    list_filter = ('kind', 'status')


@admin.register(SectionAssignmentEvent)
class SectionAssignmentEventAdmin(admin.ModelAdmin):
    list_display = ('section', 'kind', 'user', 'for_date', 'at')
    list_filter = ('kind',)


@admin.register(SectionBaselineSnapshot)
class SectionBaselineSnapshotAdmin(admin.ModelAdmin):
    list_display = ('section', 'week_monday', 'mean', 'n', 'warm')


@admin.register(WeekScoreSnapshot)
class WeekScoreSnapshotAdmin(admin.ModelAdmin):
    list_display = ('week_monday', 'letter', 'score', 'doing', 'cross', 'owner')


@admin.register(QaCallIn)
class QaCallInAdmin(admin.ModelAdmin):
    list_display = ('employee', 'date', 'shift', 'marked_by', 'created_at')
    list_filter = ('date',)


@admin.register(QaNudge)
class QaNudgeAdmin(admin.ModelAdmin):
    list_display = ('run', 'created_by', 'created_at')


@admin.register(QaDayOverride)
class QaDayOverrideAdmin(admin.ModelAdmin):
    list_display = ('employee', 'date', 'shift', 'marked_by', 'created_at')


@admin.register(QaDayExclusion)
class QaDayExclusionAdmin(admin.ModelAdmin):
    list_display = ('employee', 'date', 'marked_by', 'created_at')

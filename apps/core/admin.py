from django.contrib import admin
from .models import WorkLocation, AppSetting, S3File, PrintServerRelease, EnhancementRequest, EnhancementRequestNote


@admin.register(WorkLocation)
class WorkLocationAdmin(admin.ModelAdmin):
    list_display = ('name', 'phone', 'timezone', 'is_active')
    search_fields = ('name',)


@admin.register(AppSetting)
class AppSettingAdmin(admin.ModelAdmin):
    list_display = ('key', 'value', 'description', 'updated_at')
    search_fields = ('key',)


@admin.register(S3File)
class S3FileAdmin(admin.ModelAdmin):
    list_display = ('filename', 'key', 'size', 'uploaded_at')
    search_fields = ('filename', 'key')


@admin.register(PrintServerRelease)
class PrintServerReleaseAdmin(admin.ModelAdmin):
    list_display = ('version', 'is_current', 'released_at')


class EnhancementRequestNoteInline(admin.TabularInline):
    model = EnhancementRequestNote
    extra = 0
    readonly_fields = ('author', 'created_at')


@admin.register(EnhancementRequest)
class EnhancementRequestAdmin(admin.ModelAdmin):
    list_display = ('id', 'area', 'status', 'priority', 'submitted_by', 'target_date', 'created_at')
    list_filter = ('area', 'status', 'priority')
    search_fields = ('body',)
    inlines = [EnhancementRequestNoteInline]

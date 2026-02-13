from django.contrib import admin
from .models import WorkLocation, AppSetting, S3File, PrintServerRelease


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

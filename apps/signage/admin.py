from django.contrib import admin

from .models import Sign


@admin.register(Sign)
class SignAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'status', 'copies_up', 'pdf', 'is_active', 'updated_at')
    list_filter = ('status', 'is_active')
    search_fields = ('name', 'note')

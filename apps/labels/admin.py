from django.contrib import admin

from .models import CustomLabel


@admin.register(CustomLabel)
class CustomLabelAdmin(admin.ModelAdmin):
    list_display = ('name', 'kind', 'width_in', 'height_in', 'is_active', 'updated_at')
    list_filter = ('kind', 'is_active')
    search_fields = ('name', 'slug')

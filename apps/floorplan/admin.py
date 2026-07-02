from django.contrib import admin

from .models import FloorPlan, FloorPlanAsset


@admin.register(FloorPlan)
class FloorPlanAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'location', 'revision', 'is_active', 'updated_at')
    list_filter = ('location', 'is_active')
    search_fields = ('name',)


@admin.register(FloorPlanAsset)
class FloorPlanAssetAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'location', 'content_type', 'is_active', 'updated_at')
    list_filter = ('location', 'is_active', 'content_type')
    search_fields = ('name',)

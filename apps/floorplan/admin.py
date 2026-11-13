from django.contrib import admin

from .models import FloorPlan, FloorPlanAsset, FloorPlanCurrentPeriod, MapLayer, MapPin


@admin.register(FloorPlan)
class FloorPlanAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'location', 'revision', 'is_current', 'is_active', 'updated_at')
    list_filter = ('location', 'is_current', 'is_active')
    search_fields = ('name',)


@admin.register(FloorPlanAsset)
class FloorPlanAssetAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'location', 'content_type', 'is_active', 'updated_at')
    list_filter = ('location', 'is_active', 'content_type')
    search_fields = ('name',)


@admin.register(FloorPlanCurrentPeriod)
class FloorPlanCurrentPeriodAdmin(admin.ModelAdmin):
    list_display = ('id', 'plan', 'started_at', 'ended_at', 'pins_copied')
    list_select_related = ('plan',)


@admin.register(MapLayer)
class MapLayerAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'slug', 'ref_type', 'color', 'sort_order', 'is_active')
    list_filter = ('is_active',)


@admin.register(MapPin)
class MapPinAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'layer', 'plan', 'ref_type', 'ref_id', 'updated_at')
    list_filter = ('layer',)
    search_fields = ('name', 'note')

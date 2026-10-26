from django.contrib import admin

from .models import SupplyCount, SupplyItem, SupplyList, SupplyOrder


@admin.register(SupplyList)
class SupplyListAdmin(admin.ModelAdmin):
    list_display = ('name', 'department', 'is_active', 'sort_order')


@admin.register(SupplyItem)
class SupplyItemAdmin(admin.ModelAdmin):
    list_display = ('name', 'supply_list', 'vendor', 'pack_size', 'min_qty', 'max_qty', 'price', 'is_active')
    list_filter = ('supply_list', 'is_active')


@admin.register(SupplyCount)
class SupplyCountAdmin(admin.ModelAdmin):
    list_display = ('supply_list', 'week_start', 'counted_by', 'submitted_at')


@admin.register(SupplyOrder)
class SupplyOrderAdmin(admin.ModelAdmin):
    list_display = ('week_start', 'built_at')

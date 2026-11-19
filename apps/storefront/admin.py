from django.contrib import admin, messages
from django.utils.html import format_html

from apps.storefront.models import StockPhoto


@admin.register(StockPhoto)
class StockPhotoAdmin(admin.ModelAdmin):
    """Stock photos on the phone site. A wrong one: tick it and run Reject (off the site at the next snapshot, within
    5 minutes; not looked up again for 90 days)."""

    list_display = ('thumb', 'title', 'key', 'status', 'page', 'confidence', 'found_at', 'next_try_on', 'cost_usd')
    list_filter = ('status',)
    search_fields = ('key', 'title', 'match_key', 'page_url')
    readonly_fields = ('thumb_large', 'created_at', 'updated_at')
    raw_id_fields = ('product', 'manifest_row', 'approved_by')
    actions = ['reject']
    list_per_page = 50

    @admin.display(description='Photo')
    def thumb(self, obj):
        if not obj.image:
            return '-'
        return format_html('<img src="{}" style="height:60px;max-width:90px;object-fit:contain" alt="">', obj.image.url)

    @admin.display(description='Photo')
    def thumb_large(self, obj):
        if not obj.image:
            return '-'
        return format_html('<img src="{}" style="max-height:320px;max-width:480px" alt="">', obj.image.url)

    @admin.display(description='Page')
    def page(self, obj):
        if not obj.page_url:
            return '-'
        return format_html('<a href="{}" target="_blank" rel="noopener noreferrer">open</a>', obj.page_url)

    @admin.action(description='Reject: take the photo off the site (not looked up again for 90 days)')
    def reject(self, request, queryset):
        from apps.storefront.services.stock_photos import reject

        n = reject(queryset, user=request.user)
        self.message_user(request, f'{n} stock photo(s) rejected.', messages.SUCCESS)

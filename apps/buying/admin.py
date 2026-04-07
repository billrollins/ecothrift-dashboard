from django.contrib import admin

from apps.buying.models import (
    Auction,
    AuctionSnapshot,
    Bid,
    ManifestRow,
    Marketplace,
    Outcome,
    WatchlistEntry,
)


@admin.register(Marketplace)
class MarketplaceAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'external_id', 'is_active', 'created_at')
    list_filter = ('is_active',)
    search_fields = ('name', 'slug')
    prepopulated_fields = {'slug': ('name',)}


@admin.register(Auction)
class AuctionAdmin(admin.ModelAdmin):
    list_display = (
        'title',
        'marketplace',
        'external_id',
        'lot_id',
        'group_id',
        'auction_ext_id',
        'current_price',
        'bid_count',
        'status',
        'has_manifest',
        'ai_score',
        'last_updated_at',
    )
    list_filter = ('marketplace', 'status', 'has_manifest')
    search_fields = ('title', 'external_id', 'category')
    raw_id_fields = ('marketplace',)


@admin.register(AuctionSnapshot)
class AuctionSnapshotAdmin(admin.ModelAdmin):
    list_display = ('auction', 'price', 'bid_count', 'captured_at')
    list_filter = ('captured_at',)
    raw_id_fields = ('auction',)
    date_hierarchy = 'captured_at'


@admin.register(ManifestRow)
class ManifestRowAdmin(admin.ModelAdmin):
    list_display = (
        'auction',
        'row_number',
        'title',
        'brand',
        'category',
        'retail_value',
    )
    list_filter = ('auction',)
    search_fields = ('title', 'brand', 'sku', 'upc')
    raw_id_fields = ('auction',)


@admin.register(WatchlistEntry)
class WatchlistEntryAdmin(admin.ModelAdmin):
    list_display = (
        'auction',
        'priority',
        'status',
        'poll_interval_seconds',
        'updated_at',
    )
    list_filter = ('priority', 'status')
    raw_id_fields = ('auction',)


@admin.register(Bid)
class BidAdmin(admin.ModelAdmin):
    list_display = ('auction', 'amount', 'strategy', 'bid_time', 'was_winning')
    list_filter = ('strategy',)
    raw_id_fields = ('auction',)


@admin.register(Outcome)
class OutcomeAdmin(admin.ModelAdmin):
    list_display = (
        'auction',
        'hammer_price',
        'fees',
        'shipping_cost',
        'total_cost',
        'win',
        'captured_at',
    )
    list_filter = ('win',)
    raw_id_fields = ('auction',)

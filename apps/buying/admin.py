from django.contrib import admin

from apps.buying.models import (
    Auction,
    AuctionSnapshot,
    Bid,
    CategoryMapping,
    CategoryStats,
    ManifestPullLog,
    ManifestRow,
    ManifestTemplate,
    Marketplace,
    Outcome,
    WatchlistEntry,
)


@admin.register(CategoryStats)
class CategoryStatsAdmin(admin.ModelAdmin):
    list_display = (
        'category',
        'need_score_1to99',
        'recovery_rate',
        'have_units',
        'want_units',
        'avg_sold_price',
        'avg_retail',
        'avg_cost',
        'good_data_sample_size',
        'need_retail',
        'computed_at',
    )
    search_fields = ('category',)


@admin.register(CategoryMapping)
class CategoryMappingAdmin(admin.ModelAdmin):
    list_display = ('source_key', 'canonical_category', 'rule_origin', 'updated_at')
    list_filter = ('rule_origin', 'canonical_category')
    search_fields = ('source_key', 'ai_reasoning')


@admin.register(ManifestTemplate)
class ManifestTemplateAdmin(admin.ModelAdmin):
    list_display = (
        'display_name',
        'marketplace',
        'header_signature',
        'is_reviewed',
        'updated_at',
    )
    list_filter = ('marketplace', 'is_reviewed')
    search_fields = ('display_name', 'header_signature')
    raw_id_fields = ('marketplace',)


@admin.register(Marketplace)
class MarketplaceAdmin(admin.ModelAdmin):
    list_display = (
        'name',
        'slug',
        'external_id',
        'default_fee_rate',
        'default_shipping_rate',
        'is_active',
        'created_at',
    )
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
        'fast_cat_key',
        'fast_cat_value',
        'canonical_category',
        'category_confidence',
        'retail_value',
    )
    list_filter = ('auction',)
    search_fields = ('title', 'brand', 'sku', 'upc')
    raw_id_fields = ('auction',)


@admin.register(ManifestPullLog)
class ManifestPullLogAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'auction',
        'completed_at',
        'rows_downloaded',
        'api_calls',
        'duration_seconds',
        'used_socks5',
        'success',
    )
    list_filter = ('success', 'used_socks5')
    raw_id_fields = ('auction',)
    date_hierarchy = 'completed_at'
    readonly_fields = (
        'auction',
        'started_at',
        'completed_at',
        'rows_downloaded',
        'api_calls',
        'duration_seconds',
        'used_socks5',
        'success',
        'error_message',
    )


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

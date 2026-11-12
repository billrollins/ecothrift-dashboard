from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .api_row_disputes import row_dispute_undo_view, row_disputes_view
from .api_add_item import (
    add_item_ai_fill_view, add_item_check_in_view, add_item_clean_up_view, add_item_find_view, add_item_price_view, add_item_taxonomy_view,
    restoration_request_settings_view,
)
from .api_bulk_price import (
    bulk_labels_view, bulk_price_apply_view, bulk_price_detail_view, bulk_price_list_view, bulk_price_preview_view,
    bulk_price_undo_view,
)
from .api_floor_issues import floor_issue_lookup_view, floor_issue_photo_view, floor_issue_report_view
from .api_photo_sheets import (
    photo_sheet_ai_view, photo_sheet_detail_view, photo_sheet_list_view, photo_sheet_photo_link_view,
    photo_sheet_photo_upload_view, photo_sheet_photo_view, photo_sheet_printed_view, photo_sheet_start_view,
)
from .api_inventory_search import (
    inventory_review_flags_view, inventory_review_view, inventory_search_items_view, inventory_search_similar_view, inventory_search_view,
)
from .api_item_card import item_card_view, order_card_view, product_card_view, restoration_card_view
from .api_product_similar import similar_products_view
from .api_product_find import processing_row_likely_products_view, product_find_view
from .api_reentry import (
    reentry_back_to_shelf_view, reentry_find_view, reentry_list_view, reentry_price_again_view,
    reentry_scrap_view, reentry_send_to_restoration_view,
)
from .api_processing_command_center import processing_command_center_view
from .views import (
    VendorViewSet, CategoryViewSet, PurchaseOrderViewSet,
    ProductViewSet, VendorProductRefViewSet, BatchGroupViewSet,
    ItemViewSet, ItemCheckInViewSet, ItemHistoryViewSet, ItemNoteViewSet, RestorationJobViewSet,
    RestorationOutputViewSet,
    RestorationPartViewSet,
    RestorationPartsOrderViewSet,
    RestorationGradeScaleViewSet,
    manifest_field_metadata_view, item_lookup,
    classify_item_view, shrink_estimate_view, store_report_view,
    verify_present_view, quick_reprice_view, duplicate_item_for_resale_view,
    mark_sold_item_on_shelf_view, estimate_price_view, recovery_estimate_view, price_coach_view,
)

router = DefaultRouter()
router.register(r'vendors', VendorViewSet, basename='vendor')
router.register(r'categories', CategoryViewSet, basename='category')
router.register(r'orders', PurchaseOrderViewSet, basename='purchaseorder')
router.register(r'products', ProductViewSet, basename='product')
router.register(r'product-refs', VendorProductRefViewSet, basename='vendorproductref')
router.register(r'batch-groups', BatchGroupViewSet, basename='batchgroup')
router.register(r'items', ItemViewSet, basename='item')
router.register(r'item-check-ins', ItemCheckInViewSet, basename='itemcheckin')
router.register(r'item-history', ItemHistoryViewSet, basename='itemhistory')
router.register(r'item-notes', ItemNoteViewSet, basename='itemnote')
router.register(r'restoration-jobs', RestorationJobViewSet, basename='restorationjob')
router.register(r'restoration-outputs', RestorationOutputViewSet, basename='restorationoutput')
router.register(r'restoration-parts', RestorationPartViewSet, basename='restorationpart')
router.register(r'restoration-parts-orders', RestorationPartsOrderViewSet, basename='restorationpartsorder')
router.register(r'grade-scales', RestorationGradeScaleViewSet, basename='restorationgradescale')

urlpatterns = [
    path('orders/<int:po_id>/row-disputes/', row_disputes_view, name='row-disputes'),
    path('orders/<int:po_id>/row-disputes/<int:dispute_id>/undo/', row_dispute_undo_view,
         name='row-dispute-undo'),
    path('manifest-fields/', manifest_field_metadata_view, name='inventory-manifest-fields'),
    path('similar-products/', similar_products_view, name='similar-products'),
    path('product-find/', product_find_view, name='product-find'),
    path('processing-rows/<int:row_id>/likely-products/', processing_row_likely_products_view,
         name='processing-row-likely-products'),
    path('search/', inventory_search_view, name='inventory-search'),
    path('search/items/', inventory_search_items_view, name='inventory-search-items'),
    path('search/similar/', inventory_search_similar_view, name='inventory-search-similar'),
    path('review/', inventory_review_view, name='inventory-review'),
    path('review/flags/', inventory_review_flags_view, name='inventory-review-flags'),
    path('add-item/find/', add_item_find_view, name='add-item-find'),
    path('add-item/price/', add_item_price_view, name='add-item-price'),
    path('add-item/taxonomy/', add_item_taxonomy_view, name='add-item-taxonomy'),
    path('add-item/ai-fill/', add_item_ai_fill_view, name='add-item-ai-fill'),
    path('add-item/clean-up/', add_item_clean_up_view, name='add-item-clean-up'),
    path('add-item/check-in/', add_item_check_in_view, name='add-item-check-in'),
    path('restoration-request/settings/', restoration_request_settings_view, name='restoration-request-settings'),
    path('floor-issues/', floor_issue_report_view, name='floor-issue-report'),
    path('floor-issues/lookup/', floor_issue_lookup_view, name='floor-issue-lookup'),
    path('floor-issues/<int:pk>/photo/', floor_issue_photo_view, name='floor-issue-photo'),
    path('photo-sheets/', photo_sheet_list_view, name='photo-sheet-list'),
    path('photo-sheets/start/', photo_sheet_start_view, name='photo-sheet-start'),
    path('photo-sheets/ai/', photo_sheet_ai_view, name='photo-sheet-ai'),
    path('photo-sheets/photos/', photo_sheet_photo_upload_view, name='photo-sheet-photo-upload'),
    path('photo-sheets/photos/link/', photo_sheet_photo_link_view, name='photo-sheet-photo-link'),
    path('photo-sheets/photos/<int:file_id>/', photo_sheet_photo_view, name='photo-sheet-photo'),
    path('photo-sheets/<int:pk>/', photo_sheet_detail_view, name='photo-sheet-detail'),
    path('photo-sheets/<int:pk>/printed/', photo_sheet_printed_view, name='photo-sheet-printed'),
    path('reentries/', reentry_list_view, name='reentry-list'),
    path('reentries/find/', reentry_find_view, name='reentry-find'),
    path('reentries/<int:pk>/price-again/', reentry_price_again_view, name='reentry-price-again'),
    path('reentries/<int:pk>/back-to-shelf/', reentry_back_to_shelf_view, name='reentry-back-to-shelf'),
    path('reentries/<int:pk>/send-to-restoration/', reentry_send_to_restoration_view, name='reentry-send-to-restoration'),
    path('reentries/<int:pk>/scrap/', reentry_scrap_view, name='reentry-scrap'),
    path('bulk-price/', bulk_price_list_view, name='bulk-price-list'),
    path('bulk-price/preview/', bulk_price_preview_view, name='bulk-price-preview'),
    path('bulk-price/apply/', bulk_price_apply_view, name='bulk-price-apply'),
    path('bulk-price/labels/', bulk_labels_view, name='bulk-price-labels'),
    path('bulk-price/<int:pk>/', bulk_price_detail_view, name='bulk-price-detail'),
    path('bulk-price/<int:pk>/undo/', bulk_price_undo_view, name='bulk-price-undo'),
    path('', include(router.urls)),
    path('items/lookup/<str:sku>/', item_lookup, name='item-lookup'),
    path('classify/', classify_item_view, name='classify-item'),
    path('store-report/', store_report_view, name='store-report'),
    path('shrink-estimate/', shrink_estimate_view, name='shrink-estimate'),
    path('items/<int:pk>/card/', item_card_view, name='item-card'),
    path('products/<int:pk>/card/', product_card_view, name='product-card'),
    path('orders/<int:pk>/card/', order_card_view, name='order-card'),
    path('restoration-jobs/<int:pk>/card/', restoration_card_view, name='restoration-card'),
    path('items/<int:pk>/verify-present/', verify_present_view, name='item-verify-present'),
    path('items/<int:pk>/quick-reprice/', quick_reprice_view, name='item-quick-reprice'),
    path('items/<int:pk>/duplicate-for-resale/', duplicate_item_for_resale_view, name='item-duplicate-for-resale'),
    path('items/<int:pk>/mark-on-shelf/', mark_sold_item_on_shelf_view, name='item-mark-on-shelf'),
    path('estimate-price/', estimate_price_view, name='estimate-price'),
    path('recovery-estimate/', recovery_estimate_view, name='recovery-estimate'),
    path('processing-command-center/', processing_command_center_view, name='processing-command-center'),
    path('price-coach/', price_coach_view, name='price-coach'),
]

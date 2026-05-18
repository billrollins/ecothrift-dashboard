<!-- order surfaces — list, create, detail, manifest — 2026-05-08 -->

# Order dashboard — surfaces & SQL



Staff **purchase order** flows: list, create, detail (GET/PATCH), upload/remove manifest. Implementation: [`apps/inventory/views.py`](../../../apps/inventory/views.py) `PurchaseOrderViewSet`; serializers [`PurchaseOrderListSerializer`](../../../apps/inventory/serializers.py), [`PurchaseOrderSerializer`](../../../apps/inventory/serializers.py), [`PurchaseOrderDetailSerializer`](../../../apps/inventory/serializers.py), [`PurchaseOrderDetailSurfaceSerializer`](../../../apps/inventory/serializers.py); model [`PurchaseOrder`](../../../apps/inventory/models.py) → `ecothrift.inventory_purchaseorder`. API mount: [`ecothrift/urls.py`](../../../ecothrift/urls.py) `api/inventory/` + [`apps/inventory/urls.py`](../../../apps/inventory/urls.py) `orders/`.



## Table of contents



1. [Order list](#1-order-list)

2. [Order create](#2-order-create)

3. [Order detail retrieve vs PATCH vs detail-surface](#3-order-detail-retrieve-vs-patch-vs-detail-surface)

4. [Manifest upload / remove](#4-manifest-upload--remove)



---



## 1. Order list



| | |

|-|-|

| **GET** | `/api/inventory/orders/` |

| **Summary (KPIs)** | `/api/inventory/orders/summary/` — same filters as list, aggregates only (`summary` in [`PurchaseOrderViewSet`](../../../apps/inventory/views.py)) |

| **Query** | `vendor`, `status`, `status__in` ([`filterset_fields`](../../../apps/inventory/views.py)); `search` or `q`, `ordered_date_after`, `ordered_date_before` ([`_filter_purchase_order_list_extras`](../../../apps/inventory/views.py)); `ordering` on `ordered_date`, `expected_delivery`, `created_at`; `page`, `page_size` ([`ConfigurablePageSizePagination`](../../../ecothrift/pagination.py) default **50**, max **200**) |

| **Scope** | [`vendor_name_cache__in=PURCHASE_ORDER_DASHBOARD_VENDOR_NAMES`](../../../apps/inventory/constants.py) — display names only, not vendor PK |



**Serializer:** [`PurchaseOrderListSerializer`](../../../apps/inventory/serializers.py) — `vendor_*` from caches; `has_manifest` ⇔ `manifest_id`; no `manifest_preview` / `processing_stats`.



**SQL:** [`_sql/order_list.sql`](./_sql/order_list.sql) — `IN (...)` must match [`PURCHASE_ORDER_DASHBOARD_VENDOR_NAMES`](../../../apps/inventory/constants.py); search uses at most **20** words (`icontains` each), same as the view.



**UI:** [`frontend/src/pages/inventory/OrderListPage.tsx`](../../../frontend/src/pages/inventory/OrderListPage.tsx); create dialog [`frontend/src/components/inventory/CreatePurchaseOrderDialog.tsx`](../../../frontend/src/components/inventory/CreatePurchaseOrderDialog.tsx); client [`frontend/src/api/inventory.api.ts`](../../../frontend/src/api/inventory.api.ts).



---



## 2. Order create



| | |

|-|-|

| **POST** | `/api/inventory/orders/` |

| **Body** | [`PurchaseOrderSerializer`](../../../apps/inventory/serializers.py) writable fields (e.g. `vendor`, optional `order_number` / `ordered_date`, costs, counts, `description`, `condition`, …) |

| **Server** | [`perform_create`](../../../apps/inventory/views.py): sets `created_by`, `est_shrink` ([`get_default_po_est_shrink`](../../../apps/inventory/services/po_defaults.py)), generates `order_number` if blank, default `ordered_date` to today if missing. Model save refreshes `vendor_*_cache`, `search_text`, `total_cost` from cost fields. |



**SQL:** [`_sql/order_create_new.sql`](./_sql/order_create_new.sql) — post-insert row + live vendor join; bind `:po_id`.



---



## 3. Order detail retrieve vs PATCH vs detail-surface



| Client | Endpoint | Serializer | Purpose |

|--------|----------|------------|---------|

| **Order Detail UI** (`OrderDetailPage.tsx`) | `GET …/detail-surface/` | [`PurchaseOrderDetailSurfaceSerializer`](../../../apps/inventory/serializers.py) | Thin payload: scalar PO fields, `has_manifest`, denormalized `manifest_*` metadata — **no** `manifest_preview`, nested S3/`url()`, or `processing_stats`. Queryset omits annotated stats joins. |

| **Processing / Receiving / ItemForm** | `GET …/{id}/` (retrieve) | [`PurchaseOrderDetailSerializer`](../../../apps/inventory/serializers.py) | Full detail + `inventory_manifest_row_count` (canonical ManifestRow tally from annotation), nested `manifest_file`, `manifest_preview`, `processing_stats`. Queryset [`_annotate_purchase_order_stats`](../../../apps/inventory/views.py). |



### GET `/api/inventory/orders/{id}/` (retrieve)



- **Serializer:** [`PurchaseOrderDetailSerializer`](../../../apps/inventory/serializers.py) (= [`PurchaseOrderSerializer`](../../../apps/inventory/serializers.py) + `inventory_manifest_row_count`). Model denormalized **`manifest_row_count`** is upload metadata (lines in CSV at upload).

- **`manifest`:** not `select_related`; nested `manifest_file`/`S3FileSerializer` is usually an extra query; `url` uses storage.



**SQL:** [`_sql/order_detail_get.sql`](./_sql/order_detail_get.sql) — vendor + `accounts_user` joins; subselects mirror ORM annotations. Rename in JSON responses: Serializer exposes canonical count as **`inventory_manifest_row_count`** (SQL alias `_manifest_row_count`).



### GET `/api/inventory/orders/{id}/detail-surface/`



- **Views:** [`detail_surface`](../../../apps/inventory/views.py), `PurchaseOrder.objects.all()` (slim queryset).



### PATCH `/api/inventory/orders/{id}/`



- Writable fields exclude `manifest_filename`, `manifest_uploaded_at`, `manifest_row_count`, `manifest_category_count` (`read_only`). Sending those keys yields **400** (explicit validation).

- Patchable fields also exclude `total_cost`, `est_shrink`, `manifest_preview` (`read_only` on [`PurchaseOrderSerializer`](../../../apps/inventory/serializers.py)).



**UI:** [`frontend/src/pages/inventory/OrderDetailPage.tsx`](../../../frontend/src/pages/inventory/OrderDetailPage.tsx) uses **`detail-surface`** only; Processing, Receiving, and Item Form still use **`GET …/{id}/`** ([`usePurchaseOrder`](../../../frontend/src/hooks/useInventory.ts)).



**SQL:** [`_sql/order_edit.sql`](./_sql/order_edit.sql) — columns commonly touched by inline save; bind `po_id` in `p` CTE.



---



## 4. Manifest upload / remove



| | |

|-|-|

| **Upload** | `POST` `/api/inventory/orders/{id}/upload-manifest/` — multipart `file` `.csv`/`.tsv` ([`upload_manifest`](../../../apps/inventory/views.py)) |

| **Remove** | `POST` `/api/inventory/orders/{id}/remove-manifest/` ([`remove_manifest`](../../../apps/inventory/views.py)) |



Both: create or clear `core_s3file` link + `manifest_preview`; delete [`PreprocessingOrder`](../../../apps/inventory/models.py) (+ rows) when applicable; persist/clear PO denormalized manifest metadata; delete old storage key on replace/remove. Response: **`PurchaseOrderDetailSurfaceSerializer`** (frontend may `setQueryData(['purchaseOrderSurface', id], data)` without refetching full retrieve).



| Field | Source of truth | Written by | Cleared by |

| ----- | ----------------- | ---------- | ----------- |

| `manifest_filename` | `core_s3file.filename` at upload | `upload_manifest` | `remove_manifest` |

| `manifest_uploaded_at` | `core_s3file.uploaded_at` at upload | `upload_manifest` | `remove_manifest` |

| `manifest_row_count` | `len(rows_data)` at upload | `upload_manifest` | `remove_manifest` |

| `manifest_category_count` | distinct non-empty values in first matching header column (`category` → `department` → `class`, first column hit) over **full** `rows_data` at upload ([`compute_category_count`](../../../apps/inventory/services/manifest_meta.py)) | `upload_manifest` | `remove_manifest` |



**SQL:** [`_sql/order_upload_manifest.sql`](./_sql/order_upload_manifest.sql) — PO preview keys, linked `core_s3file`, preprocessing row if any.



---



## See also



- [`.ai/extended/sql/intake_pipeline_by_order.sql`](../../extended/sql/intake_pipeline_by_order.sql)

- [`2026.05.08_intake_updates.md`](./2026.05.08_intake_updates.md)


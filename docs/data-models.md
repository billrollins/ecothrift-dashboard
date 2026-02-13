<!-- Last updated: 2026-02-13T21:00:00-06:00 -->
# Data Models

## accounts

### User
Custom user model. Email is the sole login identifier.

| Field | Type | Notes |
|-------|------|-------|
| email | EmailField | `USERNAME_FIELD`, unique |
| first_name | CharField(150) | |
| last_name | CharField(150) | |
| phone | CharField(30) | blank |
| is_active | BooleanField | default True |
| is_staff | BooleanField | default False |
| date_joined | DateTimeField | auto |
| updated_at | DateTimeField | auto |

**Properties:** `full_name`, `role` (from first Group membership), `roles` (list of all Group names — supports multi-role users)

### EmployeeProfile
One-to-one with User. Created when a user is assigned the Employee role.

| Field | Type | Notes |
|-------|------|-------|
| user | OneToOneField(User) | related_name='employee' |
| employee_number | CharField | unique, auto-generated EMP-XXX |
| department | FK(hr.Department) | nullable |
| position | CharField | e.g. "Cashier" |
| employment_type | CharField | full_time / part_time / seasonal |
| pay_rate | DecimalField | |
| hire_date | DateField | |
| termination_date | DateField | nullable |
| termination_type | CharField(40) | choices: voluntary_resignation, job_abandonment, retirement, layoff, termination_for_cause, termination_without_cause, mutual_agreement, end_of_contract, medical, other; blank |
| termination_notes | TextField | blank |
| work_location | FK(core.WorkLocation) | nullable |
| emergency_name | CharField | blank |
| emergency_phone | CharField | blank |
| notes | TextField | blank |
| created_at | DateTimeField | auto |

### ConsigneeProfile
One-to-one with User. Created when a user is assigned the Consignee role.

| Field | Type | Notes |
|-------|------|-------|
| user | OneToOneField(User) | related_name='consignee' |
| consignee_number | CharField | unique, auto-generated CON-XXX |
| commission_rate | DecimalField | percentage |
| payout_method | CharField | cash / check / store_credit |
| status | CharField | active / paused / closed |
| join_date | DateField | |
| notes | TextField | blank |
| created_at | DateTimeField | auto |

### CustomerProfile
One-to-one with User. For tracking repeat customers.

| Field | Type | Notes |
|-------|------|-------|
| user | OneToOneField(User) | related_name='customer' |
| customer_number | CharField | unique, auto-generated CUS-XXX |
| customer_since | DateField | |
| notes | TextField | blank |

---

## core

### WorkLocation
Physical store location.

| Field | Type | Notes |
|-------|------|-------|
| name | CharField(200) | |
| address | TextField | blank |
| phone | CharField(30) | blank |
| timezone | CharField(50) | default 'America/Chicago' |
| is_active | BooleanField | default True |
| created_at | DateTimeField | auto |

### AppSetting
Key-value configuration store.

| Field | Type | Notes |
|-------|------|-------|
| key | CharField(100) | unique, used as lookup_field |
| value | JSONField | |
| description | CharField(255) | blank |
| updated_by | FK(User) | nullable |
| updated_at | DateTimeField | auto |

### S3File
Tracks files uploaded to AWS S3.

| Field | Type | Notes |
|-------|------|-------|
| key | CharField(500) | S3 object key |
| filename | CharField(255) | original filename |
| size | IntegerField | bytes |
| content_type | CharField(100) | MIME type |
| uploaded_by | FK(User) | nullable |
| uploaded_at | DateTimeField | auto |

### PrintServerRelease
Tracks print server versions uploaded to S3.

| Field | Type | Notes |
|-------|------|-------|
| version | CharField(20) | unique |
| s3_file | FK(S3File) | |
| release_notes | TextField | blank |
| is_current | BooleanField | |
| released_by | FK(User) | nullable |
| released_at | DateTimeField | auto_now_add |

---

## hr

### Department

| Field | Type | Notes |
|-------|------|-------|
| name | CharField(200) | unique |
| description | TextField | blank |
| location | FK(WorkLocation) | nullable |
| manager | FK(User) | nullable |
| is_active | BooleanField | default True |

### TimeEntry
Tracks employee clock-in/out. `unique_together = (employee, date, clock_in)`.

| Field | Type | Notes |
|-------|------|-------|
| employee | FK(User) | |
| date | DateField | auto-filled on clock-in |
| clock_in | DateTimeField | auto-filled on clock-in |
| clock_out | DateTimeField | nullable |
| break_minutes | IntegerField | default 0 |
| total_hours | DecimalField | computed on clock-out |
| status | CharField | pending / approved / flagged |
| approved_by | FK(User) | nullable |
| notes | TextField | blank |
| created_at | DateTimeField | auto |
| updated_at | DateTimeField | auto |

**Business logic:** `compute_total_hours()` runs on save when `clock_out` is set. Sick leave accrues (1hr per 30hrs worked) when an entry is approved.

### SickLeaveBalance
Per-employee, per-year. `unique_together = (employee, year)`. Annual cap: 56 hours.

| Field | Type | Notes |
|-------|------|-------|
| employee | FK(User) | |
| year | IntegerField | |
| hours_earned | DecimalField | |
| hours_used | DecimalField | |

**Properties:** `hours_available`, `is_capped`

### SickLeaveRequest

| Field | Type | Notes |
|-------|------|-------|
| employee | FK(User) | |
| start_date | DateField | |
| end_date | DateField | |
| hours_requested | DecimalField | |
| status | CharField | pending / approved / denied |
| reason | TextField | blank |
| reviewed_by | FK(User) | nullable |
| review_note | TextField | blank |
| reviewed_at | DateTimeField | nullable |
| created_at | DateTimeField | auto |

### TimeEntryModificationRequest
Employee-submitted request to modify an approved time entry. Requires manager approval.

| Field | Type | Notes |
|-------|------|-------|
| time_entry | FK(TimeEntry) | |
| employee | FK(User) | |
| requested_clock_in | DateTimeField | nullable |
| requested_clock_out | DateTimeField | nullable |
| requested_break_minutes | IntegerField | nullable |
| reason | TextField | |
| status | CharField | pending / approved / denied |
| reviewed_by | FK(User) | nullable |
| reviewed_at | DateTimeField | nullable |
| review_note | TextField | blank |
| created_at | DateTimeField | auto |

---

## inventory

### Vendor
`is_active` used for soft delete.

| Field | Type | Notes |
|-------|------|-------|
| name | CharField(200) | |
| code | CharField(20) | unique |
| vendor_type | CharField | liquidation / retail / direct / other |
| contact_name | CharField | blank |
| contact_email | EmailField | blank |
| contact_phone | CharField | blank |
| address | TextField | blank |
| notes | TextField | blank |
| is_active | BooleanField | default True |
| created_at | DateTimeField | auto |

### PurchaseOrder

| Field | Type | Notes |
|-------|------|-------|
| vendor | FK(Vendor) | |
| order_number | CharField | unique, auto-generated PO-XXXXX or user-provided |
| status | CharField | ordered / paid / shipped / delivered / processing / complete / cancelled |
| ordered_date | DateField | defaults to today on create |
| paid_date | DateField | nullable, set via mark-paid action |
| shipped_date | DateField | nullable, set via mark-shipped action |
| expected_delivery | DateField | nullable |
| delivered_date | DateField | nullable, set via deliver action |
| purchase_cost | DecimalField | nullable |
| shipping_cost | DecimalField | nullable |
| fees | DecimalField | nullable |
| total_cost | DecimalField | auto-computed from purchase_cost + shipping_cost + fees |
| retail_value | DecimalField | nullable, estimated retail value |
| condition | CharField | choices: new / like_new / good / fair / salvage / mixed |
| description | CharField(500) | order title/summary |
| item_count | IntegerField | default 0 |
| notes | TextField | blank |
| manifest | FK(S3File) | nullable, uploaded CSV file |
| manifest_preview | JSONField | nullable, persisted CSV preview (headers + first 20 rows) |
| created_by | FK(User) | |
| created_at | DateTimeField | auto |
| updated_at | DateTimeField | auto |

### CSVTemplate
Vendor-specific CSV column mappings for manifest processing.

| Field | Type | Notes |
|-------|------|-------|
| vendor | FK(Vendor) | |
| name | CharField | |
| header_signature | CharField | hash for auto-matching |
| column_mappings | JSONField | maps CSV columns to ManifestRow fields |
| is_default | BooleanField | |
| created_at | DateTimeField | auto |

### ManifestRow
Standardized row data extracted from vendor CSV.

| Field | Type | Notes |
|-------|------|-------|
| purchase_order | FK(PurchaseOrder) | related_name='manifest_rows' |
| row_number | IntegerField | |
| quantity | IntegerField | default 1 |
| description | TextField | blank |
| brand | CharField | blank |
| model | CharField | blank |
| category | CharField | blank |
| retail_value | DecimalField | nullable |
| upc | CharField | blank |
| notes | TextField | blank |

### Product
Reusable product definitions.

| Field | Type | Notes |
|-------|------|-------|
| title | CharField(300) | |
| brand | CharField | blank |
| model | CharField | blank |
| category | CharField | blank |
| description | TextField | blank |
| default_price | DecimalField | nullable |
| created_at | DateTimeField | auto |
| updated_at | DateTimeField | auto |

### Item
Individual sellable item with auto-generated SKU.

| Field | Type | Notes |
|-------|------|-------|
| sku | CharField(20) | unique, auto-generated ET-XXXXXX |
| product | FK(Product) | nullable |
| purchase_order | FK(PurchaseOrder) | nullable |
| title | CharField(300) | |
| brand | CharField | blank |
| category | CharField | blank |
| price | DecimalField | sticker price |
| cost | DecimalField | nullable |
| source | CharField | purchased / donated / consignment |
| status | CharField | intake / processing / on_shelf / sold / returned / damaged / missing |
| location | CharField | blank |
| listed_at | DateTimeField | nullable |
| sold_at | DateTimeField | nullable |
| sold_for | DecimalField | nullable |
| notes | TextField | blank |
| created_at | DateTimeField | auto |
| updated_at | DateTimeField | auto |

### ProcessingBatch

| Field | Type | Notes |
|-------|------|-------|
| purchase_order | FK(PurchaseOrder) | |
| status | CharField | pending / in_progress / completed |
| total_rows | IntegerField | default 0 |
| processed_count | IntegerField | default 0 |
| items_created | IntegerField | default 0 |
| started_at | DateTimeField | nullable |
| completed_at | DateTimeField | nullable |
| created_by | FK(User) | |
| notes | TextField | blank |

### ItemScanHistory
Tracks public item lookups.

| Field | Type | Notes |
|-------|------|-------|
| item | FK(Item) | |
| scanned_at | DateTimeField | auto |
| ip_address | GenericIPAddressField | nullable |
| source | CharField | web / app |

---

## pos

### Register

| Field | Type | Notes |
|-------|------|-------|
| location | FK(WorkLocation) | |
| name | CharField | |
| code | CharField(10) | unique |
| starting_cash | DecimalField | |
| starting_breakdown | JSONField | denomination counts |
| is_active | BooleanField | default True |

### Drawer
`unique_together = (register, date)`. One drawer per register per day.

| Field | Type | Notes |
|-------|------|-------|
| register | FK(Register) | |
| date | DateField | |
| status | CharField | open / closed |
| current_cashier | FK(User) | required |
| opened_by | FK(User) | required |
| opened_at | DateTimeField | |
| opening_count | JSONField | denomination breakdown |
| opening_total | DecimalField | |
| closed_by | FK(User) | nullable |
| closed_at | DateTimeField | nullable |
| closing_count | JSONField | nullable |
| closing_total | DecimalField | nullable |
| cash_sales_total | DecimalField | default 0 |
| expected_cash | DecimalField | nullable |
| variance | DecimalField | nullable |

### DrawerHandoff
Mid-shift cashier change with cash count.

| Field | Type | Notes |
|-------|------|-------|
| drawer | FK(Drawer) | |
| outgoing_cashier | FK(User) | required |
| incoming_cashier | FK(User) | required |
| counted_at | DateTimeField | |
| count | JSONField | denomination breakdown |
| counted_total | DecimalField | |
| expected_total | DecimalField | |
| variance | DecimalField | |
| notes | TextField | blank |

### CashDrop
Safe drops during shift.

| Field | Type | Notes |
|-------|------|-------|
| drawer | FK(Drawer) | |
| amount | JSONField | denomination breakdown |
| total | DecimalField | |
| dropped_by | FK(User) | required |
| dropped_at | DateTimeField | auto |
| notes | TextField | blank |

### SupplementalDrawer
One per location (OneToOneField). Petty cash / change fund.

| Field | Type | Notes |
|-------|------|-------|
| location | OneToOneField(WorkLocation) | |
| current_balance | JSONField | denomination breakdown |
| current_total | DecimalField | |
| last_counted_by | FK(User) | nullable |
| last_counted_at | DateTimeField | nullable |

### SupplementalTransaction

| Field | Type | Notes |
|-------|------|-------|
| supplemental | FK(SupplementalDrawer) | |
| transaction_type | CharField | draw / return / audit_adjustment |
| amount | JSONField | denomination breakdown |
| total | DecimalField | |
| related_drawer | FK(Drawer) | nullable |
| performed_by | FK(User) | required |
| performed_at | DateTimeField | auto |
| notes | TextField | blank |

### BankTransaction

| Field | Type | Notes |
|-------|------|-------|
| location | FK(WorkLocation) | |
| transaction_type | CharField | deposit / change_pickup |
| amount | JSONField | denomination breakdown |
| total | DecimalField | |
| status | CharField | pending / completed |
| performed_by | FK(User) | required |
| created_at | DateTimeField | auto |
| completed_at | DateTimeField | nullable |
| notes | TextField | blank |

### Cart
A sale transaction. `recalculate()` updates subtotal/tax/total from lines.

| Field | Type | Notes |
|-------|------|-------|
| drawer | FK(Drawer) | |
| cashier | FK(User) | required |
| customer | FK(User) | nullable |
| status | CharField | open / completed / voided |
| subtotal | DecimalField | |
| tax_rate | DecimalField | |
| tax_amount | DecimalField | |
| total | DecimalField | |
| payment_method | CharField | cash / card / split |
| cash_tendered | DecimalField | nullable |
| change_given | DecimalField | nullable |
| card_amount | DecimalField | nullable |
| completed_at | DateTimeField | nullable |
| created_at | DateTimeField | auto |

### CartLine

| Field | Type | Notes |
|-------|------|-------|
| cart | FK(Cart) | related_name='lines' |
| item | FK(Item) | nullable |
| description | CharField | |
| quantity | IntegerField | default 1 |
| unit_price | DecimalField | |
| line_total | DecimalField | |
| created_at | DateTimeField | auto |

### Receipt

| Field | Type | Notes |
|-------|------|-------|
| cart | OneToOneField(Cart) | |
| receipt_number | CharField | unique, auto-generated |
| printed | BooleanField | default False |
| emailed | BooleanField | default False |
| created_at | DateTimeField | auto |

### RevenueGoal

| Field | Type | Notes |
|-------|------|-------|
| location | FK(WorkLocation) | |
| date | DateField | |
| goal_amount | DecimalField | |

---

## consignment

### ConsignmentAgreement

| Field | Type | Notes |
|-------|------|-------|
| consignee | FK(User) | |
| agreement_number | CharField | unique, auto-generated |
| commission_rate | DecimalField | percentage |
| status | CharField | active / paused / closed |
| start_date | DateField | |
| end_date | DateField | nullable |
| terms | TextField | blank |
| created_at | DateTimeField | auto |

### ConsignmentItem

| Field | Type | Notes |
|-------|------|-------|
| agreement | FK(ConsignmentAgreement) | |
| item | OneToOneField(Item) | related_name='consignment' |
| asking_price | DecimalField | |
| listed_price | DecimalField | nullable |
| status | CharField | received / listed / sold / returned / expired |
| received_at | DateTimeField | auto |
| listed_at | DateTimeField | nullable |
| sold_at | DateTimeField | nullable |
| sale_amount | DecimalField | nullable |
| store_commission | DecimalField | nullable |
| consignee_earnings | DecimalField | nullable |
| return_date | DateField | nullable |
| notes | TextField | blank |

### ConsignmentPayout

| Field | Type | Notes |
|-------|------|-------|
| consignee | FK(User) | |
| payout_number | CharField | unique, auto-generated |
| period_start | DateField | |
| period_end | DateField | |
| items_sold | IntegerField | default 0 |
| total_sales | DecimalField | default 0 |
| total_commission | DecimalField | default 0 |
| payout_amount | DecimalField | default 0 |
| status | CharField | draft / approved / paid |
| paid_at | DateTimeField | nullable |
| paid_by | FK(User) | nullable |
| payment_method | CharField | blank |
| notes | TextField | blank |
| created_at | DateTimeField | auto |

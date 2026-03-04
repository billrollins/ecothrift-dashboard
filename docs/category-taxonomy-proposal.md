# Category Taxonomy Proposal

> **Status:** DRAFT — Awaiting your review and approval before this is seeded into the database.
>
> **Instructions:** Review the hierarchy below. Add categories you know from your inventory that are missing. Mark any that should be merged. When approved, the `seed_categories` management command will insert all of these into the `inventory_category` table and link every item via the classifier.

---

## How to Approve

1. Read through the tree below
2. Add any missing top-level or subcategories in the "Your Additions" section
3. Mark merges with: `MERGE: Small Kitchen → Kitchen Appliances`
4. Reply with approval and the AI will run: `python manage.py seed_categories`

---

## Proposed Hierarchy

Based on common thrift / liquidation inventory patterns. Adjust to match what you actually stock.

```
Electronics
  ├── Laptops & Computers
  ├── Tablets
  ├── Smartphones
  ├── Audio & Headphones
  ├── TVs & Monitors
  ├── Gaming & Consoles
  ├── Smart Home & Networking
  ├── Cameras & Photography
  └── Electronics – Other

Appliances
  ├── Small Kitchen Appliances
  ├── Large Kitchen Appliances
  ├── Personal Care Appliances
  ├── Laundry & Cleaning Appliances
  └── Appliances – Other

Tools & Hardware
  ├── Power Tools
  ├── Hand Tools
  ├── Outdoor & Garden Tools
  ├── Safety & Hardware
  └── Tools – Other

Home & Kitchen
  ├── Cookware & Bakeware
  ├── Kitchen Gadgets & Storage
  ├── Bedding & Bath
  ├── Home Décor
  ├── Lighting & Fixtures
  ├── Storage & Organization
  ├── Furniture
  └── Home – Other

Sports & Outdoors
  ├── Exercise & Fitness Equipment
  ├── Outdoor Recreation
  ├── Camping & Hiking
  ├── Cycling
  └── Sports – Other

Toys & Games
  ├── Action Figures & Dolls
  ├── Board Games & Puzzles
  ├── Building & STEM Toys
  ├── Outdoor Toys
  └── Toys – Other

Clothing & Accessories
  ├── Men's Clothing
  ├── Women's Clothing
  ├── Children's Clothing
  ├── Shoes & Footwear
  ├── Bags & Luggage
  └── Clothing – Other

Health & Beauty
  ├── Vitamins & Supplements
  ├── Personal Care & Hygiene
  ├── Medical Devices & Aids
  └── Health – Other

Automotive
  ├── Car Electronics & Accessories
  ├── Tools & Maintenance
  └── Automotive – Other

Office & School
  ├── Office Electronics & Supplies
  ├── Printers & Scanners
  └── Office – Other

Books, Media & Music
  ├── Books
  ├── Movies & TV
  ├── Music & Instruments
  └── Media – Other

Pet Supplies
  ├── Dog
  ├── Cat
  └── Pet – Other

Miscellaneous
  └── General Merchandise
```

---

## Spec Templates

Each leaf category can have a `spec_template` — a JSON list of structured specs staff fill in during processing. These make the item detail page much more informative and help the pricing model.

Example for `Electronics > Laptops & Computers`:
```json
[
  {"key": "processor", "label": "Processor", "type": "text"},
  {"key": "ram_gb", "label": "RAM (GB)", "type": "number"},
  {"key": "storage_gb", "label": "Storage (GB)", "type": "number"},
  {"key": "screen_size_inches", "label": "Screen Size (in)", "type": "number"},
  {"key": "os", "label": "Operating System", "type": "text"},
  {"key": "battery_ok", "label": "Battery works?", "type": "boolean"},
  {"key": "charger_included", "label": "Charger included?", "type": "boolean"}
]
```

Example for `Appliances > Small Kitchen Appliances`:
```json
[
  {"key": "tested", "label": "Powers on and tested", "type": "boolean"},
  {"key": "all_parts", "label": "All parts present", "type": "boolean"},
  {"key": "wattage", "label": "Wattage", "type": "number"}
]
```

The spec templates are stored in `Category.spec_template` and surfaced in the Processing Drawer so staff can fill them in during check-in.

---

## Your Additions

*(Add categories or notes here before approving)*

---

## Merges Requested

*(List any categories above that should be merged here)*

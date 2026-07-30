# Five-minute Online Sales demo script

Prereqs (local DEBUG):

```text
python manage.py migrate
python manage.py seed_online_sales_hours
python manage.py seed_online_sales_demo --wipe
# set ONLINE_SALES_ENABLED=true in .env / shell, restart Django
```

| Step | Where | Click / do | Expect |
|------|-------|------------|--------|
| 1 | Staff `https://localhost:5173` | Sign in as Manager | Online Sales workspace in Slot C |
| 2 | `/online-sales/listings` | Open `Demo F4 Photo Gallery` | Listing Studio with photos |
| 3 | Public `http://localhost:5174/shop` | Browse; open a reserved item if any | Reserved badge when available=0 |
| 4 | Public PDP | Ask about this item → send | Thanks message; thread in staff Messages |
| 5 | Public | Add to hold list → Request a hold | Hold status page with messages |
| 6 | Staff Inbox → Holds | Confirm the new hold | Customer gets console email “Hold confirmed” |
| 7 | Staff Inbox → Ready for pickup | Stage / Extend | Countdown updates |
| 8 | Public `/account/sign-in` | Email `demo.customer@ecothrift.example` | Console prints magic link; consume → Account |

Seeded customer: `demo.customer@ecothrift.example` (magic link only).

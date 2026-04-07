# B-Stock intelligence (notebooks)

Exploration and ad hoc analysis for auction data stored by the Django **`apps/buying/`** app.

Use **`_shared/README.md`** to connect notebooks to the same Postgres database as the dashboard. Import pipeline helpers from the project root, for example:

```python
import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "ecothrift.settings")
django.setup()

from apps.buying.services import pipeline
```

Prefer **`python manage.py bstock_token`** (stores JWT in **`workspace/.bstock_token`**). Or set **`BSTOCK_AUTH_TOKEN`** in **`.env`** as fallback. See **`apps/buying/bookmarklet/bstock_elt_bookmarklet.md`** to copy the token from the browser `elt` cookie. Search listing discovery does not require the token.

The legacy notebook package under **`bstock-scraper/Scraper/`** is reference-only for API discovery; production scraping uses **`apps/buying/services/scraper.py`**.

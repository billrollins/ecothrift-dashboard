# B-Stock JWT bookmarklet (Next.js `accessToken`)

The old **`elt` cookie** approach does not work for API calls:

1. The cookie often holds a **JWE** (encrypted token), not the plain **JWT** the microservices expect. It typically starts with `eyJhbGciOiJSU0EtT0FF` (RSA-OAEP). The order-process manifest endpoint returns **400** if you send this.
2. On some pages the cookie is **httpOnly** or missing, so a bookmarklet cannot read it.

The **working JWT** is the RS256 access token used in `Authorization: Bearer ...`. It usually starts with `eyJhbGciOiJSUzI1NiI`. On B-Stock Next.js pages it is exposed in page props:

- `window.__NEXT_DATA__.props.pageProps.accessToken`
- Shortcut: `window.p.accessToken`

## Save as a bookmark

1. Create a new bookmark (Bookmark this tab, or Bookmarks manager, Add bookmark).
2. Name it something like **B-Stock Token**.
3. Set the URL to **one** of the lines below (starts with `javascript:`).

### Copy only (textarea fallback)

Use this if you prefer paste into `python manage.py bstock_token`:

```javascript
javascript:void((function(){try{var t=(window.__NEXT_DATA__&&window.__NEXT_DATA__.props&&window.__NEXT_DATA__.props.pageProps&&window.__NEXT_DATA__.props.pageProps.accessToken)||(window.p&&window.p.accessToken);if(!t){alert('No token found. Are you logged in?');return}var ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);alert('Token copied! ('+t.length+' chars)');}catch(e){alert('Error: '+e.message)}})())
```

### POST to local Django (preferred when runserver is up)

Saves the token to **`workspace/.bstock_token`** via **`POST /api/buying/token/`** (DEBUG or localhost only). If the server is down, falls back to clipboard and tells you to run **`bstock_token`**.

```javascript
javascript:void((function(){try{var t=(window.__NEXT_DATA__&&window.__NEXT_DATA__.props&&window.__NEXT_DATA__.props.pageProps&&window.__NEXT_DATA__.props.pageProps.accessToken)||(window.p&&window.p.accessToken);if(!t){alert('No token found. Are you logged in?');return}fetch('http://localhost:8000/api/buying/token/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:t})}).then(function(r){if(r.ok)return r.json();throw new Error('HTTP '+r.status)}).then(function(d){alert('Token saved to server! ('+t.length+' chars)')}).catch(function(e){var ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);alert('Server unavailable, token copied to clipboard instead. Paste into: python manage.py bstock_token')})}catch(e){alert('Error: '+e.message)}})())
```

Requires **DEBUG=True** (or loopback) and **`https://bstock.com`** in CORS when using the fetch variant.

## Workflow

1. Log in at **https://bstock.com** and open a normal listing or dashboard page (same origin as the token).
2. Click the bookmarklet. Confirm the alert (saved server-side or copied).
3. Run management commands, for example:

```bash
python manage.py sweep_auctions
python manage.py watch_auctions
```

The scraper reads **`workspace/.bstock_token`** first, then **`BSTOCK_AUTH_TOKEN`** in `.env`. Manifest data is ingested via **CSV upload** in the staff UI, not via a management command.

## Token lifetime

Tokens last about **one hour**. On **401** from JWT-backed endpoints (e.g. watchlist poll), refresh: open B-Stock, click the bookmarklet again, then rerun commands.

## See also

- **`scripts/refresh_bstock.bat`**: open Target seller page, wait for token file change, run **`sweep_auctions`**.

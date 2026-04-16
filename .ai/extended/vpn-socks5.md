<!-- Last updated: 2026-04-16T14:00:00-05:00 -->
# VPN / SOCKS5 proxy — PIA configuration and diagnostics

All outbound B-Stock HTTP (`*.bstock.com`) in `apps/buying/services/scraper.py` can be routed through a SOCKS5 proxy. The current provider is **Private Internet Access (PIA)**. This file documents the setup, known behavior, troubleshooting, and diagnostic tooling.

---

## Why SOCKS5

- **IP anonymity:** B-Stock sees a PIA exit IP (Netherlands pool), not the office/home IP.
- **Rotation:** PIA's `proxy-nl` hostname resolves to ~30 IPs via DNS round-robin. If one IP is rate-limited, the next connection may land on a different one.
- **No account fingerprint:** Anonymous endpoints (search, auction state, manifests) require no JWT. Combined with rotating IPs, there is no stable identity to block.
- **Selective:** Only `*.bstock.com` URLs go through the proxy. Local API calls, ipify probes, and all other traffic use the direct connection.

---

## Provider: Private Internet Access (PIA)

### Endpoint

| Setting | Value |
|---------|-------|
| Hostname | `proxy-nl.privateinternetaccess.com` |
| Port | `1080` |
| Protocol | SOCKS5 (TCP) |
| Region | Netherlands (only region available for standalone SOCKS5) |

PIA does **not** offer per-city SOCKS5 hostnames (`proxy-us`, `proxy-ca`, etc.). The Netherlands endpoint is the only one. For a different geographic exit, use PIA's full VPN tunnel via the desktop app.

### Credentials

SOCKS5 credentials are **not** the same as PIA VPN login credentials. Generate them at:

**PIA Client Control Panel -> Downloads tab -> SOCKS username/password**

Usernames typically start with `x...`. Store in `.env`:

```
BUYING_SOCKS5_PROXY_USER=x1234567
BUYING_SOCKS5_PROXY_PASSWORD=yourSocksPassword
```

### IP pool

`proxy-nl.privateinternetaccess.com` resolves to two clusters (observed April 2026):

- `109.201.152.161–179` (19 IPs)
- `77.247.181.209–219` (11 IPs)

Egress IP may differ from the proxy IP you connect to (e.g., connect to `109.201.152.161`, egress as `77.247.181.212`). This is normal.

---

## `.env` settings

All settings are in the root `.env` (gitignored). Defaults in `.env.example`.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `BUYING_SOCKS5_PROXY_ENABLED` | bool | `False` | Master switch. When `False`, all B-Stock calls go direct. |
| `BUYING_SOCKS5_PROXY_HOST` | str | — | Proxy hostname (e.g., `proxy-nl.privateinternetaccess.com`). |
| `BUYING_SOCKS5_PROXY_PORT` | str | — | Proxy port (e.g., `1080`). |
| `BUYING_SOCKS5_PROXY_USER` | str | — | SOCKS5 username (PIA-specific, not VPN login). |
| `BUYING_SOCKS5_PROXY_PASSWORD` | str | — | SOCKS5 password. |
| `BUYING_SOCKS5_PROXY_IP` | str | — | Optional resolved IP of the proxy host. Overrides hostname in the proxy URL. Use when hostname resolution itself is unreliable. |
| `BUYING_SOCKS5_LOCAL_DNS` | bool | `True` | **`True` (recommended for PIA):** `socks5://` — client resolves DNS, hands IP to proxy. **`False`:** `socks5h://` — proxy resolves DNS (fails on PIA with 0x04). |
| `BUYING_SOCKS5_DEV_AUDIT` | bool | `False` | Log redacted proxy URL per request + periodic egress IP to `logs/bstock_api.log`. |
| `BUYING_SOCKS5_EGRESS_PROBE_SECONDS` | float | `45` | Minimum seconds between egress IP probes (throttle). |

### Minimal working config

```ini
BUYING_SOCKS5_PROXY_ENABLED=True
BUYING_SOCKS5_PROXY_HOST=proxy-nl.privateinternetaccess.com
BUYING_SOCKS5_PROXY_PORT=1080
BUYING_SOCKS5_PROXY_USER=x1234567
BUYING_SOCKS5_PROXY_PASSWORD=yourSocksPassword
BUYING_SOCKS5_LOCAL_DNS=True
BUYING_SOCKS5_DEV_AUDIT=True
```

---

## `socks5://` vs `socks5h://` (critical for PIA)

| Scheme | DNS resolution | PIA behavior |
|--------|---------------|--------------|
| `socks5://` | **Client** resolves hostname, sends IP to proxy | **Works.** Recommended. |
| `socks5h://` | **Proxy** resolves hostname | **Fails** with `0x04 Host unreachable`. PIA's internal DNS resolver is unreliable. |

Set `BUYING_SOCKS5_LOCAL_DNS=True` for `socks5://`. This is the known-working path confirmed by diagnostic testing.

---

## How it works in the scraper

`apps/buying/services/scraper.py` — `_request_json` is the single HTTP gateway for all B-Stock calls.

1. Before each request, `_bstock_socks5_proxies_for_url(url)` checks:
   - Is `BUYING_SOCKS5_PROXY_ENABLED` true?
   - Is the URL a `*.bstock.com` host?
   - If both, `_build_bstock_socks5_proxies_dict()` builds the proxy dict.
2. The proxy dict uses `BUYING_SOCKS5_PROXY_IP` (if set) or `BUYING_SOCKS5_PROXY_HOST`, with scheme from `BUYING_SOCKS5_LOCAL_DNS`.
3. `requests.get/post(..., proxies=proxy_dict)` routes through SOCKS5.
4. If `BUYING_SOCKS5_DEV_AUDIT` is on, each request logs the redacted proxy URL and periodically probes `api.ipify.org` through the same proxy to record the egress IP.

---

## Diagnostic script

**`workspace/tests/socks5_egress_probe.py`** — standalone 6-step diagnostic. Changes process `cwd` to the repo root and loads **`.env`** via **`python-decouple`** (same keys as `ecothrift/settings.py`; **no Django import**).

### Usage

```bash
# Basic (Steps 1, 3, 4, 5):
python workspace/tests/socks5_egress_probe.py

# With direct IP comparison:
python workspace/tests/socks5_egress_probe.py --compare-direct

# Full diagnostic including B-Stock GET over SOCKS:
python workspace/tests/socks5_egress_probe.py --compare-direct --bstock

# Test even when BUYING_SOCKS5_PROXY_ENABLED=False:
python workspace/tests/socks5_egress_probe.py --ignore-enabled
```

### Steps

| Step | What | Expected |
|------|------|----------|
| 1 | Resolve proxy hostname to IPs | PASS (~30 IPs) |
| 2 | Direct egress (no proxy) — `--compare-direct` | PASS (your real IP) |
| 3 | `socks5://` + hostname (LOCAL_DNS=True path) | **PASS** — scraper uses this |
| 4 | `socks5://` + resolved IP | PASS (Grok's recommendation) |
| 5 | `socks5h://` + hostname (LOCAL_DNS=False path) | **FAIL** expected on PIA (0x04) |
| 6 | B-Stock GET — `--bstock` | PASS (HTTP response; any 2xx/3xx/4xx means SOCKS reached host) |

The summary line identifies which step matches the scraper's current `.env` config and whether that step passed.

---

## Heroku (production)

**PySocks** is already in `requirements.txt` — the Heroku **slug** installs it; no extra build step.

**Config vars are not automatic.** Set them on the app (Dashboard → Settings → Config Vars, or CLI). Names match `.env` / `.env.example` (`BUYING_SOCKS5_*`).

### Policy

- **SOCKS5 is optional** — toggle with `BUYING_SOCKS5_PROXY_ENABLED` without redeploying.
- **Recommended default on Heroku:** enable SOCKS (`True`) when PIA credentials are configured, so B-Stock traffic uses the proxy. If the proxy is unreachable, set `BUYING_SOCKS5_PROXY_ENABLED=False` — the scraper falls back to **direct** HTTPS for `*.bstock.com` (no silent retry inside a single request).

### Example `heroku config:set` (replace secrets; app name may differ)

```bash
heroku config:set BUYING_SOCKS5_PROXY_ENABLED=True -a ecothrift-dashboard
heroku config:set BUYING_SOCKS5_PROXY_HOST=proxy-nl.privateinternetaccess.com -a ecothrift-dashboard
heroku config:set BUYING_SOCKS5_PROXY_PORT=1080 -a ecothrift-dashboard
heroku config:set BUYING_SOCKS5_PROXY_USER=xYOUR_PIA_SOCKS_USER -a ecothrift-dashboard
heroku config:set BUYING_SOCKS5_PROXY_PASSWORD=YOUR_PIA_SOCKS_PASSWORD -a ecothrift-dashboard
# Optional: match scraper defaults (code default is True as of 2026-04; set explicitly if unsure)
heroku config:set BUYING_SOCKS5_LOCAL_DNS=True -a ecothrift-dashboard
```

Optional: `BUYING_SOCKS5_PROXY_IP`, `BUYING_SOCKS5_DEV_AUDIT`, `BUYING_SOCKS5_EGRESS_PROBE_SECONDS`.

### Post-deploy smoke

1. **Probe** (uses same config vars on the dyno):

   ```bash
   heroku run python workspace/tests/socks5_egress_probe.py --bstock -a ecothrift-dashboard
   ```

2. **Scheduled sweep** (hits B-Stock via `scraper` — optional `--dry-run` to avoid DB writes from discovery):

   ```bash
   heroku run python manage.py scheduled_sweep --dry-run -a ecothrift-dashboard
   ```

3. **Logs** — with `BUYING_SOCKS5_DEV_AUDIT=True`, tail `logs/bstock_api.log` on the dyno is not persistent across one-off runs; use **`heroku logs --tail`** for web/worker output, or rely on probe + sweep success.

### Fallback

- **PIA SOCKS unreachable from Heroku:** set `BUYING_SOCKS5_PROXY_ENABLED=False` — direct B-Stock until fixed.
- **B-Stock blocks datacenter / Heroku egress even through SOCKS:** consider running sweep from a trusted local machine and a **push-to-API** pattern (not built here); see [`.ai/initiatives/bstock_auction_intelligence.md`](../initiatives/bstock_auction_intelligence.md) open questions.

---

## Troubleshooting

### `0x05 Authentication failed`

Wrong credentials. PIA SOCKS5 uses **dedicated** credentials, not VPN login. Regenerate at PIA Client Control Panel -> Downloads -> SOCKS.

### `0x04 Host unreachable`

Almost always caused by `socks5h://` (remote DNS). Fix: set `BUYING_SOCKS5_LOCAL_DNS=True`. If still failing:

1. Try `BUYING_SOCKS5_PROXY_IP` with a resolved IP from `nslookup proxy-nl.privateinternetaccess.com`.
2. Regenerate SOCKS credentials (they can go stale).
3. Check if PIA's NL cluster has a temporary routing issue — wait and retry.

### Connection timeout

PIA SOCKS5 does not require the desktop VPN app. If timing out:

1. Verify port 1080 is not blocked by firewall.
2. Try a different resolved IP in `BUYING_SOCKS5_PROXY_IP`.
3. Check PIA status page for outages.

### Verifying proxy usage

With `BUYING_SOCKS5_DEV_AUDIT=True`, check `logs/bstock_api.log`:

```
2026-04-15 18:07:20 | B-Stock SOCKS5 route | POST search.bstock.com/... | socks5://x1234567:***@proxy-nl...:1080
2026-04-15 18:07:22 | B-Stock SOCKS5 egress IP (public, via api.ipify.org): 77.247.181.212
2026-04-15 18:07:22 | POST search.bstock.com/... | auth=none | 200 | 1865ms
```

If the egress IP matches your home/office IP, the proxy is not working.

---

## Limitations

- **Single region:** PIA SOCKS5 is Netherlands only. No city selection.
- **No per-request IP rotation:** Same connection may reuse the same exit IP. DNS round-robin gives some rotation across connections.
- **Unencrypted outer layer:** PIA SOCKS5 traffic is not tunnel-encrypted (PIA's own warning). Since all B-Stock calls are HTTPS, the payload is TLS-protected; only connection metadata (destination IP/port) is visible to PIA.
- **Not a residential proxy:** Exit IPs are datacenter IPs in PIA's ASN. Targets that block datacenter ranges could still block them, though B-Stock does not currently do this.

---

## Dependencies

- **`PySocks`** — Python SOCKS support for `requests`. Install: `pip install requests[socks]` (or `pip install PySocks`). Already in `requirements.txt`.

---

*See also: [`.ai/extended/bstock.md`](bstock.md) (scraper API surface), [`apps/buying/services/scraper.py`](../../apps/buying/services/scraper.py), [`.env.example`](../../.env.example).*

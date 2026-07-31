# Online Sales email setup (retail@ecothrift.us)

**Do not change DNS until Bill reviews.** Overnight only prepared this checklist.

## Goal

- **Send** transactional mail (sign-in link, hold confirmed, you have a reply) as:
  - From: `Eco-Thrift <retail@ecothrift.us>`
  - Reply-To: `retail@ecothrift.us`
- **Receive** customer replies in the existing Microsoft 365 mailbox `retail@ecothrift.us`.
- Prefer a **transactional provider** for send (G9 default) over M365 SMTP (basic auth retirement).

App settings (already in code):

| Setting | Default |
|---------|---------|
| `ONLINE_SALES_EMAIL_FROM` | `retail@ecothrift.us` |
| `ONLINE_SALES_EMAIL_DISPLAY_NAME` | `Eco-Thrift` |
| `ONLINE_SALES_EMAIL_REPLY_TO` | `retail@ecothrift.us` |
| `ONLINE_SALES_PUBLIC_BASE_URL` | `https://ecothrift.us` (links in emails) |
| `EMAIL_BACKEND` | console (local) |

### Local development

Magic-link and hold emails embed `ONLINE_SALES_PUBLIC_BASE_URL`. For a clickable local link, set in `.env`:

```text
ONLINE_SALES_PUBLIC_BASE_URL=http://localhost:5174
```

With `DEBUG=True`, the magic-link request API also returns `debug_token`, and the public Sign-in page shows a **Continue with debug link** button so you can sign in without relying on the emailed URL.

## Current DNS (overnight could not resolve)

Public DNS lookup from the overnight agent timed out. Bill should run:

```text
nslookup -type=TXT ecothrift.us
nslookup -type=MX ecothrift.us
nslookup -type=TXT _dmarc.ecothrift.us
```

Record the **current SPF** (`v=spf1 …`) here before editing:

```text
CURRENT_SPF: (paste)
```

Microsoft 365 typically includes something like `include:spf.protection.outlook.com`.

## WARNING — SPF append, never replace

**Bold rule:** when adding a transactional provider, **append** its `include:` to the existing SPF TXT record.  
**Replacing** the Microsoft `include:` will break staff @ecothrift.us mail authentication.

Example shape (placeholders only):

```text
v=spf1 include:spf.protection.outlook.com include:PROVIDERSEND.spf.example.com -all
```

Stay under **10 DNS lookups** in the SPF chain.

## DKIM (provider placeholders)

After the provider is chosen, add the CNAMEs they give you (names are examples):

| Host | Type | Value |
|------|------|-------|
| `s1._domainkey.ecothrift.us` | CNAME | `(provider value)` |
| `s2._domainkey.ecothrift.us` | CNAME | `(provider value)` |

Also ensure Microsoft 365 DKIM remains enabled for the domain if staff mail uses it.

## Suggested DMARC

If `_dmarc.ecothrift.us` is empty, start monitoring-only:

```text
v=DMARC1; p=none; rua=mailto:retail@ecothrift.us; fo=1
```

Tighten to `p=quarantine` later after SPF/DKIM align for both M365 and the provider.

## Ordered checklist for Bill

1. Paste current SPF / MX / DMARC into this doc.
2. Decide provider (G9) — Resend / Postmark / SES / etc. **Do not sign up overnight.**
3. Create sending domain `ecothrift.us` (or subdomain `mail.ecothrift.us` if preferred) in the provider.
4. **Append** provider SPF include; never delete Microsoft’s include.
5. Add DKIM CNAMEs from the provider.
6. Confirm DMARC exists (`p=none` first).
7. Set Heroku config: `EMAIL_BACKEND`, provider credentials, keep `ONLINE_SALES_EMAIL_*` pointing at retail@.
8. Run: `python manage.py check_email_config --to you@ecothrift.us`
9. Confirm message From/Reply-To and that replies land in `retail@`.
10. Only then flip real customer traffic.

## Local / staging verification (safe anytime)

```text
python manage.py check_email_config
python manage.py check_email_config --to your@address
```

With the console backend, `--to` still “sends” to the console/outbox without touching DNS.

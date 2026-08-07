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

**There is no debug bypass.** The customer APIs never return the raw magic-link
token in any environment, and the public pages have no "continue with debug link"
button — confirming an email always means clicking the emailed link, so local
testing exercises the real path.

Two ways to get that link locally:

| `MS_GRAPH_ENABLED` | Where the link goes |
|--------------------|---------------------|
| `true` (current local default) | Real email from `retail@ecothrift.us` to the address you signed up with. Links still point at `localhost:5174`. |
| `false` | Nothing is sent; the console email backend prints the whole message, link included, to the Django terminal. |

Graph needs `msal` in the venv (`pip install -r requirements.txt`) plus the
`MS_GRAPH_*` credentials in `.env`.

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

## Microsoft 365 Graph two-way mailbox

Release 3 uses one mailbox, `retail@ecothrift.us`, through Microsoft Graph
client credentials. Graph is controlled by `MS_GRAPH_ENABLED` and remains off
when the setting is absent.

### Entra app

1. In Microsoft Entra admin center, create a single-tenant app registration.
2. Create a client secret and record its value immediately.
3. Record the tenant ID, application (client) ID, and the **Enterprise
   Application** (service principal) object ID — not the app registration
   object ID.
4. **Do not** add Microsoft Graph application permissions `Mail.Read` /
   `Mail.ReadWrite` / `Mail.Send` and **do not** grant tenant-wide admin
   consent for those scopes. Entra grants are additive; an org-wide Graph
   mail grant would bypass the Exchange mailbox scope below.

### Restrict the app to retail@ with Exchange Online RBAC

Access is granted only via **RBAC for Applications** in Exchange Online
(Application Mail.Send / Application Mail.ReadWrite), scoped to
`retail@ecothrift.us`. Run these commands from Exchange Online PowerShell as
an Exchange administrator. Replace the angle-bracket values:

```powershell
Connect-ExchangeOnline

New-ServicePrincipal `
  -AppId "<CLIENT_ID>" `
  -ObjectId "<ENTERPRISE_APPLICATION_OBJECT_ID>" `
  -DisplayName "Eco-Thrift Dashboard Graph Mail"

New-ManagementScope `
  -Name "Eco-Thrift retail mailbox" `
  -RecipientRestrictionFilter "PrimarySmtpAddress -eq 'retail@ecothrift.us'"

New-ManagementRoleAssignment `
  -Name "Eco-Thrift retail Mail.ReadWrite" `
  -Role "Application Mail.ReadWrite" `
  -App "<ENTERPRISE_APPLICATION_OBJECT_ID>" `
  -CustomResourceScope "Eco-Thrift retail mailbox"

New-ManagementRoleAssignment `
  -Name "Eco-Thrift retail Mail.Send" `
  -Role "Application Mail.Send" `
  -App "<ENTERPRISE_APPLICATION_OBJECT_ID>" `
  -CustomResourceScope "Eco-Thrift retail mailbox"

Test-ServicePrincipalAuthorization `
  -Identity "<ENTERPRISE_APPLICATION_OBJECT_ID>" `
  -Resource "retail@ecothrift.us"
```

Confirm that the test lists only the intended application roles for the retail
mailbox. RBAC changes can take time to propagate.

### Application settings and verification

Set these Heroku config vars, leaving the kill switch false at first:

```text
MS_GRAPH_ENABLED=false
MS_GRAPH_TENANT_ID=<tenant-guid>
MS_GRAPH_CLIENT_ID=<application-client-guid>
MS_GRAPH_CLIENT_SECRET=<secret-value>
MS_GRAPH_MAILBOX=retail@ecothrift.us
```

After RBAC propagation, enable and verify:

```text
MS_GRAPH_ENABLED=true
python manage.py check_ms_graph
python manage.py check_ms_graph --to your-address@example.com
python manage.py sync_ms_mailbox
```

Schedule `python manage.py sync_ms_mailbox` at the desired polling interval.
The command stores the Graph delta cursor and is safe to rerun. Disable Graph
immediately by restoring `MS_GRAPH_ENABLED=false`; Django email then uses its
non-Graph backend and mailbox sync skips work. Microsoft Graph send does not
require an SPF record change.

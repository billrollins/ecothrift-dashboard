# Intake PO repair — recon and runbooks

Target POs:

| id  | order_number     |
|-----|------------------|
| 316 | AMZ0N-OQL-CCP4   |
| 317 | C5TC0-OM1-A8R3   |
| 318 | TRGET-O4U-QP68   |
| 319 | TRGET-O2R-1K40   |

## Local discovery (once)

1. Pull prod schema into local `ecothrift_v3` (`scripts/deploy/0_pull_prod_to_local.bat`).
2. Run premigrate recon → CSV:
   - SQL: [`premigrate/recon_intake_pos_pre_migrate.sql`](premigrate/recon_intake_pos_pre_migrate.sql)
   - See [`.ai/extended/sql/cli.md`](../../../extended/sql/cli.md) for `psql` flags.
3. `python manage.py migrate`
4. Run postmigrate recon → CSV:
   - SQL: [`postmigrate/recon_intake_pos_post_migrate.sql`](postmigrate/recon_intake_pos_post_migrate.sql)

## One clean rehearsal (local)

1. Pull prod again (clean slate).
2. `psql ... -v ON_ERROR_STOP=1 -f premigrate/repair_intake_pos_premigrate.sql`
3. `python manage.py migrate`
4. `python manage.py repair_intake_pipeline_pos --apply`
5. `python manage.py repair_intake_pipeline_pos --verify`

## Production (after deploy)

1. `heroku pg:psql -a ecothrift-dashboard -f premigrate/repair_intake_pos_premigrate.sql`
2. `heroku run python manage.py migrate -a ecothrift-dashboard`
3. `heroku run python manage.py repair_intake_pipeline_pos --apply -a ecothrift-dashboard`
4. `heroku run python manage.py repair_intake_pipeline_pos --verify -a ecothrift-dashboard`

Canonical repair logic (manifest denorm + deterministic PO fixes) lives in:

- `apps/inventory/services/intake_po_repair.py`
- `apps/inventory/management/commands/repair_intake_pipeline_pos.py`

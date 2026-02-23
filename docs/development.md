<!-- Last updated: 2026-02-16T10:31:19-06:00 -->
# Development Guide

## Prerequisites

- Python 3.12
- Node.js 20+
- PostgreSQL 15+

## First-Time Setup

```bash
# 1. Create and activate virtual environment
python -m venv venv
venv\Scripts\activate          # Windows
source venv/bin/activate       # macOS/Linux

# 2. Install Python dependencies
pip install -r requirements.txt

# 3. Create the database
psql -U postgres -c "CREATE DATABASE ecothrift_v2 OWNER postgres;"

# 4. Run migrations
python manage.py migrate

# 5. Seed initial data (groups, admin user, registers, settings)
python manage.py setup_initial_data

# 6. Install frontend dependencies
cd frontend
npm install

# 7. Start both servers (or use workspace/scripts/start-servers.bat)
# Terminal 1:
python manage.py runserver

# Terminal 2:
cd frontend
npm run dev
```

Open `http://localhost:5173`. Login: `bill_rollins@ecothrift.us` / `JAckel13`

## Quick Scripts

Drag-and-drop these from `workspace/scripts/`:

| Script | What it does |
|--------|-------------|
| `start-servers.bat` | Kills old ports, starts Django + Vite in separate windows |
| `kill-servers.bat` | Stops Django (8000) and Vite (5173) |
| `migrate.bat` | makemigrations + migrate |
| `seed-data.bat` | Run setup_initial_data |
| `reset-db.bat` | Drop + recreate DB (with confirmation) |

## Environment Variables

Defined in `.env` (gitignored):

| Variable | Description | Default |
|----------|-------------|---------|
| `SECRET_KEY` | Django secret key | (generated) |
| `DEBUG` | Debug mode | `True` |
| `ENVIRONMENT` | Runtime environment label | `development` |
| `DATABASE_NAME` | PostgreSQL database name | `ecothrift_v2` |
| `DATABASE_USER` | PostgreSQL user | `postgres` |
| `DATABASE_PASSWORD` | PostgreSQL password | `password` |
| `DATABASE_HOST` | PostgreSQL host | `localhost` |
| `DATABASE_PORT` | PostgreSQL port | `5432` |
| `USE_S3` | Toggle S3-backed media storage | `False` (set `True` when using S3) |
| `AWS_ACCESS_KEY_ID` | S3 access key | — |
| `AWS_SECRET_ACCESS_KEY` | S3 secret key | — |
| `AWS_STORAGE_BUCKET_NAME` | S3 bucket name | — |
| `AWS_S3_REGION_NAME` | S3 region | `us-east-2` |
| `ALLOWED_HOSTS` | Comma-separated hosts | `localhost,127.0.0.1` |
| `ANTHROPIC_API_KEY` | Optional AI integration key | — |

## Adding a New Feature

### Backend

1. Add model to the appropriate `apps/*/models.py`
2. Run `python manage.py makemigrations` + `migrate`
3. Add serializer in `apps/*/serializers.py`
4. Add ViewSet or view in `apps/*/views.py`
5. Register URL in `apps/*/urls.py`
6. Register model in `apps/*/admin.py`

### Frontend

1. Add TypeScript types in `frontend/src/types/`
2. Add API functions in `frontend/src/api/`
3. Add React Query hooks in `frontend/src/hooks/`
4. Create page component in `frontend/src/pages/`
5. Add route in `App.tsx`
6. Add sidebar nav item in `Sidebar.tsx` (if needed)

## Code Conventions

- **Backend:** ViewSets + DRF Routers for standard CRUD. `@action` for custom endpoints.
- **Frontend:** One API file per backend app. One hook file per domain. Pages are default exports.
- **State:** TanStack React Query for server state. React Context for auth only. No Redux.
- **Forms:** React Hook Form for complex forms. Controlled inputs for simple ones.
- **Tables:** MUI X DataGrid for all data tables. `pageSizeOptions={[10, 25, 50, 100]}`.
- **Notifications:** `useSnackbar()` from notistack for success/error toasts.

## Deployment (Heroku)

```bash
# Procfile handles:
#   release: python manage.py migrate && python manage.py createcachetable
#   web: gunicorn ecothrift.wsgi --bind 0.0.0.0:$PORT

# Root package.json heroku-postbuild script builds the frontend
# WhiteNoise serves static files from frontend/dist/
# Production settings: ecothrift/settings_production.py
```

Set `DJANGO_SETTINGS_MODULE=ecothrift.settings_production` on Heroku.

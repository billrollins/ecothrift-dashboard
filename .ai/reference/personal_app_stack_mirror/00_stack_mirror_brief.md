# Personal Web App — Stack Mirror Brief (Local Only)

**Audience:** Another AI building a personal web app for Bill.  
**Goal:** Mirror Eco-Thrift Dashboard (Django + Postgres + Vite + React/TS + LLM router), **local-only**.

## Stack

| Layer | Choice |
|-------|--------|
| Backend | Python 3.12, Django 5.2, DRF, simplejwt |
| DB | PostgreSQL 15+ via root `.env` `DATABASE_*` |
| Frontend | Vite 7, React 18, TypeScript, MUI v7, React Query, Axios |
| AI | One `llm_router`; purpose → `AI_MODEL_<PURPOSE>` → provider by model id |
| Ports | Django `:8000`, Vite `:5173` |

## Layout

Repo root: `manage.py`, `apps/`, `.env`. Frontend: `frontend/`. Vite `envDir` = repo root; proxy `/api` → Django.

## Postgres

```bash
psql -U postgres -c "CREATE DATABASE myapp_dev OWNER postgres;"
```

New apps can use `public` schema (Eco-Thrift’s `search_path=ecothrift` is optional).

## AI rules

1. One router — no provider SDKs in feature code  
2. Keys only in `.env`  
3. Log usage to `workspace/logs/ai_usage.jsonl`  
4. Optional proxy: `GET /api/ai/models/`, `POST /api/ai/chat/`  
5. Frontend never holds provider keys  

## Feature checklist

Backend: model → migrate → serializer → view → urls  
Frontend: types → api → hooks → page → route  

## Skip for now

Heroku, S3, print server, multi-DB archives.

See also: `docs/env_and_ai.md`, `source_patterns/`.

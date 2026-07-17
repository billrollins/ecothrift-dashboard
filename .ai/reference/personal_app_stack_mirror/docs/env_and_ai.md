# Environment + AI knobs (personal app)

## Required Postgres + Django

```env
SECRET_KEY=dev-only-change-me
DEBUG=True
ENVIRONMENT=development
ALLOWED_HOSTS=localhost,127.0.0.1
DATABASE_NAME=myapp_dev
DATABASE_USER=postgres
DATABASE_PASSWORD=password
DATABASE_HOST=localhost
DATABASE_PORT=5432
```

## AI

```env
ANTHROPIC_API_KEY=
XAI_API_KEY=
GOOGLE_API_KEY=
XAI_API_BASE=https://api.x.ai/v1
AI_PROVIDER=auto
AI_MODEL=claude-sonnet-4-6
AI_MODEL_FAST=claude-haiku-4-5
AI_MODEL_AI_CHAT=claude-sonnet-4-6
```

Provider routing: `grok*` → xAI, `gemini*` → Google, else Anthropic.  
Usage log: `workspace/logs/ai_usage.jsonl`. Keys never in the frontend.

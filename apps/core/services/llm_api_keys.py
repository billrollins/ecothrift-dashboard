"""Resolve LLM API keys from Django settings (.env / Heroku config vars only)."""

from __future__ import annotations

from django.conf import settings


def resolve_anthropic_api_key() -> str:
    return str(getattr(settings, "ANTHROPIC_API_KEY", "") or "").strip()


def resolve_xai_api_key() -> str:
    return str(getattr(settings, "XAI_API_KEY", "") or "").strip()


def resolve_google_api_key() -> str:
    key = str(getattr(settings, "GOOGLE_API_KEY", "") or "").strip()
    if key:
        return key
    return str(getattr(settings, "GEMINI_API_KEY", "") or "").strip()


def api_key_status() -> dict[str, dict[str, str | bool]]:
    """Present/missing only - never returns secret values."""
    return {
        "anthropic": {
            "ok": bool(resolve_anthropic_api_key()),
            "source": "ANTHROPIC_API_KEY in .env" if resolve_anthropic_api_key() else "missing",
        },
        "xai": {
            "ok": bool(resolve_xai_api_key()),
            "source": (
                "XAI_API_KEY or GROK_API_KEY in .env"
                if resolve_xai_api_key()
                else "missing"
            ),
        },
        "google": {
            "ok": bool(resolve_google_api_key()),
            "source": (
                "GOOGLE_API_KEY or GEMINI_API_KEY in .env"
                if resolve_google_api_key()
                else "missing"
            ),
        },
    }

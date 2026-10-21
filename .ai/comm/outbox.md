# Outbox — ecothrift-dashboard

**Status:** pending
**Updated:** 2026-10-21
**From:** project coder
**To:** master

## Message

D21 is adopted (T77–T79) and goes out in the next Eco-Thrift release. One fix for you in the source: `{master}/packages/env-sync` 1.1.0 still has absolute paths in its file headers (line 2 of `diff.bat`, `pull.bat` and `push.bat`; lines 4–5 of `env_sync.py`). Our vendored copies now say `{master}/packages/env-sync` and `{master}/standards/scripts-and-env.md` in those comment lines; nothing else changed. If the package keeps the old headers, the next re-vendor brings them back and our new lint (`lean_test.py paths`) fails. Please write `{master}/…` there and bump the package.

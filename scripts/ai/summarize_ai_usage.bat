@echo off
REM Summarize workspace/logs/ai_usage.jsonl. Interactive clear: 0=no, 1=older than 7d, 2=all,
REM 3=keep N America/Chicago calendar days (0=today only, 1=today+yesterday, ...).
python "%~dp0summarize_ai_usage.py" %*

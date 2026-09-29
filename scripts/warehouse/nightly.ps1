#Requires -Version 5.1
# Nightly Analytical layer (data_platform Phase 4): pull production into the local copy, then rebuild
# the warehouse. Run by Windows Task Scheduler on the owner's PC (the Linux server later).
# Note: the pull REPLACES the local database, so local test setups (a test register, test members) go.
# Log: workspace\warehouse\nightly.log. Exit code 1 when the pull or a warehouse check fails.
$ErrorActionPreference = 'Continue'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Log = Join-Path $Root 'workspace\warehouse\nightly.log'
New-Item -ItemType Directory -Force (Split-Path $Log) | Out-Null
function Say($t) { "$(Get-Date -Format s)  $t" | Tee-Object -FilePath $Log -Append }

Say 'pull production -> local'
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root 'scripts\deploy\helpers\0_pull_prod_to_local.ps1') *>> $Log
if ($LASTEXITCODE -ne 0) { Say "pull FAILED ($LASTEXITCODE); warehouse not rebuilt"; exit 1 }

Say 'build warehouse'
$env:PYTHONIOENCODING = 'utf-8'
& (Join-Path $Root 'venv\Scripts\python.exe') -m warehouse.build *>> $Log
$code = $LASTEXITCODE
Say $(if ($code -eq 0) { 'done: GREEN' } else { 'done: RED (see the checks above)' })
exit $code

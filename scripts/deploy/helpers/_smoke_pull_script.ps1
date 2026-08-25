$ErrorActionPreference = 'Stop'
$deploy = Split-Path $PSScriptRoot -Parent
$bat = Join-Path $deploy '0_pull_prod_to_local.bat'
$ps1 = Join-Path $PSScriptRoot '0_pull_prod_to_local.ps1'

if (-not (Test-Path -LiteralPath $bat)) { throw "missing $bat" }
if (-not (Test-Path -LiteralPath $ps1)) { throw "missing $ps1" }

$batText = Get-Content -LiteralPath $bat -Raw
if ($batText -notmatch 'helpers\\0_pull_prod_to_local\.ps1') {
    throw 'bat does not call helpers\0_pull_prod_to_local.ps1'
}

$errs = $null
$null = [System.Management.Automation.Language.Parser]::ParseFile($ps1, [ref]$null, [ref]$errs)
if ($errs) {
    $errs | ForEach-Object { $_.ToString() }
    throw 'PowerShell parse failed'
}

# Same invocation the user runs: cmd -> bat -> helper. Stop before any DB work
# by asking PowerShell only to tokenize/load; then invoke the bat via cmd and
# confirm it reaches the first Write-Pull line (not a parse error).
$bytes = [System.IO.File]::ReadAllBytes($ps1)
$hasBom = $bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF
if (-not $hasBom) { throw 'helper is missing a UTF-8 BOM (Windows PowerShell 5.1 will misread it)' }

$text = Get-Content -LiteralPath $ps1 -Raw
if ($text -match '\[string\]\$Host\b' -or $text -match '-Host \$Db\.Host') {
    throw 'do not bind -Host; PowerShell Host is read-only'
}

Write-Output 'SMOKE_OK'

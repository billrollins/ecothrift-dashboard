#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$HelperDir = $PSScriptRoot
$DeployDir = (Resolve-Path (Join-Path $HelperDir '..')).Path
$Root = (Resolve-Path (Join-Path $DeployDir '..\..')).Path
$BackupDir = Join-Path $DeployDir 'backups'
$VenvPy = Join-Path $Root 'venv\Scripts\python.exe'
$DevPs1 = Join-Path $Root 'scripts\dev\dev.ps1'

$Db = @{
    Name     = 'ecothrift_v3'
    User     = 'postgres'
    Password = 'password'
    Host     = 'localhost'
    Port     = '5432'
}

function Write-Pull($Text) { Write-Host $Text }
function Write-Ok($Text) { Write-Host "       $Text" }

function Get-EnvFileValues {
    param([string]$Path)
    $out = @{}
    if (-not (Test-Path $Path)) { return $out }
    foreach ($raw in Get-Content -LiteralPath $Path) {
        $line = $raw.Trim()
        if (-not $line -or $line.StartsWith('#')) { continue }
        $eq = $line.IndexOf('=')
        if ($eq -lt 1) { continue }
        $key = $line.Substring(0, $eq).Trim()
        $val = $line.Substring($eq + 1).Trim().Trim('"').Trim("'")
        $out[$key] = $val
    }
    return $out
}

function Test-Cmd($Name) {
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

# heroku writes "update available" to stderr. PowerShell 5.1 + Stop treats that
# as a terminating error even when stderr is redirected.
function Invoke-Heroku {
    param([Parameter(Mandatory)][string[]]$HerokuArgs)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $raw = & heroku @HerokuArgs 2>&1
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prev
    }
    $lines = @(
        $raw | ForEach-Object { "$_" } |
            Where-Object { $_ -and ($_ -notmatch 'Warning: heroku update available') }
    )
    return @{ ExitCode = $code; Output = $lines }
}

function Invoke-Native {
    param(
        [Parameter(Mandatory)][string]$File,
        [string[]]$NativeArgs = @()
    )
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & $File @NativeArgs 2>&1
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prev
    }
    return @{ ExitCode = $code; Output = $output }
}

function Invoke-Psql {
    param([string]$Sql, [switch]$Tuples)
    $env:PGPASSWORD = $Db.Password
    $psqlArgs = @(
        '-h', $Db.Host, '-p', $Db.Port, '-U', $Db.User, '-d', $Db.Name,
        '-v', 'ON_ERROR_STOP=1'
    )
    if ($Tuples) { $psqlArgs += @('-tAc', $Sql) } else { $psqlArgs += @('-c', $Sql) }
    $result = Invoke-Native -File 'psql' -NativeArgs $psqlArgs
    if ($result.ExitCode -ne 0) {
        throw ($result.Output | Out-String)
    }
    return $result.Output
}

function Invoke-PgDumpSchema {
    param([string]$OutFile, [string]$DbHost, [string]$Port, [string]$User, [string]$Database, [string]$Password)
    $env:PGPASSWORD = $Password
    $result = Invoke-Native -File 'pg_dump' -NativeArgs @(
        '--no-owner', '--no-acl', '-F', 'c', '--schema=ecothrift',
        '-h', $DbHost, '-p', $Port, '-U', $User, '-d', $Database, '-f', $OutFile
    )
    if ($result.ExitCode -ne 0) { throw "pg_dump failed (exit $($result.ExitCode))" }
}

Write-Pull '========================================'
Write-Pull '  ECOTHRIFT - PULL PRODUCTION ecothrift SCHEMA ONLY'
Write-Pull '  Does NOT touch local public, darkhorse, heroku_ext, etc.'
Write-Pull '========================================'
Write-Pull ''
Write-Pull '  Stops local servers, replaces schema ecothrift with production,'
Write-Pull '  then applies this checkout extra migrations.'
Write-Pull ''

Write-Pull '[Preflight] Tools, venv, Heroku login...'
foreach ($cmd in @('heroku', 'pg_dump', 'pg_restore', 'psql')) {
    if (-not (Test-Cmd $cmd)) { throw "$cmd is not on PATH." }
}
if (-not (Test-Path -LiteralPath $VenvPy)) { throw "venv not found at $VenvPy" }

$who = Invoke-Heroku -HerokuArgs @('auth:whoami')
if ($who.ExitCode -ne 0 -or -not $who.Output) { throw 'Not logged into Heroku CLI. Run: heroku login' }
Write-Ok "Logged in as: $($who.Output | Select-Object -First 1)"
Write-Ok "Using $VenvPy"

$envFile = Get-EnvFileValues (Join-Path $Root '.env')
foreach ($key in @('DATABASE_NAME', 'DATABASE_USER', 'DATABASE_PASSWORD', 'DATABASE_HOST', 'DATABASE_PORT')) {
    if ($envFile.ContainsKey($key) -and $envFile[$key]) {
        $short = $key.Substring('DATABASE_'.Length)
        $map = @{ NAME = 'Name'; USER = 'User'; PASSWORD = 'Password'; HOST = 'Host'; PORT = 'Port' }
        $Db[$map[$short]] = $envFile[$key]
    }
}
if ($Db.Host -notin @('localhost', '127.0.0.1')) {
    throw "DATABASE_HOST=$($Db.Host) - this script only writes to localhost / 127.0.0.1."
}
Write-Ok "Local target: $($Db.User)@$($Db.Host):$($Db.Port)/$($Db.Name) schema ecothrift"
Write-Pull ''

Write-Pull '[Stop] Freeing ports 8000 / 5173 / 5174...'
& powershell -NoProfile -ExecutionPolicy Bypass -File $DevPs1 -Stop
if ($LASTEXITCODE -ne 0) { throw 'Could not stop the local servers.' }
Write-Pull ''

if (-not (Test-Path -LiteralPath $BackupDir)) { New-Item -ItemType Directory -Path $BackupDir | Out-Null }
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$localDump = Join-Path $BackupDir "local_ecothrift_before_pull_$stamp.dump"
$prodDump = Join-Path $BackupDir "prod_ecothrift_schema_$stamp.dump"

Write-Pull '[Local backup] Dumping current schema ecothrift...'
$hasLocal = $null
try {
    $hasLocal = (Invoke-Psql -Tuples "SELECT 1 FROM information_schema.schemata WHERE schema_name='ecothrift'" | Select-Object -First 1).ToString().Trim()
} catch {
    $hasLocal = ''
}
if ($hasLocal -eq '1') {
    Invoke-PgDumpSchema -OutFile $localDump -DbHost $Db.Host -Port $Db.Port -User $Db.User -Database $Db.Name -Password $Db.Password
    Write-Ok "Saved $localDump"
} else {
    Write-Ok 'No local ecothrift schema - skip rollback dump.'
    $localDump = $null
}
Write-Pull ''

Write-Pull '[Prod dump] Fetching DATABASE_URL and dumping schema ecothrift...'
$prodUrlLookup = Invoke-Heroku -HerokuArgs @('config:get', 'DATABASE_URL', '-a', 'ecothrift-dashboard')
$prodUrl = ($prodUrlLookup.Output | Select-Object -First 1)
if ($prodUrlLookup.ExitCode -ne 0 -or -not $prodUrl) { throw 'Could not fetch DATABASE_URL from Heroku.' }
$env:PGPASSWORD = $null
$prodDumpResult = Invoke-Native -File 'pg_dump' -NativeArgs @(
    '--no-owner', '--no-acl', '-F', 'c', '--schema=ecothrift', '-f', $prodDump, $prodUrl
)
if ($prodDumpResult.ExitCode -ne 0) {
    if (Test-Path -LiteralPath $prodDump) { Remove-Item -LiteralPath $prodDump -Force }
    throw 'pg_dump from production failed.'
}
Write-Ok "Saved $prodDump"
Write-Pull ''

Write-Pull '----------------------------------------'
Write-Pull '  Dropping local schema ecothrift and replacing with production.'
Write-Pull '  Local schemas NOT modified: public, darkhorse, heroku_ext, ...'
Write-Pull "  Local DB: $($Db.Name) ($($Db.Host))"
Write-Pull '----------------------------------------'
Write-Pull ''

Write-Pull "[Kick] Terminating other connections to $($Db.Name)..."
Invoke-Psql 'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid();' | Out-Null
Write-Pull ''

Write-Pull '[Drop] DROP SCHEMA ecothrift CASCADE...'
Invoke-Psql 'DROP SCHEMA IF EXISTS ecothrift CASCADE;' | Out-Host
Write-Ok 'Dropped.'
Write-Pull ''

Write-Pull '[Restore] Restoring prod dump...'
$env:PGPASSWORD = $Db.Password
$restore = Invoke-Native -File 'pg_restore' -NativeArgs @(
    '--no-owner', '--no-acl', '-h', $Db.Host, '-p', $Db.Port, '-U', $Db.User, '-d', $Db.Name, $prodDump
)
$restoreRc = $restore.ExitCode
$hasMigrations = ''
try {
    $hasMigrations = (Invoke-Psql -Tuples 'SELECT 1 FROM ecothrift.django_migrations LIMIT 1' | Select-Object -First 1).ToString().Trim()
} catch {
    $hasMigrations = ''
}
if ($hasMigrations -ne '1') {
    throw "Restore did not leave ecothrift.django_migrations (pg_restore exit $restoreRc). Half-schema - not migrating."
}
if ($restoreRc -ne 0) {
    Write-Ok "pg_restore exit $restoreRc - schema verified (index chatter is expected)."
} else {
    Write-Ok 'Restore completed.'
}
Write-Pull ''

Write-Pull '[Trigram] Ensuring pg_trgm indexes...'
Invoke-Psql 'CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA ecothrift;' | Out-Null
Invoke-Psql 'CREATE INDEX IF NOT EXISTS item_searchtext_trgm ON ecothrift.inventory_item USING gin (search_text ecothrift.gin_trgm_ops);' | Out-Null
Invoke-Psql 'CREATE INDEX IF NOT EXISTS po_searchtext_trgm ON ecothrift.inventory_purchaseorder USING gin (search_text ecothrift.gin_trgm_ops);' | Out-Null
Write-Ok 'Trigram search indexes ready.'
Write-Pull ''

Set-Location $Root
Write-Pull '[Plan] Migrations this checkout will apply on the prod snapshot...'
$plan = Invoke-Native -File $VenvPy -NativeArgs @('manage.py', 'showmigrations', '--plan')
$plan.Output | Out-Host
if ($plan.ExitCode -ne 0) { throw 'showmigrations --plan failed. Dumps kept. Schema is the prod snapshot - do not drop again.' }
Write-Pull ''

Write-Pull '[Migrate] Applying local migrations production has not seen...'
$migrate = Invoke-Native -File $VenvPy -NativeArgs @('manage.py', 'migrate')
$migrate.Output | Out-Host
if ($migrate.ExitCode -ne 0) { throw 'migrate failed. Dumps kept. Schema is the prod snapshot - do not drop again.' }
$left = Invoke-Native -File $VenvPy -NativeArgs @('manage.py', 'showmigrations', '--plan')
$unapplied = @($left.Output | Where-Object { "$_" -match '\[\s\]' })
if ($unapplied.Count -gt 0) {
    $unapplied | Out-Host
    throw 'migrate finished but unapplied migrations remain. Dumps kept.'
}
Write-Pull ''

Write-Pull '[Check] manage.py check...'
$check = Invoke-Native -File $VenvPy -NativeArgs @('manage.py', 'check')
$check.Output | Out-Host
if ($check.ExitCode -ne 0) { throw 'manage.py check failed. Dumps kept.' }
Write-Pull ''

Write-Pull '[Cleanup] Keeping the newest 3 local-before and prod-schema dumps...'
foreach ($pattern in @('local_ecothrift_before_pull_*.dump', 'prod_ecothrift_schema_*.dump')) {
    $files = @(Get-ChildItem -LiteralPath $BackupDir -Filter $pattern | Sort-Object LastWriteTime -Descending)
    if ($files.Count -gt 3) {
        $files | Select-Object -Skip 3 | ForEach-Object {
            Write-Ok "Deleting old dump: $($_.Name)"
            Remove-Item -LiteralPath $_.FullName -Force
        }
    }
}
Write-Pull ''

Write-Pull '========================================'
Write-Pull '  PULL COMPLETE (ecothrift schema only)'
Write-Pull '========================================'
Write-Pull ''
Write-Pull "  Local $($Db.Name): schema ecothrift is production data + local migrations."
Write-Pull ''

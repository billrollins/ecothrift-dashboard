<#
.SYNOPSIS
    Start the Eco-Thrift local stack (API + staff dash and/or public site).

.DESCRIPTION
    Runs preflight checks before launching anything, so a broken start tells you
    why instead of leaving dead windows behind:

      * Python / venv resolution
      * root .env present
      * database reachable and migrations applied (auto-applies by default)
      * node_modules present for the frontends being started (auto-installs when missing)

    Then it launches each server in its own window and waits until the ports
    actually answer, so "READY" means ready.

.PARAMETER Target
    Which frontends to start alongside Django:
      All    - staff dashboard (:5173) + public site (:5174)  [default]
      Staff  - staff dashboard only (dash.ecothrift)
      Public - public storefront only (www)

.PARAMETER Http
    Serve the staff dashboard as plain HTTP on localhost only. The default is
    HTTPS bound to the LAN so the same URL works from a phone. Ignored when
    -Target Public.

.PARAMETER Mobile
    Accepted for backwards compatibility. LAN HTTPS is now the default, so this
    switch does nothing.

.PARAMETER NoMigrate
    Report pending migrations but do not apply them.

.PARAMETER NoKill
    Do not free the target ports first. Start fails if they are taken.

.PARAMETER NoOpen
    Do not open browser tabs once the stack is up.

.PARAMETER Stop
    Stop the full stack (ports 8000 / 5173 / 5174) and exit.

.EXAMPLE
    .\dev.ps1
.EXAMPLE
    .\dev.ps1 -Target Staff
.EXAMPLE
    .\dev.ps1 -Target Public
.EXAMPLE
    .\dev.ps1 -Http
.EXAMPLE
    .\dev.ps1 -Stop
#>
[CmdletBinding()]
param(
    [ValidateSet('All', 'Staff', 'Public')]
    [string]$Target = 'All',
    [switch]$Http,
    [switch]$Mobile,
    [switch]$NoMigrate,
    [switch]$NoKill,
    [switch]$NoOpen,
    [switch]$Stop
)

$ErrorActionPreference = 'Stop'

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$ApiPort = 8000
$StaffPort = 5173
$PublicPort = 5174
$AllPorts = @($ApiPort, $StaffPort, $PublicPort)
$StartStaff = $Target -ne 'Public'
$StartPublic = $Target -ne 'Staff'
$Ports = @($ApiPort)
if ($StartStaff) { $Ports += $StaffPort }
if ($StartPublic) { $Ports += $PublicPort }

# ---------------------------------------------------------------- output helpers

function Write-Step { param([string]$Text) Write-Host "  $Text" -ForegroundColor Cyan }
function Write-Ok { param([string]$Text) Write-Host "  [ok]   $Text" -ForegroundColor Green }
function Write-Warn2 { param([string]$Text) Write-Host "  [warn] $Text" -ForegroundColor Yellow }
function Write-Bad { param([string]$Text) Write-Host "  [fail] $Text" -ForegroundColor Red }

function Write-Banner {
    param([string]$Text)
    Write-Host ''
    Write-Host ('=' * 62) -ForegroundColor DarkGray
    Write-Host "  $Text"
    Write-Host ('=' * 62) -ForegroundColor DarkGray
    Write-Host ''
}

# ---------------------------------------------------------------- port helpers

function Get-PortOwner {
    param([int]$Port)
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $conn) { return $null }
    $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
    return [pscustomobject]@{
        Pid  = $conn.OwningProcess
        Name = if ($proc) { $proc.ProcessName } else { 'unknown' }
    }
}

function Stop-Ports {
    param([int[]]$PortList)
    $killed = 0
    foreach ($p in $PortList) {
        $owner = Get-PortOwner -Port $p
        if ($owner) {
            Write-Step "port $p held by $($owner.Name) (pid $($owner.Pid)) - stopping"
            Stop-Process -Id $owner.Pid -Force -ErrorAction SilentlyContinue
            $killed++
        }
    }
    if ($killed -gt 0) {
        # Give Windows a moment to release the sockets.
        $deadline = (Get-Date).AddSeconds(10)
        while ((Get-Date) -lt $deadline) {
            $stillHeld = @($PortList | Where-Object { Get-PortOwner -Port $_ })
            if ($stillHeld.Count -eq 0) { break }
            Start-Sleep -Milliseconds 300
        }
    }
    return $killed
}

function Test-HttpOnce {
    param([string]$Url)
    try {
        Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3 | Out-Null
        return $true
    }
    catch {
        # Any HTTP status (404, 500, ...) still proves the server answered.
        return [bool]$_.Exception.Response
    }
}

function Get-LanIp {
    $addr = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -notlike '127.*' -and
            $_.IPAddress -notlike '169.254.*' -and
            $_.PrefixOrigin -ne 'WellKnown'
        } |
        Sort-Object @{ Expression = {
                if ($_.InterfaceAlias -match 'Wi-?Fi|Wireless') { 0 }
                elseif ($_.InterfaceAlias -match 'Ethernet') { 1 }
                else { 2 }
            }
        }, IPAddress |
        Select-Object -First 1
    if ($addr) { return $addr.IPAddress }
    return $null
}

# ---------------------------------------------------------------- -Stop

if ($Stop) {
    Write-Banner 'ECO-THRIFT DEV - STOP'
    $n = Stop-Ports -PortList $AllPorts
    if ($n -eq 0) { Write-Ok 'nothing was running' } else { Write-Ok "stopped $n process(es)" }
    Write-Host ''
    exit 0
}

# ---------------------------------------------------------------- preflight

$targetLabel = switch ($Target) {
    'Staff' { 'staff dashboard only' }
    'Public' { 'public site only' }
    default { 'full stack (staff + public)' }
}
Write-Banner "ECO-THRIFT DEV - PREFLIGHT ($targetLabel)"

# Python: prefer the repo venv so the stack matches installed deps.
$venvPython = Join-Path $Root 'venv\Scripts\python.exe'
$usingVenv = Test-Path $venvPython
$python = if ($usingVenv) { $venvPython } else { 'python' }

if ($usingVenv) {
    Write-Ok 'venv found - using venv\Scripts\python.exe'
}
else {
    Write-Warn2 'no venv\ - falling back to the python on PATH'
}

try {
    $pyVersion = (& $python --version 2>&1 | Out-String).Trim()
    Write-Ok $pyVersion
}
catch {
    Write-Bad 'python is not runnable. Install Python or create venv\.'
    exit 1
}

if (Test-Path (Join-Path $Root '.env')) {
    Write-Ok '.env present'
}
else {
    Write-Bad '.env missing at repo root - Django will not start. See .ai/extended/development.md for the required keys.'
    exit 1
}

# Database + migrations. `migrate --check` exits non-zero when anything is
# unapplied, and throws outright when the database is unreachable, so this one
# call covers both. Forgetting to migrate after a prod pull is the single most
# common way this stack comes up broken.
Push-Location $Root
try {
    $migrateCheck = & $python 'manage.py' 'migrate' '--check' 2>&1 | Out-String
    $migrateRc = $LASTEXITCODE

    if ($migrateRc -eq 0) {
        Write-Ok 'database reachable, migrations up to date'
    }
    elseif ($migrateCheck -match 'could not connect|Connection refused|does not exist|OperationalError') {
        Write-Bad 'cannot reach the database. Is Postgres running, and does .env point at the right DB?'
        Write-Host ''
        Write-Host $migrateCheck.Trim() -ForegroundColor DarkGray
        exit 1
    }
    elseif ($NoMigrate) {
        Write-Warn2 'unapplied migrations (left alone because -NoMigrate). Run: python manage.py migrate'
    }
    else {
        Write-Step 'unapplied migrations found - applying'
        & $python 'manage.py' 'migrate'
        if ($LASTEXITCODE -ne 0) {
            Write-Bad 'migrate failed - fix the migration before starting the stack.'
            exit 1
        }
        Write-Ok 'migrations applied'
    }
}
finally {
    Pop-Location
}

# Frontend deps. A missing node_modules is otherwise a confusing Vite crash.
$frontends = @()
if ($StartStaff) {
    $frontends += @{ Name = 'frontend'; Path = Join-Path $Root 'frontend' }
}
if ($StartPublic) {
    $frontends += @{ Name = 'frontend-public'; Path = Join-Path $Root 'frontend-public' }
}
foreach ($fe in $frontends) {
    if (Test-Path (Join-Path $fe.Path 'node_modules')) {
        Write-Ok "$($fe.Name)\node_modules present"
    }
    else {
        Write-Step "$($fe.Name)\node_modules missing - running npm install (this takes a minute)"
        Push-Location $fe.Path
        try {
            & npm install
            if ($LASTEXITCODE -ne 0) {
                Write-Bad "npm install failed in $($fe.Name)"
                exit 1
            }
        }
        finally {
            Pop-Location
        }
        Write-Ok "$($fe.Name) dependencies installed"
    }
}

# ---------------------------------------------------------------- free ports

Write-Banner 'STARTING'

if ($NoKill) {
    $taken = @($Ports | Where-Object { Get-PortOwner -Port $_ })
    if ($taken.Count -gt 0) {
        Write-Bad "ports already in use: $($taken -join ', ') (-NoKill was passed)"
        exit 1
    }
}
else {
    $n = Stop-Ports -PortList $Ports
    if ($n -eq 0) { Write-Ok ("ports {0} are free" -f ($Ports -join ' / ')) }
}

# LAN HTTPS is the default so one URL works from both the PC and a phone, and
# so the cert the browser already trusts keeps being the right one.
# Public-only skips staff Vite, so LAN mode is irrelevant there.
$lanMode = $StartStaff -and -not $Http
$lanIp = if ($lanMode) { Get-LanIp } else { $null }
$staffScheme = if ($lanMode) { 'https' } else { 'http' }

# ---------------------------------------------------------------- launch

# Start-Process gives each server its own independent console, so the windows
# survive this launcher exiting (and stay open on crash for the traceback).
function Start-DevWindow {
    param(
        [string]$Title,
        [string]$WorkDir,
        [string]$Command
    )
    # /k keeps the window open after the process dies so errors stay readable.
    $inner = "title $Title && $Command"
    return Start-Process -FilePath 'cmd.exe' `
        -ArgumentList '/k', $inner `
        -WorkingDirectory $WorkDir `
        -WindowStyle Minimized `
        -PassThru
}

# Invoke the venv interpreter by absolute path. Do not rely on activate.bat —
# a relocated venv (e.g. D: -> C:) leaves VIRTUAL_ENV stale and silently falls
# back to system Python, which then misses deps like msal.
$djangoCmd = if ($usingVenv) {
    "`"$venvPython`" manage.py runserver 127.0.0.1:$ApiPort"
}
else {
    "python manage.py runserver 127.0.0.1:$ApiPort"
}

Write-Step 'launching Django API'
$null = Start-DevWindow -Title 'EcoThrift API' -WorkDir $Root -Command $djangoCmd

if ($StartStaff) {
    Write-Step "launching staff dashboard$(if ($lanMode) { ' (HTTPS / LAN)' } else { ' (HTTP / localhost)' })"
    if ($lanMode) {
        # Inherited by the child; frontend/vite.config.ts reads these.
        $env:ECOTHRIFT_MOBILE_HTTPS = '1'
        if ($lanIp) { $env:ECOTHRIFT_MOBILE_LAN_IP = $lanIp }
    }
    $staffCmd = if ($lanMode) { 'npm run dev:mobile' } else { 'npm run dev' }
    $null = Start-DevWindow -Title 'EcoThrift Staff' -WorkDir (Join-Path $Root 'frontend') -Command $staffCmd
    if ($lanMode) {
        Remove-Item Env:ECOTHRIFT_MOBILE_HTTPS -ErrorAction SilentlyContinue
        Remove-Item Env:ECOTHRIFT_MOBILE_LAN_IP -ErrorAction SilentlyContinue
    }
}

if ($StartPublic) {
    Write-Step 'launching public site'
    $null = Start-DevWindow -Title 'EcoThrift Public' -WorkDir (Join-Path $Root 'frontend-public') -Command 'npm run dev'
}

# ---------------------------------------------------------------- health gate

Write-Host ''
Write-Step 'waiting for servers to answer...'

# Poll targeted servers together rather than one after another, so one dead
# server cannot make the wait as long as the sum of every timeout.
$results = [ordered]@{ 'API' = $false }
if ($StartStaff) { $results['Staff dashboard'] = $false }
if ($StartPublic) { $results['Public site'] = $false }
$deadline = (Get-Date).AddSeconds(60)

while ((Get-Date) -lt $deadline) {
    # Django gets a real HTTP probe: the port opens before the app can serve.
    if (-not $results['API'] -and (Get-PortOwner -Port $ApiPort)) {
        if (Test-HttpOnce -Url "http://127.0.0.1:$ApiPort/api/webstore/config/") {
            $results['API'] = $true
            Write-Ok 'API is up'
        }
    }
    # Vite is TCP-probed only, so a self-signed cert cannot fail the check.
    if ($StartStaff -and -not $results['Staff dashboard'] -and (Get-PortOwner -Port $StaffPort)) {
        $results['Staff dashboard'] = $true
        Write-Ok 'Staff dashboard is up'
    }
    if ($StartPublic -and -not $results['Public site'] -and (Get-PortOwner -Port $PublicPort)) {
        $results['Public site'] = $true
        Write-Ok 'Public site is up'
    }

    if ($results.Values -notcontains $false) { break }
    Start-Sleep -Milliseconds 400
}

foreach ($name in $results.Keys) {
    if (-not $results[$name]) { Write-Bad "$name did not come up" }
}

$allUp = -not ($results.Values -contains $false)

# ---------------------------------------------------------------- report

$staffUrl = "${staffScheme}://localhost:$StaffPort/"
$publicUrl = "http://localhost:$PublicPort/"

if ($allUp) {
    Write-Banner 'READY'
    if ($StartStaff) { Write-Host "  Staff dashboard   $staffUrl" }
    if ($StartPublic) { Write-Host "  Public site       $publicUrl" }
    Write-Host "  API               http://127.0.0.1:$ApiPort/"
    if ($lanMode) {
        Write-Host ''
        if ($lanIp) {
            Write-Host "  Phone (same Wi-Fi)  ${staffScheme}://${lanIp}:$StaffPort/"
        }
        else {
            Write-Warn2 'could not detect a LAN IP - run ipconfig and use your Wi-Fi IPv4'
        }
        Write-Host '  Accept the self-signed certificate warning once on the phone.'
        Write-Host '  Allow Node.js through Windows Firewall (Private networks) if it will not load.'
        Write-Host '  Plain HTTP on localhost instead:  scripts\dev\start_dashboard.bat -Http' -ForegroundColor DarkGray
    }
    Write-Host ''
    Write-Host '  Stop everything:  scripts\dev\start_all.bat -Stop' -ForegroundColor DarkGray
    Write-Host ''

    if (-not $NoOpen) {
        if ($StartStaff) { Start-Process $staffUrl }
        if ($StartPublic) { Start-Process $publicUrl }
    }
    exit 0
}

Write-Banner 'START FAILED'
Write-Host '  Check the window(s) that stayed open for the error:' -ForegroundColor Yellow
foreach ($name in $results.Keys) {
    if (-not $results[$name]) { Write-Host "    - $name" -ForegroundColor Yellow }
}
Write-Host ''
Write-Host '  Windows are titled EcoThrift API / EcoThrift Staff / EcoThrift Public.' -ForegroundColor DarkGray
Write-Host ''
exit 1

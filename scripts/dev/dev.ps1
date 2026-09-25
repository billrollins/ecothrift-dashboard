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

    Phone testing (staff dashboard over LAN HTTPS, the default): the READY report
    prints https://<hostname>.local:5173/scan plus a QR code for it. The
    .local name (mDNS) does not change when DHCP gives the PC a new IP, and the
    self-signed cert is kept in %LOCALAPPDATA%\EcoThrift\dev-cert\<hostname> for
    800 days, so a phone bookmarks the URL and accepts the cert warning once.
    It also checks the Windows network profile and Node.js firewall rule (prints
    fixes, changes nothing), and uses Tailscale Serve when Tailscale is installed.

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
# The page the phone QR code opens (what gets tested on a phone first).
$PhonePath = '/scan'

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

# ---------------------------------------------------------------- phone helpers

# Returns Ip / Alias / Index of the adapter a phone on the same Wi-Fi reaches,
# or $null. First choice is the interface holding the default route (lowest
# route + interface metric): that is the real LAN. Picking by adapter name alone
# could land on vEthernet / WSL / Bluetooth adapters.
function Get-LanIp {
    $best = $null
    $bestMetric = [int]::MaxValue
    $routes = @(Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue)
    foreach ($r in $routes) {
        $ipIf = Get-NetIPInterface -InterfaceIndex $r.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if (-not $ipIf -or "$($ipIf.ConnectionState)" -ne 'Connected') { continue }
        $metric = [int]$r.RouteMetric + [int]$ipIf.InterfaceMetric
        if ($metric -ge $bestMetric) { continue }
        $addr = Get-NetIPAddress -InterfaceIndex $r.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
            Select-Object -First 1
        if (-not $addr) { continue }
        $bestMetric = $metric
        $best = [pscustomobject]@{ Ip = $addr.IPAddress; Alias = $r.InterfaceAlias; Index = $r.InterfaceIndex }
    }
    if ($best) { return $best }

    # Fallback (no default route, e.g. Wi-Fi without internet): the old pick by
    # adapter name, skipping the usual virtual adapters.
    $addr = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -notlike '127.*' -and
            $_.IPAddress -notlike '169.254.*' -and
            $_.PrefixOrigin -ne 'WellKnown' -and
            $_.InterfaceAlias -notmatch 'vEthernet|WSL|Hyper-V|VirtualBox|VMware|Bluetooth|Loopback|Tailscale|ZeroTier'
        } |
        Sort-Object @{ Expression = {
                if ($_.InterfaceAlias -match 'Wi-?Fi|Wireless') { 0 }
                elseif ($_.InterfaceAlias -match 'Ethernet') { 1 }
                else { 2 }
            }
        }, IPAddress |
        Select-Object -First 1
    if ($addr) {
        return [pscustomobject]@{ Ip = $addr.IPAddress; Alias = $addr.InterfaceAlias; Index = $addr.InterfaceIndex }
    }
    return $null
}

# Windows answers mDNS for its own host name, so https://<name>.local:5173/
# reaches this PC whatever IP DHCP hands out. iOS resolves .local natively;
# Android 12+ generally does.
function Get-MdnsHostName {
    $name = [System.Net.Dns]::GetHostName()
    if (-not $name) { $name = $env:COMPUTERNAME }
    return $name.ToLowerInvariant()
}

# Expiry + thumbprint of the dev cert that basic-ssl keeps in $Dir\_cert.pem
# (private key and cert in one file), or $null when there is none yet.
function Get-DevCertInfo {
    param([string]$Dir)
    $pem = Join-Path $Dir '_cert.pem'
    if (-not (Test-Path $pem)) { return $null }
    try {
        $text = [System.IO.File]::ReadAllText($pem)
        $m = [regex]::Match($text, '-----BEGIN CERTIFICATE-----([A-Za-z0-9+/=\s]+)-----END CERTIFICATE-----')
        if (-not $m.Success) { return $null }
        $bytes = [Convert]::FromBase64String(($m.Groups[1].Value -replace '\s', ''))
        $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 -ArgumentList (, $bytes)
        return [pscustomobject]@{ Thumbprint = $cert.Thumbprint; NotAfter = $cert.NotAfter }
    }
    catch {
        return $null
    }
}

# Windows settings that decide whether a phone can reach this PC: the network
# profile of the LAN adapter and the inbound firewall rules for node.exe.
# Read-only; the report prints the fixes.
function Get-PhoneNetworkHealth {
    param([int]$InterfaceIndex)
    $info = [pscustomobject]@{
        Category  = $null   # Public / Private / Domain
        Network   = $null   # Wi-Fi name
        NodeAllow = $null   # profiles with an allow rule; $null = could not read the rules
        NodeBlock = @()
    }
    try {
        $p = Get-NetConnectionProfile -InterfaceIndex $InterfaceIndex -ErrorAction Stop | Select-Object -First 1
        $info.Category = ("$($p.NetworkCategory)" -replace 'DomainAuthenticated', 'Domain')
        $info.Network = $p.Name
    }
    catch { }
    try {
        $node = (Get-Command node -ErrorAction Stop).Source
        # Rules Windows made from its "allow Node.js?" prompt, or ones added by hand.
        $rules = @(Get-NetFirewallApplicationFilter -Program '*node.exe' -ErrorAction Stop |
                Where-Object { [Environment]::ExpandEnvironmentVariables($_.Program) -ieq $node } |
                Get-NetFirewallRule -ErrorAction SilentlyContinue |
                Where-Object { "$($_.Enabled)" -eq 'True' -and "$($_.Direction)" -eq 'Inbound' })
        $info.NodeAllow = @($rules | Where-Object { "$($_.Action)" -eq 'Allow' } | ForEach-Object { "$($_.Profile)" })
        $info.NodeBlock = @($rules | Where-Object { "$($_.Action)" -eq 'Block' } | ForEach-Object { "$($_.Profile)" })
    }
    catch { }
    return $info
}

# True when one of the rule profile strings ("Public", "Private, Public", "Any")
# covers the given network category.
function Test-ProfileCovered {
    param([string[]]$Profiles, [string]$Category)
    foreach ($p in $Profiles) {
        if ($p -eq 'Any' -or ($Category -and $p -match $Category)) { return $true }
    }
    return $false
}

# Runs a CLI with a hard time limit so a login prompt or a stuck daemon cannot
# hang the launcher. ExitCode is $null on timeout.
function Invoke-Bounded {
    param([string]$Exe, [string[]]$Arguments, [int]$TimeoutSec = 10)
    $outFile = [System.IO.Path]::GetTempFileName()
    $errFile = [System.IO.Path]::GetTempFileName()
    try {
        $p = Start-Process -FilePath $Exe -ArgumentList $Arguments -NoNewWindow -PassThru `
            -RedirectStandardOutput $outFile -RedirectStandardError $errFile
        $null = $p.Handle   # PS 5.1: without this ExitCode reads empty after exit
        $exited = $p.WaitForExit($TimeoutSec * 1000)
        if (-not $exited) {
            try { $p.Kill() } catch { }
            Start-Sleep -Milliseconds 200
        }
        $out = [string](Get-Content -Path $outFile -Raw -ErrorAction SilentlyContinue)
        $err = [string](Get-Content -Path $errFile -Raw -ErrorAction SilentlyContinue)
        return [pscustomobject]@{
            ExitCode = if ($exited) { $p.ExitCode } else { $null }
            Out      = $out
            Text     = ($out + "`n" + $err).Trim()
        }
    }
    catch {
        return [pscustomobject]@{ ExitCode = -1; Out = ''; Text = $_.Exception.Message }
    }
    finally {
        Remove-Item -Path $outFile, $errFile -ErrorAction SilentlyContinue
    }
}

# Optional: when Tailscale is installed and logged in, publish the staff server
# at https://<machine>.<tailnet>.ts.net/ with a real certificate (no warning,
# works off Wi-Fi; the phone runs Tailscale too). Every failure only warns.
function Start-TailscaleServe {
    param([int]$Port)
    $exe = Get-Command tailscale -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source
    if (-not $exe -and $env:ProgramFiles) {
        $candidate = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'
        if (Test-Path $candidate) { $exe = $candidate }
    }
    if (-not $exe) { return [pscustomobject]@{ State = 'absent' } }

    $status = Invoke-Bounded -Exe $exe -Arguments @('status', '--json') -TimeoutSec 8
    # Regex, not ConvertFrom-Json: PS 5.1 chokes on some peer maps. Self comes
    # before Peer in the JSON, so the first DNSName after "Self" is this PC.
    $state = [regex]::Match($status.Out, '"BackendState"\s*:\s*"([^"]*)"').Groups[1].Value
    $dns = [regex]::Match($status.Out, '"Self"\s*:\s*\{.*?"DNSName"\s*:\s*"([^"]*)"', 'Singleline').Groups[1].Value
    if ($state -ne 'Running' -or -not $dns) {
        $why = if ($state) { $state } else { 'not running' }
        return [pscustomobject]@{ State = 'offline'; Detail = $why }
    }
    $tsHost = $dns.TrimEnd('.').ToLowerInvariant()

    # https+insecure: Vite's own cert is self-signed; Tailscale shows the real one.
    # --bg keeps serving after this window closes (until: tailscale serve --https=443 off).
    $serve = Invoke-Bounded -Exe $exe -Arguments @('serve', '--bg', "https+insecure://127.0.0.1:$Port") -TimeoutSec 15
    if ($serve.ExitCode -eq 0) {
        return [pscustomobject]@{ State = 'serving'; Host = $tsHost }
    }
    # A stuck serve usually means Serve / HTTPS certificates are not enabled for
    # the tailnet yet; the CLI prints a login.tailscale.com link to enable them.
    $link = [regex]::Match($serve.Text, 'https://login\.tailscale\.com/\S+').Value
    $first = ($serve.Text -split "`r?`n" | Where-Object { $_.Trim() } | Select-Object -First 1)
    $detail = if ($null -eq $serve.ExitCode) { 'timed out' } elseif ($first) { $first.Trim() } else { "exit $($serve.ExitCode)" }
    return [pscustomobject]@{ State = 'failed'; Host = $tsHost; Detail = $detail; Link = $link }
}

# True when this launcher runs in a window of its own that closes on exit
# (the .bat was double-clicked: Explorer started "cmd.exe /c ...bat"). The
# READY report then waits for Enter so the phone QR code stays on screen. A
# .bat typed into an open cmd / PowerShell window does not match.
function Test-OwnWindow {
    try {
        $me = Get-CimInstance Win32_Process -Filter "ProcessId=$PID" -ErrorAction Stop
        $cmd = Get-CimInstance Win32_Process -Filter "ProcessId=$($me.ParentProcessId)" -ErrorAction Stop
        if ($cmd.Name -ne 'cmd.exe' -or $cmd.CommandLine -notmatch '\s/c\s') { return $false }
        $shell = Get-CimInstance Win32_Process -Filter "ProcessId=$($cmd.ParentProcessId)" -ErrorAction Stop
        return ($shell.Name -eq 'explorer.exe')
    }
    catch {
        return $false
    }
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
# Python stderr is a terminating ErrorRecord under Stop; capture it as text.
$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
    $migrateCheck = & $python 'manage.py' 'migrate' '--check' 2>&1 | ForEach-Object { $_.ToString() } | Out-String
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
    $ErrorActionPreference = $prevEap
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
$lan = if ($lanMode) { Get-LanIp } else { $null }
$lanIp = if ($lan) { $lan.Ip } else { $null }
$staffScheme = if ($lanMode) { 'https' } else { 'http' }

# Phone URL + cert. frontend/vite.config.ts works out the same folder on its
# own; passing it keeps the two in step. Keyed by hostname because basic-ssl
# never regenerates for a changed domain list, only for a missing/expired cert.
$mdnsHost = Get-MdnsHostName
$certBase = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $HOME '.cache' }
$devCertDir = Join-Path $certBase ('EcoThrift\dev-cert\' + ($mdnsHost -replace '[^a-z0-9.-]', '_'))
$certBefore = if ($lanMode) { Get-DevCertInfo -Dir $devCertDir } else { $null }

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
        $env:ECOTHRIFT_DEV_CERT_DIR = $devCertDir
    }
    $staffCmd = if ($lanMode) { 'npm run dev:mobile' } else { 'npm run dev' }
    $null = Start-DevWindow -Title 'EcoThrift Staff' -WorkDir (Join-Path $Root 'frontend') -Command $staffCmd
    if ($lanMode) {
        Remove-Item Env:ECOTHRIFT_MOBILE_HTTPS -ErrorAction SilentlyContinue
        Remove-Item Env:ECOTHRIFT_DEV_CERT_DIR -ErrorAction SilentlyContinue
    }
}

if ($StartPublic) {
    Write-Step 'launching public site'
    $null = Start-DevWindow -Title 'EcoThrift Public' -WorkDir (Join-Path $Root 'frontend-public') -Command 'npm run dev'
}

# Firewall lookups take about a second; do them while the servers boot.
$netHealth = if ($lanMode -and $lan) { Get-PhoneNetworkHealth -InterfaceIndex $lan.Index } else { $null }

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
        # The .local URL is the one to bookmark: it survives DHCP handing the PC
        # a new IP, and its cert does not change between starts.
        $phoneBase = "https://${mdnsHost}.local:$StaffPort"
        $phoneUrl = "$phoneBase$PhonePath"
        Write-Host ''
        Write-Host "  Phone (same Wi-Fi)  $phoneUrl   " -NoNewline
        Write-Host '<- bookmark this one' -ForegroundColor Green
        Write-Host "  Phone dashboard     $phoneBase/"
        if ($lanIp) {
            Write-Host "  Fallback by IP      https://${lanIp}:$StaffPort/"
        }
        else {
            Write-Warn2 'could not detect a LAN IP - run ipconfig and use your Wi-Fi IPv4'
        }
        $ts = Start-TailscaleServe -Port $StaffPort
        $tsUrl = $null
        if ($ts.State -eq 'serving') {
            $tsUrl = "https://$($ts.Host)$PhonePath"
            Write-Host "  Phone (anywhere)    $tsUrl   " -NoNewline
            Write-Host 'real cert, via Tailscale' -ForegroundColor DarkGray
        }
        Write-Host ''

        # basic-ssl reuses the saved cert until it expires, so this normally
        # reads "unchanged" and a phone that accepted it has nothing new to accept.
        $certNow = Get-DevCertInfo -Dir $devCertDir
        if (-not $certNow) {
            Write-Warn2 "no dev certificate saved in $devCertDir - phones may see a new one each start"
        }
        elseif ($certBefore -and $certBefore.Thumbprint -eq $certNow.Thumbprint) {
            Write-Ok ('certificate unchanged (valid to {0:yyyy-MM-dd})' -f $certNow.NotAfter)
        }
        else {
            Write-Step ('new certificate (valid to {0:yyyy-MM-dd}): each phone asks once' -f $certNow.NotAfter)
        }
        Write-Host '  Phone cert warning: Chrome > Advanced > Proceed; Safari > Show Details > visit this website.' -ForegroundColor DarkGray

        # Network sanity. Read-only: prints the fix, never changes a setting.
        if ($netHealth) {
            $cat = $netHealth.Category
            if ($cat -eq 'Public') {
                $netName = if ($netHealth.Network) { " '$($netHealth.Network)'" } else { '' }
                Write-Warn2 "network$netName on $($lan.Alias) is set to Public: Windows may block phones and the .local name on it."
                Write-Host "         Fix once, admin PowerShell:  Set-NetConnectionProfile -InterfaceAlias '$($lan.Alias)' -NetworkCategory Private" -ForegroundColor Yellow
                if ($null -ne $netHealth.NodeAllow -and -not (Test-ProfileCovered $netHealth.NodeAllow 'Private')) {
                    Write-Host '         Node.js is only let through the firewall on Public today: allow it on Private too after switching.' -ForegroundColor Yellow
                }
            }
            if ($null -eq $netHealth.NodeAllow -or -not $cat) {
                Write-Host '  Allow Node.js through Windows Firewall (Private networks) if it will not load.' -ForegroundColor DarkGray
            }
            elseif (Test-ProfileCovered $netHealth.NodeBlock $cat) {
                Write-Warn2 "Windows Firewall blocks Node.js on $cat networks, so the phone cannot connect."
                Write-Host "         Fix: Windows Security > Firewall > Allow an app through firewall > Node.js > tick $cat." -ForegroundColor Yellow
            }
            elseif (-not (Test-ProfileCovered $netHealth.NodeAllow $cat)) {
                Write-Warn2 "no firewall rule lets Node.js in on $cat networks yet, so the phone may not connect."
                Write-Host "         Click Allow if Windows asks, or: Windows Security > Firewall > Allow an app through firewall > Node.js > tick $cat." -ForegroundColor Yellow
            }
        }
        else {
            Write-Host '  Allow Node.js through Windows Firewall (Private networks) if it will not load.' -ForegroundColor DarkGray
        }

        if ($lanIp) {
            Write-Host "  Tip: reserve $lanIp for this PC in the router (DHCP reservation) so the IP URL never changes." -ForegroundColor DarkGray
        }
        switch ($ts.State) {
            'absent' {
                Write-Host '  Tip: install Tailscale on PC + phone for a permanent https URL that also works off Wi-Fi.' -ForegroundColor DarkGray
            }
            'offline' {
                Write-Host "  Tailscale is installed but not connected ($($ts.Detail)): sign in to get the ts.net URL." -ForegroundColor DarkGray
            }
            'failed' {
                Write-Warn2 "tailscale serve failed: $($ts.Detail)"
                if ($ts.Link) {
                    Write-Host "         Enable Serve for the tailnet: $($ts.Link)" -ForegroundColor Yellow
                }
                else {
                    Write-Host '         Turn on MagicDNS and HTTPS certificates in the Tailscale admin console (DNS page).' -ForegroundColor Yellow
                }
            }
        }
        Write-Host '  Plain HTTP on localhost instead:  scripts\dev\start_dashboard.bat -Http' -ForegroundColor DarkGray

        # QR last so it sits at the bottom of the window, fully in view. node
        # writes straight to the console; UTF-8 only matters if it gets piped.
        Write-Host ''
        Write-Host "  Scan with the phone camera to open $phoneUrl"
        $qrHtml = Join-Path $certBase 'EcoThrift\phone-qr.html'
        $qrArgs = @(
            (Join-Path $PSScriptRoot 'phone-qr.mjs'), '--qr', $phoneUrl, '--html', $qrHtml,
            '--link', "Price scanner (same Wi-Fi)|$phoneUrl",
            '--link', "Dashboard (same Wi-Fi)|$phoneBase/"
        )
        if ($lanIp) { $qrArgs += @('--link', "Fallback by IP|https://${lanIp}:$StaffPort/") }
        if ($tsUrl) { $qrArgs += @('--link', "Anywhere, via Tailscale|$tsUrl") }
        $prevEncoding = $null
        try {
            $prevEncoding = [Console]::OutputEncoding
            [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
        }
        catch { }
        try { & node @qrArgs } catch { Write-Host '  (QR code skipped: node is not runnable)' -ForegroundColor DarkGray }
        if ($prevEncoding) { try { [Console]::OutputEncoding = $prevEncoding } catch { } }
        if (Test-Path $qrHtml) {
            Write-Host "  Bigger QR codes on this PC:  $qrHtml" -ForegroundColor DarkGray
        }
    }
    Write-Host ''
    Write-Host '  Stop everything:  scripts\dev\start_all.bat -Stop' -ForegroundColor DarkGray
    Write-Host ''

    if (-not $NoOpen) {
        if ($StartStaff) { Start-Process $staffUrl }
        if ($StartPublic) { Start-Process $publicUrl }
    }
    if ($lanMode -and (Test-OwnWindow)) {
        # Double-clicked .bat: this window closes on exit and would take the QR with it.
        try { $null = Read-Host '  Press Enter to close this window (the servers keep running)' } catch { }
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

#Requires -Version 5.1
<#
Backup before the first deploy of the day (Bill, critic review 2026-10-21, point 8).

Lists the Heroku Postgres backups on the shared add-on (app ecothrift-database). If a manual backup (ID b...)
completed today, store time (America/Chicago), it skips; otherwise it captures one. Scheduled backups (a...) do not
count: the point is a copy taken just before the day's first release. Prints one line saying which.
Exit 0 = go ahead with the deploy; exit 1 = stop (the list or the capture failed).

  -DryRun       decide and print, never capture.
  -ListFile     read the backup list from this file instead of Heroku (tests).
  -NowUtc       "yyyy-MM-dd HH:mm:ss" in UTC, instead of the clock (tests).
#>
param(
    [switch]$DryRun,
    [string]$ListFile = '',
    [string]$NowUtc = ''
)
$ErrorActionPreference = 'Stop'
# heroku writes progress to stderr; under 'Stop', Windows PowerShell 5.1 turns that into an error. Calls run under this.
function Invoke-Heroku { $ErrorActionPreference = 'Continue'; & heroku @args 2>&1 }

$App = 'ecothrift-database'
$StoreZone = [TimeZoneInfo]::FindSystemTimeZoneById('Central Standard Time')  # America/Chicago, with DST
$Culture = [Globalization.CultureInfo]::InvariantCulture
$Utc = [Globalization.DateTimeStyles]::AssumeUniversal -bor [Globalization.DateTimeStyles]::AdjustToUniversal

function ConvertTo-StoreTime([datetime]$utc) { [TimeZoneInfo]::ConvertTimeFromUtc($utc, $StoreZone) }

if ($NowUtc) {
    $nowUtcValue = [datetime]::ParseExact($NowUtc, 'yyyy-MM-dd HH:mm:ss', $Culture, $Utc)
} else {
    $nowUtcValue = [datetime]::UtcNow
}
$today = (ConvertTo-StoreTime $nowUtcValue).Date

if ($ListFile) {
    $listing = Get-Content -LiteralPath $ListFile
} else {
    $listing = Invoke-Heroku pg:backups -a $App
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Backup: ERROR, could not list backups on $App. Deploy stopped."
        exit 1
    }
}

# "  b028   2026-10-21 18:36:52 +0000   Completed 2026-10-21 18:37:52 +0000   344.37MB   DATABASE"
$pattern = '^\s*(b\d+)\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \+0000\s+Completed\b'
$todays = @()
foreach ($line in $listing) {
    $m = [regex]::Match([string]$line, $pattern)
    if (-not $m.Success) { continue }
    $created = ConvertTo-StoreTime ([datetime]::ParseExact($m.Groups[2].Value, 'yyyy-MM-dd HH:mm:ss', $Culture, $Utc))
    if ($created.Date -eq $today) { $todays += [pscustomobject]@{ Id = $m.Groups[1].Value; At = $created } }
}

if ($todays.Count -gt 0) {
    $latest = $todays | Sort-Object At -Descending | Select-Object -First 1
    Write-Host ("Backup: skipped, {0} was taken today at {1} (store time)." -f $latest.Id, $latest.At.ToString('h:mm tt', $Culture))
    exit 0
}

if ($DryRun) {
    Write-Host "Backup: would take one now (none yet today, $($today.ToString('yyyy-MM-dd', $Culture)) store time). Dry run: nothing captured."
    exit 0
}

$out = Invoke-Heroku pg:backups:capture -a $App
if ($LASTEXITCODE -ne 0) {
    Write-Host "Backup: ERROR, the capture on $App failed. Deploy stopped."
    exit 1
}
$id = [regex]::Match(($out -join "`n"), '\b(b\d+)\b').Groups[1].Value
Write-Host ("Backup: taken{0} before today's first deploy." -f $(if ($id) { " ($id)" } else { '' }))
exit 0

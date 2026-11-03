# Wi-Fi time clock helper (D23): install on the store PC. For the coder; asks nothing.
#   powershell -NoProfile -File scripts/wifi_clock/install.ps1            # token (if none), sign-in task, start it
#   powershell -NoProfile -File scripts/wifi_clock/install.ps1 -Remove    # stop and remove the task (token kept)
# Makes WIFI_CLOCK_TOKEN (a user env var) when it is missing and prints only its sha256, which goes to Dash in the
# hr.wifi_clock_pilot request. The task runs this checkout's venv pythonw (no window) at sign-in and restarts it.
param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$TaskName = 'EcoThrift Wi-Fi clock helper'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

if ($Remove) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Output "Removed task '$TaskName'."
    exit 0
}

$token = [Environment]::GetEnvironmentVariable('WIFI_CLOCK_TOKEN', 'User')
if (-not $token) {
    $bytes = New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $token = ([BitConverter]::ToString($bytes) -replace '-', '').ToLower()
    [Environment]::SetEnvironmentVariable('WIFI_CLOCK_TOKEN', $token, 'User')
    Write-Output 'Made a new WIFI_CLOCK_TOKEN (user env var).'
}
$sha = [Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($token))
Write-Output ('token_sha256: ' + (([BitConverter]::ToString($sha) -replace '-', '').ToLower()))

$pythonw = Join-Path $Root 'venv\Scripts\pythonw.exe'
$helper = Join-Path $Root 'scripts\wifi_clock\helper.py'
if (-not (Test-Path $pythonw)) { throw "No venv pythonw at $pythonw" }
$action = New-ScheduledTaskAction -Execute $pythonw -Argument "`"$helper`"" -WorkingDirectory $Root
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
    -Description 'Eco-Thrift Dash Wi-Fi clock pilot (D23): sends seen / not seen for registered phones only.' -Force | Out-Null
Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Start-ScheduledTask -TaskName $TaskName
Write-Output "Task '$TaskName' registered and started ($Root)."

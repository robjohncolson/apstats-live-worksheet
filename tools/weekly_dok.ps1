# Weekly misconception DOK sheet; defaults to a read-only dry run.
# Registration is printed by -Register, never executed by this script.
# First scheduled run: Friday 2026-09-18, 21:00 local, on Athena.
# Register once (this script does NOT execute this command):
# schtasks /Create /TN "APStats-WeeklyDOK" /SC WEEKLY /D FRI /ST 21:00 /SD 09/18/2026 /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Users\rober\Downloads\Projects\school\follow-alongs\tools\weekly_dok.ps1 -Apply" /F
# -PushOnly retries pending weekly commits without selecting another sheet.
param(
  [switch]$Apply,
  [switch]$DryRun,
  [switch]$PushOnly,
  [switch]$Register,
  [switch]$Now
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
if ($Register) {
  Write-Output ('schtasks /Create /TN "APStats-WeeklyDOK" /SC WEEKLY /D FRI /ST 21:00 /SD 09/18/2026 /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ' + $repo + '\tools\weekly_dok.ps1 -Apply" /F')
  exit 0
}
if (([int]$Apply.IsPresent + [int]$DryRun.IsPresent + [int]$PushOnly.IsPresent) -gt 1) {
  throw 'Choose only one of -Apply, -DryRun, -PushOnly.'
}
$mode = '--dry-run'
if ($Apply) { $mode = '--apply' }
if ($PushOnly) { $mode = '--push-only' }
$jobArgs = @('scripts/weekly-dok.mjs', $mode)
if ($Now) { $jobArgs += '--now' }
Push-Location $repo
try {
  if ($mode -eq '--dry-run') {
    & node @jobArgs
  } else {
    $logDir = Join-Path $PSScriptRoot '.weekly-dok-logs'
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    $log = Join-Path $logDir ((Get-Date -Format 'yyyy-MM-dd') + '.log')
    & node @jobArgs 2>&1 | Tee-Object -FilePath $log -Append
  }
  $code = $LASTEXITCODE
} finally { Pop-Location }
exit $code

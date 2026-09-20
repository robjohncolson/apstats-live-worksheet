# Weekly misconception DOK sheet; defaults to a read-only dry run.
# Registration is printed by -Register, never executed by this script.
# First scheduled run: Friday 2026-09-18, 21:00 local, on Athena.
# Register once (this script does NOT execute this command): run tools/register_weekly_dok.ps1.
# It creates APStats-WeeklyDOK with two triggers (Fri 21:00 + Sat 07:00 catch-up), start-when-missed,
# wake-to-run, and three 30-minute retries. The script itself refuses a second apply in the same week.
# -PushOnly is accepted for old scheduled commands.
param(
  [switch]$Apply,
  [switch]$DryRun,
  [switch]$PushOnly,
  [switch]$Register,
  [switch]$Now
)
$ErrorActionPreference = 'Stop'
if ($PushOnly) { Write-Output '-PushOnly is no longer needed.'; exit 0 }
$repo = Split-Path -Parent $PSScriptRoot
if ($Register) {
  Write-Output ('powershell -NoProfile -ExecutionPolicy Bypass -File ' + $PSScriptRoot + '\register_weekly_dok.ps1')
  exit 0
}
if (([int]$Apply.IsPresent + [int]$DryRun.IsPresent) -gt 1) {
  throw 'Choose only one of -Apply, -DryRun.'
}
$mode = '--dry-run'
if ($Apply) { $mode = '--apply' }
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
    # Under 'Stop', PowerShell 5.1 turns node's first stderr line into a terminating error and the
    # failure reason never reaches the log. Relax it for this call and log stderr as plain text.
    $ErrorActionPreference = 'Continue'
    "=== $(Get-Date -Format s) $mode ===" | Out-File -FilePath $log -Append -Encoding utf8
    $runOutput = @(& node @jobArgs 2>&1 | ForEach-Object { "$_" } | Tee-Object -FilePath $log -Append)
    $runOutput | Write-Output
  }
  $code = $LASTEXITCODE
} finally { Pop-Location }
if ($Apply) {
  # Alerts are best-effort; preserve the node exit code even if gh is missing or fails.
  try {
    $ErrorActionPreference = 'Stop'
    $today = Get-Date
    $date = $today.ToString('yyyy-MM-dd')
    $title = "Weekly DOK sheet failed $date"
    $issuesJson = & gh issue list -R robjohncolson/apstats-live-worksheet --state open --search '"Weekly DOK sheet failed" in:title' --limit 100 --json number,title 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Issue lookup failed' }
    $issues = @($issuesJson | ConvertFrom-Json)
    if ($code -ne 0) {
      $lastLine = Get-Content -LiteralPath $log | Where-Object { $_.Trim() } | Select-Object -Last 1
      $body = "$lastLine`n`nLog: tools/.weekly-dok-logs/$date.log on Athena. Manual run: tools\weekly_dok.ps1 -Apply -Now"
      $existing = $issues | Where-Object { $_.title -eq $title } | Select-Object -First 1
      if ($existing) {
        & gh issue comment $existing.number -R robjohncolson/apstats-live-worksheet --body $body 2>$null | Out-Null
      } else {
        & gh issue create -R robjohncolson/apstats-live-worksheet --title $title --body $body 2>$null | Out-Null
      }
    } else {
      $published = $runOutput | Where-Object { $_ -match '^Published commit: [0-9a-f]+$' } | Select-Object -Last 1
      if ($published) {
        $monday = $today.Date.AddDays(-(([int]$today.DayOfWeek + 6) % 7))
        foreach ($issue in $issues) {
          if ($issue.title -notmatch '^Weekly DOK sheet failed (\d{4}-\d{2}-\d{2})$') { continue }
          $failedDate = [datetime]::ParseExact($Matches[1], 'yyyy-MM-dd', $null)
          if ($failedDate -lt $monday -or $failedDate -ge $monday.AddDays(7)) { continue }
          & gh issue close $issue.number -R robjohncolson/apstats-live-worksheet --comment $published 2>$null | Out-Null
        }
      }
    }
  } catch { Write-Output 'Weekly DOK issue alert skipped' }
}
exit $code

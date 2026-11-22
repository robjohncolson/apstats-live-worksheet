# ops.ps1 -- one command for each routine operation (see GROK_OPS.md).
# Every command that can write grades is a DRY RUN unless you add -Live.
#
#   powershell -NoProfile -File tools\ops.ps1 status
#   powershell -NoProfile -File tools\ops.ps1 sync      -Section PeriodB [-Live]
#   powershell -NoProfile -File tools\ops.ps1 reconcile -Section PeriodE [-Live]
#   powershell -NoProfile -File tools\ops.ps1 backup
#   powershell -NoProfile -File tools\ops.ps1 brief
#   powershell -NoProfile -File tools\ops.ps1 summaries
#   powershell -NoProfile -File tools\ops.ps1 gate
#   powershell -NoProfile -File tools\ops.ps1 prepush

param(
  [Parameter(Position = 0)]
  [ValidateSet('status', 'sync', 'reconcile', 'backup', 'brief', 'summaries', 'gate', 'prepush')]
  [string]$Command = 'status',
  [ValidateSet('PeriodB', 'PeriodE')]
  [string]$Section = 'PeriodB',
  [switch]$Live
)

$ErrorActionPreference = 'Continue'
$tools = $PSScriptRoot
$repo = Split-Path -Parent $tools
Set-Location $repo

$TASKS = @(
  'ApStatsPcReconcileB', 'ApStatsPcReconcileE', 'ApStatsSchoologySync-B', 'ApStatsSchoologySync-E',
  'APStats Grade Nightly Backup', 'APStats-NightlyBrief', 'A2 Tomorrow Draft',
  'APStats DOGE Payout Agent', 'APStats Slips Agent', 'APStats Weekly Slips'
)
$HEALTH = @(
  'https://roster-production-12c1.up.railway.app/health',
  'https://curriculumrender-production.up.railway.app/health',
  'https://a2-live-worksheets-production.up.railway.app/health'
)

function Show-Status {
  Write-Output '== Services =='
  foreach ($url in $HEALTH) {
    try {
      $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 15
      Write-Output ("{0}  {1}" -f $r.StatusCode, $url)
    } catch {
      Write-Output ("DOWN {0}  ({1})" -f $url, $_.Exception.Message)
    }
  }

  Write-Output ''
  Write-Output '== CI (last 3 runs) =='
  & gh run list --workflow=ci.yml -L 3

  Write-Output ''
  Write-Output '== Scheduled tasks (Result 0 = ok; agents show Running) =='
  foreach ($name in $TASKS) {
    $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    if (-not $task) { Write-Output ("MISSING  {0}" -f $name); continue }
    $info = $task | Get-ScheduledTaskInfo
    Write-Output ("{0,-9} result={1,-11} last={2:MM-dd HH:mm}  {3}" -f $task.State, $info.LastTaskResult, $info.LastRunTime, $name)
  }

  Write-Output ''
  Write-Output '== Job reports (roster-local\job-status) =='
  $statusDir = Join-Path $repo 'roster-local\job-status'
  if (Test-Path $statusDir) {
    Get-ChildItem $statusDir -Filter *.json | ForEach-Object {
      $j = Get-Content $_.FullName -Raw | ConvertFrom-Json
      Write-Output ("{0,-16} {1,-8} {2}  {3}" -f $j.job, $j.state, $j.ranAt, $j.reason)
    }
  }

  Write-Output ''
  Write-Output '== Grade job launcher log (last 8 lines) =='
  $launcher = Join-Path $tools '.schoology-sync-logs\launcher.log'
  if (Test-Path $launcher) { Get-Content $launcher -Tail 8 }
}

switch ($Command) {
  'status' { Show-Status }
  'sync' {
    if ($Live) { & (Join-Path $tools 'daily_schoology_sync.ps1') -Section $Section -Live }
    else { & (Join-Path $tools 'daily_schoology_sync.ps1') -Section $Section }
  }
  'reconcile' {
    if ($Live) { & (Join-Path $tools 'daily_pc_reconcile.ps1') -Section $Section -Pages server -Apply }
    else { & (Join-Path $tools 'daily_pc_reconcile.ps1') -Section $Section -Pages server }
  }
  'backup' { Start-ScheduledTask -TaskName 'APStats Grade Nightly Backup'; Write-Output 'Backup task started. Check C:\Users\rober\grade-backups.' }
  'brief' { & node (Join-Path $repo 'scripts\nightly-brief.mjs') --with-a2 }
  'summaries' { & npm.cmd run pull-summaries }
  'gate' { & npm.cmd run test:quick }
  'prepush' {
    Write-Output '== Commits not yet pushed =='
    & git log --oneline origin/master..HEAD
    Write-Output ''
    Write-Output '== roster-server changes in them (any line here = grade server restarts: wait for a gap between classes) =='
    & git diff --stat origin/master..HEAD -- roster-server/
  }
}
exit $LASTEXITCODE

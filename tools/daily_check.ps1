# daily_check.ps1 -- once a day: is everything up, and did today's grade jobs run?
#
# 1. Runs `tools\ops.ps1 status` and saves the text.
# 2. Works out the red flags itself (no model): a service down, a failed or stale grade task,
#    a job that started and never ended, a failed job report, a red CI run.
# 3. Asks Grok Build (headless, READ tools only: it cannot run a command or write a file) to
#    explain the status in plain words, following .grok/skills/daily-check.
# 4. Writes the report to roster-local\daily-check\<date>.md and latest.md (gitignored).
#    When there is a red flag, the report opens in Notepad so the teacher sees it.
#
# The report is written even when Grok is down or slow: the flags and the raw status come first.
# Scheduled as "APStats-DailyCheck" at 17:15 (after the 16:45 sync; see register_daily_check_task.ps1).
#
#   powershell -NoProfile -File tools\daily_check.ps1            # full run
#   powershell -NoProfile -File tools\daily_check.ps1 -NoGrok    # flags and status only
#   powershell -NoProfile -File tools\daily_check.ps1 -NoPopup   # never open Notepad
#
# Exit codes: 0 = no red flags, 1 = at least one red flag.
# ASCII only.

param(
  [switch]$NoGrok,
  [switch]$NoPopup
)

$ErrorActionPreference = 'Continue'
$tools = $PSScriptRoot
$repo = Split-Path -Parent $tools
Set-Location $repo

$GROK = Join-Path $env:USERPROFILE '.grok\bin\grok.exe'
$GROK_TIMEOUT_MS = 8 * 60 * 1000
$OUT_DIR = Join-Path $repo 'roster-local\daily-check'
$LAUNCHER_LOG = Join-Path $tools '.schoology-sync-logs\launcher.log'
$JOB_STATUS_DIR = Join-Path $repo 'roster-local\job-status'

# Tasks that must have run in the last day with result 0.
$DAILY_TASKS = @(
  'ApStatsPcReconcileB', 'ApStatsPcReconcileE', 'ApStatsSchoologySync-B', 'ApStatsSchoologySync-E',
  'APStats Grade Nightly Backup', 'APStats-NightlyBrief', 'A2 Tomorrow Draft'
)
# Agents that must be Running (their result code while running is not 0: that is normal).
$AGENT_TASKS = @('APStats DOGE Payout Agent', 'APStats Slips Agent')
$HEALTH = @(
  'https://roster-production-12c1.up.railway.app/health',
  'https://curriculumrender-production.up.railway.app/health',
  'https://a2-live-worksheets-production.up.railway.app/health'
)
$STALE_HOURS = 26
$TASK_STILL_RUNNING = 267009

function Get-ServiceFlags {
  $flags = @()
  foreach ($url in $HEALTH) {
    try {
      $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 20
      if ($r.StatusCode -ne 200) { $flags += "Service answered $($r.StatusCode): $url" }
    } catch {
      $flags += "Service DOWN: $url"
    }
  }
  return $flags
}

function Get-TaskFlags {
  $flags = @()
  $now = Get-Date
  foreach ($name in $DAILY_TASKS) {
    $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    if (-not $task) { $flags += "Task MISSING: $name"; continue }
    if ($task.State -eq 'Disabled') { $flags += "Task DISABLED: $name"; continue }
    $info = $task | Get-ScheduledTaskInfo
    if ($info.LastTaskResult -eq $TASK_STILL_RUNNING) { continue }
    if ($info.LastTaskResult -ne 0) { $flags += "Task FAILED (result $($info.LastTaskResult)): $name" }
    $hours = ($now - $info.LastRunTime).TotalHours
    if ($hours -gt $STALE_HOURS) { $flags += ("Task has not run for {0:N0} hours: {1}" -f $hours, $name) }
  }
  foreach ($name in $AGENT_TASKS) {
    $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    if (-not $task) { $flags += "Agent MISSING: $name"; continue }
    if ($task.State -ne 'Running') { $flags += "Agent not running (state $($task.State)): $name" }
  }
  return $flags
}

# A grade job writes "<time> <label> start ..." then "<time> <label> end exit <code> ...".
function Get-LauncherFlags {
  $flags = @()
  if (-not (Test-Path $LAUNCHER_LOG)) { return @('Launcher log is missing') }
  $today = (Get-Date).ToString('yyyy-MM-dd')
  $open = @{}
  foreach ($line in (Get-Content $LAUNCHER_LOG -Tail 200)) {
    if ($line -notmatch '^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) (\S+) (start|end exit (-?\d+))') { continue }
    if ($Matches[1] -ne $today) { continue }
    $label = $Matches[3]
    if ($Matches[4] -eq 'start') { $open[$label] = $Matches[2]; continue }
    $open.Remove($label)
    if ($Matches[5] -ne '0') { $flags += "Job $label ended with exit code $($Matches[5]) at $($Matches[2])" }
  }
  foreach ($label in $open.Keys) {
    $started = [datetime]::ParseExact("$today $($open[$label])", 'yyyy-MM-dd HH:mm:ss', $null)
    $minutes = ((Get-Date) - $started).TotalMinutes
    if ($minutes -gt 20) { $flags += "Job $label started at $($open[$label]) and never ended (killed?)" }
  }
  return $flags
}

function Get-JobReportFlags {
  $flags = @()
  if (-not (Test-Path $JOB_STATUS_DIR)) { return $flags }
  foreach ($file in (Get-ChildItem $JOB_STATUS_DIR -Filter *.json)) {
    $j = Get-Content $file.FullName -Raw | ConvertFrom-Json
    if ($j.state -eq 'failed') { $flags += "Job report FAILED: $($j.job) (streak $($j.streak)): $($j.reason)" }
  }
  return $flags
}

function Get-CiFlags {
  $json = & gh run list --workflow=ci.yml -L 5 --json status,conclusion,headSha 2>$null
  if (-not $json) { return @('Could not read CI runs (gh failed)') }
  $done = @($json | ConvertFrom-Json | Where-Object { $_.status -eq 'completed' })
  if ($done.Count -eq 0) { return @() }
  if ($done[0].conclusion -eq 'success') { return @() }
  return @("CI is RED: last finished run is '$($done[0].conclusion)' (commit $($done[0].headSha.Substring(0, 8)))")
}

function Invoke-Grok([string]$promptPath) {
  if (-not (Test-Path $GROK)) { return $null }
  $outPath = Join-Path $OUT_DIR 'grok-out.tmp'
  $errPath = Join-Path $OUT_DIR 'grok-err.tmp'
  $grokArgs = @(
    '--prompt-file', "`"$promptPath`"", '--output-format', 'plain', '--permission-mode', 'dontAsk',
    '--cwd', "`"$repo`"", '--disable-web-search', '--no-subagents', '--max-turns', '25',
    '--tools', 'read_file,grep,list_dir'
  )
  $proc = Start-Process -FilePath $GROK -ArgumentList $grokArgs -NoNewWindow -PassThru `
    -RedirectStandardOutput $outPath -RedirectStandardError $errPath
  if (-not $proc.WaitForExit($GROK_TIMEOUT_MS)) {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    return $null
  }
  $text = Get-Content $outPath -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
  Remove-Item $outPath, $errPath -ErrorAction SilentlyContinue
  if (-not $text -or $text.Trim().Length -lt 40) { return $null }
  return $text.Trim()
}

New-Item -ItemType Directory -Force -Path $OUT_DIR | Out-Null
$stamp = (Get-Date).ToString('yyyy-MM-dd')
$when = (Get-Date).ToString('yyyy-MM-dd HH:mm')

$status = (& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $tools 'ops.ps1') status 2>&1 | Out-String).Trim()

$flags = @()
$flags += Get-ServiceFlags
$flags += Get-TaskFlags
$flags += Get-LauncherFlags
$flags += Get-JobReportFlags
$flags += Get-CiFlags
$flags = @($flags | Where-Object { $_ })

$headline = 'ALL GREEN: nothing needs you.'
if ($flags.Count -gt 0) { $headline = "$($flags.Count) RED FLAG(S): read below." }
$flagText = '(none)'
if ($flags.Count -gt 0) { $flagText = ($flags | ForEach-Object { "- $_" }) -join "`n" }

$grokText = $null
if (-not $NoGrok) {
  $prompt = @"
Daily check for the AP Statistics platform. It is $when. Follow the skill .grok/skills/daily-check/SKILL.md.

You have READ tools only (read_file, grep, list_dir). You cannot run a command and you cannot write a file.
Do not try: a refused call ends this run. The status below was collected a minute ago by tools/ops.ps1 status.

Write a short report for the teacher in plain words:
1. One line: is everything fine, yes or no.
2. For each red flag: what it means and the ONE next step (who does it: the teacher, or Grok in a normal session).
   Read the matching log under tools/ (launcher.log first) before you explain a flag.
3. Anything else in the status that looks wrong and is not in the red flag list.
Never name a student, never quote a log line that holds a name, never print a secret. Counts only.
A job report with state "nothing" is fine. Agents with state Running are fine.

== RED FLAGS (worked out by the script) ==
$flagText

== STATUS ==
$status
"@
  $promptPath = Join-Path $OUT_DIR 'prompt.tmp'
  [IO.File]::WriteAllText($promptPath, $prompt)
  $grokText = Invoke-Grok $promptPath
  Remove-Item $promptPath -ErrorAction SilentlyContinue
}
if (-not $grokText) { $grokText = '(Grok did not answer this time. The red flags and the status below are complete without it.)' }

$report = @"
# Daily check, $when

$headline

## Red flags
$flagText

## Grok's reading
$grokText

## Raw status
$status
"@

[IO.File]::WriteAllText((Join-Path $OUT_DIR "$stamp.md"), $report)
[IO.File]::WriteAllText((Join-Path $OUT_DIR 'latest.md'), $report)
Write-Output $headline

if ($flags.Count -eq 0) { exit 0 }
if (-not $NoPopup) { Start-Process notepad.exe -ArgumentList "`"$(Join-Path $OUT_DIR 'latest.md')`"" }
exit 1

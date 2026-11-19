# Nightly AP Classroom -> roster Progress Check reconcile (PC_FOLLOWTHROUGH_SPEC.md section 4).
# Runs tools/apclassroom_pc_reconcile.py for one section. DRY-RUN BY DEFAULT: pass -Apply to post.
#
# Runs on Athena BEFORE the Schoology syncs (16:30 PeriodB / 16:45 PeriodE), so the PC column
# carries tonight's number the same evening. Register once with register_pc_reconcile_task.ps1,
# or paste these two lines (the teacher runs them; this script never does):
#
#   schtasks /Create /SC DAILY /TN ApStatsPcReconcileB /ST 16:00 /F /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%USERPROFILE%\Downloads\Projects\school\follow-alongs\tools\daily_pc_reconcile.ps1\" -Section PeriodB -Apply"
#   schtasks /Create /SC DAILY /TN ApStatsPcReconcileE /ST 16:10 /F /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%USERPROFILE%\Downloads\Projects\school\follow-alongs\tools\daily_pc_reconcile.ps1\" -Section PeriodE -Apply"
#
# Needs: ROSTER_TEACHER_SECRET in the task account's environment (setx, never the CLI), and the
# Edge rig profile signed into AP Classroom once. Exit 2 = SIGN IN NEEDED (a GitHub issue is opened
# when gh is installed and -Apply is set). Logs: tools/.pc-reconcile-logs/ (gitignored: the log may
# hold unmatched AP Classroom names).
#
# -Pages server reads the AP Classroom page texts the outside sender posted to the roster server
# (POST /admin/apclassroom-page/<id>) instead of the Edge rig: no sign-in, and a missing or stale
# page skips its entry (exit 1). The default stays the rig until the sender's routine is proven;
# then add "-Pages server" to the two scheduled task lines above.
#
# Three outcomes (an -Apply run only): ok, nothing to do, failed.
#   * The Python tool ends its log with "JOB-RESULT code=<code> state=<state>" and writes
#     roster-local/job-status/pcReconcile<B|E>.json = {job, ranAt, state, reason, streak}
#     (gitignored; the nightly brief reads it).
#   * "Nothing to do" (Python exit 3) = no AP Classroom pages on the server yet, or no school
#     today. This script then exits 0, so Task Scheduler shows red only for a real failure.
#     Two school-day runs in a row with no pages turn into a failure ("reader-down").
#   * The code is reported to POST /admin/job-result. A server that does not know a new code
#     yet (400) gets 'page-not-ready' instead (tools/_proposals/job-result-three-state.patch).

param(
  [string]$Section = 'PeriodB',
  [switch]$Apply,
  [string]$Base = '',
  [string]$LogDir = '',
  [ValidateSet('rig', 'server')]
  [string]$Pages = 'rig'
)

$ErrorActionPreference = 'Continue'

$toolsDir = $PSScriptRoot
if (-not $LogDir) { $LogDir = Join-Path $toolsDir '.pc-reconcile-logs' }
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$log   = Join-Path $LogDir "reconcile-$Section-$stamp.log"

$mode = if ($Apply) { 'APPLY' } else { 'DRY-RUN' }
Add-Content -Path $log -Value ("[" + (Get-Date -Format 'HH:mm:ss') + "] === daily_pc_reconcile started ($mode) section=$Section pages=$Pages ===")

# The job name the server and the status file use.
$job = if ($Section -eq 'PeriodE') { 'pcReconcileE' } elseif ($Section -eq 'PeriodB') { 'pcReconcileB' } else { "pcReconcile-$Section" }
$statusFile = Join-Path (Split-Path -Parent $toolsDir) "roster-local\job-status\$job.json"
$startedUtc = (Get-Date).ToUniversalTime()

# A missing ROSTER_TEACHER_SECRET is checked by the Python tool, which records it as a failure.
$pyArgs = @((Join-Path $toolsDir 'apclassroom_pc_reconcile.py'), '--section', $Section, '--log', $log)
if ($Apply) { $pyArgs += @('--apply', '--status-file', $statusFile) }
if ($Base) { $pyArgs += @('--base', $Base) }
if ($Pages -eq 'server') { $pyArgs += @('--pages', 'server') }

# The Python script writes its own log (usernames only on stdout).
& python @pyArgs
$code = $LASTEXITCODE
# python not found leaves no exit code at all: that is a failure, never a silent exit 0.
if ($null -eq $code) { $code = 1 }

Add-Content -Path $log -Value ("[" + (Get-Date -Format 'HH:mm:ss') + "] === daily_pc_reconcile done (exit $code) ===")

# The last "JOB-RESULT code=<code>" line the Python tool logged, or '' when it never got there.
function Get-JobResultCode {
  $hit = Select-String -Path $log -Pattern '^JOB-RESULT code=(\S+)' | Select-Object -Last 1
  if (-not $hit) { return '' }
  return $hit.Matches[0].Groups[1].Value
}

# Python did not finish (not installed, crashed on import): record the failure ourselves.
# Same contract as the Python writer: {job, ranAt, state, reason, streak}, UTF-8 without BOM.
function Write-FallbackStatus([string]$reason) {
  try {
    $streak = 1
    if (Test-Path $statusFile) {
      $prev = Get-Content -Raw -Path $statusFile | ConvertFrom-Json
      if ($prev.state -eq 'failed' -and $prev.reason -eq $reason) { $streak = [int]$prev.streak + 1 }
    }
    $record = [ordered]@{
      job = $job
      ranAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
      state = 'failed'
      reason = $reason
      streak = $streak
    }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $statusFile) | Out-Null
    $json = ($record | ConvertTo-Json) -replace "`r`n", "`n"
    [System.IO.File]::WriteAllText($statusFile, $json + "`n", (New-Object System.Text.UTF8Encoding($false)))
  } catch {
    Add-Content -Path $log -Value ("job status not written: " + $_.Exception.Message)
  }
}

# Report the outcome to the roster server so status.html shows it (POST /admin/job-result).
# Best-effort: a failed report is logged and never changes the exit code. Only the scheduled
# -Apply run reports (a dry run is not the nightly job).
# The server only accepts an allowlisted code and writes the public message itself.
function Send-JobResult([string]$resultCode) {
  $url = if ($Base) { $Base.TrimEnd('/') } else { 'https://roster-production-12c1.up.railway.app' }
  $at = (Get-Date).ToUniversalTime().ToString('o')
  $tries = @($resultCode)
  # Codes a server without the three-state patch does not know yet (it answers 400).
  if (@('nothing-no-pages', 'nothing-no-school', 'reader-down') -contains $resultCode) { $tries += 'page-not-ready' }
  foreach ($try in $tries) {
    $body = @{ job = $job; code = $try; at = $at } | ConvertTo-Json -Compress
    try {
      Invoke-RestMethod -Method Post -Uri "$url/admin/job-result" -ContentType 'application/json' -Headers @{ 'x-teacher-secret' = $env:ROSTER_TEACHER_SECRET } -Body $body -TimeoutSec 15 | Out-Null
      Add-Content -Path $log -Value "job-result reported: $job $try (exit $code)"
      return
    } catch {
      $status = 0
      if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
      Add-Content -Path $log -Value ("job-result report failed ($try): " + $_.Exception.Message)
      if ($status -ne 400) { return }
    }
  }
}

if ($Apply) {
  $resultCode = Get-JobResultCode
  $statusFresh = (Test-Path $statusFile) -and ((Get-Item $statusFile).LastWriteTimeUtc -ge $startedUtc.AddSeconds(-1))
  if (-not $resultCode -or -not $statusFresh) {
    Write-FallbackStatus "the reconcile did not finish (python exit $code)"
    $resultCode = 'failed'
  }
  Send-JobResult $resultCode
}

# Exit 3 = nothing to do (no pages yet, or no school today): not a failure for Task Scheduler.
if ($code -eq 3) { exit 0 }
exit $code

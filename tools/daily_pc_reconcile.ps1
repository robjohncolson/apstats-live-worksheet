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

param(
  [string]$Section = 'PeriodB',
  [switch]$Apply,
  [string]$Base = '',
  [string]$LogDir = ''
)

$ErrorActionPreference = 'Continue'

$toolsDir = $PSScriptRoot
if (-not $LogDir) { $LogDir = Join-Path $toolsDir '.pc-reconcile-logs' }
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$log   = Join-Path $LogDir "reconcile-$Section-$stamp.log"

$mode = if ($Apply) { 'APPLY' } else { 'DRY-RUN' }
Add-Content -Path $log -Value ("[" + (Get-Date -Format 'HH:mm:ss') + "] === daily_pc_reconcile started ($mode) section=$Section ===")

if (-not $env:ROSTER_TEACHER_SECRET) {
  $msg = 'ERROR: ROSTER_TEACHER_SECRET is not set in the environment (setx ROSTER_TEACHER_SECRET <secret>).'
  Write-Output $msg
  Add-Content -Path $log -Value $msg
  exit 1
}

$pyArgs = @((Join-Path $toolsDir 'apclassroom_pc_reconcile.py'), '--section', $Section, '--log', $log)
if ($Apply) { $pyArgs += '--apply' }
if ($Base) { $pyArgs += @('--base', $Base) }

# The Python script writes its own log (usernames only on stdout).
& python @pyArgs
$code = $LASTEXITCODE

Add-Content -Path $log -Value ("[" + (Get-Date -Format 'HH:mm:ss') + "] === daily_pc_reconcile done (exit $code) ===")
exit $code

# One-time registration of the nightly AP Classroom PC reconcile (PC_FOLLOWTHROUGH_SPEC.md section 4)
# as two Windows Scheduled Tasks: PeriodB at 16:00 and PeriodE at 16:10, before the 16:30 / 16:45
# Schoology syncs. Same pattern as register_schoology_sync_task.ps1.
#
# The two schtasks lines this script runs (paste them yourself if you prefer):
#
#   schtasks /Create /SC DAILY /TN ApStatsPcReconcileB /ST 16:00 /F /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"<repo>\tools\daily_pc_reconcile.ps1\" -Section PeriodB -Apply"
#   schtasks /Create /SC DAILY /TN ApStatsPcReconcileE /ST 16:10 /F /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"<repo>\tools\daily_pc_reconcile.ps1\" -Section PeriodE -Apply"
#
# Defaults register DRY-RUN jobs; pass -Apply to post. -PrintOnly prints the exact lines and exits.
# The task account needs ROSTER_TEACHER_SECRET in its environment (setx); the Edge rig profile
# must be signed into AP Classroom once.
#
# Usage:
#   powershell -NoProfile -File tools/register_pc_reconcile_task.ps1 -PrintOnly
#   powershell -NoProfile -File tools/register_pc_reconcile_task.ps1 -Apply

param(
  [string]$TimeB = '16:00',
  [string]$TimeE = '16:10',
  [switch]$Apply,
  [switch]$PrintOnly
)

$ErrorActionPreference = 'Stop'

$batch = Join-Path $PSScriptRoot 'daily_pc_reconcile.ps1'
if (-not (Test-Path $batch)) {
  Write-Error "Cannot find the batch script at $batch"
  exit 1
}

$ps = (Get-Command powershell.exe).Source
$tasks = @(
  @{ Name = 'ApStatsPcReconcileB'; Section = 'PeriodB'; Time = $TimeB },
  @{ Name = 'ApStatsPcReconcileE'; Section = 'PeriodE'; Time = $TimeE }
)

foreach ($t in $tasks) {
  $inner = "-NoProfile -ExecutionPolicy Bypass -File `"$batch`" -Section $($t.Section)"
  if ($Apply) { $inner += ' -Apply' }
  $action = "`"$ps`" $inner"
  Write-Output "schtasks /Create /SC DAILY /TN $($t.Name) /TR $action /ST $($t.Time) /F"
  if ($PrintOnly) { continue }
  schtasks /Create /SC DAILY /TN $t.Name /TR $action /ST $t.Time /F
  if ($LASTEXITCODE -ne 0) {
    Write-Error "schtasks /Create failed for $($t.Name) (exit $LASTEXITCODE)."
    exit $LASTEXITCODE
  }
}

if ($PrintOnly) { exit 0 }
Write-Output ""
Write-Output "Tasks created ($(if ($Apply) { 'APPLY' } else { 'DRY-RUN' }))."
Write-Output "  Run now:  schtasks /Run /TN ApStatsPcReconcileE"
Write-Output "  Delete:   schtasks /Delete /TN ApStatsPcReconcileB /F ; schtasks /Delete /TN ApStatsPcReconcileE /F"
exit 0

# Start the grade tasks with NO console window, through tools/run_hidden.vbs.
#
# Why (2026-11-11): each task started powershell.exe / node.exe as a console program, which
# Windows hands to a new, focused Windows Terminal window. The 16:30 PeriodB Schoology sync died
# in its first seconds on Tue 11/10 (0xC000013A, the Ctrl+C / closed-window exit) and Wed 11/11
# (0x8007042B), and the Tue 21:00 grade backup too (0xC000013A). Nothing on the laptop recorded
# what closed or interrupted those windows. Hidden, a job has no window to close or to type
# Ctrl+C into, and run_hidden.vbs logs every start and exit code to
# tools/.schoology-sync-logs/launcher.log.
#
# Only each task's action changes; its triggers, conditions and settings stay as they are.
# Every task's XML is saved first to tools/.schoology-sync-logs/task-backups/ (gitignored).
#
#   powershell -NoProfile -File tools/set_tasks_hidden.ps1            # dry run: show the change
#   powershell -NoProfile -File tools/set_tasks_hidden.ps1 -Apply     # switch to the launcher
#   powershell -NoProfile -File tools/set_tasks_hidden.ps1 -Revert    # back to the old action
#
# Re-registering a task (tools/register_schoology_sync_task.ps1, register_pc_reconcile_task.ps1)
# brings its window back: run this script with -Apply afterwards.
# ASCII only. LF line endings.

param(
  [switch]$Apply,
  [switch]$Revert
)

$ErrorActionPreference = 'Stop'

$tasks = [ordered]@{
  'ApStatsPcReconcileB'          = 'reconcile-PeriodB'
  'ApStatsPcReconcileE'          = 'reconcile-PeriodE'
  'ApStatsSchoologySync-B'       = 'sync-PeriodB'
  'ApStatsSchoologySync-E'       = 'sync-PeriodE'
  'APStats Grade Nightly Backup' = 'backup'
}

$wscript   = Join-Path $env:WINDIR 'System32\wscript.exe'
$launcher  = Join-Path $PSScriptRoot 'run_hidden.vbs'
$backupDir = Join-Path $PSScriptRoot '.schoology-sync-logs\task-backups'
# The launcher's own argument prefix, and how to read the old program and arguments back out.
$hiddenPattern = '^//B //Nologo "[^"]*run_hidden\.vbs" (\S+) "([^"]+)" ?(.*)$'

if ($Apply -and $Revert) {
  Write-Output "Use -Apply or -Revert, not both. Nothing changed."
  exit 2
}
if (-not (Test-Path $launcher)) {
  Write-Output "The launcher is missing: $launcher. Nothing changed."
  exit 1
}

$mode = if ($Apply) { 'APPLY' } elseif ($Revert) { 'REVERT' } else { 'DRY RUN' }
Write-Output "set_tasks_hidden: $mode"
$failed = 0

foreach ($name in $tasks.Keys) {
  $label = $tasks[$name]
  $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
  if (-not $task) {
    Write-Output "  $name : not registered, skipped"
    continue
  }
  $action = $task.Actions[0]
  $current = "$($action.Execute) $($action.Arguments)".Trim()
  $isHidden = ($action.Execute -like '*wscript.exe') -and ($action.Arguments -match $hiddenPattern)

  if ($Revert) {
    if (-not $isHidden) {
      Write-Output "  $name : already starts without the launcher"
      continue
    }
    $execute = $Matches[2]
    $arguments = $Matches[3]
  } else {
    if ($isHidden) {
      Write-Output "  $name : already hidden"
      continue
    }
    $execute = $wscript
    $arguments = "//B //Nologo `"$launcher`" $label `"$($action.Execute)`" $($action.Arguments)".Trim()
  }

  Write-Output "  $name"
  Write-Output "    now:  $current"
  Write-Output "    new:  $execute $arguments"
  if (-not ($Apply -or $Revert)) { continue }

  try {
    New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $safeName = $name -replace '[^A-Za-z0-9_-]', '_'
    Export-ScheduledTask -TaskName $name | Set-Content -Path (Join-Path $backupDir "$safeName-$stamp.xml") -Encoding Unicode
    $newAction = if ($action.WorkingDirectory) {
      New-ScheduledTaskAction -Execute $execute -Argument $arguments -WorkingDirectory $action.WorkingDirectory
    } else {
      New-ScheduledTaskAction -Execute $execute -Argument $arguments
    }
    Set-ScheduledTask -TaskName $name -Action $newAction | Out-Null
    $check = (Get-ScheduledTask -TaskName $name).Actions[0]
    if ($check.Execute -ne $execute -or $check.Arguments -ne $arguments) { throw "read-back differs" }
    Write-Output "    done (old definition saved in task-backups\$safeName-$stamp.xml)"
  } catch {
    $failed += 1
    Write-Output "    FAILED: $($_.Exception.Message)"
  }
}

if ($failed) { exit 1 }
exit 0

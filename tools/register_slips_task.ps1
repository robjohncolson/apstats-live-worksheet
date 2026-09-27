# One-time registration of the weekly paper slips build as a Windows Scheduled
# Task (SLIPS_V2_SPEC.md section 2b). Teacher: "5am on Monday mornings, so the
# info is current."
#
# Task "APStats Weekly Slips": WEEKLY, Monday 05:00 local, runs
#   node scripts/weekly-slips.mjs          (prints PDFs; --date defaults to today)
# with the repo root as working directory, output appended to
# tools/.slips-agent-logs/weekly.log (the print agent's /health reads its last
# "Slips:" line). StartWhenAvailable: a laptop asleep at 05:00 runs it at wake.
# Runs ONLY while the teacher is logged on (the roster credentials are local).
#
# Slips carry names: the script writes to %USERPROFILE%\grade-backups\slips and
# refuses any output folder inside the repository.
#
# Usage:
#   powershell -NoProfile -File tools/register_slips_task.ps1              # register
#   powershell -NoProfile -File tools/register_slips_task.ps1 -DryRun      # print, change nothing
#   powershell -NoProfile -File tools/register_slips_task.ps1 -Unregister  # remove the task

param(
  [string]$TaskName = 'APStats Weekly Slips',
  [string]$Time     = '05:00',
  [string]$NodeExe  = '',
  [switch]$DryRun,
  [switch]$Unregister
)

$ErrorActionPreference = 'Stop'

$toolsDir = $PSScriptRoot
$repo     = Split-Path -Parent $toolsDir
$script   = Join-Path $repo 'scripts\weekly-slips.mjs'
$logDir   = Join-Path $toolsDir '.slips-agent-logs'
$log      = Join-Path $logDir 'weekly.log'

# -- Unregister ---------------------------------------------------------------
if ($Unregister) {
  $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if (-not $existing) {
    Write-Output "Task '$TaskName' is not registered. Nothing to do."
    exit 0
  }
  if ($DryRun) {
    Write-Output "[dry-run] Would unregister task '$TaskName'."
    exit 0
  }
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Output "Task '$TaskName' removed."
  exit 0
}

# -- Pre-flight ---------------------------------------------------------------
if (-not (Test-Path $script)) {
  Write-Error "Cannot find the slips script at $script"
  exit 1
}
if (-not $NodeExe) {
  $nodeCmd = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $nodeCmd) {
    Write-Error "node.exe not found on PATH. Pass -NodeExe <full path>."
    exit 1
  }
  $NodeExe = $nodeCmd.Source
}

# -- The command the task runs ------------------------------------------------
# cmd.exe wraps node so stdout/stderr are appended to weekly.log.
$inner   = "`"$NodeExe`" `"$script`" >> `"$log`" 2>&1"
$cmdArgs = "/d /c `"$inner`""

Write-Output "Registering weekly Scheduled Task:"
Write-Output "  Name:     $TaskName"
Write-Output "  Trigger:  every Monday at $Time (runs at wake if the laptop was asleep)"
Write-Output "  Session:  only while $env:USERNAME is logged on"
Write-Output "  Workdir:  $repo"
Write-Output "  Log:      $log"
Write-Output "  Runs:     cmd.exe $cmdArgs"
Write-Output ""

if ($DryRun) {
  Write-Output "[dry-run] No task registered."
  exit 0
}

if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }

$action    = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument $cmdArgs -WorkingDirectory $repo
$trigger   = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At $Time
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$settings  = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30) `
  -MultipleInstances IgnoreNew `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Principal $principal -Settings $settings -Force | Out-Null

Write-Output "Task '$TaskName' created."
Write-Output "  Run it now:  Start-ScheduledTask -TaskName '$TaskName'"
Write-Output "  Inspect:     Get-ScheduledTaskInfo -TaskName '$TaskName'"
Write-Output "  Tail the log: Get-Content '$log' -Tail 20"
Write-Output "  Remove it:   powershell -NoProfile -File tools/register_slips_task.ps1 -Unregister"
exit 0

# One-time registration of the slips print agent (tools/slips-agent.mjs) as a
# Windows Scheduled Task (SLIPS_V2_SPEC.md section 2). Same shape as
# register_payout_agent_task.ps1: at logon of the current user, a 5-minute
# keep-alive, and ONLY while that user is logged on.
#
# The agent listens on 127.0.0.1:47831 (loopback only). The DOK app's teacher
# panel ("Print slips now") talks to it. It holds no secrets: the slips script
# reads the roster credentials itself.
#
# Usage:
#   powershell -NoProfile -File tools/register_slips_agent_task.ps1              # register
#   powershell -NoProfile -File tools/register_slips_agent_task.ps1 -DryRun      # print, change nothing
#   powershell -NoProfile -File tools/register_slips_agent_task.ps1 -Unregister  # remove the task
#
# Smoke BEFORE registering:
#   node tools/slips-agent.mjs --port 47899   then   curl -s http://127.0.0.1:47899/health
#
# stdout/stderr go to tools/.slips-agent-logs/console.log (the agent itself
# also writes tools/.slips-agent-logs/agent.log).

param(
  [string]$TaskName = 'APStats Slips Agent',
  [string]$NodeExe  = '',
  [switch]$DryRun,
  [switch]$Unregister
)

$ErrorActionPreference = 'Stop'

$toolsDir = $PSScriptRoot
$repo     = Split-Path -Parent $toolsDir
$agent    = Join-Path $toolsDir 'slips-agent.mjs'
$logDir   = Join-Path $toolsDir '.slips-agent-logs'
$log      = Join-Path $logDir 'console.log'

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
  Write-Output "Task '$TaskName' removed. A running agent keeps going until it exits or you stop it:"
  Write-Output "  Stop-ScheduledTask -TaskName '$TaskName'"
  exit 0
}

# -- Pre-flight ---------------------------------------------------------------
if (-not (Test-Path $agent)) {
  Write-Error "Cannot find the agent at $agent"
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
# cmd.exe wraps node so stdout/stderr can be appended to the log file.
$inner    = "`"$NodeExe`" `"$agent`" >> `"$log`" 2>&1"
$cmdArgs  = "/d /c `"$inner`""

Write-Output "Registering Scheduled Task:"
Write-Output "  Name:     $TaskName"
Write-Output "  Trigger:  at logon of $env:USERNAME (interactive session only) + keep-alive every 5 min"
Write-Output "  Restart:  on failure, every 1 min, up to 999 times"
Write-Output "  Workdir:  $repo"
Write-Output "  Listens:  http://127.0.0.1:47831 (loopback only)"
Write-Output "  Log:      $log"
Write-Output "  Runs:     cmd.exe $cmdArgs"
Write-Output ""

if ($DryRun) {
  Write-Output "[dry-run] No task registered."
  exit 0
}

if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }

$action    = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument $cmdArgs -WorkingDirectory $repo
# At logon, plus a keep-alive every 5 minutes. With MultipleInstances=IgnoreNew the
# keep-alive is a no-op while the agent runs, and restarts it within 5 min if it died.
$logonTrigger     = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
# (No -RepetitionDuration: on Windows PowerShell 5.1 that means "repeat indefinitely".)
$keepAliveTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date `
  -RepetitionInterval (New-TimeSpan -Minutes 5)
$trigger = @($logonTrigger, $keepAliveTrigger)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$settings  = New-ScheduledTaskSettingsSet `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -DontStopOnIdleEnd

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Principal $principal -Settings $settings -Force | Out-Null

Write-Output "Task '$TaskName' created. It starts at your next logon."
Write-Output "  Start it now:  Start-ScheduledTask -TaskName '$TaskName'"
Write-Output "  Check it:      curl.exe -s http://127.0.0.1:47831/health"
Write-Output "  Stop it:       Stop-ScheduledTask -TaskName '$TaskName'"
Write-Output "  Remove it:     powershell -NoProfile -File tools/register_slips_agent_task.ps1 -Unregister"
exit 0

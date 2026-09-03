# One-time registration of the DOGE payout agent as a Windows Scheduled Task —
# the Windows counterpart of tools/doge-payout-agent.service (systemd). Same
# infra pattern as register_schoology_sync_task.ps1.
#
# The task runs `node tools/doge-payout-agent.mjs --config <json>` at every
# logon of the current user, restarts it if it dies, and runs ONLY while that
# user is logged on: Dogecoin Core (dogecoin-qt) is a GUI app living in the
# user session, and dogecoin-cli needs that session's RPC credentials.
#
# Working directory = the repo root, so the agent's .doge-send-journal.json is
# the SAME file a manual `node tools/doge-send.mjs` run locks on (one send lock).
#
# The agent key lives ONLY in the JSON config (see
# tools/payout-agent.config.example.json) — never in this task or on the CLI.
# Registration refuses to proceed if that config file is missing.
#
# Usage:
#   powershell -NoProfile -File tools/register_payout_agent_task.ps1              # register
#   powershell -NoProfile -File tools/register_payout_agent_task.ps1 -DryRun      # print, change nothing
#   powershell -NoProfile -File tools/register_payout_agent_task.ps1 -Unregister  # remove the task
#
# One-shot smoke BEFORE registering (one poll, then exit):
#   node tools/doge-payout-agent.mjs --config "$HOME/.config/apstats/.payout-agent.json" --once
#
# stdout/stderr go to tools/.payout-agent-logs/agent.log (Task Scheduler
# discards console output otherwise).

param(
  [string]$ConfigPath = (Join-Path $HOME '.config\apstats\.payout-agent.json'),
  [string]$TaskName   = 'APStats DOGE Payout Agent',
  [string]$NodeExe    = '',
  [switch]$DryRun,
  [switch]$Unregister
)

$ErrorActionPreference = 'Stop'

$toolsDir = $PSScriptRoot
$repo     = Split-Path -Parent $toolsDir
$agent    = Join-Path $toolsDir 'doge-payout-agent.mjs'
$logDir   = Join-Path $toolsDir '.payout-agent-logs'
$log      = Join-Path $logDir 'agent.log'

# ── Unregister ───────────────────────────────────────────────────────────────
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

# ── Pre-flight ───────────────────────────────────────────────────────────────
if (-not (Test-Path $agent)) {
  Write-Error "Cannot find the agent at $agent"
  exit 1
}
if (-not (Test-Path $ConfigPath)) {
  Write-Error "Config file not found: $ConfigPath`nCopy tools/payout-agent.config.example.json there and fill in payoutAgentKey first."
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

# ── The command the task runs ────────────────────────────────────────────────
# cmd.exe wraps node so stdout/stderr can be appended to the log file.
$inner    = "`"$NodeExe`" `"$agent`" --config `"$ConfigPath`" >> `"$log`" 2>&1"
$cmdArgs  = "/d /c `"$inner`""

Write-Output "Registering Scheduled Task:"
Write-Output "  Name:     $TaskName"
Write-Output "  Trigger:  at logon of $env:USERNAME (interactive session only)"
Write-Output "  Restart:  on failure, every 1 min, up to 999 times"
Write-Output "  Workdir:  $repo"
Write-Output "  Config:   $ConfigPath"
Write-Output "  Log:      $log"
Write-Output "  Runs:     cmd.exe $cmdArgs"
Write-Output ""

if ($DryRun) {
  Write-Output "[dry-run] No task registered."
  exit 0
}

if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }

$action    = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument $cmdArgs -WorkingDirectory $repo
$trigger   = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
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
Write-Output "  Stop it:       Stop-ScheduledTask -TaskName '$TaskName'"
Write-Output "  Inspect:       Get-ScheduledTaskInfo -TaskName '$TaskName'"
Write-Output "  Tail the log:  Get-Content '$log' -Wait -Tail 50"
Write-Output "  Remove it:     powershell -NoProfile -File tools/register_payout_agent_task.ps1 -Unregister"
Write-Output ""
Write-Output "Reminder: NEVER delete or retry an armed/ambiguous .doge-send-journal.json;"
Write-Output "fund the sending wallet with a float only, never the treasury."
exit 0

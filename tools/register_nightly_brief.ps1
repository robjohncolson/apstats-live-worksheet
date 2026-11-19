# Registers (or re-registers) the APStats-NightlyBrief scheduled task. Run once, as the signed-in user.
#
# What it does: every day at 20:45 runs `node scripts/nightly-brief.mjs --with-a2`, which writes the
# nightly brief (open promises carried forward + next prep) for AP Stats B/E and Algebra 2 C/D/G into
# roster-local/brief/ (gitignored). 20:45 is after the 20:30 "A2 Tomorrow Draft" (which pulls the a2
# summaries) and before the 21:00 grade backup.
# The job runs HIDDEN through tools/run_hidden.vbs (see set_tasks_hidden.ps1 for why); each start and
# exit code is logged to tools/.schoology-sync-logs/launcher.log under the label "nightly-brief".
#
# NOT registered yet (needs teacher sign-off). Run once by hand to register:
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/register_nightly_brief.ps1
# To unregister:
#   Unregister-ScheduledTask -TaskName 'APStats-NightlyBrief' -Confirm:$false
# ASCII only.
$ErrorActionPreference = 'Stop'

$taskName = 'APStats-NightlyBrief'
$repo     = Split-Path -Parent $PSScriptRoot
$node     = (Get-Command node).Source
$wscript  = Join-Path $env:WINDIR 'System32\wscript.exe'
$launcher = Join-Path $PSScriptRoot 'run_hidden.vbs'
$script   = Join-Path $repo 'scripts\nightly-brief.mjs'

if (-not (Test-Path $launcher)) { throw "The launcher is missing: $launcher" }
if (-not (Test-Path $script))   { throw "The script is missing: $script" }

$arguments = "//B //Nologo `"$launcher`" nightly-brief `"$node`" `"$script`" --with-a2"
$action    = New-ScheduledTaskAction -Execute $wscript -Argument $arguments -WorkingDirectory $repo
$trigger   = New-ScheduledTaskTrigger -Daily -At 20:45
$settings  = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Get-ScheduledTask -TaskName $taskName | Get-ScheduledTaskInfo | Select-Object TaskName, NextRunTime

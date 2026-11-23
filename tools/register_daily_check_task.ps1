# Register the "APStats-DailyCheck" task: tools\daily_check.ps1 every day at 17:15,
# after the 16:45 Schoology sync has ended and outside the 16:00-17:05 write window.
# It starts hidden through tools\run_hidden.vbs (start and end lines go to launcher.log).
# The check only reads; its report lands in roster-local\daily-check\latest.md.
#
#   powershell -NoProfile -File tools\register_daily_check_task.ps1           # dry run
#   powershell -NoProfile -File tools\register_daily_check_task.ps1 -Apply    # register
#   Unregister-ScheduledTask -TaskName 'APStats-DailyCheck' -Confirm:$false   # remove
# ASCII only.

param([switch]$Apply)

$ErrorActionPreference = 'Stop'
$TASK = 'APStats-DailyCheck'
$AT = '17:15'

$wscript = Join-Path $env:WINDIR 'System32\wscript.exe'
$launcher = Join-Path $PSScriptRoot 'run_hidden.vbs'
$powershell = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$script = Join-Path $PSScriptRoot 'daily_check.ps1'
$arguments = "//B //Nologo `"$launcher`" daily-check `"$powershell`" -NoProfile -ExecutionPolicy Bypass -File $script"

Write-Output "Task:   $TASK, daily at $AT"
Write-Output "Action: $wscript $arguments"
if (-not $Apply) {
  Write-Output 'Dry run: nothing registered. Add -Apply.'
  exit 0
}

$action = New-ScheduledTaskAction -Execute $wscript -Argument $arguments
$trigger = New-ScheduledTaskTrigger -Daily -At $AT
# Runs on battery too (it only reads), and catches up if the PC was asleep at 17:15.
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 20)
Register-ScheduledTask -TaskName $TASK -Action $action -Trigger $trigger -Settings $settings `
  -Description 'Daily check: services, grade jobs, CI. Report: roster-local\daily-check\latest.md' -Force | Out-Null
Write-Output "Registered $TASK."

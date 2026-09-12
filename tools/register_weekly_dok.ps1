# Registers (or re-registers) the APStats-WeeklyDOK scheduled task. Run once, as the signed-in user.
# Fri 21:00 main run + Sat 07:00 catch-up; starts ASAP after a missed start; wakes from sleep; retries on failure.
# The weekly script refuses a second apply in the same week, so the catch-up is safe after a completed Friday run.
$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'weekly_dok.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -File "' + $script + '" -Apply')
$triggers = @(
  (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Friday -At 21:00),
  (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Saturday -At 07:00)
)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 30) -ExecutionTimeLimit (New-TimeSpan -Hours 3) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'APStats-WeeklyDOK' -Action $action -Trigger $triggers -Settings $settings -Force | Out-Null
Get-ScheduledTask -TaskName 'APStats-WeeklyDOK' | Get-ScheduledTaskInfo | Select-Object TaskName, NextRunTime

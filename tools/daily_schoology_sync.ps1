# Single-host teacher-laptop daily batch for the grade -> Schoology hop
# (GRADE_PIPELINE_E2E_SPEC.md section 4). One pass per open marking period
# (QUARTER_LINE_BY_DUE_DATE_SPEC.md section 4, from 2026-11-08).
#
# WHICH PASSES RUN: build_schoology_fixture.py --passes reads /class/grades config.quarters
# and prints them (finding B3, 2026-11-08; no quarter is hard-coded here):
#   - the quarter holding today (on a gap day between two quarters, the next one), and
#   - each earlier quarter that has ended but is still open for fixes (today <= its close).
#   Sun 11/08 - Thu 11/12: "Q1 Q2". From Fri 11/13: "Q2". From Sat 2027-01-23: "Q3" (and
#   "Q2" too only once grade-config carries a quarters.Q2.close).
#   If that call fails, NOTHING runs and the job exits non-zero (there is no fallback list).
# Each pass has three steps:
#   1. build_schoology_fixture.py --quarter Qn  -- GET /class/grades -> that pass's fixture
#                                                  (exit 4: the quarter has closed, skipped).
#   2. schoology_sync_section.py --quarter Qn   -- switch the gradebook to MPn, VERIFY it,
#                                                  push the fixture (abort, no writes, if not;
#                                                  the view is re-checked before every cell).
#   3. schoology_official.py --quarter Qn       -- the official override for MPn (a quarter
#                                                  that has ended never lowers; Quarter 1
#                                                  stops after its close and its final).
# A failed pass is logged and the next pass still runs; the job exits with the first
# non-zero code.
#
# MONDAY 2026-11-09, 16:30 (B) and 16:45 (E), -Live: --passes prints "Q1 Q2".
#   Quarter 1 pass: the fixture holds only Quarter 1 lessons (0 dates by Fri 11/06: B
#     through 2.3 Day 1, E through 2.1), so no 0 for an after-the-line lesson. The sync
#     selects and verifies MP1 and writes those columns (best-wins: never a lower cell);
#     the MP1 official override never goes lower.
#   Quarter 2 pass: selects and verifies MP2, creates the MP2 columns of the lessons due by
#     today, writes the scores students already have and the first Quarter 2 zeros for
#     missing work (B: 2.3 Day 2 Quiz; E: 2.2 Follow-Along / Blooket / Quiz and 2.3
#     Follow-Along / Blooket), then the MP2 official override (a Progress Check counts only
#     after its Day 2).
#   Tue-Thu the same. From Fri 11/13 only the Quarter 2 pass runs.
#
# DEFAULTS TO DRY-RUN BY DESIGN. Steps 2 and 3 write only with -Live.
#   -Q2ScoresOnly  the Quarter 2 pass builds its fixture without the lagged zeros (an earned
#                  0 still goes): the fallback while the marking-period filter is unverified.
#   -Q1Close       Quarter 1's close date, used only when /class/grades config has none
#                  (Quarter 1 only: --passes --q1-close, and --close in its steps 1 and 3).
#
# THE RIG LOCK. One Edge window serves every Schoology tool. This job holds
# tools/.schoology-sync-logs/rig.lock (schoology_sync_lib's shared lock, one line
# "<pid> <owner> <time>") for all its passes, and the python steps inherit it
# (APSTATS_RIG_LOCK_OWNER = this job's pid). The other section's run waits for it (up to 45
# minutes, then exit 5). A lock whose process is gone, or older than 3 hours, is removed.
# The column move (schoology_move_columns.py) and the close (close_quarter.py) hold the same
# lock and never START between 16:00 and 17:05, so these LIVE tasks run on time; keep any
# manual Schoology run out of 16:00-17:05 too.
#
# The teacher secret is read from the environment (ROSTER_TEACHER_SECRET), never
# the CLI, so the scheduled task can run headless. The teacher just keeps Edge
# signed into Schoology (~90-day cookie).
#
# Read-only check of the whole job (CMD 8): powershell -NoProfile -File tools/daily_schoology_sync.ps1 -Section PeriodB
# Register as a daily Scheduled Task with register_schoology_sync_task.ps1.

param(
  [string]$Section = 'PeriodB',
  [switch]$Live,
  [string]$Base = '',
  [string]$LogDir = '',
  [switch]$Q2ScoresOnly,
  [string]$Q1Close = '2026-11-12'
)

$ErrorActionPreference = 'Continue'

# This script lives in tools/; the repo root is its parent.
$toolsDir = $PSScriptRoot
$repo     = Split-Path -Parent $toolsDir

if (-not $LogDir) { $LogDir = Join-Path $toolsDir '.schoology-sync-logs' }
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }

$stamp    = Get-Date -Format 'yyyyMMdd-HHmmss'
$log      = Join-Path $LogDir "sync-$Section-$stamp.log"
# The lock lives in the default (gitignored) logs folder whatever -LogDir says.
$lockDir  = Join-Path $toolsDir '.schoology-sync-logs'
if (-not (Test-Path $lockDir)) { New-Item -ItemType Directory -Force -Path $lockDir | Out-Null }
$lockPath = Join-Path $lockDir 'rig.lock'
$script:passCodes = @{}

# Write-Host (not Write-Output): nothing a helper prints may leak into a function's result.
function Write-Log {
  param([string]$Message)
  $line = "[" + (Get-Date -Format 'HH:mm:ss') + "] $Message"
  Write-Host $line
  Add-Content -Path $log -Value $line
}

function Enter-RigLock {
  $deadline = (Get-Date).AddMinutes(45)
  while ($true) {
    try {
      New-Item -Path $lockPath -ItemType File -ErrorAction Stop | Out-Null
      Set-Content -Path $lockPath -Value "$PID $Section $(Get-Date -Format o)"
      # The python steps run inside this lock: schoology_sync_lib.acquire_rig_lock sees
      # this pid in the lock file and inherits the lock instead of waiting for it.
      $env:APSTATS_RIG_LOCK_OWNER = "$PID"
      return $true
    } catch {
      $holderPid = 0
      $line = Get-Content -Path $lockPath -TotalCount 1 -ErrorAction SilentlyContinue
      if ($line) { [void][int]::TryParse(($line -split ' ')[0], [ref]$holderPid) }
      $item = Get-Item -Path $lockPath -ErrorAction SilentlyContinue
      if (-not $item) { continue }   # released between the two checks: try again
      $old = ((Get-Date) - $item.LastWriteTime).TotalHours -gt 3
      $gone = $holderPid -gt 0 -and -not (Get-Process -Id $holderPid -ErrorAction SilentlyContinue)
      if ($gone -or $old) {
        Write-Log "Removing a stale rig lock ($line)."
        Remove-Item -Path $lockPath -Force -ErrorAction SilentlyContinue
        continue
      }
      if ((Get-Date) -gt $deadline) { return $false }
      Start-Sleep -Seconds 20
    }
  }
}

function Exit-RigLock {
  Remove-Item -Path $lockPath -Force -ErrorAction SilentlyContinue
  Remove-Item -Path Env:APSTATS_RIG_LOCK_OWNER -ErrorAction SilentlyContinue
}

# Today's quarter passes (finding B3). One roster call before the rig lock: it never
# touches Edge. Its stdout is one line: "Q1 Q2", "Q2", ... or "none".
function Get-QuarterPasses {
  $passArgs = @(
    (Join-Path $toolsDir 'build_schoology_fixture.py'),
    '--section', $Section,
    '--passes'
  )
  if ($Base) { $passArgs += @('--base', $Base) }
  if ($Q1Close) { $passArgs += @('--q1-close', $Q1Close) }

  Write-Log "PASSES: build_schoology_fixture.py --section $Section --passes$(if ($Q1Close) { " --q1-close $Q1Close" } else { '' })"
  $lines = @(& python @passArgs 2>&1 | ForEach-Object { "$_" })
  $code = $LASTEXITCODE
  foreach ($line in $lines) { Write-Log "  $line" }
  $answer = @($lines | Where-Object { $_ -match '^(none|Q[1-4]( Q[1-4])*)$' }) | Select-Object -Last 1
  return @{ Code = $code; Answer = $answer }
}

# One quarter pass: steps 1-3. Records its exit code in $script:passCodes[$Quarter].
function Invoke-QuarterPass {
  param([string]$Quarter, [bool]$NoZeros)
  $fixture = Join-Path $LogDir "fixture-$Section-$Quarter-$stamp.json"

  $buildArgs = @(
    (Join-Path $toolsDir 'build_schoology_fixture.py'),
    '--section', $Section,
    '--out', $fixture,
    '--granularity', 'component',   # SY2627: fine-grained columns = the Desk's "Schoology today"
    '--quarter', $Quarter
  )
  if ($Base) { $buildArgs += @('--base', $Base) }
  if ($Quarter -eq 'Q1' -and $Q1Close) { $buildArgs += @('--close', $Q1Close) }
  if ($NoZeros) { $buildArgs += '--no-zeros' }

  Write-Log "[$Quarter] STEP 1: build_schoology_fixture.py --section $Section --quarter $Quarter --out $fixture$(if ($NoZeros) { ' --no-zeros' } else { '' })"
  & python @buildArgs 2>&1 | Tee-Object -FilePath $log -Append | Out-Host
  $buildCode = $LASTEXITCODE
  if ($buildCode -eq 4) {
    Write-Log "[$Quarter] the quarter has closed: pass skipped."
    $script:passCodes[$Quarter] = 0
    return
  }
  if ($buildCode -ne 0) {
    Write-Log "[$Quarter] STEP 1 FAILED (exit $buildCode) -- no Schoology write in this pass."
    $script:passCodes[$Quarter] = $buildCode
    return
  }

  $syncArgs = @(
    (Join-Path $toolsDir 'schoology_sync_section.py'),
    '--sync-section', $Section,
    '--grades-fixture', $fixture,
    '--granularity', 'component',   # must match step 1; --through defaults to today (NY)
    '--quarter', $Quarter
  )
  # schoology_sync_section.py defaults to DRY-RUN since 5c283fc5 (2026-09-26): a live run must pass --apply.
  if ($Live) { $syncArgs += '--apply' } else { $syncArgs += '--dry-run' }
  # Grade-cell comments on lagged zeros ("Not a permanent 0. Missing: ...") -- teacher said
  # yes 2026-09-29, alongside quiz zeros (QUIZ_ZEROS_FROM in schoology_components.py).
  # Passed on dry runs too so a preview shows the "comment: would write ..." plan.
  $syncArgs += '--comments'
  # The fixture already left the lagged zeros out; this keeps the comment texts in step.
  if ($NoZeros) { $syncArgs += '--no-zeros' }

  Write-Log "[$Quarter] STEP 2: schoology_sync_section.py --sync-section $Section --quarter $Quarter --grades-fixture <fixture>$(if ($Live) { ' --apply' } else { ' --dry-run' }) --comments$(if ($NoZeros) { ' --no-zeros' } else { '' })"
  & python @syncArgs 2>&1 | Tee-Object -FilePath $log -Append | Out-Host
  $syncCode = $LASTEXITCODE
  if ($syncCode -ne 0) {
    Write-Log "[$Quarter] STEP 2 FAILED (exit $syncCode) -- step 3 skipped for this pass."
    $script:passCodes[$Quarter] = $syncCode
    return
  }

  # Step 3 -- official quarter grade (OFFICIAL_GRADE_SYNC_SPEC.md): recompute from tonight's
  # Schoology grades in this marking period, write each student's override, publish to the Desk.
  $officialArgs = @((Join-Path $toolsDir 'schoology_official.py'), '--section', $Section, '--quarter', $Quarter)
  if ($Quarter -eq 'Q1' -and $Q1Close) { $officialArgs += @('--close', $Q1Close) }
  if ($Live) { $officialArgs += '--apply' }
  Write-Log "[$Quarter] STEP 3: schoology_official.py --section $Section --quarter $Quarter$(if ($Live) { ' --apply' } else { '' })"
  & python @officialArgs 2>&1 | Tee-Object -FilePath $log -Append | Out-Host
  $officialCode = $LASTEXITCODE
  if ($officialCode -ne 0) {
    Write-Log "[$Quarter] STEP 3 FAILED (exit $officialCode) -- grades were pushed; official overrides need a rerun."
  }
  $script:passCodes[$Quarter] = $officialCode
}

$mode = if ($Live) { 'LIVE' } else { 'DRY-RUN' }
Write-Log "=== daily_schoology_sync started ($mode) section=$Section ==="

# The secret must come from the environment -- never accept it on the CLI.
if (-not $env:ROSTER_TEACHER_SECRET) {
  Write-Log "ERROR: ROSTER_TEACHER_SECRET is not set in the environment."
  Write-Log "       Set it once for the scheduled-task account, e.g.:"
  Write-Log "         setx ROSTER_TEACHER_SECRET <secret>"
  Write-Log "       then re-run. The secret is NEVER passed on the command line."
  exit 1
}

$passes = Get-QuarterPasses
if ($passes.Code -ne 0 -or -not $passes.Answer) {
  $failCode = $passes.Code
  if ($failCode -eq 0) { $failCode = 1 }
  Write-Log "ERROR: could not work out today's quarter passes (build_schoology_fixture.py --passes exit $($passes.Code)) -- nothing ran."
  exit $failCode
}
if ($passes.Answer -eq 'none') {
  Write-Log "No quarter is open today (config.quarters) -- nothing to sync."
  Write-Log "=== daily_schoology_sync done ($mode) no pass -- log: $log ==="
  exit 0
}
$quarters = @($passes.Answer -split ' ')
Write-Log "Today's passes: $($quarters -join ' ')"

if (-not (Enter-RigLock)) {
  Write-Log "ERROR: the Schoology rig stayed busy for 45 minutes ($lockPath) -- nothing ran."
  exit 5
}
try {
  foreach ($quarter in $quarters) {
    $noZeros = ($quarter -eq 'Q2') -and [bool]$Q2ScoresOnly
    Invoke-QuarterPass -Quarter $quarter -NoZeros $noZeros
  }
} finally {
  Exit-RigLock
}

$exitCode = 0
$codes = @()
foreach ($quarter in $quarters) {
  $code = $script:passCodes[$quarter]
  if ($null -eq $code) { $code = 1 }   # a pass that recorded no exit code did not finish
  $codes += "$quarter=$code"
  if ($exitCode -eq 0 -and $code -ne 0) { $exitCode = $code }
}
Write-Log "=== daily_schoology_sync done ($mode) $($codes -join ' ') -- log: $log ==="
exit $exitCode

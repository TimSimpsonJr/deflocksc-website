<#
.SYNOPSIS
  Refresh the SC camera count from DeFlock's CDN, on this machine.

.DESCRIPTION
  DeFlock's Cloudflare CDN returns 403 to datacenter egress (GitHub Actions
  runners, Netlify), so the scheduled GitHub workflow cannot fetch the data.
  A residential IP is served normally, so this script runs the same
  fetch -> derive -> commit that the workflow would, from a Windows Scheduled
  Task on this machine. See .github/workflows/refresh-camera-data.yml (kept as a
  manual-only fallback) and docs/plans/2026-09-04-live-camera-counter-design.md.

  It deliberately does NOT run `npm run prebuild`: the only input build-impact
  needs, public/districts/sc-counties.json, is already committed, and prebuild
  would rewrite git-ignored/tracked artifacts and muddy the tree. It commits
  only when the actual camera data changes; impact-stats.json bumps a
  generatedAt timestamp every run, so an unchanged fetch is discarded rather
  than committed as a daily no-op. fetch-camera-data validates the CDN payload
  all-or-nothing and exits non-zero on anything malformed, so a bad response can
  never be committed.

.PARAMETER DryRun
  Do everything except git add/commit/push. Reports whether a commit WOULD
  happen and leaves the working tree as-is for inspection.

.NOTES
  Logs to %LOCALAPPDATA%\DeflockSC\refresh-camera-data.log (never committed).
  Targets Windows PowerShell 5.1 (powershell.exe), the Scheduled Task host.
#>
[CmdletBinding()]
param([switch]$DryRun)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Repo root = the parent of this script's scripts/ directory.
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $RepoRoot

$LogDir = Join-Path $env:LOCALAPPDATA 'DeflockSC'
[void](New-Item -ItemType Directory -Force -Path $LogDir)
$LogFile = Join-Path $LogDir 'refresh-camera-data.log'

function Log([string]$msg) {
  $line = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Write-Host $line
  Add-Content -LiteralPath $LogFile -Value $line
}

# Run a native command, mirror its output to the log, and throw on nonzero exit.
# ErrorActionPreference is dropped to Continue for the call because Windows
# PowerShell 5.1 wraps a native command's stderr lines into ErrorRecords under
# 2>&1 and would otherwise throw on npm/git progress written to stderr.
function Invoke-Checked([string]$exe, [string[]]$argv) {
  Log "> $exe $($argv -join ' ')"
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $exe @argv 2>&1 | ForEach-Object { Log "  $_" }
    $code = $LASTEXITCODE
  }
  finally { $ErrorActionPreference = $prev }
  if ($code -ne 0) { throw "$exe $($argv -join ' ') exited $code" }
}

try {
  Log "=== refresh start (DryRun=$($DryRun.IsPresent)) ==="

  foreach ($cmd in 'git', 'npm', 'node') {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
      throw "$cmd not found on PATH. A Scheduled Task's PATH can differ from your interactive shell; if this fires, point the task at absolute exe paths."
    }
  }

  $branch = (& git rev-parse --abbrev-ref HEAD).Trim()
  if ($branch -ne 'master') { throw "Expected branch 'master' but on '$branch'; aborting." }

  # Refuse a dirty tree so an automated data commit never sweeps in unrelated
  # edits. Untracked (??) files are allowed; only tracked/staged changes block.
  $dirty = @(& git status --porcelain | Where-Object { $_ -notmatch '^\?\? ' })
  if ($dirty.Count -gt 0) {
    throw "Working tree has tracked changes; aborting:`n$($dirty -join "`n")"
  }

  Invoke-Checked git @('pull', '--ff-only')
  Invoke-Checked npm @('run', 'fetch-camera-data')
  Invoke-Checked npm @('run', 'build-impact-stats')

  & git diff --quiet -- public/camera-data.json public/camera-counts.json
  $dataChanged = ($LASTEXITCODE -ne 0)

  if (-not $dataChanged) {
    Log 'No camera-data change; discarding generatedAt-only churn and finishing.'
    & git checkout -- public/camera-data.json public/camera-counts.json src/data/impact-stats.json 2>&1 |
      ForEach-Object { Log "  $_" }
    Log '=== refresh done (no change) ==='
    return
  }

  Log 'Camera data changed.'
  if ($DryRun) {
    Log 'DryRun: WOULD commit + push camera-data.json, camera-counts.json, impact-stats.json.'
    & git --no-pager diff --stat -- public/camera-data.json public/camera-counts.json src/data/impact-stats.json 2>&1 |
      ForEach-Object { Log "  $_" }
    Log '=== refresh done (dry run; tree left modified for inspection) ==='
    return
  }

  Invoke-Checked git @('add', 'public/camera-data.json', 'public/camera-counts.json', 'src/data/impact-stats.json')
  Invoke-Checked git @('commit', '-m', 'chore: refresh camera data + impact stats (local scheduled run)')
  Invoke-Checked git @('push')
  Log '=== refresh done (committed + pushed) ==='
}
catch {
  Log "ERROR: $($_.Exception.Message)"
  exit 1
}

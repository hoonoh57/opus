# opus-safe module v3
# ASCII only. Never put non-ASCII characters in this file (PowerShell 5.1 reads BOM-less UTF-8 as ANSI).
# Usage: see .claude/skills/repo-sync/SKILL.md section 3.
function Invoke-OpusSafe {
  param(
    [Parameter(Mandatory = $true)][string]$Repo,
    [Parameter(Mandatory = $true)][string]$Commit,
    [object[]]$Edits = @(),
    [System.Collections.IDictionary]$Files = $null,
    [string[]]$Canary = @()
  )
  $ErrorActionPreference = 'Stop'
  $U8 = New-Object System.Text.UTF8Encoding $false
  try { [Console]::OutputEncoding = $U8 } catch {}

  function G {
    $ErrorActionPreference = 'Continue'
    $o = ((& git @args 2>&1) | ForEach-Object { "$_" }) -join ' '
    if ($LASTEXITCODE -ne 0) {
      if ($o.Length -gt 300) { $o = $o.Substring(0, 300) }
      throw ('git ' + ($args -join ' ') + ' failed: ' + $o)
    }
    return $o.Trim()
  }
  function CheckPath($p) {
    if ($p -match '(^|[\\/])\.git([\\/]|$)' -or $p -match '(^|[\\/])\.env($|\.)' -or $p.Contains('..')) { throw ('blocked path: ' + $p) }
  }

  $Base = $null
  try {
    foreach ($c in $Canary) {
      if ($c -cne [string][char]0xAC00) { throw 'Korean text was broken by console paste. Nothing changed.' }
    }
    if (-not (Test-Path (Join-Path $Repo '.git'))) { throw ('not a git repo: ' + $Repo) }
    Set-Location $Repo
    if (G status --porcelain) { throw 'uncommitted changes exist. aborted (original protected)' }
    G pull --ff-only -q | Out-Null
    $Base = G rev-parse --short HEAD

    $Out = [ordered]@{}
    $n = 0
    foreach ($e in $Edits) {
      $n++
      $p = [string]$e.Path
      CheckPath $p
      $full = Join-Path $Repo $p
      if ($Out.Contains($p)) { $src = $Out[$p] } else {
        if (-not (Test-Path $full)) { throw ('edit#' + $n + ' file not found: ' + $p) }
        $src = [System.IO.File]::ReadAllText($full, $U8)
        if ($src.IndexOf([char]0xFFFD) -ge 0) { throw ('edit#' + $n + ' source already broken: ' + $p) }
      }
      $nl = "`n"
      if ($src.Contains("`r`n")) { $nl = "`r`n" }
      $old = ([string]$e.Old).Replace("`r`n", "`n").Replace("`n", $nl)
      $new = ([string]$e.New).Replace("`r`n", "`n").Replace("`n", $nl)
      if ($old.Length -eq 0) { throw ('edit#' + $n + ' empty search text: ' + $p) }
      $i = $src.IndexOf($old, [System.StringComparison]::Ordinal)
      if ($i -lt 0) { throw ('edit#' + $n + ' 0 matches: ' + $p) }
      if ($src.IndexOf($old, $i + 1, [System.StringComparison]::Ordinal) -ge 0) { throw ('edit#' + $n + ' 2+ matches: ' + $p) }
      $Out[$p] = $src.Substring(0, $i) + $new + $src.Substring($i + $old.Length)
    }
    if ($null -ne $Files) {
      foreach ($p in @($Files.Keys)) {
        CheckPath $p
        $t = ([string]$Files[$p]).Replace("`r`n", "`n")
        if (-not $t.EndsWith("`n")) { $t += "`n" }
        $Out[$p] = $t
      }
    }
    if ($Out.Count -eq 0) { throw 'nothing to change' }

    foreach ($p in @($Out.Keys)) {
      $full = Join-Path $Repo $p
      $dir = Split-Path $full -Parent
      if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
      [System.IO.File]::WriteAllText($full, $Out[$p], $U8)
      $back = [System.IO.File]::ReadAllText($full, $U8)
      if ($back -cne $Out[$p]) { throw ('write verify failed: ' + $p) }
      if ($back.IndexOf([char]0xFFFD) -ge 0) { throw ('broken char found: ' + $p) }
    }

    G add -A | Out-Null
    if (-not (G status --porcelain)) { throw 'no actual change after write' }
    G commit -q -m $Commit | Out-Null
    G push -q | Out-Null
    $fc = 0; if ($null -ne $Files) { $fc = $Files.Count }
    Write-Host ('OK ' + $Base + ' -> ' + (G rev-parse --short HEAD) + ' edits ' + @($Edits).Count + ', files ' + $fc)
  }
  catch {
    Write-Host ('FAIL ' + $_.Exception.Message)
    if ($Base) { Write-Host ('RESTORE: cd ' + $Repo + '; git reset --hard ' + $Base + '; git clean -fd') }
  }
}

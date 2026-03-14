Param(
  [switch]$OpenBrowser
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$pgBin = 'C:\Program Files\PostgreSQL\18\bin'
if (Test-Path $pgBin) {
  $env:Path = "$env:Path;$pgBin"
}

function Get-EnvMap($path) {
  $map = @{}
  if (-not (Test-Path $path)) { return $map }
  Get-Content $path | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq '' -or $line.StartsWith('#')) { return }
    $idx = $line.IndexOf('=')
    if ($idx -lt 1) { return }
    $key = $line.Substring(0, $idx).Trim()
    $val = $line.Substring($idx + 1).Trim()
    if ($val.StartsWith('"') -and $val.EndsWith('"')) { $val = $val.Trim('"') }
    $map[$key] = $val
  }
  return $map
}

$envPath = Join-Path $root 'server\.env'
$envMap = Get-EnvMap $envPath

Write-Host "Checking database connectivity..."
$psql = Get-Command psql -ErrorAction SilentlyContinue
if ($null -eq $psql) {
  Write-Warning "psql not found in PATH. Skipping DB check."
} else {
  $dbHost = $envMap['DB_HOST']
  $dbUser = $envMap['DB_USER']
  $dbName = $envMap['DB_NAME']
  $dbPass = $envMap['DB_PASSWORD']

  if ($dbHost -and $dbUser -and $dbName -and $dbPass) {
    $env:PGPASSWORD = $dbPass
    try {
      psql -h $dbHost -U $dbUser -d $dbName -c "SELECT 1;" | Out-Null
      Write-Host "DB check OK."
    } catch {
      Write-Warning "DB check failed. Backend may not work until DB is reachable."
    }
  } else {
    Write-Warning "DB settings missing in server\.env. Skipping DB check."
  }
}

Write-Host "Starting backend..."
Push-Location "$root\server"
Start-Process -WindowStyle Minimized -FilePath "node" -ArgumentList "index.js"
Pop-Location

Write-Host "Starting frontend..."
Push-Location "$root\client"
Start-Process -WindowStyle Minimized -FilePath "npx" -ArgumentList "serve ."
Pop-Location

if ($OpenBrowser) {
  Start-Sleep -Seconds 2
  Start-Process "http://localhost:3000/index.html"
}

Write-Host "Done. Backend on http://localhost:7000 and frontend on http://localhost:3000"

param(
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 5173
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $projectRoot "backend"
$frontendDir = Join-Path $projectRoot "frontend"
$python = Join-Path $projectRoot ".venv\Scripts\python.exe"
$npm = Join-Path $projectRoot "tools\node-v24.16.0-win-x64\npm.cmd"

if (-not (Test-Path -LiteralPath $python)) {
    throw "Project virtual environment not found: $python"
}

if (-not (Test-Path -LiteralPath $npm)) {
    $npm = "npm.cmd"
}

$backendArgs = @(
    "-NoProfile",
    "-WindowStyle", "Hidden",
    "-Command",
    "Set-Location -LiteralPath '$backendDir'; & '$python' -m uvicorn main:app --host 127.0.0.1 --port $BackendPort"
)
Start-Process -FilePath "powershell.exe" -ArgumentList $backendArgs -WorkingDirectory $backendDir -WindowStyle Hidden

$backendReady = $false
for ($attempt = 1; $attempt -le 20; $attempt++) {
    Start-Sleep -Milliseconds 500
    try {
        $health = Invoke-WebRequest -Uri "http://127.0.0.1:$BackendPort/api/health" -UseBasicParsing -TimeoutSec 2
        if ($health.StatusCode -eq 200) {
            $backendReady = $true
            break
        }
    }
    catch {
        # Uvicorn is still starting; retry briefly.
    }
}

if (-not $backendReady) {
    throw "Backend did not start on port $BackendPort. Check backend/.env and dependencies."
}

Write-Host "Backend health check passed: http://127.0.0.1:$BackendPort/api/health"
Write-Host "Frontend: http://127.0.0.1:$FrontendPort"
Write-Host "Press Ctrl+C in this window to stop the frontend dev server."

Set-Location -LiteralPath $frontendDir
& $npm run dev -- --host 127.0.0.1 --port $FrontendPort

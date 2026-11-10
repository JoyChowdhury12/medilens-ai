# MediLens: start everything with one command.
#   Right-click the file > "Run with PowerShell", or in a terminal:  .\start-medilens.ps1
#   Optional public link for showing on another device:            .\start-medilens.ps1 -Tunnel
# If PowerShell blocks the script, run once:  Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
param([switch]$Tunnel, [switch]$NoBrowser)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ErrorActionPreference = 'Continue'

function Test-Port($port) {
  try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1', $port); $c.Close(); return $true } catch { return $false }
}
function Step($text) { Write-Host ""; Write-Host "==> $text" -ForegroundColor Cyan }
function Ok($text)   { Write-Host "    OK   $text" -ForegroundColor Green }
function Warn($text) { Write-Host "    NOTE $text" -ForegroundColor Yellow }
function Wait-Port($port, $seconds) {
  for ($i = 0; $i -lt $seconds; $i++) { if (Test-Port $port) { return $true }; Start-Sleep -Seconds 1 }
  return $false
}
function Launch($title, $dir, $cmd) {
  Start-Process powershell -ArgumentList '-NoExit', '-Command', "`$Host.UI.RawUI.WindowTitle='$title'; Set-Location '$dir'; $cmd"
}

Write-Host "MediLens" -ForegroundColor Cyan

# 1. Database
Step "Database (PostgreSQL, port 5432)"
if (Test-Port 5432) { Ok "already running" }
elseif (Get-Command docker -ErrorAction SilentlyContinue) {
  Warn "not running, trying Docker"
  Push-Location "$root\backend"; docker compose up -d 2>&1 | Out-Null; Pop-Location
  if (Wait-Port 5432 40) { Ok "started with Docker" } else { Warn "database did not start. Start PostgreSQL and run again." }
} else { Warn "PostgreSQL is not running. Start it (Windows service or Docker) and run this script again." }

# 2. Ollama (our fine-tuned explanation model)
Step "Explanation model (Ollama, port 11434)"
$env:OLLAMA_NUM_PARALLEL = '4'
if (Test-Port 11434) { Ok "already running" }
elseif (Get-Command ollama -ErrorAction SilentlyContinue) {
  Start-Process powershell -WindowStyle Minimized -ArgumentList '-NoExit', '-Command', "`$Host.UI.RawUI.WindowTitle='MediLens - Ollama'; `$env:OLLAMA_NUM_PARALLEL='4'; ollama serve"
  if (Wait-Port 11434 20) { Ok "started" } else { Warn "Ollama did not start. The app still works with template explanations." }
} else { Warn "Ollama not found. The app still works with template explanations." }

# 3. AI service
Step "AI service (port 8000)"
if (-not (Test-Path "$root\.env") -and (Test-Path "$root\.env.example")) { Copy-Item "$root\.env.example" "$root\.env"; Ok "created .env from .env.example" }
if (Test-Port 8000) { Ok "already running" }
else {
  $activate = if (Test-Path "$root\venv\Scripts\Activate.ps1") { "& '$root\venv\Scripts\Activate.ps1'; " } else { "" }
  New-Item -ItemType Directory -Force -Path "$root\.run-logs" | Out-Null
  Launch 'MediLens - AI service' $root "${activate}python -m uvicorn api.main:app --port 8000 2>&1 | Tee-Object -FilePath '$root\.run-logs\ai-live.log'"
  if (Wait-Port 8000 60) { Ok "started" } else { Warn "AI service did not start. Look at its window for the error." }
}

# 4. Backend
Step "Backend (port 4000)"
if (Test-Port 4000) { Ok "already running" }
else {
  New-Item -ItemType Directory -Force -Path "$root\.run-logs" | Out-Null
  Launch 'MediLens - Backend' "$root\backend" "npm run start:dev 2>&1 | Tee-Object -FilePath '$root\.run-logs\backend-live.log'"
  if (Wait-Port 4000 90) { Ok "started" } else { Warn "Backend did not start. Look at its window for the error." }
}

# 5. Website
Step "Website (port 3000)"
if (Test-Port 3000) { Ok "already running" }
else {
  Launch 'MediLens - Website' "$root\frontend" "npm run dev"
  if (Wait-Port 3000 90) { Ok "started" } else { Warn "Website did not start. Look at its window for the error." }
}

# 6. Health check
Step "Health check"
try {
  $h = Invoke-RestMethod http://localhost:8000/health -TimeoutSec 8
  Ok ("AI service ok. Fine-tuned model: " + $(if ($h.fine_tuned_model -eq 'on') { 'ON' } else { 'off (templates will be used)' }))
} catch { Warn "Could not read http://localhost:8000/health" }

# 7. Optional public link (Cloudflare Tunnel)
if ($Tunnel) {
  Step "Public link"
  if (Get-Command cloudflared -ErrorAction SilentlyContinue) {
    Warn "Look in the new window for the https://...trycloudflare.com address. Use sample reports only, and close that window when you are done."
    Launch 'MediLens - Public link' $root "cloudflared tunnel --url http://localhost:3000"
  } else { Warn "cloudflared is not installed. Install it with:  winget install Cloudflare.cloudflared" }
}

Write-Host ""
Write-Host "Ready:  http://localhost:3000" -ForegroundColor Green
Write-Host "Close the 'MediLens - ...' windows to stop everything."
if (-not $NoBrowser) { Start-Process "http://localhost:3000" }

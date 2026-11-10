# MediLens: stop everything started by start-medilens.ps1.
#   .\stop-medilens.ps1            stops the website, backend and AI service (database and Ollama keep running)
#   .\stop-medilens.ps1 -All       also stops Ollama
param([switch]$All)

function Stop-Port($port, $name) {
  $pids = @(netstat -ano | Select-String ":$port\s" | ForEach-Object { ($_.ToString().Trim() -split '\s+')[-1] } |
    Where-Object { $_ -match '^\d+$' -and $_ -ne '0' } | Sort-Object -Unique)
  if ($pids.Count -eq 0) { Write-Host "    --   $name (port $port) was not running" -ForegroundColor DarkGray; return }
  foreach ($p in $pids) { taskkill /PID $p /F /T 2>&1 | Out-Null }
  Write-Host "    OK   $name stopped" -ForegroundColor Green
}

Write-Host "Stopping MediLens" -ForegroundColor Cyan
Stop-Port 3000 "Website"
Stop-Port 4000 "Backend"
Stop-Port 8000 "AI service"
if ($All) {
  Stop-Port 11434 "Ollama"
  Get-Process ollama*, "ollama app" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

# Close the windows that start-medilens.ps1 opened (their titles start with "MediLens - ")
Get-Process powershell, pwsh -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowTitle -like 'MediLens - *' -and $_.Id -ne $PID } |
  Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Done. Start again with:  .\start-medilens.ps1" -ForegroundColor Green

# Capture every SAHARA view at 1440x900 (2x) with headless Edge.
# Requires the API (port 8000) and web app (port 5173) to be running.
param([string[]]$Views = @("welfare", "commander", "personnel", "audit", "metrics"))

$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "C:\Program Files\Microsoft\Edge\Application\msedge.exe" }
$outDir = Join-Path $PSScriptRoot "..\docs\screenshots"
New-Item -ItemType Directory -Force $outDir | Out-Null

foreach ($v in $Views) {
    $out = Join-Path (Resolve-Path $outDir) "$v.png"
    $args = @("--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2",
              "--window-size=1440,900", "--virtual-time-budget=15000", "--user-data-dir=$env:TEMP\sahara-edge",
              "--screenshot=$out", "http://localhost:5173/#$v")
    Start-Process -FilePath $edge -ArgumentList $args -Wait -NoNewWindow -RedirectStandardError "$env:TEMP\sahara-edge.log"
    if (Test-Path $out) { Write-Output "saved $out" } else { Write-Output "FAILED $v (see $env:TEMP\sahara-edge.log)" }
}

# Forja: installation in one command (Windows, PowerShell 5.1 or 7).
#
#   .\install.ps1                 build, create the administrator, start, open the browser
#   .\install.ps1 -Demo           ... and load the demo project
#   .\install.ps1 -Ollama         ... with an Ollama container (several GB more)
#   .\install.ps1 -NoBrowser      do not open the browser
#   .\install.ps1 -KeepBuildCache keep Docker's build cache after the build
#
# Needs Docker Desktop. Data stays in Docker volumes: `docker compose down` keeps them,
# `docker compose down -v` deletes them.
param(
    [switch]$Demo,
    [switch]$Ollama,
    [switch]$NoBrowser,
    [switch]$KeepBuildCache
)
$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

function Say($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }
function Fail($text) { Write-Host "`nErreur : $text" -ForegroundColor Red; exit 1 }

$port = if ($env:FORJA_WEB_PORT) { [int]$env:FORJA_WEB_PORT } else { 3000 }
$neededGb = if ($Ollama) { 12 } else { 4 }

Say "Prérequis"
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Fail "Docker est introuvable : installez Docker Desktop."
}
docker info *> $null
if ($LASTEXITCODE -ne 0) { Fail "Docker ne répond pas : démarrez Docker Desktop puis relancez." }
docker compose version *> $null
if ($LASTEXITCODE -ne 0) { Fail "docker compose (v2) est requis." }
Write-Host ("Docker " + (docker version --format "{{.Server.Version}}") + ", compose " + (docker compose version --short))

$drive = (Get-Item -Path $PSScriptRoot).PSDrive
$freeGb = [math]::Floor($drive.Free / 1GB)
Write-Host "Espace libre sur $($drive.Name): : $freeGb Go (au moins $neededGb Go nécessaires)"
if ($freeGb -lt $neededGb) { Fail "pas assez d'espace disque pour construire les images." }
if ($Ollama) {
    Write-Host "Profil ollama : l'image Ollama pèse environ 4 Go, chaque modèle plusieurs Go de plus."
}

$busy = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
if ($busy -and -not (docker compose ps --status running web 2>$null | Select-String "web")) {
    Fail "le port $port est déjà utilisé : `$env:FORJA_WEB_PORT=3001; .\install.ps1"
}

if ($Ollama) {
    # Kept in .env, so that a later `docker compose up -d` starts the same services.
    if (-not (Test-Path .env)) { New-Item -ItemType File .env | Out-Null }
    $envText = Get-Content .env -Raw
    if ($envText -notmatch "(?m)^COMPOSE_PROFILES=") { Add-Content .env "COMPOSE_PROFILES=ollama" }
    if ($envText -notmatch "(?m)^FORJA_OLLAMA_URL=") { Add-Content .env "FORJA_OLLAMA_URL=http://ollama:11434" }
    $env:FORJA_OLLAMA_URL = "http://ollama:11434"
}

Say "Construction des images"
docker compose build
if ($LASTEXITCODE -ne 0) { Fail "la construction des images a échoué." }
# Former Forja images left without a tag, then the build cache (intermediate layers),
# not needed once the images exist; -KeepBuildCache keeps the latter.
docker image prune -f --filter dangling=true --filter "label=org.opencontainers.image.source=https://github.com/koutamMoulaye/Forja" | Out-Null
if (-not $KeepBuildCache) {
    Write-Host "Suppression du cache de construction Docker (-KeepBuildCache pour le garder)"
    docker builder prune -f | Out-Null
}

Say "Premier démarrage"
$init = @("compose", "run", "--rm", "--no-deps", "api", "forja", "init")
if ($Demo) { $init += "--demo" }
& docker @init
if ($LASTEXITCODE -ne 0) { Fail "l'initialisation a échoué." }

Say "Démarrage"
$up = @("compose")
if ($Ollama) { $up += @("--profile", "ollama") }
$up += @("up", "-d")
& docker @up
if ($LASTEXITCODE -ne 0) { Fail "le démarrage a échoué : docker compose logs" }

$url = "http://localhost:$port"
Write-Host -NoNewline "Attente de $url "
$ready = $false
for ($i = 0; $i -lt 90; $i++) {
    try {
        Invoke-WebRequest -Uri "$url/api/health" -UseBasicParsing -TimeoutSec 3 | Out-Null
        $ready = $true
        break
    } catch {
        Write-Host -NoNewline "."
        Start-Sleep -Seconds 2
    }
}
if (-not $ready) { Fail "Forja ne répond pas : docker compose logs" }
Write-Host " prêt."

if (-not $NoBrowser) { Start-Process $url }
if ($Ollama) {
    Write-Host "Modèle local : docker compose exec ollama ollama pull qwen3.5:9b (environ 6 Go),"
    Write-Host "puis Réglages > Fournisseur IA > Ollama."
}
Say "Forja tourne sur $url (arrêt : docker compose down)"

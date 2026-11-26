# IA local do Ampara (ADR-0010): roda ao ligar o PC, pela tarefa "Ampara IA local".
# 1) servidor do LM Studio só em 127.0.0.1:1234 (sem CORS); 2) modelos carregados como "ampara" e "ampara-sentido";
# 3) intermediário em 127.0.0.1:1235 que só aceita o Ampara. O Tailscale publica o 1235 na rede privada.
# Fica de vigia: a cada 30 s confere as três peças e religa a que caiu (a tarefa do Windows só reinicia em falha).
$ErrorActionPreference = 'Continue'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$config = Get-Content (Join-Path $dir 'config.json') -Raw | ConvertFrom-Json
$log = Join-Path $dir 'ia-local.log'
$proxyLog = Join-Path $dir 'intermediario.log'
function Write-Log($msg) {
  # o registro não cresce sem fim: passou de 2 MB, guarda só o último pedaço
  if ((Test-Path $log) -and (Get-Item $log).Length -gt 2MB) { Get-Content $log -Tail 200 | Set-Content $log -Encoding utf8 }
  "$(Get-Date -Format 's') $msg" | Add-Content -Path $log -Encoding utf8
}

$lms = Join-Path $env:USERPROFILE '.lmstudio\bin\lms.exe'
if (-not (Test-Path $lms)) { Write-Log 'LM Studio (lms) não encontrado.'; exit 1 }
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { Write-Log 'Node.js não encontrado.'; exit 1 }

function Test-Lms {
  try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 http://127.0.0.1:1234/v1/models | Out-Null; return $true } catch { return $false }
}

function Start-Lms {
  Write-Log 'Iniciando o servidor do LM Studio...'
  & $lms server start --port 1234 *>> $log
  for ($i = 0; $i -lt 60 -and -not (Test-Lms); $i++) { Start-Sleep -Seconds 2 }
}

# carrega o que falta (o LM Studio pode descarregar um modelo para usar outro)
function Confirm-Models {
  $loaded = (& $lms ps 2>$null | Out-String)
  if ($loaded -notmatch '(?m)^ampara\s') {
    Write-Log "Carregando o modelo $($config.model)..."
    # --gpu max: o modelo inteiro na placa; --parallel 1: uma conversa por vez (menos memória, nada vai para a RAM)
    & $lms load $config.model --identifier ampara --gpu max --context-length $config.context --parallel $config.parallel -y *>> $log
  }
  # modelo de sentido (ADR-0012): pequeno (~230 MB), carregado junto
  if ($config.senseModel -and $loaded -notmatch '(?m)^ampara-sentido\s') {
    Write-Log "Carregando o modelo de sentido $($config.senseModel)..."
    & $lms load $config.senseModel --identifier ampara-sentido --gpu max -y *>> $log
  }
}

$port = if ($config.port) { [string]$config.port } else { '1235' }
$env:AMPARA_AI_PORT = $port
$env:LMSTUDIO_URL = 'http://127.0.0.1:1234'
$env:AMPARA_ORIGINS = ($config.origins -join ',')
function Start-Proxy {
  Write-Log "Ligando o intermediário (127.0.0.1:$port)..."
  Start-Process -FilePath $node -ArgumentList "`"$(Join-Path $dir 'proxy.cjs')`"" -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $proxyLog -RedirectStandardError "$proxyLog.erro"
}

if (-not (Test-Lms)) { Start-Lms }
Confirm-Models
$proxy = Start-Proxy

while ($true) {
  Start-Sleep -Seconds 30
  if (-not (Test-Lms)) {
    Write-Log 'O LM Studio não respondeu: religando.'
    Start-Lms
  }
  Confirm-Models
  if ($proxy.HasExited) {
    Write-Log 'O intermediário caiu: religando.'
    Start-Sleep -Seconds 2
    $proxy = Start-Proxy
  }
}

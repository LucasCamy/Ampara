# IA local do Ampara (ADR-0010): roda ao ligar o PC, pela tarefa "Ampara IA local".
# 1) servidor do LM Studio só em 127.0.0.1:1234 (sem CORS); 2) modelo carregado como "ampara";
# 3) intermediário em 127.0.0.1:1235 que só aceita o Ampara. O Tailscale publica o 1235 na rede privada.
$ErrorActionPreference = 'Continue'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$config = Get-Content (Join-Path $dir 'config.json') -Raw | ConvertFrom-Json
$log = Join-Path $dir 'ia-local.log'
function Write-Log($msg) { "$(Get-Date -Format 's') $msg" | Add-Content -Path $log -Encoding utf8 }

$lms = Join-Path $env:USERPROFILE '.lmstudio\bin\lms.exe'
if (-not (Test-Path $lms)) { Write-Log 'LM Studio (lms) não encontrado.'; exit 1 }

Write-Log 'Iniciando o servidor do LM Studio...'
& $lms server start --port 1234 *>> $log

# espera o servidor responder (até 2 minutos)
for ($i = 0; $i -lt 60; $i++) {
  try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 http://127.0.0.1:1234/v1/models | Out-Null; break } catch { Start-Sleep -Seconds 2 }
}

Write-Log "Carregando o modelo $($config.model)..."
# --gpu max: o modelo inteiro na placa; --parallel 1: uma conversa por vez (menos memória, nada vai para a RAM)
& $lms load $config.model --identifier ampara --gpu max --context-length $config.context --parallel $config.parallel -y *>> $log

$env:AMPARA_AI_PORT = '1235'
$env:LMSTUDIO_URL = 'http://127.0.0.1:1234'
$env:AMPARA_ORIGINS = ($config.origins -join ',')
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { Write-Log 'Node.js não encontrado.'; exit 1 }
Write-Log 'Intermediário no ar (127.0.0.1:1235).'
# fica rodando: a tarefa do Windows acompanha este processo e reinicia se ele cair
& $node (Join-Path $dir 'proxy.cjs') *>> $log

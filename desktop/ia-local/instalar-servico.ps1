# Instala a IA local do Ampara para ligar junto com o PC (ADR-0010). Rode UMA vez, como administrador:
#   powershell -ExecutionPolicy Bypass -File desktop\ia-local\instalar-servico.ps1
# O Windows pede a sua senha numa janela própria: ela fica com o Agendador de Tarefas, não com o Ampara.
#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
$src = Split-Path -Parent $MyInvocation.MyCommand.Path
$dest = Join-Path $env:LOCALAPPDATA 'Ampara\ia-local'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item (Join-Path $src 'iniciar.ps1'), (Join-Path $src 'proxy.cjs'), (Join-Path $src 'config.json') -Destination $dest -Force
Write-Host "Arquivos copiados para $dest"

$user = "$env:USERDOMAIN\$env:USERNAME"
$cred = Get-Credential -UserName $user -Message 'Senha do Windows: a IA local do Ampara liga mesmo antes de você entrar.'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$dest\iniciar.ps1`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'Ampara IA local' -Description 'LM Studio + intermediário do Ampara (ADR-0010)' `
  -Action $action -Trigger $trigger -Settings $settings -User $cred.UserName -Password $cred.GetNetworkCredential().Password -RunLevel Limited -Force | Out-Null
Write-Host 'Tarefa "Ampara IA local" criada: liga ao iniciar o PC.'

# Publica o intermediário só na sua rede Tailscale, com HTTPS (não é "funnel": nada fica aberto na internet)
$ts = Get-Command tailscale -ErrorAction SilentlyContinue
if ($ts) {
  tailscale serve --bg --https=443 http://127.0.0.1:1235
  Write-Host 'Tailscale: endereço publicado na sua rede privada.'
  tailscale serve status
} else {
  Write-Warning 'Tailscale não encontrado. Instale e rode: tailscale serve --bg --https=443 http://127.0.0.1:1235'
}

# Para um intermediário que esteja rodando à mão (senão a porta 1235 fica ocupada)
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -like '*proxy.cjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -Confirm:$false }
Start-ScheduledTask -TaskName 'Ampara IA local'
Write-Host 'Pronto. A IA local está subindo (o modelo leva ~30 s para carregar).'

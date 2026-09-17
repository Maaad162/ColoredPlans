param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z][a-z0-9-]+[a-z0-9]$')]
  [string]$ProjetoId,
  [switch]$Aplicar
)

$ErrorActionPreference = 'Stop'
$tokenAdministrativo = gcloud auth print-access-token
if ($LASTEXITCODE -ne 0 -or !$tokenAdministrativo) {
  throw 'Autentique o responsavel tecnico com gcloud auth login antes de continuar.'
}
$cabecalhos = @{ Authorization = "Bearer $tokenAdministrativo" }
$endpoint = "https://identitytoolkit.googleapis.com/admin/v2/projects/$ProjetoId/config"
if ($Aplicar) {
  $corpo = @{ client = @{ permissions = @{ disabledUserSignup = $true } } } | ConvertTo-Json -Depth 4
  Invoke-RestMethod -Method Patch -Uri "$endpoint`?updateMask=client.permissions.disabledUserSignup" `
    -Headers $cabecalhos -ContentType 'application/json' -Body $corpo | Out-Null
}
$configuracao = Invoke-RestMethod -Method Get -Uri $endpoint -Headers $cabecalhos
if ($configuracao.client.permissions.disabledUserSignup -ne $true) {
  throw 'Cadastro publico ainda habilitado no Authentication. Revise o projeto e execute com -Aplicar para bloquea-lo.'
}
Write-Output "Projeto ${ProjetoId}: cadastro de usuarios finais bloqueado no Authentication."

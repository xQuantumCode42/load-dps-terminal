param([switch]$Initialize)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'windows-path.ps1')
$snapshot = Join-Path $env:LD_SESSION 'path.json'
$latest = @(Get-LDPersistedPath)
$previous = @()
if (Test-Path -LiteralPath $snapshot) { $previous = @(Get-Content -LiteralPath $snapshot -Raw | ConvertFrom-Json) }
$merged = Merge-LDPath $env:PATH $previous $latest
Write-LDCmdPath $merged (Join-Path $env:LD_SESSION 'apply.cmd')
ConvertTo-Json -InputObject @($latest) -Compress | Set-Content -LiteralPath $snapshot -Encoding UTF8
$request = Join-Path $env:LD_SESSION 'refresh.request'
if (Test-Path -LiteralPath $request) { Remove-Item -LiteralPath $request -Force }
Write-LDStatus $env:LD_SESSION 'refreshed'

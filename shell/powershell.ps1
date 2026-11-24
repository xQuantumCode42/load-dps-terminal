# Session-only bootstrap. Profiles have already run because -NoProfile is not used.
. (Join-Path $PSScriptRoot 'windows-path.ps1')
if ($PSVersionTable.PSVersion.Major -ge 7 -and $env:LD_VSCODE_INTEGRATION -and (Test-Path -LiteralPath $env:LD_VSCODE_INTEGRATION)) {
    try { . $env:LD_VSCODE_INTEGRATION } catch { Write-Warning 'Load Dependency: native integration unavailable; using prompt fallback.' }
}
$script:ldOriginalPrompt = (Get-Command prompt -CommandType Function).ScriptBlock
$script:ldPrevious = @(Get-LDPersistedPath)
$script:ldLastHistory = -1
$script:ldRequest = Join-Path $env:LD_SESSION 'refresh.request'

function global:ld-refresh {
    param([string]$Reason = 'manual')
    $latest = @(Get-LDPersistedPath)
    $env:PATH = Merge-LDPath $env:PATH $script:ldPrevious $latest
    $script:ldPrevious = $latest
    if (Test-Path -LiteralPath $script:ldRequest) { Remove-Item -LiteralPath $script:ldRequest -Force }
    Write-LDStatus $env:LD_SESSION 'refreshed' $Reason
}

# Fix an inherited stale PATH at startup, before the user runs the first command.
try { ld-refresh -Reason 'startup' } catch { Write-Warning "Load Dependency: $($_.Exception.Message)" }

function global:prompt {
    $ldSuccess = $?
    $ldExit = $global:LASTEXITCODE
    try {
        $historyItem = Get-History -Count 1
        $newInstall = $historyItem -and $historyItem.Id -ne $script:ldLastHistory -and
            $ldSuccess -and (Test-LDInstall $historyItem.CommandLine)
        if ($historyItem) { $script:ldLastHistory = $historyItem.Id }
        # Install scripts (irm/iex, child PowerShell, custom installers) need not have
        # a recognizable command name. Observe persisted PATH at the prompt boundary.
        $pathChanged = $false
        if ($env:LD_ENABLED -eq '1') {
            $latest = @(Get-LDPersistedPath)
            $pathChanged = ($latest -join "`0") -cne ($script:ldPrevious -join "`0")
        }
        if (Test-Path -LiteralPath $script:ldRequest) {
            ld-refresh -Reason 'requested'
        } elseif ($env:LD_ENABLED -eq '1' -and ($newInstall -or $pathChanged)) {
            if ($pathChanged) { ld-refresh -Reason 'path-change' }
            else { ld-refresh -Reason 'install-command' }
        }
    } catch {
        Write-Warning "Load Dependency: $($_.Exception.Message)"
    }
    $global:LASTEXITCODE = $ldExit
    # Prompt themes and native shell integration inspect $? as well as LASTEXITCODE.
    if (-not $ldSuccess) { Write-Error 'Previous command failed' -ErrorAction Ignore }
    & $script:ldOriginalPrompt
}
Write-Host '[Load Dependency] PATH refresh enabled. Manual refresh: ld-refresh'

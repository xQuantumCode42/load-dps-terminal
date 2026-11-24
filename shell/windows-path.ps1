# Shared by PowerShell and CMD. Only PATH is updated; no registry/profile writes.
function Get-LDPersistedPath {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    # Expand against fresh persisted variables, without replacing session variables.
    $values = @{}
    foreach ($scope in @('Process', 'Machine', 'User')) {
        foreach ($entry in [Environment]::GetEnvironmentVariables($scope).GetEnumerator()) {
            if ($entry.Key -ne 'Path') { $values[$entry.Key] = [string]$entry.Value }
        }
    }
    $text = "$machine;$user"
    for ($i = 0; $i -lt 8; $i++) {
        $next = [regex]::Replace($text, '%([^%]+)%', {
            param($match)
            if ($values.ContainsKey($match.Groups[1].Value)) { $values[$match.Groups[1].Value] } else { $match.Value }
        })
        if ($next -eq $text) { break }
        $text = $next
    }
    @($text.Split(';') | Where-Object { $_ -and -not $_.Contains('%') })
}

function Merge-LDPath {
    param([string]$Current, [string[]]$Previous, [string[]]$Latest)
    $normalize = { param($value) $value.Trim().TrimEnd('\').ToLowerInvariant() }
    $latestKeys = @{}
    foreach ($item in $Latest) { if ($item) { $latestKeys[(& $normalize $item)] = $true } }
    $removed = @{}
    foreach ($item in $Previous) {
        if ($item -and -not $latestKeys.ContainsKey((& $normalize $item))) { $removed[(& $normalize $item)] = $true }
    }
    $seen = @{}
    $result = New-Object 'System.Collections.Generic.List[string]'
    foreach ($item in @($Current.Split(';')) + @($Latest)) {
        if (-not $item) { continue }
        $key = & $normalize $item
        if ($removed.ContainsKey($key) -or $seen.ContainsKey($key)) { continue }
        $seen[$key] = $true
        $result.Add($item)
    }
    $result -join ';'
}

function Write-LDCmdPath {
    param([string]$PathValue, [string]$Destination)
    if ($PathValue -match '["\r\n\x00]') { throw 'PATH contains characters unsupported by the CMD adapter.' }
    # Percent must be doubled in a batch file. Delayed expansion is off in managed CMD.
    $escaped = $PathValue.Replace('%', '%%')
    [IO.File]::WriteAllText($Destination, "@set `"PATH=$escaped`"`r`n", (New-Object Text.UTF8Encoding($false)))
}

function Test-LDInstall {
    param([string]$Line)
    if ($Line -match '[;&|<>`\r\n]' -or $Line.Contains('$(')) { return $false }
    $Line -match '^\s*(?:(?:winget|choco|scoop|npm|pnpm|yarn|pip3?|cargo)(?:\.exe|\.cmd)?\s+(?:install|i|ci|add|upgrade|update)\b|yarn\s+global\s+add\b|uv\s+(?:tool|pip)\s+install\b|dotnet\s+tool\s+(?:install|update)\b|(?:python[\d.]*|py)(?:\s+-\d[\d.]*)?\s+-m\s+pip\s+install\b)'
}

function Write-LDStatus {
    param([string]$Session, [string]$Result, [string]$Reason = 'shell-hook')
    @{ result = $Result; reason = $Reason; time = [DateTime]::UtcNow.ToString('o') } |
        ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $Session 'status.json') -Encoding UTF8
}

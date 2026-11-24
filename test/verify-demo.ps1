$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$source = Join-Path $root 'verify.ps1'
if (-not (Test-Path -LiteralPath $source)) { throw 'One-command verification script is missing.' }
$fixture = Join-Path $root ('.test-verify-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixture | Out-Null
$originalPath = $env:PATH
try {
    # Only substitute the external registry boundary. Never write real User PATH.
    $code = [IO.File]::ReadAllText($source)
    $code = $code.Replace("[Environment]::GetEnvironmentVariable('Path', 'User')", '$global:fixtureUserPath')
    $code = $code.Replace("[Environment]::SetEnvironmentVariable('Path', `$value, 'User')", '$global:fixtureUserPath = $value')
    $copy = Join-Path $fixture 'verify.ps1'
    [IO.File]::WriteAllText($copy, $code)
    function global:npm.cmd {
        $prefix = $args[[Array]::IndexOf($args, '--prefix') + 1]
        if ($args -contains 'install') {
            if ($global:failInstall) { $global:LASTEXITCODE = 1; return }
            New-Item -ItemType Directory -Path $prefix -Force | Out-Null
            [IO.File]::WriteAllText((Join-Path $prefix 'http-server.cmd'), "@echo off`r`necho v1.2.3`r`n")
        }
        $global:LASTEXITCODE = 0
    }
    foreach ($mode in @('enabled', 'no-refresh', 'install-failed')) {
        $global:fixtureUserPath = ''
        $global:failInstall = $mode -eq 'install-failed'
        $env:LD_SESSION = $fixture
        $env:LD_ENABLED = '1'
        . (Join-Path $root 'shell/powershell.ps1')
        function global:Get-LDPersistedPath { @($originalPath -split ';') + @($global:fixtureUserPath -split ';') }
        if ($mode -eq 'no-refresh') { function global:prompt { 'PS> ' } }
        $before = (Get-Command prompt).ScriptBlock
        $output = (& $copy 6>&1 | Out-String)
        if ($mode -eq 'install-failed') {
            if ($output -notmatch 'FAIL' -or $global:fixtureUserPath) { throw 'Installation failure was not cleaned up.' }
        } else {
            if (-not $global:fixtureUserPath) { throw 'Verification did not defer until the prompt.' }
            # Simulate another installer modifying User PATH while verification is pending.
            $global:fixtureUserPath += ';fixture-other-path'
            $output += (& prompt 6>&1 | Out-String)
            if ($mode -eq 'enabled' -and $output -notmatch '\[PASS\]') { throw "Hooked prompt did not pass: $output" }
            if ($mode -eq 'no-refresh' -and $output -notmatch '\[FAIL\]') { throw 'Missing refresh was reported as success.' }
            if ($global:fixtureUserPath -ne 'fixture-other-path') { throw 'Cleanup overwrote a concurrent PATH change.' }
        }
        if ((Get-Command prompt).ScriptBlock -ne $before) { throw 'Original prompt was not restored.' }
        if ($output -match 'Temporary directory: ([^\r\n]+)' -and (Test-Path -LiteralPath $Matches[1])) { throw 'Temporary package directory was not removed.' }
        if ($env:PATH -match 'load-dependency-demo-') { throw 'Session PATH contains a demo entry after cleanup.' }
        Write-Host "PASS: $mode"
    }
    $env:LD_ENABLED = '0'
    $beforeDisabled = $global:fixtureUserPath
    $output = (& $copy 6>&1 | Out-String)
    if ($output -notmatch '\[FAIL\]' -or $global:fixtureUserPath -ne $beforeDisabled) { throw 'Disabled hook did not stop verification before changing PATH.' }
    Write-Host 'PASS: disabled preflight'
} finally {
    $env:PATH = $originalPath
    Remove-Item -LiteralPath $fixture -Recurse -Force
}

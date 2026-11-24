# Run in the existing VS Code Windows PowerShell terminal: & .\verify.ps1
# Do not launch a child powershell.exe: the next interactive prompt is the test.
$ErrorActionPreference = 'Stop'
if (-not $env:LD_SESSION -or $env:LD_ENABLED -ne '1' -or -not (Get-Command ld-refresh -ErrorAction SilentlyContinue)) {
    Write-Host '[FAIL] Open a Load Dependency Windows PowerShell terminal with + first.' -ForegroundColor Red
    return
}
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    Write-Host '[FAIL] Windows Node.js/npm is required.' -ForegroundColor Red
    return
}

$id = [guid]::NewGuid().ToString('N')
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$directory = Join-Path $tempRoot "load-dependency-demo-$id"
$command = "ld-http-server-$id.cmd"
$readUserPath = { [Environment]::GetEnvironmentVariable('Path', 'User') }
$writeUserPath = { param($value) [Environment]::SetEnvironmentVariable('Path', $value, 'User') }
$state = @{ directory = $directory; command = $command; pathAdded = $false }
$cleanup = {
    # Read the latest value, so other PATH changes made during the test survive.
    if ($state.pathAdded) {
        $latest = & $readUserPath
        $value = (($latest -split ';') | Where-Object { $_ -ine $state.directory }) -join ';'
        if ($value -eq '') { $value = $null }
        & $writeUserPath $value
        $state.pathAdded = $false
    }
    # Removing our own test entry after verification cannot make the test pass.
    $env:PATH = (($env:PATH -split ';') | Where-Object { $_ -ine $state.directory }) -join ';'
    $target = [IO.Path]::GetFullPath($state.directory)
    if ($target -ne (Join-Path $tempRoot "load-dependency-demo-$id")) { throw 'Unsafe cleanup target.' }
    if (Test-Path -LiteralPath $target) {
        npm.cmd uninstall --global --prefix $target http-server | Out-Host
        Remove-Item -LiteralPath $target -Recurse -Force
    }
}.GetNewClosure()

try {
    Write-Host '[1/3] Installing http-server into an isolated temporary directory...'
    Write-Host "Temporary directory: $directory"
    Write-Host 'This test temporarily adds this directory to User PATH and removes it after verification.'
    npm.cmd install --global --prefix $directory http-server | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }
    Copy-Item -LiteralPath (Join-Path $directory 'http-server.cmd') -Destination (Join-Path $directory $command)
    & (Join-Path $directory $command) --version | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'The installed CLI could not run by its full path.' }
    if (Get-Command $command -ErrorAction SilentlyContinue) { throw 'Baseline invalid: the unique command is already discoverable.' }
    Write-Host '[2/3] Baseline confirmed: installed CLI works by full path, but cannot be found by name.'

    # A script cannot observe the NEXT prompt while it is still running.
    # Delegate once to the existing prompt (including the actual LD hook), then verify.
    $previousPrompt = (Get-Command prompt -CommandType Function).ScriptBlock
    $verifyAtPrompt = {
        Set-Item -Path Function:global:prompt -Value $previousPrompt
        $promptText = 'PS> '
        try {
            $promptText = & $previousPrompt
            $found = Get-Command $state.command -ErrorAction SilentlyContinue
            $expected = Join-Path $state.directory $state.command
            if (-not $found -or $found.Source -ine $expected) { throw 'The next prompt did not discover the new PATH entry.' }
            & $state.command --version | Out-Host
            if ($LASTEXITCODE -ne 0) { throw 'The CLI was found but execution failed.' }
            Write-Host '[PASS] The same terminal discovered and ran the new CLI after returning to the prompt.' -ForegroundColor Green
            Write-Host 'No ld-refresh or process PATH assignment was used to make the test pass.'
        } catch {
            Write-Host "[FAIL] $($_.Exception.Message)" -ForegroundColor Red
            Write-Host 'Check Load Dependency: Show Status before retrying.'
        } finally {
            try { & $cleanup; Write-Host '[CLEAN] Test package, directory and PATH entry removed.' }
            catch { Write-Host "[CLEANUP FAILED] $($_.Exception.Message)" -ForegroundColor Red; Write-Host "Remove only this User PATH entry and directory manually: $($state.directory)" }
        }
        $promptText
    }.GetNewClosure()

    $oldValue = & $readUserPath
    $value = if ([string]::IsNullOrEmpty($oldValue)) { $directory } else { "$oldValue;$directory" }
    # Mark first so cleanup also runs if the write fails partway through.
    $state.pathAdded = $true
    & $writeUserPath $value
    Set-Item -Path Function:global:prompt -Value $verifyAtPrompt
    Write-Host '[3/3] Returning to the normal prompt; automatic verification and cleanup follow now.'
} catch {
    Write-Host "[FAIL] $($_.Exception.Message)" -ForegroundColor Red
    try { & $cleanup } catch { Write-Host "[CLEANUP FAILED] Remove only this User PATH entry and directory manually: $directory" -ForegroundColor Red }
}

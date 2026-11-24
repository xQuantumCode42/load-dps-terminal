# Default terminal integration

User requirement: after extension activation, pressing VS Code's ordinary + creates
a terminal with automatic CLI refresh. Repeated Open Terminal or ld-refresh is not
the normal flow. This extends the already approved shell bootstrap architecture.

Use contributed TerminalProfileProviders for PowerShell 5.1/7, CMD, default WSL
and local Bash. Reuse one terminal-options builder for profiles and the optional
Open Terminal command. Associate profile-created terminals via their unique session
environment marker, not by title alone. Do not inject commands into existing shells.

On first local trusted activation, map a supported current default to its LD profile
and save the exact previous value at the same window-level Global/Workspace scope.
Restore recorded slots independently even if a newer scope now wins; never write
folder default settings. Specifically named WSL distributions are preserved when
their identity cannot be carried over safely. Unsupported
custom args/env/path-array shells keep their default and receive a setup action.
While autoDefaultTerminal is true, reconcile supported native defaults on activation,
preserving their shell family and saving the latest native choice for restore.
Turning autoDefaultTerminal off opts out. Provide Set Default
Terminal and Restore Previous Default Terminal commands. Auto-default setting false
restores an owned default; restoration never replaces a subsequent user choice.
No user shell profiles, registry, settings files outside VS Code's configuration API,
or other defaults are modified. Remote windows remain outside this preview scope.

Validation: pure policy regressions, ordinary terminal.new (the + command) in a real
isolated host for PowerShell/CMD/WSL, immediate new CLI lookup, session association,
restore/disable semantics and archive exclusions. Keep version 0.1.0; no publishing
or installation into the daily VS Code profile during development.

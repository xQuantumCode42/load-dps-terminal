# Load Dependency local preview design

Approved direction: TypeScript + VS Code Extension API; native events first;
managed CMD terminal accepted; implement a local preview under tools/load-dependency.

## Intent and scope
Make newly installed CLI commands available without restarting VS Code.
Targets: Windows PowerShell 5.1, PowerShell 7, CMD, and Ubuntu/WSL Bash inside
the Windows VS Code terminal. No external terminal or arbitrary-process hot reload.
Extension-host restart is a separate explicit command, never an install side effect.

## Approaches
Native events alone cannot update a parent shell and CMD lacks native command
integration. A standalone CLI cannot update its parent either. Chosen approach:
VS Code native end events detect supported installs and queue refresh requests;
session-local shell adapters apply changes at prompt/command-return boundaries.
Prompt-side install recognition covers native-event delivery races and missing
integration. CMD uses session DOSKEY post-command hooks for known package managers.
PowerShell additionally compares persisted PATH at prompt boundaries so arbitrary
script installers do not need a recognized executable name to trigger a refresh.
Its original command executes directly; the hook receives no user arguments and
refreshes after any successful manager invocation, including non-install queries.

## Boundaries
No automatic sendText/executeCommand into an existing terminal, no Ctrl+C,
no profile modification, no registry writes, no installation replay. Queued refresh
may wait until the next prompt. PowerShell merges persisted PATH with current PATH,
preserving session prefixes and removing only entries removed since its snapshot.
CMD uses a generated quoted batch assignment; unsafe quotes/newlines are rejected.
WSL runs Linux logic within the selected default WSL distro, never Windows PATH.
Bash refreshes hash and adds existing standard user executable directories; arbitrary
startup files and version-manager scripts are not sourced automatically.

## Architecture
src/core.ts: install recognition and request gating.
src/extension.ts: terminal creation, native observation, request files, status and cleanup.
shell/windows-path.ps1: persisted PATH snapshot and session-safe merge.
shell/powershell.ps1: prompt-boundary adapter.
shell/cmd-*.cmd and cmd-refresh.ps1: DOSKEY post-command hooks and parent-shell assignment.
shell/bash.bash: Bash prompt hook with preserved startup configuration.

## Safety and limitations
Commands and package names are never replayed from event data. Logs record manager
names and outcomes, not entire commands or environment values. Failed/unknown-exit
commands do not queue refresh. Existing unmanaged terminals show a managed-terminal
suggestion. CMD wrappers cover interactive simple commands, not scripts/full paths/
compound commands. Bash and WSL require separate real-environment acceptance.

## Validation
Behavior tests for command recognition, event gating, real PowerShell merge and CMD
return/refresh behavior. Extension-host smoke test checks activation and commands.
Package .vsix for local installation. Report WSL restrictions rather than claiming
unexecuted validation. No publish, auto-install, version increments or commits.

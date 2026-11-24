# Development

Node.js 22.12+, npm, VS Code 1.93+. PowerShell/CMD tests run on Windows;
Bash tests use accessible WSL or Git Bash. Host tests default to downloading
official VS Code 1.93.1 into `.vscode-test/`; `VSCODE_EXECUTABLE` selects another runtime.

```sh
npm ci
npm test
npm run check
npm run build
npm run test:host
npm run test:reopen
npm run package
```

F5 launches an Extension Development Host. Tests use isolated profiles and fake
installers, not global package installation or real registry PATH changes.
PowerShell 5.1 fixture scripts with non-ASCII literals require UTF-8 with BOM.
Use unique fixture executable names so an installed CLI cannot mask failure.

## Architecture

- `src/core.ts`: conservative install recognition; never replay event command text.
- `src/extension.ts`: native events, managed sessions, request files and status.
- `src/profiles.ts`: profile descriptors and conservative default-shell selection.
- `src/default-terminal.ts`: one-time window default setup and raw-slot backup/restore.
- `shell/powershell.ps1`: prompt-boundary persisted PATH observation plus installation fallback.
- `shell/windows-path.ps1`: persisted PATH reading, session-preserving merge and status.
- `shell/cmd-*.cmd`: DOSKEY post-command hooks; no user arguments through CALL/reparse wrappers.
- `shell/bash.bash`: prompt requests, standard user CLI directories and hash refresh.

Native events may arrive after the prompt was rendered. A queued request alone is
not a same-prompt guarantee: tests must exercise install -> new CLI without manual
refresh, extra Enter or a matching preinstalled executable.

Contributed TerminalProfileProviders and the optional opener share one options
builder. Profile-created terminals are associated by their unique LD_SESSION marker.
VS Code 1.93's native profile list refresh has a 2-second debounce; configuration
updates resolve before it. Setup waits 2.5 seconds before marking + ready, so tests
exercise the first ordinary new terminal rather than retrying after a plain shell.

DefaultProfile is window-scoped: use Global/Workspace, not active document/folder
settings. Restore enumerates saved slots rather than only the currently winning
scope; otherwise a newer Workspace override can hide an owned Global setting.
Run new-terminal tests with a common cwd when using multiple fixture folders.

`test:reopen` uses two cold launches with the same isolated profile: first save a
genuine initialized marker via normal setup/restore, then re-enable auto-default
with a native default. The old marker must not suppress live configuration checks.
Do not infer activation from an executable such as cowsay already being on PATH.
Status distinguishes a configured future default, an unhooked active terminal,
pending bootstrap and confirmed shell markers. `previewBuild` identifies same-version
local preview rebuilds in Show Status.

## Distribution

`verify.ps1` is the interactive Windows PowerShell user demo. It temporarily writes
User PATH at the user's request, installs http-server into a unique temporary
prefix, then verifies discovery after delegating to the existing prompt. It never
calls ld-refresh to obtain a passing result. Cleanup restores the prompt, removes
only its own persisted/session PATH entry, and uninstalls/deletes its temporary
package. Forced process termination can interrupt cleanup.

On Windows, `npm test` also runs `test/verify-demo.ps1`: it substitutes only the
registry boundary and npm installer with isolated fixtures, exercising the real
PowerShell prompt hook. It covers success, no refresh, installation failure,
disabled preflight, cleanup and preservation of concurrent PATH changes. The
automated test never installs real packages or writes real User PATH.

`npm run package` creates the VSIX and `release/SHA256SUMS`. Reinstall the VSIX and
reopen managed terminals when updating the same preview version. Existing terminals
retain copied shell scripts. Test profiles/runtimes/dependencies are excluded.
The dev-only minimatch 11 override resolves the packaging tool's dependency advisory;
the VSIX has no runtime npm dependency tree. See `docs/validation.md` for evidence.

# Local preview validation — 2026-11-24

## Verified

- 58 core/policy/status/shell tests passed: default shell selection, conservative custom
  profile handling, named-distro preservation, installer recognition, failed/unknown-exit gating,
  preserved session PATH precedence, removed persisted entries, same-process CLI
  discovery, case-insensitive deduplication, Unicode/CMD metacharacter paths,
  unsafe CMD assignment rejection, original PowerShell prompt/failure state,
  CMD post-command exit preservation, disabled PowerShell path-change gating,
  and successful/failed real WSL prompt hooks.
- TypeScript strict check passed against VS Code API 1.93.
- An isolated official VS Code 1.93.1 runtime passed the host checks below:
  activation/registration, real PowerShell startup/input, npm-style install to immediate
  CLI lookup, script-installer PATH change to immediate CLI lookup, CMD startup/manual refresh,
  CMD automatic refresh with literal-percent argument preservation and exactly-once
  command execution, failed CMD install without refresh, and WSL native installation
  event → queued request → prompt consumption.
- No real system packages were installed; all installer commands in tests were fixtures.

## Follow-up regression: script installers

The original host tests checked PowerShell bootstrap/input but did not assert the
full install -> newly named CLI flow. Added unique executable fixtures to prevent
an existing installed CLI masking failure. The npm-style flow passed; a child
PowerShell script changing the test's persisted-PATH source failed with
`command-not-found` on the old code and passed after prompt-boundary path-change
observation. This verifies a concrete gap, not the exact user installation route
(the full installation command was not yet supplied when this record was written).
PowerShell status now distinguishes startup/manual/install/path-change/requested
refreshes. No registry writes or actual downloaded installer execution were needed.
- Full dependency audit reported no known vulnerabilities after the packaging-tool
  minimatch override. No runtime npm dependencies are shipped.

## Ordinary + terminal integration

- Ordinary `workbench.action.terminal.new` (the terminal + action), not the LD
  opener, creates hooked PowerShell/CMD/default-WSL terminals. Their session marker
  associates them with status and native events. Immediate npm/script CLI lookup,
  CMD argument preservation and WSL request consumption passed through this path.
- Profile policy tests reject custom startup args/env/path arrays and preserve
  specifically named Ubuntu profiles rather than silently switching WSL distros.
- Global default backup survives switching LD shells. Restore preserves a later
  manual choice, disabling auto-default restores the original, and a later Workspace
  override does not hide the saved Global slot. Workspace changes restore at the
  original Workspace scope. Document/folder switching preserves resource settings.
- VS Code 1.93 rejects folder-scoped writes to defaultProfile; integration deliberately
  targets window-level Global/Workspace settings and never writes folder defaults.
- First + immediately after Configuration.update initially bypassed the provider
  because VS Code's profile cache is debounced by 2 seconds. Setup now waits 2.5s
  before announcing readiness. Existing terminals are not injected or interrupted.
- Host fixtures use a shared cwd in an isolated multi-root workspace to avoid the
  unrelated built-in cwd picker. No daily VS Code defaults were changed by tests.

## Persisted initialization and truthful status (2026-11-24)

- Built-in Command Prompt uses a canonical Sysnative/System32 fallback path array.
  The prior policy rejected that standard profile as custom. The narrow standard
  pair is now supported; arbitrary custom arrays/args/env remain preserved.
- A historical initialized=true marker no longer suppresses current default setup.
  `test:reopen` uses two real cold launches and VS Code's configuration API to seed
  initialized=true, no saved backup, auto-default=true and a native CMD default.
  Reopening creates a hooked + terminal; restoring keeps that latest native choice.
- The built-in CMD policy case and the old reopen behavior failed before fixes.
  Status tests distinguish not enabled, old unhooked terminals, pending shell startup,
  missing startup confirmation, disabled refresh and confirmed managed shells.
- A setup attempt no longer prints an unconditional ready message. Diagnostics report
  live default configuration and require a shell readiness marker before saying the
  active terminal is confirmed. A missing marker reports an error after 15 seconds.
- Build marker: `2026-11-24-initialization-fix`. The existing +/install/restore host
  suite passed. WSL fixture setup now waits for its native completion event before
  issuing the next command, and avoids writing test commands to user shell history.
- Installed-state diagnosis was read-only. No daily VS Code settings, registry values,
  real package installations or shell startup files were changed during verification.

## Remaining acceptance

- PowerShell 7 is not installed in the test environment; its adapter is implemented
  but a real PowerShell 7 session has not been verified.
- Real installers across all listed package managers have not been exhaustively
  tested. PATH/command cache refresh cannot supply arbitrary missing environment
  variables or activate every version manager.
- Extension-host restart is a registered explicit built-in command; no automatic
  extension hot replacement is promised.
- Regular local VS Code terminals are the scope. Remote WSL/SSH project windows,
  nondefault distro selection and adopting existing unmanaged terminals are not included.
- VS Code test startup emitted existing application mutex/chat-registry warnings;
  assertions and test process exit succeeded. The daily installed VS Code was held
  by an installer-update lock, so tests used the independent official archive.

## Artifact

VSIX packaging passed. Archive inspection confirmed all nine required manifest,
bundle and shell assets; no test runtimes, profiles, source maps, test bundles or
npm dependency tree are included. The packaged text scan found no conventional
personal Windows home paths or personal email patterns. A SHA-256 checksum is
written alongside the VSIX in `release/SHA256SUMS`.
The VSIX is for local trial and is not Marketplace-published or signed.

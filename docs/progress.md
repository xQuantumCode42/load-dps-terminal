# Implementation ledger

Plan: superpowers/plans/2026-11-23-load-dependency.md

- User authorized implementation after stack and native-event/managed-CMD discussion.
- Ruling: use new requested directory in place; parent is not a Git repository.
- Ruling: use Node built-in assertions instead of Vitest to reduce dependencies.
- Ruling: refresh PATH/command cache only in preview; arbitrary environment or extension hot reload is out of scope.
- CodeGraph CLI unavailable and no MCP tool offered; directory initially empty.
- Preflight: core install recognition is consumed by extension native event handler;
  shell fallbacks deliberately accept only known interactive install patterns.
- Task 1: complete. RED: 15 install/gate assertions failed with stub; GREEN: recognition/gating passed.
- Task 2: real Windows PATH merge, PowerShell prompt, CMD and WSL Bash tests added.
- Review found CMD argument re-expansion and PowerShell prompt success-state loss;
  both reproduced in regression tests, then fixed (33 shell/core tests green).
- Ruling: CMD uses DOSKEY original-command + argument-free post hook, rather than
  replaying arguments through CALL/a child CMD. It refreshes after all successful
  known-manager commands; cost is harmless extra refreshes after queries.
- Ruling: use official downloaded VS Code 1.93.1 for host tests because daily VS Code
  has a held installer-update lock. Test runtime/profile excluded from packaging.
- Ruling: packaging tool has a dev-only minimatch 11 override to resolve advisory;
  validate packaging itself to cover API compatibility. npm audit currently clean.
- Task 2: complete. Final npm test: 33 passed, 0 failed, including real WSL Bash.
- Task 3: complete. Strict type check/build/VSIX packaging passed. VS Code 1.93.1
  host tests passed all six activation/PowerShell/CMD/WSL checks; WSL native event,
  refresh queue and prompt consumption verified. CMD macro argument regression
  and failure/no-refresh verified in a real PTY. Reviewer recheck found no new
  important issues in the fixes. PowerShell 7 remains untested (not installed).
- Archive inspection: all runtime assets present, no dependencies/tests/profiles
  or source maps packaged, personal-path pattern scan passed. Local VSIX only;
  no installation into daily VS Code, publish, repository initialization or commit.
- Follow-up: user reported PowerShell pi lookup needing manual refresh and unclear
  README. Reproduced script-installer PATH updates missed by command-name detection
  in a real PTY (RED command-not-found); added prompt-boundary persisted-PATH change
  detection (GREEN immediate CLI lookup). npm-style lookup passed with unique fake CLI.
- Added disabled-mode path-change regression and refresh-reason diagnostics.
- README rewritten around installation, real examples and troubleshooting;
  contributor details moved to docs/development.md. Ordinary-terminal enablement
  is still a design discussion; no default terminal or user startup files changed.
- User subsequently requested automatic ordinary + integration. Added contributed
  providers and shared terminal preparation, one-time backed-up window default
  selection, explicit selection/restoration and + readiness status. VS Code settings
  are changed only by installed plugin behavior/test profiles; no shell profile edits.
- RED: ordinary new-terminal regression launched plain PowerShell on old code.
  Initial provider integration still launched plain PowerShell before VS Code's
  debounced cache refresh; a documented setup wait fixed the first + path.
- Review: fixed Global backup hidden by later Workspace override (real-host RED),
  simplified defaults to actual window-level settings, and rejected ambiguous named
  distro adoption. Host tests cover Global/Workspace restoration and resource settings.
- Latest policy/core/shell suite: 49 passed. Type check passed. Host normal + flows
  and restore cases verified in the isolated minimum-version runtime. Version stays
  0.1.0; final VSIX packaging/inspection follows documentation updates.
- Final: normal + host tests exited 0, including all restoration/resource-preservation
  regressions. VSIX rebuilt; 5 contributed terminal profiles and restore command
  present, test artifacts excluded, personal-path scan and checksum passed. Daily
  VS Code installation/settings untouched during development; install the new VSIX.
- 2026-11-24 feedback: missing status/banner despite cowsay executing. Read-only
  diagnosis and reproductions found stale initialized gating and misclassification
  of VS Code's standard CMD fallback array. Removed the gate and allow only the
  canonical system fallback pair; custom argument/env/array protections remain.
- Added explicit not-enabled/unhooked/loading/error/confirmed state presentation,
  real shell-readiness checks, an activation failure message and a preview build ID.
- 58 core/policy/status/shell tests passed. Cold-reopen regression uses two launches
  with real saved VS Code configuration; it passed, including restoration to the
  latest native choice. Existing normal + PS/CMD/WSL and restore suite passed.
- Intentional contract: auto-default=true rewraps supported native defaults on
  activation without changing shell family; auto-default=false opts out. Documented
  this distinction and retained restoration of later manual native selections.

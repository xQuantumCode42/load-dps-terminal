# Load Dependency Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline for this plan.

**Goal:** Build a local VS Code preview that refreshes CLI paths in managed terminals.

**Architecture:** Native shell execution events queue requests. Shell adapters apply
them at a prompt boundary, with local fallbacks for unavailable native integration.

**Tech Stack:** TypeScript, VS Code API 1.93+, esbuild, Node assertion tests, PowerShell/CMD/Bash.

**Spec:** ../specs/2026-11-23-load-dependency-design.md

## Global Constraints
No profile/registry writes, command replay, terminal interruption, automatic
extension restart or publication. PATH changes retain session environment priority.
Work is isolated in a new directory; parent workspace is not a Git repository.

## Review Focus
Unknown/failed exits must not refresh; compound commands must not be mistaken for
installs; PATH updates preserve virtual environments; command arguments containing
metacharacters must not become refresh code; WSL paths must be Linux paths.

### Task 1: Install recognition and event gate
- [x] Write failing behavior tests for supported managers, non-installs, quoted
  commands, failures, disabled mode and duplicate shell events.
- [x] Implement src/core.ts; run npm test and compare expected outcomes.

### Task 2: Shell adapters
- [x] Write real-shell tests with controlled snapshots and temporary CLI directories.
- [x] Implement shell/windows-path.ps1 and PowerShell prompt hook; verify same-session lookup.
- [x] Implement CMD session post-command hooks and quoted refresh assignment; verify return code.
- [x] Implement Bash prompt hook; verify in real WSL Bash.

### Task 3: Extension integration and distribution
- [x] Implement src/extension.ts with managed sessions, native events, refresh
  request files, diagnostics, explicit extension restart and terminal cleanup.
- [x] Add extension-host activation smoke test, README, license, F5 configuration.
- [x] Run type check, all tests, build, host smoke test and package VSIX.
- [x] Review final source, record verified results and remaining platform limitations.

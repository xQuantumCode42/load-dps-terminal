# Default terminal implementation plan

> Execute inline using superpowers:executing-plans and test-driven-development.

**Goal:** Make the normal VS Code + terminal action load the refresh adapters.
**Architecture:** Contributed providers share terminal preparation; defaults are
configured once with scope-aware snapshots and explicit restoration.
**Tech Stack:** TypeScript, VS Code 1.93 API, existing shell adapters.
**Spec:** ../specs/2026-11-23-default-terminal-design.md

## Constraints and review focus
Preserve original default and user changes, profile arguments/environment, unique
session ownership, PATH precedence and shell compatibility. No busy-shell injection,
profile/registry edits, global package installs or implicit version changes.

## Tasks
- [x] Write policy tests and a + host regression; observe RED.
- [x] Add profile selection policy and provider-backed shared preparation.
- [x] Add scope-aware automatic default setup, explicit selection and restoration.
- [x] Test + for PowerShell/CMD/WSL, immediate CLI lookup and restore/disable.
- [x] Rewrite README around +, review, run checks and rebuild/inspect VSIX.

# Project rules

- This preview refreshes CLI PATH/cache within managed integrated terminals.
- Preserve session-specific PATH precedence, including active virtual environments.
- Never replay a command observed through native terminal events.
- Do not inject automatic commands into a busy terminal or send Ctrl+C.
- Do not modify registry values or persistent shell startup files.
- VS Code window terminal defaults may be updated through its configuration API with backup/restore; preserve later manual choices and folder settings.
- Keep extension-host restart explicit and separate from CLI installs.
- Tests use isolated fixtures, not real package installations or system PATH writes.
- Test shell behavior, not merely script text; report untested environments honestly.
- Exclude test runtimes, profiles, dependencies and personal data from the VSIX.

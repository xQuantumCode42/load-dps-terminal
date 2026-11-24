@echo off
if exist "%LD_SESSION%\apply.cmd" del /q "%LD_SESSION%\apply.cmd"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%LD_SHELL_DIR%\cmd-refresh.ps1"
if errorlevel 1 exit /b 1
call "%LD_SESSION%\apply.cmd"
exit /b 0

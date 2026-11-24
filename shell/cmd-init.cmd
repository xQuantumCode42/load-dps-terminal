@echo off
chcp 65001 >nul
rem $T queues a separate console command. Original arguments never enter a wrapper.
for %%M in (winget choco scoop npm pnpm yarn pip pip3 uv cargo dotnet python python3 py) do doskey %%M=%%M $* $T "%LD_SHELL_DIR%\cmd-after.cmd"
doskey ld-refresh="%LD_SHELL_DIR%\cmd-refresh.cmd"
call "%LD_SHELL_DIR%\cmd-refresh.cmd"
echo [Load Dependency] Session install wrappers enabled. Manual refresh: ld-refresh

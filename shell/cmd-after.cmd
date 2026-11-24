@set "LD_INSTALL_EXIT=%errorlevel%"
@if not "%LD_INSTALL_EXIT%"=="0" exit /b %LD_INSTALL_EXIT%
@if not "%LD_ENABLED%"=="1" exit /b 0
@rem No user command or argument is passed here. A successful manager command refreshes PATH.
@call "%LD_SHELL_DIR%\cmd-refresh.cmd"
@exit /b 0

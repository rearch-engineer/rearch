@echo off
REM ------------------------------------------------------------------
REM development.cmd — ReArch Development Server (Windows)
REM
REM Launches the interactive TUI dashboard that manages:
REM   Docker (detached):  Redis, MongoDB
REM   Local (foreground): mcp-proxy, backend, frontend
REM
REM The TUI provides live status, switchable log views, and controls.
REM ------------------------------------------------------------------

set "ROOT_DIR=%~dp0"
set "DEVTOOLS_DIR=%ROOT_DIR%devtools"

REM ------------------------------------------------------------------
REM Ensure devtools dependencies are installed
REM ------------------------------------------------------------------
if not exist "%DEVTOOLS_DIR%\node_modules" (
  echo Installing devtools dependencies...
  pushd "%DEVTOOLS_DIR%"
  call bun install
  popd
  echo.
)

REM ------------------------------------------------------------------
REM Launch the TUI
REM ------------------------------------------------------------------
bun run "%DEVTOOLS_DIR%\src\index.ts"

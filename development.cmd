@echo off
REM ------------------------------------------------------------------
REM development.cmd — ReArch CLI (Windows)
REM
REM Usage: development.cmd [command] [args]
REM        development.cmd start
REM        development.cmd logs
REM        development.cmd stop
REM        development.cmd help
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
REM Run CLI — pass all arguments through
REM ------------------------------------------------------------------
bun run "%DEVTOOLS_DIR%\src\cli.ts" %*

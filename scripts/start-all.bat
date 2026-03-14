@echo off
setlocal EnableDelayedExpansion

set "PG_BIN=C:\Program Files\PostgreSQL\18\bin"
if exist "%PG_BIN%" set "PATH=%PATH%;%PG_BIN%"

set "ENV_FILE=%~dp0\..\server\.env"
if exist "%ENV_FILE%" (
  for /f "usebackq delims=" %%L in ("%ENV_FILE%") do (
    set "LINE=%%L"
    if not "!LINE!"=="" if /I not "!LINE:~0,1!"=="#" (
      for /f "tokens=1,* delims==" %%A in ("!LINE!") do (
        set "KEY=%%A"
        set "VAL=%%B"
        if "!VAL:~0,1!"=="\"" set "VAL=!VAL:~1,-1!"
        if /I "!KEY!"=="DB_HOST" set "DB_HOST=!VAL!"
        if /I "!KEY!"=="DB_USER" set "DB_USER=!VAL!"
        if /I "!KEY!"=="DB_NAME" set "DB_NAME=!VAL!"
        if /I "!KEY!"=="DB_PASSWORD" set "DB_PASSWORD=!VAL!"
      )
    )
  )
)

where psql >nul 2>nul
if %ERRORLEVEL%==0 (
  if defined DB_HOST if defined DB_USER if defined DB_NAME if defined DB_PASSWORD (
    set "PGPASSWORD=%DB_PASSWORD%"
    psql -h %DB_HOST% -U %DB_USER% -d %DB_NAME% -c "SELECT 1;" >nul 2>nul
    if %ERRORLEVEL%==0 (
      echo DB check OK.
    ) else (
      echo WARNING: DB check failed. Backend may not work until DB is reachable.
    )
  ) else (
    echo WARNING: DB settings missing in server\.env. Skipping DB check.
  )
) else (
  echo WARNING: psql not found in PATH. Skipping DB check.
)

start "RoyalMind Backend" node "%~dp0\..\server\index.js"
start "RoyalMind Frontend" node "%~dp0\static-server.js"

endlocal

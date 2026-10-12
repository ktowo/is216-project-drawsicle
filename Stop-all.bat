@echo off
setlocal EnableExtensions
rem Stops everything Start-all.bat (or Start-all.sh in Git Bash) started: the API, the client and
rem the local MongoDB. Safe to run more than once.
rem
rem It closes the "Drawisicle ..." windows with everything running in them, then stops anything
rem still listening on the API, client and local database ports (a MongoDB can be left over
rem when the API is killed).

cd /d "%~dp0"
set "ROOT=%~dp0"
set "CLIENT_PORT=5173"
set "API_PORT=8000"
set "DB_PORT=27018"
set "STOPPED=0"

rem Double-clicked (see Start-all.bat): keep the window open at the end
set "PAUSE_AT_END=0"
echo(%cmdcmdline%| findstr /e /c:"\" \"" >nul 2>nul && set "PAUSE_AT_END=1"

if exist "server\.env" (
  for /f "usebackq tokens=1,* delims==" %%a in ("server\.env") do (
    if /i "%%a"=="PORT" set "API_PORT=%%b"
    if /i "%%a"=="LOCAL_DB_PORT" set "DB_PORT=%%b"
  )
)
set "API_PORT=%API_PORT: =%"
set "DB_PORT=%DB_PORT: =%"

rem The windows Start-all.bat opened, with pnpm, nodemon, node and MongoDB inside them
tasklist /fi "WINDOWTITLE eq Drawisicle*" /nh 2>nul | findstr /i /c:".exe" >nul
if not errorlevel 1 (
  taskkill /fi "WINDOWTITLE eq Drawisicle*" /t /f >nul 2>nul
  echo Closed the Drawisicle windows.
  set "STOPPED=1"
)

rem Whatever still holds a port. The API goes before its database so it can let go of it first.
call :stop_port %CLIENT_PORT% client
call :stop_port %API_PORT% API
call :stop_port %DB_PORT% "local MongoDB"

rem A nodemon whose app was stopped keeps waiting for file changes; only the one from this folder
for /f "usebackq delims=" %%p in (`powershell -NoProfile -NonInteractive -Command "$dir = (Join-Path '%ROOT%' 'server\node_modules').ToLower(); Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine.Replace('/', '\').ToLower().Contains($dir) -and $_.CommandLine -match 'nodemon' } | ForEach-Object { $_.ProcessId }" 2^>nul`) do (
  taskkill /pid %%p /t /f >nul 2>nul && (
    echo Stopped a leftover nodemon, process %%p.
    set "STOPPED=1"
  )
)

if exist ".run\*.pid" del /q ".run\*.pid" >nul 2>nul

if "%STOPPED%"=="0" (
  echo Nothing to stop: Drawisicle isn't running.
) else (
  echo Drawisicle has stopped. Logs are kept in .run\
)
if "%PAUSE_AT_END%"=="1" pause
exit /b 0

rem stop_port <port> <label>: listening sockets have a foreign address ending in :0
:stop_port
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:"TCP  *[^ ]*:%~1  *[^ ]*:0  "') do (
  if not "%%p"=="0" (
    taskkill /pid %%p /t /f >nul 2>nul && (
      echo Stopped the %~2 on port %~1, process %%p.
      set "STOPPED=1"
    )
  )
)
exit /b 0

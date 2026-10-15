@echo off
setlocal EnableExtensions
rem Starts Drawsicle from cmd.exe or a double-click: installs anything missing, creates
rem server\.env, then runs the API (with its own local MongoDB unless server\.env sets DB_MONGODB_URI)
rem and the Vue client in two minimised windows. Git Bash, macOS and Linux: Start-all.sh
rem
rem   Start-all.bat               API + client
rem   Start-all.bat --mock        client only; the API runs inside the browser with demo data
rem   Start-all.bat --install     reinstall dependencies even if they are already there
rem   Start-all.bat --no-install  never install (stops if dependencies are missing)
rem
rem Logs go to .run\. Stop everything with Stop-all.bat

cd /d "%~dp0"
set "ROOT=%~dp0"
set "RUN_DIR=%~dp0.run"
set "MOCK=0"
set "INSTALL=auto"
set "CLIENT_PORT=5173"
set "API_WAIT_SECONDS=300"
set "CLIENT_WAIT_SECONDS=120"

rem Explorer starts a double-clicked file as cmd /c ""file" " (ending in quote, space, quote);
rem then the window stays open at the end so the messages can be read
set "PAUSE_AT_END=0"
echo(%cmdcmdline%| findstr /e /c:"\" \"" >nul 2>nul && set "PAUSE_AT_END=1"

:parse_args
if "%~1"=="" goto :args_done
if /i "%~1"=="--mock" (set "MOCK=1" & goto :next_arg)
if /i "%~1"=="--install" (set "INSTALL=always" & goto :next_arg)
if /i "%~1"=="--no-install" (set "INSTALL=never" & goto :next_arg)
if /i "%~1"=="--help" goto :usage
if /i "%~1"=="-h" goto :usage
if /i "%~1"=="/?" goto :usage
echo Unknown option: %~1
call :print_usage
exit /b 2
:next_arg
shift
goto :parse_args
:args_done

rem ---------- Node.js ----------

where node >nul 2>nul
if errorlevel 1 (
  echo Error: Node.js isn't installed. Install Node 22.18 or newer, 24 LTS recommended, from https://nodejs.org and run this again.
  goto :fail
)
for /f "delims=" %%v in ('node -p "process.versions.node"') do set "NODE_VERSION=%%v"
for /f "tokens=1,2 delims=." %%a in ("%NODE_VERSION%") do (
  set "NODE_MAJOR=%%a"
  set "NODE_MINOR=%%b"
)
if %NODE_MAJOR% LSS 22 goto :old_node
if %NODE_MAJOR% EQU 22 if %NODE_MINOR% LSS 18 goto :old_node

rem ---------- Package manager ----------

rem corepack can ask before downloading pnpm, which would hang a minimised window
set "COREPACK_ENABLE_DOWNLOAD_PROMPT=0"
set "PM="
where pnpm >nul 2>nul && set "PM=pnpm"
if not defined PM call :try_corepack
if not defined PM call :try_npm
if not defined PM (
  echo Error: no package manager found. Install Node.js from https://nodejs.org, which includes npm, and run this again.
  goto :fail
)
echo Drawsicle: Node %NODE_VERSION%, %PM%

rem ---------- Dependencies ----------

if "%MOCK%"=="0" (
  call :install_deps server
  if errorlevel 1 goto :fail
)
call :install_deps client
if errorlevel 1 goto :fail

rem ---------- server\.env ----------

if "%MOCK%"=="0" if not exist "server\.env" (
  call :create_env
  if errorlevel 1 goto :fail
)

set "API_PORT=8000"
set "DB_VALUE="
set "MONGODB_URI_VALUE="
set "DB_MONGODB_URI_VALUE="
set "ENVFILE_MONGO_DIR="
set "ENVFILE_MONGO_BIN="
set "ENVFILE_MONGO_VERSION="
if exist "server\.env" (
  for /f "usebackq tokens=1,* delims==" %%a in ("server\.env") do (
    if /i "%%a"=="PORT" set "API_PORT=%%b"
    if /i "%%a"=="DB" set "DB_VALUE=%%b"
    if /i "%%a"=="MONGODB_URI" set "MONGODB_URI_VALUE=%%b"
    if /i "%%a"=="DB_MONGODB_URI" set "DB_MONGODB_URI_VALUE=%%b"
    if /i "%%a"=="MONGOMS_DOWNLOAD_DIR" set "ENVFILE_MONGO_DIR=%%b"
    if /i "%%a"=="MONGOMS_SYSTEM_BINARY" set "ENVFILE_MONGO_BIN=%%b"
    if /i "%%a"=="MONGOMS_VERSION" set "ENVFILE_MONGO_VERSION=%%b"
  )
)
set "API_PORT=%API_PORT: =%"
rem A real connection string in DB_MONGODB_URI, MONGODB_URI or DB means a shared database (same as server\db.js)
set "EXTERNAL_DB=0"
if defined DB_VALUE if not "%DB_VALUE:~0,1%"=="[" set "EXTERNAL_DB=1"
if defined MONGODB_URI_VALUE if not "%MONGODB_URI_VALUE:~0,1%"=="[" set "EXTERNAL_DB=1"
if defined DB_MONGODB_URI_VALUE if not "%DB_MONGODB_URI_VALUE:~0,1%"=="[" set "EXTERNAL_DB=1"

set "API_URL=http://localhost:%API_PORT%"
set "CLIENT_URL=http://localhost:%CLIENT_PORT%"
if not exist "%RUN_DIR%" mkdir "%RUN_DIR%"

rem ---------- API ----------

if "%MOCK%"=="1" goto :start_client

call :http_ok "%API_URL%/api/health"
if not errorlevel 1 (
  echo The API is already running on %API_URL% - not started again.
  goto :start_client
)
call :http_up "%API_URL%"
if not errorlevel 1 (
  echo Error: something else is using port %API_PORT%. Stop it, or set PORT in server\.env and VITE_PROXY_TARGET for the client.
  goto :fail
)

rem The download notice is only for a first run: skip it when mongodb-memory-server already has
rem its MongoDB binary in MONGOMS_DOWNLOAD_DIR (also read from server\.env), %USERPROFILE%\.cache\mongodb-binaries
rem or server\node_modules\.cache. MONGOMS_SYSTEM_BINARY means nothing is downloaded either.
rem (A replace on an undefined variable expands to junk, so each line checks that it is defined first.)
if not defined MONGOMS_DOWNLOAD_DIR if defined ENVFILE_MONGO_DIR set "MONGOMS_DOWNLOAD_DIR=%ENVFILE_MONGO_DIR:"=%"
if not defined MONGOMS_SYSTEM_BINARY if defined ENVFILE_MONGO_BIN set "MONGOMS_SYSTEM_BINARY=%ENVFILE_MONGO_BIN:"=%"
if not defined MONGOMS_VERSION if defined ENVFILE_MONGO_VERSION set "MONGOMS_VERSION=%ENVFILE_MONGO_VERSION:"=%"
set "MONGO_PATTERN=mongod-*.exe"
if defined MONGOMS_VERSION set "MONGO_PATTERN=mongod-*-%MONGOMS_VERSION%*.exe"
set "MONGO_CACHED=0"
if defined MONGOMS_SYSTEM_BINARY set "MONGO_CACHED=1"
if defined MONGOMS_DOWNLOAD_DIR if exist "%MONGOMS_DOWNLOAD_DIR%\%MONGO_PATTERN%" set "MONGO_CACHED=1"
if exist "%USERPROFILE%\.cache\mongodb-binaries\%MONGO_PATTERN%" set "MONGO_CACHED=1"
if exist "%ROOT%server\node_modules\.cache\mongodb-memory-server\%MONGO_PATTERN%" set "MONGO_CACHED=1"

echo Starting the API on %API_URL% ...
if "%EXTERNAL_DB%"=="0" if "%MONGO_CACHED%"=="0" (
  echo   First run: the local MongoDB is downloaded once, about 800 MB on Windows.
  echo   This can take several minutes. Later starts take a few seconds.
)
start "Drawsicle API" /min cmd /c "cd /d "%ROOT%server" && %PM% run dev > "%RUN_DIR%\server.log" 2>&1"
call :wait_for API "%API_URL%/api/health" %API_WAIT_SECONDS% "%RUN_DIR%\server.log" ok
if errorlevel 1 (
  echo Error: the API didn't start. Fix the problem above, then run Stop-all.bat and Start-all.bat again.
  goto :fail
)

rem ---------- Client ----------

:start_client
set "CLIENT_SCRIPT=dev"
if "%MOCK%"=="1" set "CLIENT_SCRIPT=dev:mock"

call :http_up "%CLIENT_URL%"
if not errorlevel 1 (
  echo The client is already running on %CLIENT_URL% - not started again. Run Stop-all.bat first to switch modes.
  goto :summary
)

echo Starting the client on %CLIENT_URL% using %CLIENT_SCRIPT% ...
start "Drawsicle client" /min cmd /c "cd /d "%ROOT%client" && %PM% run %CLIENT_SCRIPT% > "%RUN_DIR%\client.log" 2>&1"
call :wait_for client "%CLIENT_URL%" %CLIENT_WAIT_SECONDS% "%RUN_DIR%\client.log" up
if errorlevel 1 (
  echo Error: the client didn't start. Fix the problem above, then run Stop-all.bat and Start-all.bat again.
  goto :fail
)

rem ---------- Summary ----------

:summary
echo.
echo Drawsicle is running.
echo   App:         %CLIENT_URL%
if "%MOCK%"=="1" (
  echo   Mode:        mock - the API runs in your browser and data stays in this browser
) else (
  echo   API:         %API_URL%/api/health
)
if "%MOCK%"=="0" if "%EXTERNAL_DB%"=="1" echo   Database:    the one in server\.env. To add the demo accounts, run "%PM% run seed" in server\
echo   Demo login:  mika@demo.test / drawsicle123, every demo account uses drawsicle123
if "%MOCK%"=="0" (
  echo   Logs:        .run\server.log and .run\client.log
) else (
  echo   Logs:        .run\client.log
)
if "%MOCK%"=="0" (
  echo   Windows:     "Drawsicle API" and "Drawsicle client", minimised on the taskbar
) else (
  echo   Window:      "Drawsicle client", minimised on the taskbar
)
echo.
echo Stop with Stop-all.bat
rem Double-clicked: open the app too. From a terminal the address above is enough.
if "%PAUSE_AT_END%"=="1" start "" "%CLIENT_URL%"
if "%PAUSE_AT_END%"=="1" pause
exit /b 0

rem ---------- Helpers ----------

:usage
call :print_usage
exit /b 0

:print_usage
echo Usage: Start-all.bat [--mock] [--install ^| --no-install] [--help]
echo.
echo   --mock        Start only the client, with the API running in the browser - no server or database
echo   --install     Install dependencies again, even if node_modules already exists
echo   --no-install  Don't install anything; stop if dependencies are missing
echo   --help        Show this help
echo.
echo Stop everything with Stop-all.bat
exit /b 0

:old_node
echo Error: Node %NODE_VERSION% is too old. Drawsicle needs Node 22.18 or newer, 24 LTS recommended: https://nodejs.org
goto :fail

:fail
echo.
if "%PAUSE_AT_END%"=="1" pause
exit /b 1

:try_corepack
where corepack >nul 2>nul || exit /b 0
call corepack pnpm --version >nul 2>nul && set "PM=corepack pnpm"
exit /b 0

:try_npm
where npm >nul 2>nul || exit /b 0
set "PM=npm"
echo Warning: pnpm wasn't found, so npm is used instead. The lockfiles are written by pnpm, so package versions may differ a little.
echo Warning: to use pnpm, run: npm install -g pnpm  or: corepack enable
exit /b 0

rem install_deps <folder>
:install_deps
if not "%INSTALL%"=="always" if exist "%~1\node_modules\" exit /b 0
if "%INSTALL%"=="never" (
  echo Error: %~1\node_modules is missing. Run without --no-install to install it.
  exit /b 1
)
echo Installing %~1 dependencies with %PM% - this can take a few minutes the first time...
pushd "%~1"
call %PM% install
set "INSTALL_RESULT=%ERRORLEVEL%"
popd
if not "%INSTALL_RESULT%"=="0" (
  echo Error: installing the %~1 dependencies failed. See the messages above.
  exit /b 1
)
exit /b 0

rem Copies server\.env.example to server\.env with fresh random secrets; never overwrites
:create_env
if not exist "server\.env.example" (
  echo Error: server\.env.example is missing, so server\.env can't be created.
  exit /b 1
)
node -e "const fs=require('fs'),c=require('crypto'),s=()=>c.randomBytes(32).toString('hex');let t=fs.readFileSync('server/.env.example','utf8');t=t.replace(/^SECRET=.*$/m,'SECRET='+s()).replace(/^JWT_SECRET=.*$/m,'JWT_SECRET='+s()).replace(/^ADMIN_EMAILS=.*$/m,'ADMIN_EMAILS=');fs.writeFileSync('server/.env',t,{flag:'wx'})"
if errorlevel 1 (
  echo Error: couldn't create server\.env.
  exit /b 1
)
echo Created server\.env with new secrets. It uses the built-in local database; set DB_MONGODB_URI there to use MongoDB Atlas.
exit /b 0

rem http_ok <url>: errorlevel 0 when the URL answers with a 2xx status
:http_ok
where curl.exe >nul 2>nul
if errorlevel 1 (
  node -e "fetch(process.argv[1],{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" "%~1"
  exit /b
)
curl.exe -fs -o nul --max-time 3 "%~1" >nul 2>nul
exit /b

rem http_up <url>: errorlevel 0 when anything answers on the URL
:http_up
where curl.exe >nul 2>nul
if errorlevel 1 (
  node -e "fetch(process.argv[1],{signal:AbortSignal.timeout(3000)}).then(()=>process.exit(0),()=>process.exit(1))" "%~1"
  exit /b
)
curl.exe -s -o nul --max-time 3 "%~1" >nul 2>nul
exit /b

rem wait_for <label> <url> <seconds> <log> <ok|up>
:wait_for
set "WAITED=0"
<nul set /p "=Waiting for the %~1"
:wait_loop
call :http_%~5 "%~2"
if not errorlevel 1 (
  echo  ready after %WAITED%s
  exit /b 0
)
rem nodemon keeps running after the app crashes, so look at the log too
findstr /c:"app crashed" "%~4" >nul 2>nul && goto :wait_failed
if %WAITED% GEQ %~3 goto :wait_failed
<nul set /p "=."
rem ping as a 2 second sleep: timeout.exe refuses to run when input is redirected
ping -n 3 127.0.0.1 >nul
set /a WAITED+=2
goto :wait_loop
:wait_failed
echo.
echo The %~1 didn't start. Last 30 lines of %~4:
echo ------------------------------------------------------------
powershell -NoProfile -Command "Get-Content -LiteralPath '%~4' -Tail 30"
echo ------------------------------------------------------------
exit /b 1

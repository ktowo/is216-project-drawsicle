@echo off
setlocal EnableExtensions EnableDelayedExpansion
rem Runs Ollama on this computer for Drawsicle's art style matching, and publishes it to the
rem deployed site through a Cloudflare Tunnel protected by Cloudflare Access (Zero Trust).
rem Git Bash, macOS and Linux: run-ollama.sh
rem
rem   run-ollama.bat               start Ollama and the tunnel, download the models if missing
rem   run-ollama.bat --background  the same, but download models in the background (Start-all uses this)
rem   run-ollama.bat --no-pull     don't download models
rem   run-ollama.bat --stop        stop the Ollama and tunnel this script started
rem
rem Settings: ollama.env next to this script (copy ollama.env.example), or the environment:
rem   OLLAMA_VISION_MODEL, OLLAMA_EMBED_MODEL, OLLAMA_PORT, CLOUDFLARE_TUNNEL_TOKEN
rem The full set-up is in docs\VISION.md.

cd /d "%~dp0"
set "RUN_DIR=%~dp0.run"
if not exist "%RUN_DIR%" mkdir "%RUN_DIR%"

set "MODE=start"
set "PULL=foreground"
:parse_args
if "%~1"=="" goto :args_done
if /i "%~1"=="--background" (set "PULL=background" & shift & goto :parse_args)
if /i "%~1"=="--no-pull" (set "PULL=none" & shift & goto :parse_args)
if /i "%~1"=="--stop" (set "MODE=stop" & shift & goto :parse_args)
echo Unknown option: %~1
exit /b 2
:args_done

rem ollama.env: KEY=VALUE lines; the environment wins over the file
if exist "ollama.env" (
  for /f "usebackq eol=# tokens=1,* delims==" %%a in ("ollama.env") do (
    if not defined %%a set "%%a=%%~b"
  )
)
if not defined OLLAMA_VISION_MODEL set "OLLAMA_VISION_MODEL=qwen2.5vl:3b"
if not defined OLLAMA_EMBED_MODEL set "OLLAMA_EMBED_MODEL=nomic-embed-text"
if not defined OLLAMA_PORT set "OLLAMA_PORT=11434"
set "LOCAL_URL=http://127.0.0.1:%OLLAMA_PORT%"

if "%MODE%"=="stop" (
  rem taskkill with a filter succeeds even when nothing matches, so look first
  tasklist /fi "WINDOWTITLE eq Drawsicle Ollama*" /nh 2>nul | findstr /i /c:".exe" >nul && (
    taskkill /fi "WINDOWTITLE eq Drawsicle Ollama*" /t /f >nul 2>nul
    echo Stopped Ollama.
  )
  tasklist /fi "WINDOWTITLE eq Drawsicle tunnel*" /nh 2>nul | findstr /i /c:".exe" >nul && (
    taskkill /fi "WINDOWTITLE eq Drawsicle tunnel*" /t /f >nul 2>nul
    echo Stopped the Cloudflare Tunnel.
  )
  exit /b 0
)

rem ---------- Ollama ----------

where ollama >nul 2>nul
if errorlevel 1 (
  echo Ollama isn't installed, so art style matching uses colours and texture only.
  echo   To add the vision model: install Ollama from https://ollama.com/download, then run run-ollama.bat
  exit /b 0
)

curl.exe -fs -o nul --max-time 3 "%LOCAL_URL%/api/tags" >nul 2>nul
if not errorlevel 1 (
  echo Ollama is already running on %LOCAL_URL%.
  goto :models
)
echo Starting Ollama on %LOCAL_URL% ^(this computer only^) ...
rem Only this computer can reach it directly; the tunnel is the way in from outside
set "OLLAMA_HOST=127.0.0.1:%OLLAMA_PORT%"
start "Drawsicle Ollama" /min cmd /c "ollama serve > "%RUN_DIR%\ollama.log" 2>&1"
set /a WAITED=0
:wait_ollama
curl.exe -fs -o nul --max-time 3 "%LOCAL_URL%/api/tags" >nul 2>nul
if not errorlevel 1 goto :models
set /a WAITED+=1
if %WAITED% GEQ 30 (
  echo Ollama didn't start. See .run\ollama.log
  exit /b 1
)
timeout /t 1 /nobreak >nul
goto :wait_ollama

rem ---------- Models ----------

:models
set "OLLAMA_HOST=127.0.0.1:%OLLAMA_PORT%"
call :pull "%OLLAMA_VISION_MODEL%"
call :pull "%OLLAMA_EMBED_MODEL%"

rem ---------- Cloudflare Tunnel (Zero Trust) ----------

if not defined CLOUDFLARE_TUNNEL_TOKEN (
  echo.
  echo Ollama is only reachable from this computer. For local development put this in server\.env:
  echo   OLLAMA_URL=%LOCAL_URL%
  echo To let the deployed site use it, set CLOUDFLARE_TUNNEL_TOKEN in ollama.env ^(see docs\VISION.md^).
  exit /b 0
)

where cloudflared >nul 2>nul
if errorlevel 1 (
  echo cloudflared isn't installed, so the tunnel can't start.
  echo   Install it: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
  exit /b 1
)

tasklist /fi "WINDOWTITLE eq Drawsicle tunnel*" /nh 2>nul | findstr /i /c:".exe" >nul
if not errorlevel 1 (
  echo The Cloudflare Tunnel is already running.
) else (
  echo Starting the Cloudflare Tunnel ...
  rem The token goes through the environment (start passes it on), so no command line shows it
  set "TUNNEL_TOKEN=%CLOUDFLARE_TUNNEL_TOKEN%"
  start "Drawsicle tunnel" /min cmd /c "cloudflared tunnel --no-autoupdate run > "%RUN_DIR%\cloudflared.log" 2>&1"
)

echo.
echo Ollama is published through your tunnel. The site's server needs ^(Vercel environment variables^):
echo   OLLAMA_URL=https://^<the tunnel's public hostname^>
echo   CF_ACCESS_CLIENT_ID=^<service token id^>   CF_ACCESS_CLIENT_SECRET=^<service token secret^>
echo Stop with run-ollama.bat --stop ^(Stop-all.bat does this too^).
exit /b 0

:pull
ollama list 2>nul | findstr /b /i /c:"%~1 " /c:"%~1:latest " >nul
if not errorlevel 1 (
  echo Model %~1 is ready.
  exit /b 0
)
if "%PULL%"=="none" (
  echo Model %~1 is missing ^(run without --no-pull to download it^).
  exit /b 0
)
if "%PULL%"=="background" (
  echo Downloading %~1 in the background ^(see .run\ollama-pull.log^). Style tags start working when it's done.
  start "Drawsicle Ollama download" /min cmd /c "ollama pull %~1 >> "%RUN_DIR%\ollama-pull.log" 2>&1"
  exit /b 0
)
echo Downloading %~1 ^(a few GB the first time^) ...
ollama pull %~1
exit /b 0

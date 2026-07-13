@echo off
setlocal EnableExtensions

cd /d "%~dp0" || goto :path_error

set "VENV_PYTHON=%~dp0.venv\Scripts\python.exe"
set "PYTHON_CMD="
set "NEEDS_INSTALL=0"

if exist "%VENV_PYTHON%" goto :check_environment

call :find_python
if not defined PYTHON_CMD goto :python_missing

echo Vestalia necesita preparar sus dependencias en esta carpeta.
echo Se creara un entorno local llamado .venv y se descargara Chromium.
choice /C SN /N /M "Deseas instalar las dependencias ahora? [S/N]: "
if errorlevel 2 goto :setup_cancelled

echo.
echo Creando el entorno local...
%PYTHON_CMD% -m venv "%~dp0.venv"
if errorlevel 1 goto :venv_error
set "NEEDS_INSTALL=1"
goto :install_dependencies

:check_environment
"%VENV_PYTHON%" -c "import PIL; from playwright.sync_api import sync_playwright" >nul 2>&1
if errorlevel 1 goto :offer_repair

"%VENV_PYTHON%" -c "from playwright.sync_api import sync_playwright; p=sync_playwright().start(); b=p.chromium.launch(headless=True); b.close(); p.stop()" >nul 2>&1
if errorlevel 1 goto :offer_repair
goto :start_server

:offer_repair
echo El entorno local existe, pero esta incompleto o Chromium no esta disponible.
choice /C SN /N /M "Deseas repararlo ahora? [S/N]: "
if errorlevel 2 goto :setup_cancelled
set "NEEDS_INSTALL=1"

:install_dependencies
if "%NEEDS_INSTALL%"=="0" goto :start_server
echo.
echo Instalando dependencias de Vestalia...
"%VENV_PYTHON%" -m pip install -r "%~dp0requirements.txt"
if errorlevel 1 goto :dependency_error

echo.
echo Instalando Chromium para generar los PDF...
"%VENV_PYTHON%" -m playwright install chromium
if errorlevel 1 goto :dependency_error

"%VENV_PYTHON%" -c "import PIL; from playwright.sync_api import sync_playwright; p=sync_playwright().start(); b=p.chromium.launch(headless=True); b.close(); p.stop()" >nul 2>&1
if errorlevel 1 goto :dependency_error

:start_server
echo.
echo Iniciando Vestalia...
"%VENV_PYTHON%" "%~dp0servidor.py"
set "SERVER_EXIT=%ERRORLEVEL%"
if "%SERVER_EXIT%"=="0" goto :eof

echo.
echo ERROR: Vestalia no pudo iniciarse. Revisa el mensaje anterior.
echo Si el puerto 8080 esta ocupado, cierra la otra aplicacion e intenta nuevamente.
pause
exit /b %SERVER_EXIT%

:find_python
py -3 -c "import sys; raise SystemExit(0 if sys.version_info.major == 3 else 1)" >nul 2>&1
if not errorlevel 1 set "PYTHON_CMD=py -3"
if defined PYTHON_CMD exit /b 0

python -c "import sys; raise SystemExit(0 if sys.version_info.major == 3 else 1)" >nul 2>&1
if not errorlevel 1 set "PYTHON_CMD=python"
exit /b 0

:python_missing
echo.
echo ERROR: No se encontro una instalacion real de Python 3.
echo Instala Python 3 desde https://www.python.org/downloads/windows/
echo Durante la instalacion, activa la opcion para agregar Python al PATH.
pause
exit /b 1

:path_error
echo ERROR: No se pudo abrir la carpeta de Vestalia.
pause
exit /b 1

:venv_error
echo.
echo ERROR: No se pudo crear el entorno local .venv.
echo Eliminalo si quedo incompleto y vuelve a ejecutar este archivo.
pause
exit /b 1

:dependency_error
echo.
echo ERROR: No se pudieron instalar o validar las dependencias.
echo Comprueba la conexion a Internet. Puedes eliminar .venv y volver a intentar.
pause
exit /b 1

:setup_cancelled
echo.
echo Instalacion cancelada. Vestalia no modifico las dependencias del sistema.
echo Ejecuta nuevamente este archivo cuando quieras completar la preparacion.
pause
exit /b 1

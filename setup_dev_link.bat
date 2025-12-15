@echo off
setlocal

set "SOURCE_DIR=%~dp0"
set "SOURCE_DIR=%SOURCE_DIR:~0,-1%"
set "TARGET_DIR=C:\Program Files\Adobe\Adobe Photoshop 2023\Plug-ins\PSBananaUXP"

echo Source: "%SOURCE_DIR%"
echo Target: "%TARGET_DIR%"

REM Check for Admin privileges
net session >nul 2>&1
if %errorLevel% == 0 (
    echo Admin privileges confirmed.
) else (
    echo.
    echo ERROR: This script requires Administrator privileges.
    echo Please right-click and select "Run as administrator".
    echo.
    pause
    exit /b 1
)

if exist "%TARGET_DIR%" (
    echo.
    echo Target directory already exists. Deleting it to create fresh link...
    rmdir "%TARGET_DIR%"
)

echo Creating Junction Link...
mklink /J "%TARGET_DIR%" "%SOURCE_DIR%"

if %errorLevel% == 0 (
    echo.
    echo SUCCESS! Link created.
    echo You can now develop in "%SOURCE_DIR%" and changes will reflect in Photoshop.
) else (
    echo.
    echo FAILED to create link.
)

pause

@echo off
title CEO Master Platform - J.A.R.V.I.S. MARK 3
color 0b
cls

echo ======================================================================
echo    CEO Master Platform - J.A.R.V.I.S. MARK 3 (D:\Light)
echo ======================================================================
echo.

set "PATH=C:\Program Files\nodejs;C:\Users\Light\AppData\Local\Programs\Git\cmd;%PATH%"

cd /d D:\Light\CEO

echo [1/2] Checking Node.js runtime...
if exist "C:\Program Files\nodejs\node.exe" (
    set "NODE_CMD=C:\Program Files\nodejs\node.exe"
) else (
    set "NODE_CMD=node"
)

echo [2/2] Launching J.A.R.V.I.S. MARK 3 Cockpit...
echo.
"%NODE_CMD%" scripts\serve-local.js

pause

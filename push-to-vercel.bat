@echo off
title Push J.A.R.V.I.S. MARK 3 to GitHub & Vercel
color 0b
cls

echo ======================================================================
echo    Antigravity CEO - Pushing J.A.R.V.I.S. MARK 3 to Vercel
echo ======================================================================
echo.

cd /d D:\Light\CEO

echo [1/2] Checking Git status...
"C:\Users\Light\AppData\Local\Programs\Git\cmd\git.exe" status -s

echo.
echo [2/2] Pushing commits to GitHub (Lighting6647/CEO)...
"C:\Users\Light\AppData\Local\Programs\Git\cmd\git.exe" push lighting main

echo.
echo ======================================================================
echo   ✅ Push complete! Vercel is auto-building https://ceo-flame.vercel.app/
echo ======================================================================
pause

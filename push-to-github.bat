@echo off
title J.A.R.V.I.S. Git Push - Lighting6647/Javis
color 0b
echo ========================================================
echo   J.A.R.V.I.S. AUTO PUSH TO GITHUB (Lighting6647/Javis)
echo ========================================================
echo.
echo Pushing branch 'main' to https://github.com/Lighting6647/Javis.git ...
echo.
git push -u javis main
echo.
if %ERRORLEVEL% EQU 0 (
    echo ========================================================
    echo   [SUCCESS] PUSH COMPLETE!
    echo   Repository: https://github.com/Lighting6647/Javis
    echo ========================================================
) else (
    echo ========================================================
    echo   [INFO] If browser window popped up, please click 'Authorize'
    echo ========================================================
)
echo.
pause

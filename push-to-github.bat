@echo off
title J.A.R.V.I.S. Autonomous Git Pipeline - Lighting6647/Javis
color 0b
chcp 65001 >nul

:: Set Git Path if needed
set "GIT_CMD=%LOCALAPPDATA%\Programs\Git\cmd\git.exe"
if exist "%GIT_CMD%" (
    set "PATH=%LOCALAPPDATA%\Programs\Git\cmd;%PATH%"
)

echo ======================================================================
echo   ⚡ J.A.R.V.I.S. AUTONOMOUS GITHUB PIPELINE (sir ไลท์)
echo   Target: https://github.com/Lighting6647/Javis.git
echo ======================================================================
echo.
echo [1] กด Enter เพื่อเชื่อมต่อผ่าน Browser (Git Credential Manager)
echo [2] หรือ วาง GitHub Personal Access Token (PAT) แล้วกด Enter
echo.
set /p USER_TOKEN="> กรุณาเลือกวิธี [กด Enter ทันที หรือ วาง Token]: "

echo.
if "%USER_TOKEN%"=="" (
    echo [J.A.R.V.I.S.] กำลัง Push ผ่าน Git Credential Manager...
    git push -u javis main
) else (
    echo [J.A.R.V.I.S.] กำลัง Push ด้วย Access Token...
    git push https://%USER_TOKEN%@github.com/Lighting6647/Javis.git main:main
)

echo.
if %ERRORLEVEL% EQU 0 (
    echo ======================================================================
    echo   [SUCCESS] อัปโหลดขึ้น GitHub สำเร็จเรียบร้อยครับ sir ไลท์!
    echo   Repository: https://github.com/Lighting6647/Javis
    echo ======================================================================
) else (
    echo ======================================================================
    echo   [FAILED] การ Push ไม่สำเร็จ กรุณาตรวจสอบสิทธิ์หรือสร้าง Token ที่:
    echo   https://github.com/settings/tokens (เลือก repo scope)
    echo ======================================================================
)

echo.
pause

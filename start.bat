@echo off
chcp 65001 >nul
title NONSTOP-AI - 논사원 AI
cd /d "C:\Projects\nonstop-ai"

echo ============================================
echo    NONSTOP-AI  논사원 AI  개발 서버
echo    주소: http://localhost:3100
echo ============================================
echo.

REM 최초 실행 시 패키지 자동 설치
if not exist "node_modules" (
  echo [최초 실행] 패키지를 설치합니다. 잠시만 기다려 주세요...
  call npm install
  echo.
)

REM 서버가 실제로 응답할 때까지 기다렸다가 브라우저 자동 열기
echo 서버 준비가 끝나면 브라우저가 자동으로 열립니다...
start "" /b cmd /c "for /l %%i in (1,1,120) do (curl -s -o nul http://localhost:3100 && (start "" http://localhost:3100 & exit /b) || ping -n 2 127.0.0.1 >nul)"

echo 서버를 시작합니다. (종료하려면 이 창에서 Ctrl+C 를 누르거나 창을 닫으세요)
echo.
call npm run dev -- -p 3100

echo.
echo 서버가 종료되었습니다.
pause

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

REM 3초 뒤 브라우저 자동 열기 (서버 준비 시간 확보)
echo 잠시 후 브라우저가 자동으로 열립니다...
start "" /b cmd /c "ping -n 4 127.0.0.1 >nul & start http://localhost:3100"

echo 서버를 시작합니다. (종료하려면 이 창에서 Ctrl+C 를 누르거나 창을 닫으세요)
echo.
call npm run dev -- -p 3100

echo.
echo 서버가 종료되었습니다.
pause

@echo off
echo [1/4] Liberando puerto 3001 (backend)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":3001 "') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo [2/4] Liberando puerto 3000 (frontend)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":3000 "') do (
    taskkill /F /PID %%a >nul 2>&1
)

timeout /t 2 >nul

echo [3/4] Iniciando Backend en nueva ventana...
start "BACKEND - Puerto 3001" cmd /k "%~dp0apps\backend\start.bat"

echo [4/4] Iniciando Frontend en nueva ventana...
start "FRONTEND - Puerto 3000" cmd /k "%~dp0apps\frontend\start.bat"

echo.
echo =========================================
echo  Backend:  http://localhost:3001
echo  Docs API: http://localhost:3001/docs
echo  Frontend: http://localhost:3000
echo =========================================
timeout /t 3 >nul

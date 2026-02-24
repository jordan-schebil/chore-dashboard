@echo off
setlocal
echo ========================================
echo    Chore Dashboard - Starting Up...
echo ========================================
echo.

:: Get the directory where this batch file is located
set "PROJECT_DIR=%~dp0"
if not exist "%PROJECT_DIR%server\index.js" (
    echo Express backend entry not found: "%PROJECT_DIR%server\index.js"
    pause
    exit /b 1
)
if not exist "%PROJECT_DIR%node_modules\express\package.json" (
    echo Express backend dependencies are not installed.
    echo Run: npm install
    pause
    exit /b 1
)

:: Start the backend API server
echo Starting API server ^(Express / Node^)...
start "Chore API (Express) - localhost:8000" cmd /k "cd /d "%PROJECT_DIR%" && npm run start:api:node"

:: Wait a few seconds for the API to start
echo Waiting for API to initialize...
timeout /t 4 /nobreak >nul

:: Start the frontend dev server
echo Starting frontend...
start "Chore App - localhost:5173" cmd /k "cd /d "%PROJECT_DIR%" && npm run dev"

:: Wait for frontend to compile
echo Waiting for app to compile...
timeout /t 6 /nobreak >nul

:: Open the browser
echo Opening browser...
start http://localhost:5173

echo.
echo ========================================
echo    Chore Dashboard is running!
echo ========================================
echo.
echo    App:  http://localhost:5173
echo    API:  http://localhost:8000
echo    Backend: express
echo.
echo    To stop: Close the two terminal windows
echo            titled "Chore API" and "Chore App"
echo ========================================
echo.
pause

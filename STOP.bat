@echo off
echo Stopping Chore Dashboard servers...
echo.

:: Kill Node processes (Express API + frontend)
taskkill /F /IM node.exe 2>nul

echo.
echo Servers stopped.
pause

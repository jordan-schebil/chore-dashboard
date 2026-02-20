@echo off
echo Stopping Chore Dashboard servers...
echo.

:: Kill Python (backend)
taskkill /F /IM python.exe 2>nul

:: Kill Node (frontend)  
taskkill /F /IM node.exe 2>nul

echo.
echo Servers stopped.
pause

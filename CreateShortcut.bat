@echo off
REM Create desktop shortcut for Chore Dashboard
REM This script creates an icon on your desktop to launch the app

setlocal enabledelayedexpansion

:: Get the project directory
set "PROJECT_DIR=%~dp0"

:: Create the shortcut using PowerShell (handles OneDrive Desktop if present)
powershell -NoProfile -Command ^
  "$paths = @(); " ^
  "$desktop = [Environment]::GetFolderPath('Desktop'); if ($desktop) { $paths += $desktop }; " ^
  "if ($env:OneDrive) { $od = Join-Path $env:OneDrive 'Desktop'; if (Test-Path $od) { $paths += $od } }; " ^
  "$paths = $paths | Select-Object -Unique; " ^
  "$WshShell = New-Object -ComObject WScript.Shell; " ^
  "foreach ($p in $paths) { " ^
  "  $lnk = Join-Path $p 'Chore Dashboard.lnk'; " ^
  "  $Shortcut = $WshShell.CreateShortCut($lnk); " ^
  "  $Shortcut.TargetPath = '%PROJECT_DIR%LaunchApp.vbs'; " ^
  "  $Shortcut.WorkingDirectory = '%PROJECT_DIR%'; " ^
  "  $Shortcut.Description = 'Launch Chore Dashboard'; " ^
  "  $Shortcut.IconLocation = '%PROJECT_DIR%theo.ico'; " ^
  "  $Shortcut.WindowStyle = 1; " ^
  "  $Shortcut.Save(); " ^
  "  Write-Output ('Created shortcut: ' + $lnk); " ^
  "}"

echo.
echo Shortcut creation attempted. See paths above.
echo You can now double-click "Chore Dashboard.lnk" to launch the app.
echo.

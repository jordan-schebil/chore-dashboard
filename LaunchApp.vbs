'
' Chore Dashboard Launcher
' Starts backend/frontend only if their ports are not already listening.
' Runs hidden (no terminal windows) and opens the browser.
'

Option Explicit

Dim objShell, objFSO, projDir
Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

' Get the project directory (where this script is located)
projDir = objFSO.GetParentFolderName(WScript.ScriptFullName)

' Check if a TCP port is listening (uses PowerShell)
Function IsPortListening(port)
    Dim cmd, execObj, output
    cmd = "powershell -NoProfile -Command ""$c = Get-NetTCPConnection -LocalPort " & port & " -State Listen -ErrorAction SilentlyContinue; if ($c) { 'LISTEN' }"""
    Set execObj = objShell.Exec(cmd)
    output = Trim(execObj.StdOut.ReadAll())
    IsPortListening = (output = "LISTEN")
End Function

' Start backend if needed
If Not IsPortListening(8000) Then
    objShell.Run "cmd.exe /c ""cd /d """ & projDir & """ && npm run start:api:node""", 0, False
End If

' Start frontend if needed
If Not IsPortListening(5173) Then
    objShell.Run "cmd.exe /c ""cd /d """ & projDir & """ && npm run dev""", 0, False
End If

' Wait briefly for servers to initialize
WScript.Sleep 4000

' Open the app in default browser
objShell.Run "http://localhost:5173"

' Clean up
Set objShell = Nothing
Set objFSO = Nothing

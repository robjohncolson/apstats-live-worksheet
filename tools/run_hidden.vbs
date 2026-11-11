' run_hidden.vbs -- run a scheduled grade job with NO console window, wait for it, and hand
' its exit code back to Task Scheduler.
'
' Why (2026-11-11): the grade tasks started powershell.exe / node.exe as console programs, and
' Windows hands every new console to a new, focused Windows Terminal window. The 16:30 PeriodB
' Schoology sync died in its first seconds two days running (Tue 11/10: 0xC000013A, the exit
' code of Ctrl+C or a closed window; Wed 11/11: 0x8007042B), and so did the Tue 21:00 grade
' backup (0xC000013A), while the identical 16:45 PeriodE job survived. Nothing on the laptop
' recorded what closed or interrupted those windows. A job started hidden has no window to
' close, nothing to type Ctrl+C into, and never steals the teacher's focus.
'
' Task action (tools/set_tasks_hidden.ps1 writes it):
'   wscript.exe //B //Nologo <repo>\tools\run_hidden.vbs <label> <program> [arguments...]
'
' Every run appends two lines to tools\.schoology-sync-logs\launcher.log (gitignored):
'   <time> <label> start <command>
'   <time> <label> end exit <code> (0x<hex>) after <seconds> s
' A start line with no end line means the launcher itself was killed.
' Exit codes: the job's own exit code; 2 = called without a label and a program.
Option Explicit

Dim shell, fso, label, command, i, arg, logPath, startedAt, code

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

If WScript.Arguments.Count < 2 Then WScript.Quit 2

label = WScript.Arguments(0)
command = ""
For i = 1 To WScript.Arguments.Count - 1
  arg = WScript.Arguments(i)
  If InStr(arg, " ") > 0 Then arg = Chr(34) & arg & Chr(34)
  If command <> "" Then command = command & " "
  command = command & arg
Next

logPath = fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), ".schoology-sync-logs\launcher.log")

Sub WriteLog(text)
  ' Logging must never stop the job: every error here is ignored.
  Dim stream
  On Error Resume Next
  Set stream = fso.OpenTextFile(logPath, 8, True)
  stream.WriteLine Stamp() & " " & label & " " & text
  stream.Close
  On Error GoTo 0
End Sub

Function Stamp()
  Dim t
  t = Now
  Stamp = Year(t) & "-" & Right("0" & Month(t), 2) & "-" & Right("0" & Day(t), 2) & " " & _
          Right("0" & Hour(t), 2) & ":" & Right("0" & Minute(t), 2) & ":" & Right("0" & Second(t), 2)
End Function

startedAt = Now
WriteLog "start " & command

' 0 = hidden window, True = wait for the job and return its exit code.
code = shell.Run(command, 0, True)

WriteLog "end exit " & code & " (0x" & Hex(code) & ") after " & DateDiff("s", startedAt, Now) & " s"
WScript.Quit code

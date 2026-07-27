Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\slrz6\OneDrive\Documents\Default Project\CODE LIBRARY"
WshShell.Run "cmd.exe /c cd /d ""C:\Users\slrz6\OneDrive\Documents\Default Project\CODE LIBRARY"" & set PATH=C:\Program Files\nodejs;%PATH% & call ""C:\Program Files\nodejs\npm.cmd"" run dev", 0, False
Set WshShell = Nothing
#Requires AutoHotkey v2.0
#SingleInstance Force
; Ctrl+Alt+O shows/hides the module layout overlay (overlay.html) on top of the game.
; Run the game in windowed or borderless mode: exclusive fullscreen draws over every window.
; If the overlay is not open yet, it opens in a small Chrome app window.

DetectHiddenWindows true
SetTitleMatchMode 2
Title := "Layout Overlay"
Page := "file:///" StrReplace(A_ScriptDir, "\", "/") "/overlay.html"
Chrome := "C:\Program Files\Google\Chrome\Application\chrome.exe"

^!o:: {
    if hwnd := WinExist(Title) {
        if WinGetStyle(hwnd) & 0x10000000 {   ; WS_VISIBLE
            WinHide hwnd
        } else {
            WinShow hwnd
            WinSetAlwaysOnTop 1, hwnd
        }
        return
    }
    Run '"' Chrome '" --app="' Page '" --window-size=460,820'
    if hwnd := WinWait(Title, , 10)
        WinSetAlwaysOnTop 1, hwnd
}

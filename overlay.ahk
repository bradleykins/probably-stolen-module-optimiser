#Requires AutoHotkey v2.0
#SingleInstance Force
; Optional. The "Open overlay" button already gives an always-on-top window in Chrome/Edge.
; This script adds Ctrl+Alt+O to show/hide the overlay and keeps it on top of the game.
; Run the game in windowed or borderless mode: exclusive fullscreen draws over every window.

DetectHiddenWindows true
SetTitleMatchMode 2
Title := "Layout Overlay"
; Same site as the planner you use, so the overlay sees your saved plan.
; Using the local server instead? Set this to "http://localhost:8769/overlay.html".
Page := "https://bradleykins.github.io/probably-stolen-module-optimiser/overlay.html"
Chrome := "C:\Program Files\Google\Chrome\Application\chrome.exe"

IsVisible(hwnd) => WinGetStyle(hwnd) & 0x10000000      ; WS_VISIBLE
IsOnTop(hwnd) => WinGetExStyle(hwnd) & 0x8              ; WS_EX_TOPMOST

; The game can take the top spot back when it gets focus, so keep re-pinning the overlay.
KeepOnTop() {
    if (hwnd := WinExist(Title)) && IsVisible(hwnd) && !IsOnTop(hwnd)
        WinSetAlwaysOnTop 1, hwnd
}
SetTimer KeepOnTop, 1000

^!o:: {
    if hwnd := WinExist(Title) {
        if IsVisible(hwnd) && IsOnTop(hwnd) {
            WinHide hwnd
        } else {
            WinShow hwnd
            WinSetAlwaysOnTop 1, hwnd
        }
        return
    }
    Run '"' Chrome '" --app="' Page '" --window-size=316,' A_ScreenHeight // 2
    if hwnd := WinWait(Title, , 10)
        WinSetAlwaysOnTop 1, hwnd
}

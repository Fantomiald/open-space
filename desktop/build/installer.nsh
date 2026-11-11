; Picked up by electron-builder for the Windows installer (desktop/build is its buildResources).
; After an update the app asked for (quitAndInstall(true, true) passes --force-run), the installer reopens the app
; through the shell (StdUtils ExecShellAsUser), which can fail without a word: start it from here as well. The app holds
; a single-instance lock, so when both launches work the second one only quits.
!macro customInstall
  ${if} ${isForceRun}
    Exec '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --updated'
  ${endIf}
!macroend

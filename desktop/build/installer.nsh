; Picked up by electron-builder for the Windows installer (desktop/build is its buildResources).

; Up to 1.32 the installer could put Open Space in Program Files for all users. The one-click installer is per user
; and would leave that copy behind, out of date: its uninstaller is run once (UAC asks), the user's data stays.
!macro customInit
  ReadRegStr $0 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${if} $0 != ""
  ${andIf} ${FileExists} "$0\Uninstall ${PRODUCT_FILENAME}.exe"
    ExecShellWait "runas" "$0\Uninstall ${PRODUCT_FILENAME}.exe" "/allusers /S"
  ${endIf}
!macroend

; The template reopens the app through Explorer (StdUtils ExecShellAsUser), which did not start it in our tests. The
; app is started here instead, in the same cases (a first install or one with the window shown, an update the app asked
; for with --force-run), and the installer quits before its own launch, so there is one instance.
!macro customInstall
  ${ifNot} ${Silent}
  ${orIf} ${isForceRun}
    HideWindow
    ${if} ${isUpdated}
      Exec '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --updated'
    ${else}
      Exec '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
    ${endIf}
    !insertmacro quitSuccess
  ${endIf}
!macroend

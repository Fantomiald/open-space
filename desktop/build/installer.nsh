; Keep electron-builder's installation/uninstall identity stable. The Windows Shell identity is distinct
; from development runs and must match desktop/main.ts, including on the first launch after an upgrade.
!macro customInstall
  ${if} ${FileExists} "$newStartMenuLink"
    WinShell::SetLnkAUMI "$newStartMenuLink" "io.github.fantomiald.open-space.windows"
  ${endIf}
  ${if} ${FileExists} "$newDesktopLink"
    WinShell::SetLnkAUMI "$newDesktopLink" "io.github.fantomiald.open-space.windows"
  ${endIf}
!macroend

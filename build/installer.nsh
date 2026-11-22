; Registers Zak as a web browser (electron-builder `nsis.include`), so that Windows lists it in
; Settings → Apps → Default apps. Windows 10+ never lets an app make itself the default: the user
; picks it there (Réglages → Navigateur par défaut opens that page). SHCTX = HKCU for a per-user
; install, HKLM for a per-machine one.

!define ZAK_CLIENT "Software\Clients\StartMenuInternet\Zak"

!macro customInstall
  WriteRegStr SHCTX "${ZAK_CLIENT}" "" "Zak"
  WriteRegStr SHCTX "${ZAK_CLIENT}\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHCTX "${ZAK_CLIENT}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
  WriteRegStr SHCTX "${ZAK_CLIENT}\Capabilities" "ApplicationName" "Zak"
  WriteRegStr SHCTX "${ZAK_CLIENT}\Capabilities" "ApplicationDescription" "Navigateur Zak"
  WriteRegStr SHCTX "${ZAK_CLIENT}\Capabilities" "ApplicationIcon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHCTX "${ZAK_CLIENT}\Capabilities\URLAssociations" "http" "ZakURL"
  WriteRegStr SHCTX "${ZAK_CLIENT}\Capabilities\URLAssociations" "https" "ZakURL"
  WriteRegStr SHCTX "${ZAK_CLIENT}\Capabilities\FileAssociations" ".html" "ZakHTML"
  WriteRegStr SHCTX "${ZAK_CLIENT}\Capabilities\FileAssociations" ".htm" "ZakHTML"
  WriteRegStr SHCTX "${ZAK_CLIENT}\Capabilities\FileAssociations" ".xhtml" "ZakHTML"
  WriteRegStr SHCTX "${ZAK_CLIENT}\Capabilities\StartMenu" "StartMenuInternet" "Zak"
  WriteRegStr SHCTX "Software\RegisteredApplications" "Zak" "${ZAK_CLIENT}\Capabilities"

  ; ProgIDs the associations above point to: the link or file comes as the first argument.
  WriteRegStr SHCTX "Software\Classes\ZakURL" "" "Lien web Zak"
  WriteRegStr SHCTX "Software\Classes\ZakURL" "URL Protocol" ""
  WriteRegStr SHCTX "Software\Classes\ZakURL\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHCTX "Software\Classes\ZakURL\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr SHCTX "Software\Classes\ZakHTML" "" "Page HTML Zak"
  WriteRegStr SHCTX "Software\Classes\ZakHTML\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHCTX "Software\Classes\ZakHTML\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'

  ; Tell Explorer the associations changed (SHCNE_ASSOCCHANGED).
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  DeleteRegValue SHCTX "Software\RegisteredApplications" "Zak"
  DeleteRegKey SHCTX "${ZAK_CLIENT}"
  DeleteRegKey SHCTX "Software\Classes\ZakURL"
  DeleteRegKey SHCTX "Software\Classes\ZakHTML"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

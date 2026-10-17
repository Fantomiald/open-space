-- Opens Open Space in Arc's front window, in the tab it already has when there is one (Arc sleeps tabs, so a tab
-- may be open but not connected). Called by server/index.ts and by the macOS app (scripts/macos-app.py).
--   osascript scripts/open-in-arc.applescript <address> <origin>
on run argv
  set address to item 1 of argv
  set origin to item 2 of argv
  tell application "Arc"
    if (count of windows) is 0 then make new window
    repeat with candidate in windows
      repeat with existing in tabs of candidate
        if URL of existing starts with origin then
          set URL of existing to address
          tell existing to select
          activate
          return
        end if
      end repeat
    end repeat
    tell front window to make new tab with properties {URL:address}
    activate
  end tell
end run

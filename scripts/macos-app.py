#!/usr/bin/env python3
"""Builds "Open Space.app" in ~/Applications, an app that stays open in the Dock while Open Space runs:
opening it starts the server (when it is not running) and opens the page; clicking it again opens the page; quitting
it (Cmd+Q, or Quit in its Dock menu) stops the server. It also shows the server's notifications (server/notifier.ts), so
they carry its name and icon, and a click on one opens that session. Its icon is the user's bust, as the room draws it:
the page saves it in ~/.open-space/avatar.png from the user's look (and shows it as the tab's icon). Run the
script again after changing your look to update the icon.

    python3 scripts/macos-app.py [path/to/node/bin]

The Node folder defaults to the newest nvm Node 22, else the `node` on PATH. The server's output goes to
~/.open-space/server.log. Run the script again after moving the project or changing Node.

The app is an AppleScript "stay-open" applet (osacompile -s): its `on quit` handler is what stops the server.
Without avatar.png (the page was never opened), scripts/icon-head.png is used: the default look's bust. It needs Pillow.
"""
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import zlib

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.expanduser('~/Applications/Open Space.app')
DATA = os.path.expanduser(os.environ.get('OFFICE_DIR', '~/.open-space'))
AVATAR = os.path.join(DATA, 'avatar.png')
HEAD = AVATAR if os.path.exists(AVATAR) else os.path.join(PROJECT, 'scripts', 'icon-head.png')
PORT = 4848

GRID = 28
# the room at night, lighter towards the top
BACKGROUND_TOP = (58, 65, 112)
BACKGROUND_BOTTOM = (37, 42, 72)


def draw():
    """The icon on a GRID x GRID grid: a squircle like the other icons of macOS, and the bust standing on its bottom edge."""
    from PIL import Image
    inside = [[abs(x - (GRID - 1) / 2) ** 4 + abs(y - (GRID - 1) / 2) ** 4 <= 11.5 ** 4 for x in range(GRID)] for y in range(GRID)]
    shade = [tuple(round(top + (bottom - top) * y / (GRID - 1)) for top, bottom in zip(BACKGROUND_TOP, BACKGROUND_BOTTOM)) for y in range(GRID)]
    grid = [[shade[y] if inside[y][x] else None for x in range(GRID)] for y in range(GRID)]
    head = Image.open(HEAD).convert('RGBA')
    left = (GRID - head.width) // 2
    top = GRID - head.height
    for y in range(head.height):
        for x in range(head.width):
            red, green, blue, alpha = head.getpixel((x, y))
            if alpha and inside[top + y][left + x]:
                grid[top + y][left + x] = (red, green, blue)
    return grid


def png(grid, size):
    """The grid scaled to size x size (nearest neighbour, so the pixels stay sharp), as PNG bytes."""
    rows = b''
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            colour = grid[y * GRID // size][x * GRID // size]
            row += bytes((*colour, 255)) if colour else bytes(4)
        rows += bytes(row)

    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b'')


def node_folder():
    if len(sys.argv) > 1:
        return os.path.abspath(sys.argv[1])
    versions = os.path.expanduser('~/.nvm/versions/node')
    newest = sorted((name for name in os.listdir(versions) if name.startswith('v22.')), key=lambda name: [int(part) for part in name[1:].split('.')]) if os.path.isdir(versions) else []
    if newest:
        return os.path.join(versions, newest[-1], 'bin')
    found = shutil.which('node')
    if not found:
        sys.exit('Node introuvable : donne le dossier de Node 22 en argument.')
    return os.path.dirname(found)


START = '''#!/bin/bash
# Opens Open Space, starting it first when it is not running (see scripts/macos-app.py). $1: a session to open
# (from a click on its notification), or nothing.
PORT={port}
PAGE="http://127.0.0.1:$PORT/"
[ -n "$1" ] && PAGE="$PAGE#session=$1"
if /usr/sbin/lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  # in Arc's front window, reusing Open Space's tab (see open-in-arc.applescript); else the default browser
  if [ -d /Applications/Arc.app ]; then
    /usr/bin/osascript "{project}/scripts/open-in-arc.applescript" "$PAGE" "http://127.0.0.1:$PORT" && exit 0
  fi
  open "$PAGE"
  exit 0
fi
# an app opened from the Dock gets a bare PATH: take the login shell's (claude, MCP servers), with Node 22 first
LOGIN_PATH=$(/bin/zsh -lc 'echo $PATH' 2>/dev/null | tail -n 1)
export PATH="{node}:${{LOGIN_PATH:-/usr/bin:/bin:/usr/sbin:/sbin}}"
mkdir -p "$HOME/.open-space"
cd "{project}" || exit 1
# npm start opens the page once the server listens (in Arc when it is installed, see server/index.ts)
nohup npm start </dev/null >>"$HOME/.open-space/server.log" 2>&1 &
disown
'''

# SIGTERM: the server closes its sessions (they can be resumed) and saves before it exits
STOP = '''#!/bin/bash
pids=$(/usr/sbin/lsof -ti tcp:{port} -sTCP:LISTEN)
[ -n "$pids" ] && kill $pids
exit 0
'''

APPLET = '''-- the session of the last notification shown: a click on it brings the app back (reopen), which opens that session
property lastSession : ""

on run
  do shell script quoted form of (POSIX path of (path to me) & "Contents/Resources/start.sh")
end run

on reopen
  set target to lastSession
  set lastSession to ""
  do shell script quoted form of (POSIX path of (path to me) & "Contents/Resources/start.sh") & " " & quoted form of target
end reopen

-- called by the server (server/notifier.ts): shown by the app, the notification carries its name and icon
on showNotification(theTitle, theBody, sessionId)
  set lastSession to sessionId
  display notification theBody with title theTitle
end showNotification

on quit
  do shell script quoted form of (POSIX path of (path to me) & "Contents/Resources/stop.sh")
  continue quit
end quit
'''


def write_script(path, text):
    with open(path, 'w') as file:
        file.write(text)
    os.chmod(path, 0o755)


def main():
    node = node_folder()
    if not os.path.exists(os.path.join(node, 'node')):
        sys.exit(f'Pas de node dans {node}.')
    if os.path.exists(APP):
        shutil.rmtree(APP)
    with tempfile.TemporaryDirectory() as folder:
        source = os.path.join(folder, 'applet.applescript')
        with open(source, 'w') as file:
            file.write(APPLET)
        subprocess.run(['/usr/bin/osacompile', '-s', '-o', APP, source], check=True)
        resources = os.path.join(APP, 'Contents/Resources')
        write_script(os.path.join(resources, 'start.sh'), START.format(port=PORT, node=node, project=PROJECT))
        write_script(os.path.join(resources, 'stop.sh'), STOP.format(port=PORT))
        grid = draw()
        iconset = os.path.join(folder, 'icon.iconset')
        os.mkdir(iconset)
        for size in (16, 32, 128, 256, 512):
            with open(os.path.join(iconset, f'icon_{size}x{size}.png'), 'wb') as file:
                file.write(png(grid, size))
            with open(os.path.join(iconset, f'icon_{size}x{size}@2x.png'), 'wb') as file:
                file.write(png(grid, size * 2))
        # the applet's own icon file, which its Info.plist already names
        subprocess.run(['/usr/bin/iconutil', '-c', 'icns', iconset, '-o', os.path.join(resources, 'applet.icns')], check=True)
    plist = os.path.join(APP, 'Contents/Info.plist')
    subprocess.run(['/usr/bin/plutil', '-replace', 'CFBundleIdentifier', '-string', 'local.open-space', plist], check=True)
    # the applet's compiled asset catalogue would win over applet.icns: without it and its key, the .icns is used
    subprocess.run(['/usr/bin/plutil', '-remove', 'CFBundleIconName', plist], check=True)
    os.remove(os.path.join(APP, 'Contents/Resources/Assets.car'))
    # osacompile signed the bundle before it was changed: sign it again (ad hoc, as osacompile does)
    subprocess.run(['/usr/bin/codesign', '--force', '--deep', '--sign', '-', APP], check=True)
    # Finder and the Dock cache icons: touching the bundle makes them read the new one
    os.utime(APP)
    print(f'{APP} (Node : {node})')


if __name__ == '__main__':
    main()

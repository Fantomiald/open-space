#!/usr/bin/env python3
"""Draws desktop/build/icon.png, the icon of the macOS app as Finder and the .dmg show it: the default look's bust
(scripts/icon-head.png) on the squircle of scripts/macos-app.py. Once the app runs, the Dock shows the user's own bust
instead (desktop/main.ts). Run it again after changing icon-head.png; it needs Pillow.

    python3 scripts/app-icon.py
"""
import importlib.util
import os

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location('macos_app', os.path.join(PROJECT, 'scripts', 'macos-app.py'))
macos_app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(macos_app)
# the default bust, never the user's own: the icon ships to everyone
macos_app.HEAD = os.path.join(PROJECT, 'scripts', 'icon-head.png')

with open(os.path.join(PROJECT, 'desktop', 'build', 'icon.png'), 'wb') as file:
    file.write(macos_app.png(macos_app.draw(), 1024))

# Windows needs native icon sizes for the executable, shortcuts and taskbar relaunch metadata.
from PIL import Image

with Image.open(os.path.join(PROJECT, 'desktop', 'build', 'icon.png')) as image:
    image.save(os.path.join(PROJECT, 'desktop', 'build', 'icon.ico'), format='ICO',
               sizes=[(size, size) for size in (16, 20, 24, 32, 40, 48, 64, 128, 256)])

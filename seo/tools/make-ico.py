#!/usr/bin/env python3
"""Packs the 16, 32 and 48 px favicon renders into /favicon.ico (run after render-assets.js)."""
from pathlib import Path
from PIL import Image

here = Path(__file__).resolve().parent
root = here.parent.parent
sizes = [16, 32, 48]
images = [Image.open(here / '.tmp' / f'favicon-{s}.png').convert('RGBA') for s in sizes]
images[-1].save(root / 'favicon.ico', format='ICO', sizes=[(s, s) for s in sizes], append_images=images[:-1])
print('wrote favicon.ico', (root / 'favicon.ico').stat().st_size, 'bytes')

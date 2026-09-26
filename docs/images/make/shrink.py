"""Turns the twice-size screenshots in out/ into the README images in docs/images/: 2400 pixels wide,
256 colours, no dithering, which keeps the text sharp and the files small. Needs Pillow:
    python docs/images/make/shrink.py"""
from pathlib import Path

from PIL import Image

HERE = Path(__file__).parent
WIDTH = 2400
for p in sorted((HERE / "out").glob("*.png")):
    im = Image.open(p).convert("RGB")
    h = round(im.height * WIDTH / im.width)
    im = im.resize((WIDTH, h), Image.LANCZOS).quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    out = HERE.parent / p.name
    im.save(out, optimize=True)
    print(f"{p.name}: {WIDTH}x{h} {out.stat().st_size // 1024} KB")

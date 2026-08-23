#!/usr/bin/env python3
"""Paint a store-cover screenshot of Tesseract OCR. No live app needed."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

W, H = 1280, 800
BG = (20, 14, 8)
SURFACE = (31, 23, 16)
BORDER = (74, 52, 32)
TEXT = (244, 234, 216)
MUTED = (196, 168, 130)
ACCENT = (224, 152, 48)
INK = (18, 12, 7)

def font(size, bold=False):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for p in candidates:
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)

def rr(xy, r, fill=None, outline=None, width=1):
    d.rounded_rectangle(xy, radius=r, fill=fill, outline=outline, width=width)

# title
d.text((72, 48), "Tesseract OCR", font=font(42, True), fill=TEXT)
d.text((72, 102), "A photo or a page in, the words out. English, on this device.",
       font=font(20), fill=MUTED)

# card
rr((72, 150, 1208, 430), 18, fill=SURFACE, outline=BORDER, width=2)
rr((100, 174, 1180, 300), 14, fill=(26, 18, 12), outline=ACCENT, width=2)
# Camera glyph — DejaVu has no emoji, so a hollow box used to ship as the cover.
body = (618, 198, 662, 236)
rr(body, 6, outline=ACCENT, width=3)
d.ellipse((628, 204, 652, 228), outline=ACCENT, width=3)
d.rectangle((636, 188, 650, 198), fill=ACCENT)
d.text((400, 258), "Drop a picture here  or  tap to choose", font=font(22, True), fill=TEXT)

rr((100, 322, 280, 372), 10, fill=ACCENT)
d.text((128, 334), "Read text", font=font(20, True), fill=INK)
rr((296, 322, 430, 372), 10, outline=BORDER, width=2)
d.text((328, 334), "Copy", font=font(20), fill=ACCENT)
d.text((100, 388), "Tesseract 5  ·  English  ·  on this device", font=font(16), fill=MUTED)

# split: fake page + text
rr((72, 454, 620, 752), 14, fill=SURFACE, outline=BORDER, width=2)
page = (96, 490, 596, 728)
rr(page, 8, fill=(232, 220, 196))
# scan beam
d.rectangle((96, 590, 596, 598), fill=(255, 232, 196))
# lines of "print"
for i, w in enumerate((0.86, 0.74, 0.9, 0.62, 0.8, 0.55, 0.78)):
    y = 512 + i * 26
    d.rectangle((120, y, 120 + int(420 * w), y + 8), fill=(62, 44, 24) if y < 590 else (196, 180, 150))
d.text((96, 460), "Picture", font=font(14), fill=MUTED)

rr((644, 454, 1208, 752), 14, fill=SURFACE, outline=BORDER, width=2)
d.text((668, 460), "Text  ·  96% confident  ·  1.8s", font=font(14), fill=ACCENT)
sample = [
    "THE QUICK BROWN FOX",
    "jumps over the lazy dog.",
    "",
    "Pack my box with five dozen",
    "liquor jugs — a photograph of",
    "the page, typed back on this",
    "device. Nothing uploaded.",
]
y = 500
for line in sample:
    d.text((668, y), line, font=font(20, True if line.isupper() else False), fill=TEXT)
    y += 30

root = Path(__file__).resolve().parents[1]
png = root / "screenshot.png"
img.save(png, "PNG")
print("wrote", png, img.size)

# store cover: 1200px JPEG
cover_w = 1200
cover = img.resize((cover_w, int(H * cover_w / W)), Image.LANCZOS)
out = root.parents[1] / "site" / "apps" / "tesseract"
out.mkdir(parents=True, exist_ok=True)
jpg = out / "cover.jpg"
cover.save(jpg, "JPEG", quality=82, optimize=True, progressive=True)
print("wrote", jpg, cover.size)

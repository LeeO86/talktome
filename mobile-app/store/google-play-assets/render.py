"""Export Play assets from the existing icon and draw the feature graphic.
Requires Pillow; no app screenshot or app interface is fabricated here.
"""
from pathlib import Path
import math
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
FONT_DIR = Path('/System/Library/Fonts/Supplemental')

def font(size, bold=False):
    return ImageFont.truetype(str(FONT_DIR / ('Arial Bold.ttf' if bold else 'Arial.ttf')), size)

Image.open(ROOT / 'assets/icon.png').convert('RGBA').resize((512, 512), Image.Resampling.LANCZOS).save(OUT / 'icon-512.png')

for locale, lines, subtitle in [
    ('en-US', ['Team intercom.', 'Your own server.'], 'Push-to-talk for production teams.'),
    ('de-DE', ['Team-Intercom.', 'Dein eigener Server.'], 'Push-to-Talk für Produktionsteams.'),
]:
    image = Image.new('RGB', (2048, 1000), '#070b14')
    draw = ImageDraw.Draw(image)
    scale = 2
    def xy(box): return tuple(int(v * scale) for v in box)
    draw.rounded_rectangle(xy((76, 68, 130, 72)), radius=4, fill='#3dd6f5')
    draw.text(xy((76, 90)), 'TALKTOME INTERCOM', font=font(23*scale, True), fill='#aab6c5')
    size = 55
    while max(draw.textlength(line, font=font(size*scale, True)) for line in lines) > 570*scale:
        size -= 1
    for i, line in enumerate(lines):
        draw.text(xy((72, 158+i*72)), line, font=font(size*scale, True), fill='#f4f7fb')
    draw.text(xy((76, 349)), subtitle, font=font(22*scale), fill='#aab6c5')
    # A code-drawn audio/network motif extending the existing cyan visual theme.
    cx, cy = 809, 253
    draw.ellipse(xy((cx-111,cy-111,cx+111,cy+111)), fill='#10232e', outline='#245366', width=2*scale)
    for i, height in enumerate([35, 67, 106, 67, 35]):
        x=cx-51+i*23
        draw.rounded_rectangle(xy((x,cy-height/2,x+10,cy+height/2)),radius=5*scale,fill='#3dd6f5')
    for degrees in [-75, 45, 165]:
        radians=math.radians(degrees)
        x,y=cx+153*math.cos(radians),cy+153*math.sin(radians)
        ix,iy=cx+113*math.cos(radians),cy+113*math.sin(radians)
        draw.line(xy((ix,iy,x,y)),fill='#245366',width=2*scale)
        draw.ellipse(xy((x-8,y-8,x+8,y+8)),fill='#3dd6f5')
    image.resize((1024,500),Image.Resampling.LANCZOS).save(OUT / f'feature-{locale}.png')
    print(locale, 'feature graphic exported')

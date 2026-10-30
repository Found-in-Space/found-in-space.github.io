"""Make filmstrips around camera knots; requires FFmpeg and Pillow."""
import argparse
import io
import json
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
parser.add_argument('journeys', nargs='*')
args = parser.parse_args()
font = ImageFont.load_default(size=15)
for capture in sorted(args.output.glob('*/capture.json')):
    meta = json.loads(capture.read_text())
    if args.journeys and meta['id'] not in args.journeys:
        continue
    folder = capture.parent
    video = folder / f"{meta['id']}-rush-540p.mp4"
    knots = meta['motionAudit']['knots'][1:-1]
    page = 0
    for index, knot in enumerate(knots):
        row = index % 6
        if row == 0:
            page += 1
            sheet = Image.new('RGB', (1600, min(6, len(knots) - index) * 294), '#10151a')
            draw = ImageDraw.Draw(sheet)
        chapter = next((c for c in meta['chapters'] if c['start'] <= knot['time'] < c['end']), meta['chapters'][-1])
        kind = 'depart' if abs(chapter['start'] - knot['time']) < .001 else 'arrive'
        for col, offset in enumerate((-2, -1, 0, 1, 2)):
            seconds = max(0, min(meta['duration'] - 1 / meta['outputFps'], knot['time'] + offset))
            png = subprocess.check_output([
                'ffmpeg', '-v', 'error', '-ss', str(seconds), '-i', str(video),
                '-vf', 'crop=650:540:310:0,scale=320:266', '-frames:v', '1',
                '-f', 'image2pipe', '-vcodec', 'png', '-',
            ])
            with Image.open(io.BytesIO(png)) as frame:
                sheet.paste(frame, (col * 320, row * 294 + 28))
            label = f"{chapter['id']} {kind} {seconds:.2f}s"
            draw.text((col * 320 + 7, row * 294 + 5), label, fill='white', font=font)
        if row == 5 or index == len(knots) - 1:
            destination = folder / f'motion-knots-{page:02d}.jpg'
            sheet.save(destination, quality=94)
            print(destination, flush=True)

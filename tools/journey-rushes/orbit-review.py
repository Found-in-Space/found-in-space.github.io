"""Export eight viewpoints around each complete orbit; requires FFmpeg and Pillow."""
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
font = ImageFont.load_default(size=16)
for capture in sorted(args.output.glob('*/capture.json')):
    meta = json.loads(capture.read_text())
    if args.journeys and meta['id'] not in args.journeys:
        continue
    video = capture.parent / f"{meta['id']}-rush-540p.mp4"
    for orbit in meta['motionAudit'].get('orbits', []):
        if orbit['end'] > meta['outputDuration']:
            continue
        frames = [f for f in meta['frames'] if f['path']['kind'] == 'orbit'
                  and orbit['start'] - 1e-8 <= f['time'] < orbit['end'] - 1e-8]
        sheet = Image.new('RGB', (1600, 728), '#10151a')
        draw = ImageDraw.Draw(sheet)
        for index, degrees in enumerate(range(0, 360, 45)):
            frame = min(frames, key=lambda f: abs(f['path']['orbitProgress']*360 - degrees))
            png = subprocess.check_output([
                'ffmpeg', '-v', 'error', '-ss', str(frame['time']), '-i', str(video),
                '-vf', 'crop=650:540:310:0,scale=400:332', '-frames:v', '1',
                '-f', 'image2pipe', '-vcodec', 'png', '-',
            ])
            x, y = (index % 4)*400, (index // 4)*364
            with Image.open(io.BytesIO(png)) as still:
                sheet.paste(still, (x, y + 32))
            draw.text((x+8, y+7), f"{orbit['chapter']}  {degrees}°  {frame['time']:.2f}s", font=font, fill='white')
        destination = capture.parent / f"orbit-{orbit['chapter']}.jpg"
        sheet.save(destination, quality=94)
        print(destination, flush=True)

"""Validate completed rush files and export a near-arrival frame per chapter."""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

root = Path(sys.argv[1])
selected = set(sys.argv[2:])
report_path = root / 'verification.json'
previous = json.loads(report_path.read_text()) if report_path.exists() else []
results = [entry for entry in previous if selected and entry['id'] not in selected]
for capture in sorted(root.glob('*/capture.json')):
    meta = json.loads(capture.read_text())
    if selected and meta['id'] not in selected:
        continue
    folder = capture.parent
    video = folder / f"{meta['id']}-rush-540p.mp4"
    frames = meta['frames']
    assert len(frames) == meta['frameCount']
    assert len(frames) == round(meta['duration'] * meta['captureFps']), 'Incomplete rush'
    for i, frame in enumerate(frames):
        assert frame['index'] == i
        assert abs(frame['time'] - i / meta['captureFps']) < 1e-8
        assert frame['readiness']['ready']
        for stars in frame['readiness']['stars']:
            d = stars['demand']
            assert stars['ready'] and d['status'] == 'current'
            assert stars.get('currentDelivered', stars['status'] == 'current')
            if 'currentDelivered' in stars:
                assert stars['cellCount'] == d['currentCellCount']
                assert stars['starCount'] == stars['sessionStarCount']
                assert stars['renderedRevision']['viewRevision'] == stars['sessionViewRevision']
                assert stars['renderedRevision']['demandRevision'] == d['revision']
            assert d['activeWorkItemCount'] == 0 and d['inFlightCellCount'] == 0
            assert d['currentCellCount'] >= d['desiredCellCount']
    probe = json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(video)
    ]))
    assert len(probe['streams']) == 1
    stream = probe['streams'][0]
    assert (stream['width'], stream['height']) == (960, 540)
    assert stream['codec_name'] == 'h264' and stream['pix_fmt'] == 'yuv420p'
    assert stream['r_frame_rate'] == '25/1'
    assert int(stream['nb_frames']) == len(frames) * 2
    assert abs(float(probe['format']['duration']) - meta['duration']) < .041
    subprocess.run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(video), '-f', 'null', '-'], check=True)
    review = folder / 'chapters'
    review.mkdir(exist_ok=True)
    for i, chapter in enumerate(meta['chapters']):
        t = chapter['end'] - 1
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(t), '-i', str(video),
                        '-frames:v', '1', str(review / f"{i+1:02d}-{chapter['id']}.png")], check=True)
    result = {'id': meta['id'], 'seconds': meta['duration'], 'capture_frames': len(frames),
              'output_frames': int(stream['nb_frames']), 'all_frames_ready': True,
              'full_decode_passed': True, 'bytes': video.stat().st_size,
              'sha256': hashlib.file_digest(video.open('rb'), 'sha256').hexdigest(),
              'total_loading_wait_seconds': round(sum(f['waitMs'] for f in frames) / 1000, 2),
              'max_loading_wait_seconds': round(max(f['waitMs'] for f in frames) / 1000, 2)}
    results.append(result)
    print(json.dumps(result), flush=True)
(root / 'verification.json').write_text(json.dumps(results, indent=2) + '\n')

from __future__ import annotations

import json
import logging
import subprocess
import urllib.request
from dataclasses import dataclass

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# Dota 2 HUD regions (normalized 0–1, 16:9 assumed)
# ponytail: fixed ROIs tuned for 1080p streams — recalibrate if detection is poor at other resolutions
_MINIMAP_ROI = (0.00, 0.82, 0.13, 1.00)   # bottom-left square
_HPBAR_ROI   = (0.35, 0.925, 0.65, 0.97)  # bottom-center HP/mana strip

# State-machine thresholds (seconds)
_HUD_START_SECS = 10   # consecutive HUD before declaring match start
_HUD_END_SECS   = 30   # consecutive no-HUD before declaring match end


@dataclass
class Match:
    match: int
    start: str
    end: str


def _ts(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def _hud_present(frame: np.ndarray) -> bool:
    h, w = frame.shape[:2]

    def roi(frame: np.ndarray, r: tuple[float, float, float, float]) -> np.ndarray:
        x1, y1, x2, y2 = r
        return frame[int(y1 * h):int(y2 * h), int(x1 * w):int(x2 * w)]

    mm  = cv2.cvtColor(roi(frame, _MINIMAP_ROI), cv2.COLOR_BGR2HSV)
    bar = cv2.cvtColor(roi(frame, _HPBAR_ROI),   cv2.COLOR_BGR2HSV)

    # Minimap: terrain + hero dots give meaningful saturation
    minimap_ok = float(np.mean(mm[:, :, 1])) > 28

    # HP bar: green pixels (hue 40–90)
    green  = cv2.inRange(bar, (40, 90, 80), (90, 255, 255))
    # Mana bar: blue pixels (hue 100–130)
    blue   = cv2.inRange(bar, (100, 90, 80), (130, 255, 255))
    bar_ok = (np.count_nonzero(green) / green.size > 0.04
              or np.count_nonzero(blue) / blue.size > 0.03)

    return minimap_ok and bar_ok


def _probe_video(path: str) -> tuple[int, int, float]:
    """Return (width, height, duration_seconds)."""
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height",
         "-show_entries", "format=duration",
         "-of", "json", path],
        capture_output=True, text=True, check=True,
    )
    info = json.loads(r.stdout)
    stream = info["streams"][0]
    w, h = int(stream["width"]), int(stream["height"])
    duration = float(info["format"].get("duration", 0))
    return w, h, duration


def _report_progress(url: str, pct: int) -> None:
    try:
        data = json.dumps({"progress": pct}).encode()
        req = urllib.request.Request(
            url, data=data,
            headers={"Content-Type": "application/json"},
            method="PATCH",
        )
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        pass


def run_detection(video_path: str, job_id: str = "", progress_url: str = "") -> list[Match]:
    FPS = 2

    w, h, duration = _probe_video(video_path)
    frame_bytes = w * h * 3
    logger.info("job=%s size=%dx%d duration=%.0fs", job_id, w, h, duration)

    proc = subprocess.Popen(
        ["ffmpeg", "-i", video_path, "-vf", f"fps={FPS}",
         "-f", "rawvideo", "-pix_fmt", "bgr24", "-an", "pipe:1"],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
    )

    matches: list[Match] = []
    in_match       = False
    match_start    = 0.0
    hud_streak     = 0.0   # seconds of continuous HUD
    no_hud_streak  = 0.0   # seconds of continuous no-HUD
    frame_idx      = 0
    last_pct       = -1

    while True:
        raw = proc.stdout.read(frame_bytes)  # type: ignore[union-attr]
        if len(raw) < frame_bytes:
            break

        t     = frame_idx / FPS
        frame = np.frombuffer(raw, dtype=np.uint8).reshape((h, w, 3))
        hud   = _hud_present(frame)

        if hud:
            hud_streak    += 1 / FPS
            no_hud_streak  = 0.0
        else:
            no_hud_streak += 1 / FPS
            hud_streak     = 0.0

        if not in_match and hud_streak >= _HUD_START_SECS:
            in_match    = True
            match_start = t - _HUD_START_SECS
            logger.info("job=%s match_start=%.1fs", job_id, match_start)

        if in_match and no_hud_streak >= _HUD_END_SECS:
            end = t - _HUD_END_SECS
            matches.append(Match(len(matches) + 1, _ts(match_start), _ts(end)))
            logger.info("job=%s match=%d %s→%s", job_id, len(matches),
                        matches[-1].start, matches[-1].end)
            in_match      = False
            hud_streak    = 0.0

        if progress_url and duration > 0:
            pct = min(99, int(t / duration * 100))
            if pct != last_pct:
                last_pct = pct
                _report_progress(progress_url, pct)

        frame_idx += 1

    proc.wait()

    if in_match:
        matches.append(Match(len(matches) + 1, _ts(match_start), _ts(frame_idx / FPS)))

    logger.info("job=%s done matches=%d", job_id, len(matches))
    return matches


if __name__ == "__main__":
    import sys

    # Self-check: synthetic frame — bright green HP bar + saturated minimap → HUD detected
    frame = np.zeros((1080, 1920, 3), dtype=np.uint8)
    # Paint minimap region with saturated green (terrain)
    frame[885:1080, 0:250] = (0, 180, 60)
    # Paint HP bar region with bright green
    frame[999:1047, 672:1248] = (0, 220, 60)
    assert _hud_present(frame), "HUD should be detected"

    # Black frame → no HUD
    black = np.zeros((1080, 1920, 3), dtype=np.uint8)
    assert not _hud_present(black), "Black frame should not detect HUD"

    print("detection self-check passed")
    if len(sys.argv) > 1:
        result = run_detection(sys.argv[1])
        for m in result:
            print(f"  match {m.match}: {m.start} → {m.end}")

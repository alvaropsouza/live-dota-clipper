from __future__ import annotations

import json
import logging
import os
import subprocess
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

logger = logging.getLogger(__name__)

_bin = os.environ.get("FFMPEG_BIN", "")
FFMPEG  = str(Path(_bin) / "ffmpeg.exe")  if _bin else "ffmpeg"
FFPROBE = str(Path(_bin) / "ffprobe.exe") if _bin else "ffprobe"

_FPS = 1
_SCALE_W = 480
_SCALE_H = 270
_DEBOUNCE_SEC = 30.0
_MIN_MATCH_SEC = 600.0  # Dota games are always > 10 min

_HL_FPS           = 2      # sample rate for highlight scan
_HL_DIFF_THRESH   = 0.06   # fraction of kill-feed pixels that must change
_HL_PAD_BEFORE    = 15.0   # seconds before first event in cluster
_HL_PAD_AFTER     = 15.0   # seconds after last event in cluster
_HL_MERGE_GAP     = 20.0   # merge clusters whose gap is smaller than this


@dataclass(frozen=True)
class Match:
    match: int
    start: str
    end: str


@dataclass(frozen=True)
class Highlight:
    highlight: int
    match: int
    start: str
    end: str


def _seconds_to_ts(secs: float) -> str:
    h = int(secs // 3600)
    m = int((secs % 3600) // 60)
    s = int(secs % 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def _detect_hud(frame: np.ndarray) -> bool:
    h, w = frame.shape[:2]
    # Detect in-game timer: white digits on dark background at top-center
    # Menu has zero bright pixels there; in-game always has timer digits (bright_ratio > 0.04)
    timer = frame[0:int(h * 0.07), int(w * 0.38):int(w * 0.62)]
    gray = cv2.cvtColor(timer, cv2.COLOR_BGR2GRAY)
    bright_ratio = float(np.count_nonzero(gray > 160)) / gray.size
    return bright_ratio > 0.02


def _report_progress(progress_url: str, pct: int) -> None:
    if not progress_url:
        return
    try:
        data = json.dumps({"progress": pct}).encode()
        req = urllib.request.Request(progress_url, data=data, headers={"Content-Type": "application/json"}, method="PATCH")
        urllib.request.urlopen(req, timeout=2)
    except Exception:
        pass


def run_detection(video_path: str, job_id: str = "", progress_url: str = "") -> list[Match]:
    probe = subprocess.run(
        [
            FFPROBE,
            "-print_format", "json",
            "-show_streams", "-select_streams", "v:0",
            video_path,
        ],
        capture_output=True,
        text=True,
    )
    if probe.returncode != 0:
        raise RuntimeError(f"ffprobe failed (code {probe.returncode}): {probe.stderr.strip()}")
    stream = json.loads(probe.stdout)["streams"][0]
    width, height = _SCALE_W, _SCALE_H
    frame_size = width * height * 3
    duration = float(stream.get("duration", 0))
    total_frames = int(duration * _FPS) or 1

    proc = subprocess.Popen(
        [
            FFMPEG, "-i", video_path,
            "-vf", f"fps={_FPS},scale={_SCALE_W}:{_SCALE_H}",
            "-f", "rawvideo", "-pix_fmt", "bgr24",
            "pipe:1",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )

    in_game = False
    game_start: float | None = None
    matches: list[Match] = []
    match_num = 0
    pending_state: bool | None = None
    pending_since = 0.0
    frame_num = 0
    last_reported_pct = -1

    assert proc.stdout is not None
    while True:
        raw = proc.stdout.read(frame_size)
        if len(raw) < frame_size:
            break

        t = frame_num / _FPS
        frame = np.frombuffer(raw, dtype=np.uint8).reshape((height, width, 3))
        frame_num += 1

        pct = min(int(frame_num / total_frames * 100), 99)
        if pct != last_reported_pct:
            last_reported_pct = pct
            _report_progress(progress_url, pct)

        hud = _detect_hud(frame)

        if hud != in_game:
            if pending_state != hud:
                pending_state = hud
                pending_since = t
            elif t - pending_since >= _DEBOUNCE_SEC:
                if hud:
                    game_start = pending_since
                    logger.info("game start at %s", _seconds_to_ts(game_start))
                else:
                    if game_start is not None:
                        duration = pending_since - game_start
                        if duration >= _MIN_MATCH_SEC:
                            match_num += 1
                            matches.append(Match(match_num, _seconds_to_ts(game_start), _seconds_to_ts(pending_since)))
                            logger.info("game %d end at %s (%.0fs)", match_num, _seconds_to_ts(pending_since), duration)
                        else:
                            logger.info("discarded short segment %.0fs at %s", duration, _seconds_to_ts(game_start))
                        game_start = None
                in_game = hud
                pending_state = None
        else:
            pending_state = None

    proc.wait()

    if in_game and game_start is not None:
        end_t = frame_num / _FPS
        duration = end_t - game_start
        if duration >= _MIN_MATCH_SEC:
            match_num += 1
            matches.append(Match(match_num, _seconds_to_ts(game_start), _seconds_to_ts(end_t)))

    _report_progress(progress_url, 100)
    logger.info("detection done: %d matches", len(matches))
    return matches


def detect_highlights(video_path: str, match_num: int = 1, job_id: str = "") -> list[Highlight]:
    probe = subprocess.run(
        [FFPROBE, "-print_format", "json", "-show_format", "-show_streams",
         "-select_streams", "v:0", video_path],
        capture_output=True, text=True,
    )
    if probe.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {probe.stderr.strip()}")
    info = json.loads(probe.stdout)
    duration = float(info["format"].get("duration", 0))

    proc = subprocess.Popen(
        [FFMPEG, "-i", video_path,
         "-vf", f"fps={_HL_FPS},scale={_SCALE_W}:{_SCALE_H}",
         "-f", "rawvideo", "-pix_fmt", "bgr24", "pipe:1"],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
    )

    frame_size = _SCALE_W * _SCALE_H * 3
    # Kill feed: top-right corner (normalized)
    kf_x1 = int(0.68 * _SCALE_W)
    kf_y2 = int(0.14 * _SCALE_H)

    events: list[float] = []
    prev_gray: np.ndarray | None = None
    frame_idx = 0

    assert proc.stdout is not None
    while True:
        raw = proc.stdout.read(frame_size)
        if len(raw) < frame_size:
            break
        t = frame_idx / _HL_FPS
        frame = np.frombuffer(raw, dtype=np.uint8).reshape((_SCALE_H, _SCALE_W, 3))
        gray = cv2.cvtColor(frame[0:kf_y2, kf_x1:_SCALE_W], cv2.COLOR_BGR2GRAY)
        if prev_gray is not None:
            diff = cv2.absdiff(gray, prev_gray)
            if np.count_nonzero(diff > 20) / diff.size > _HL_DIFF_THRESH:
                events.append(t)
                logger.debug("job=%s match=%d kill event %.1fs", job_id, match_num, t)
        prev_gray = gray
        frame_idx += 1

    proc.wait()

    if not events:
        logger.info("job=%s match=%d no highlights", job_id, match_num)
        return []

    windows: list[tuple[float, float]] = []
    ws = max(0.0, events[0] - _HL_PAD_BEFORE)
    we = min(duration, events[0] + _HL_PAD_AFTER)
    for t in events[1:]:
        ns = max(0.0, t - _HL_PAD_BEFORE)
        ne = min(duration, t + _HL_PAD_AFTER)
        if ns <= we + _HL_MERGE_GAP:
            we = max(we, ne)
        else:
            windows.append((ws, we))
            ws, we = ns, ne
    windows.append((ws, we))

    result = [Highlight(i + 1, match_num, _seconds_to_ts(s), _seconds_to_ts(e)) for i, (s, e) in enumerate(windows)]
    logger.info("job=%s match=%d highlights=%d", job_id, match_num, len(result))
    return result

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Match:
    match: int
    start: str
    end: str


def run_detection(video_path: str) -> list[Match]:
    raise NotImplementedError("run_detection not yet implemented")

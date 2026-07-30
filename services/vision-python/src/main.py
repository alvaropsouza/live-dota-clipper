from __future__ import annotations

import asyncio
import logging

from fastapi import FastAPI, Request
from pydantic import BaseModel
from pydantic_settings import BaseSettings

from detection import Highlight, Match, detect_highlights, run_detection


class Settings(BaseSettings):
    tmp_dir: str = "tmp"
    log_level: str = "info"

    model_config = {"env_file": ".env"}


settings = Settings()
logging.basicConfig(level=settings.log_level.upper())
logger = logging.getLogger(__name__)

app = FastAPI(title="vision-python")


class ProcessRequest(BaseModel):
    videoPath: str
    jobId: str = ""
    progressUrl: str = ""


class MatchResult(BaseModel):
    match: int
    start: str
    end: str


class ProcessResponse(BaseModel):
    matches: list[MatchResult]


@app.get("/health")
async def health() -> dict[str, bool]:
    return {"ok": True}


async def _run_and_callback(body: ProcessRequest) -> None:
    try:
        matches = await asyncio.to_thread(run_detection, body.videoPath, body.jobId, body.progressUrl)
        payload = {"matches": [{"match": m.match, "start": m.start, "end": m.end} for m in matches]}
        import urllib.request, json as _json
        data = _json.dumps(payload).encode()
        req = urllib.request.Request(
            body.progressUrl.replace("/progress", "/complete"),
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=10)
        logger.info("detection complete, callback sent for %s", body.jobId)
    except Exception as exc:
        logger.error("detection failed for %s: %s", body.jobId, exc)
        import urllib.request, json as _json
        data = _json.dumps({"error": str(exc)}).encode()
        req = urllib.request.Request(
            body.progressUrl.replace("/progress", "/complete"),
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            urllib.request.urlopen(req, timeout=10)
        except Exception:
            pass


@app.post("/process", status_code=202)
async def process(request: Request, body: ProcessRequest) -> dict[str, str]:
    asyncio.create_task(_run_and_callback(body))
    logger.info("detection started for %s", body.jobId)
    return {"status": "accepted"}


class HighlightRequest(BaseModel):
    videoPath: str
    matchNum: int = 1
    jobId: str = ""
    maxDuration: float | None = None
    minKills: int = 2
    progressUrl: str = ""


class HighlightResult(BaseModel):
    highlight: int
    match: int
    start: str
    end: str


class HighlightResponse(BaseModel):
    highlights: list[HighlightResult]


@app.post("/detect-highlights")
async def detect_highlights_endpoint(body: HighlightRequest) -> HighlightResponse:
    highlights: list[Highlight] = await asyncio.to_thread(
        detect_highlights, body.videoPath, body.matchNum, body.jobId, body.maxDuration, body.minKills, body.progressUrl
    )
    return HighlightResponse(
        highlights=[
            HighlightResult(highlight=h.highlight, match=h.match, start=h.start, end=h.end)
            for h in highlights
        ]
    )

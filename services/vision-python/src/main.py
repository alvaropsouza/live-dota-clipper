from __future__ import annotations

import logging

from fastapi import FastAPI
from pydantic import BaseModel
from pydantic_settings import BaseSettings

from detection import Match, run_detection


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


class MatchResult(BaseModel):
    match: int
    start: str
    end: str


class ProcessResponse(BaseModel):
    matches: list[MatchResult]


@app.get("/health")
async def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/process")
async def process(body: ProcessRequest) -> ProcessResponse:
    logger.info("processing %s", body.videoPath)
    matches: list[Match] = run_detection(body.videoPath)
    return ProcessResponse(
        matches=[MatchResult(match=m.match, start=m.start, end=m.end) for m in matches]
    )

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .config import Settings
from .domain import Segment
from .pipeline import MinutesPipeline


class SegmentPayload(BaseModel):
    start: float = Field(ge=0)
    end: float = Field(ge=0)
    text: str
    speaker: str = "unknown"


class SummarizeRequest(BaseModel):
    segments: list[SegmentPayload]


settings = Settings.from_env()
pipeline = MinutesPipeline(settings)
app = FastAPI(title="mimemo AI API", version="0.1.0")
ALLOWED_AUDIO_SUFFIXES = {".wav", ".mp3"}

allowed_origins = [
    origin.strip()
    for origin in (
        os.getenv(
            "MIMEMO_CORS_ORIGINS",
            "http://localhost:3000,http://127.0.0.1:3000,"
            "http://localhost:3001,http://127.0.0.1:3001",
        )
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "stt_backend": settings.stt_backend,
        "llm_backend": settings.llm_backend,
    }


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)) -> dict[str, Any]:
    try:
        input_path = await _save_upload(file)
        segments = pipeline.transcribe_file(input_path)
        return {"segments": [segment.to_dict() for segment in segments]}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/summarize")
def summarize(request: SummarizeRequest) -> dict[str, Any]:
    try:
        segments = [Segment.from_dict(segment.model_dump()) for segment in request.segments]
        return pipeline.summarize_segments(segments)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/minutes")
async def minutes(file: UploadFile = File(...)) -> dict[str, Any]:
    try:
        input_path = await _save_upload(file)
        return pipeline.create_minutes(input_path)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


async def _save_upload(file: UploadFile) -> Path:
    suffix = Path(file.filename or "audio").suffix.lower()
    if suffix not in ALLOWED_AUDIO_SUFFIXES:
        raise HTTPException(status_code=400, detail="Only WAV and MP3 audio files are supported.")

    tmp = tempfile.NamedTemporaryFile(prefix="mimemo-upload-", suffix=suffix, delete=False)
    with tmp:
        while chunk := await file.read(1024 * 1024):
            tmp.write(chunk)
    return Path(tmp.name)

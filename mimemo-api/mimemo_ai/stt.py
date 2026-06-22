from __future__ import annotations

import json
import subprocess
import tempfile
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

from .config import Settings
from .domain import Segment
from .timefmt import parse_clock


class Transcriber(ABC):
    @abstractmethod
    def transcribe(self, audio_path: Path, language: str) -> list[Segment]:
        raise NotImplementedError


class FasterWhisperTranscriber(Transcriber):
    def __init__(self, model_size: str, device: str, compute_type: str):
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self._model = None

    def _load_model(self):
        if self._model is None:
            try:
                from faster_whisper import WhisperModel
            except ImportError as exc:
                raise RuntimeError(
                    "faster-whisper is not installed. Install with "
                    "`pip install -e '.[api,faster-whisper]'`."
                ) from exc
            self._model = WhisperModel(
                self.model_size,
                device=self.device,
                compute_type=self.compute_type,
            )
        return self._model

    def transcribe(self, audio_path: Path, language: str) -> list[Segment]:
        model = self._load_model()
        segments, _info = model.transcribe(
            str(audio_path),
            language=language,
            vad_filter=True,
            beam_size=5,
        )
        return [
            Segment(
                start=float(segment.start),
                end=float(segment.end),
                text=segment.text.strip(),
            )
            for segment in segments
            if segment.text.strip()
        ]


class WhisperCppTranscriber(Transcriber):
    def __init__(self, binary: str, model_path: str):
        if not model_path:
            raise ValueError("MIMEMO_WHISPER_CPP_MODEL is required for whisper.cpp")
        self.binary = binary
        self.model_path = model_path

    def transcribe(self, audio_path: Path, language: str) -> list[Segment]:
        with tempfile.TemporaryDirectory(prefix="mimemo-whispercpp-") as tmp:
            output_prefix = Path(tmp) / "transcript"
            cmd = [
                self.binary,
                "-m",
                self.model_path,
                "-f",
                str(audio_path),
                "-l",
                language,
                "-oj",
                "-of",
                str(output_prefix),
            ]
            completed = subprocess.run(cmd, capture_output=True, text=True, check=False)
            if completed.returncode != 0:
                stderr = completed.stderr.strip()
                raise RuntimeError(f"whisper.cpp failed: {stderr}")

            json_path = output_prefix.with_suffix(".json")
            if not json_path.exists():
                raise RuntimeError("whisper.cpp did not produce a JSON transcript")
            data = json.loads(json_path.read_text(encoding="utf-8"))
            return _parse_whisper_cpp_json(data)


class MockTranscriber(Transcriber):
    def transcribe(self, audio_path: Path, language: str) -> list[Segment]:
        return [
            Segment(
                start=0.0,
                end=8.0,
                text="これは開発用のモック文字起こしです。来週までに見積もりを確認します。",
            )
        ]


def build_transcriber(settings: Settings) -> Transcriber:
    backend = settings.stt_backend.lower()
    if backend == "faster-whisper":
        return FasterWhisperTranscriber(
            model_size=settings.faster_whisper_model,
            device=settings.faster_whisper_device,
            compute_type=settings.faster_whisper_compute_type,
        )
    if backend in {"whisper.cpp", "whisper-cpp", "whispercpp"}:
        return WhisperCppTranscriber(
            binary=settings.whisper_cpp_binary,
            model_path=settings.whisper_cpp_model,
        )
    if backend == "mock":
        return MockTranscriber()
    raise ValueError(f"Unsupported STT backend: {settings.stt_backend}")


def _parse_whisper_cpp_json(data: dict[str, Any]) -> list[Segment]:
    raw_segments = data.get("transcription") or data.get("segments") or []
    parsed: list[Segment] = []
    for item in raw_segments:
        timestamps = item.get("timestamps") or {}
        start = item.get("start", timestamps.get("from"))
        end = item.get("end", timestamps.get("to"))
        text = str(item.get("text", "")).strip()
        if text:
            parsed.append(
                Segment(
                    start=parse_clock(start),
                    end=parse_clock(end),
                    text=text,
                    speaker=str(item.get("speaker") or "unknown"),
                )
            )
    return parsed

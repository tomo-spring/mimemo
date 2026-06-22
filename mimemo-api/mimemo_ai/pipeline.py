from __future__ import annotations

import shutil
import tempfile
from pathlib import Path
from typing import Any

from .audio import prepare_wav
from .config import Settings
from .domain import Segment
from .llm import build_llm_client
from .minutes import MinuteGenerator
from .stt import build_transcriber


class MinutesPipeline:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.transcriber = build_transcriber(settings)
        self.generator = MinuteGenerator(
            llm=build_llm_client(settings),
            max_chunk_chars=settings.max_chunk_chars,
        )

    def transcribe_file(self, input_path: Path) -> list[Segment]:
        self.settings.work_dir.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(
            prefix="job-", dir=str(self.settings.work_dir)
        ) as tmp:
            tmp_dir = Path(tmp)
            source_path = tmp_dir / input_path.name
            if input_path.resolve() != source_path.resolve():
                shutil.copyfile(input_path, source_path)
            wav_path = prepare_wav(
                source_path,
                tmp_dir / "audio.wav",
                ffmpeg_binary=self.settings.ffmpeg_binary,
            )
            return self.transcriber.transcribe(wav_path, language=self.settings.language)

    def summarize_segments(self, segments: list[Segment]) -> dict[str, Any]:
        return self.generator.generate(segments)

    def create_minutes(self, input_path: Path) -> dict[str, Any]:
        segments = self.transcribe_file(input_path)
        return self.summarize_segments(segments)

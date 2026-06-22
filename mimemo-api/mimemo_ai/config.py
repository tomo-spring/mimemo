from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def load_dotenv(path: Path = Path(".env")) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def _getenv(name: str, default: str) -> str:
    value = os.getenv(name)
    return value if value not in (None, "") else default


def _getenv_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value in (None, ""):
        return default
    try:
        return int(value)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer, got {value!r}") from exc


@dataclass(frozen=True)
class Settings:
    language: str
    stt_backend: str
    llm_backend: str
    ffmpeg_binary: str
    faster_whisper_model: str
    faster_whisper_device: str
    faster_whisper_compute_type: str
    whisper_cpp_binary: str
    whisper_cpp_model: str
    llama_cpp_base_url: str
    llama_cpp_model: str
    llama_cpp_api_key: str
    max_chunk_chars: int
    work_dir: Path

    @classmethod
    def from_env(cls) -> "Settings":
        load_dotenv()
        return cls(
            language=_getenv("MIMEMO_LANGUAGE", "ja"),
            stt_backend=_getenv("MIMEMO_STT_BACKEND", "faster-whisper"),
            llm_backend=_getenv("MIMEMO_LLM_BACKEND", "llama.cpp"),
            ffmpeg_binary=_getenv("MIMEMO_FFMPEG_BINARY", "ffmpeg"),
            faster_whisper_model=_getenv("MIMEMO_FASTER_WHISPER_MODEL", "small"),
            faster_whisper_device=_getenv("MIMEMO_FASTER_WHISPER_DEVICE", "cpu"),
            faster_whisper_compute_type=_getenv(
                "MIMEMO_FASTER_WHISPER_COMPUTE_TYPE", "int8"
            ),
            whisper_cpp_binary=_getenv("MIMEMO_WHISPER_CPP_BINARY", "whisper-cli"),
            whisper_cpp_model=_getenv("MIMEMO_WHISPER_CPP_MODEL", ""),
            llama_cpp_base_url=_getenv(
                "MIMEMO_LLAMA_CPP_BASE_URL", "http://127.0.0.1:8080/v1"
            ).rstrip("/"),
            llama_cpp_model=_getenv("MIMEMO_LLAMA_CPP_MODEL", "local-model"),
            llama_cpp_api_key=_getenv("MIMEMO_LLAMA_CPP_API_KEY", ""),
            max_chunk_chars=_getenv_int("MIMEMO_MAX_CHUNK_CHARS", 6000),
            work_dir=Path(_getenv("MIMEMO_WORK_DIR", "/tmp/mimemo-ai")),
        )

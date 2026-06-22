from __future__ import annotations

import subprocess
from pathlib import Path


def prepare_wav(input_path: Path, output_path: Path, ffmpeg_binary: str = "ffmpeg") -> Path:
    """Convert input audio to 16 kHz mono WAV for ASR backends."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        ffmpeg_binary,
        "-y",
        "-i",
        str(input_path),
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        str(output_path),
    ]
    completed = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if completed.returncode != 0:
        stderr = completed.stderr.strip()
        raise RuntimeError(f"ffmpeg conversion failed: {stderr}")
    return output_path

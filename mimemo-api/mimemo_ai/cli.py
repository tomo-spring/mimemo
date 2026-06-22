from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .config import Settings
from .domain import Segment
from .pipeline import MinutesPipeline


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="mimemo-ai")
    subparsers = parser.add_subparsers(dest="command", required=True)

    transcribe_parser = subparsers.add_parser("transcribe")
    transcribe_parser.add_argument("audio_path")

    minutes_parser = subparsers.add_parser("minutes")
    minutes_parser.add_argument("audio_path")

    summarize_parser = subparsers.add_parser("summarize")
    summarize_parser.add_argument("transcript_json")

    args = parser.parse_args(argv)
    pipeline = MinutesPipeline(Settings.from_env())

    if args.command == "transcribe":
        segments = pipeline.transcribe_file(Path(args.audio_path))
        _dump({"segments": [segment.to_dict() for segment in segments]})
        return 0

    if args.command == "minutes":
        _dump(pipeline.create_minutes(Path(args.audio_path)))
        return 0

    if args.command == "summarize":
        data = json.loads(Path(args.transcript_json).read_text(encoding="utf-8"))
        segments = [Segment.from_dict(item) for item in data["segments"]]
        _dump(pipeline.summarize_segments(segments))
        return 0

    return 2


def _dump(value: object) -> None:
    json.dump(value, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    raise SystemExit(main())

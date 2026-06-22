from __future__ import annotations

import re


_CLOCK_RE = re.compile(
    r"^(?:(?P<hours>\d+):)?(?P<minutes>\d{1,2}):(?P<seconds>\d{1,2})(?:[.,](?P<millis>\d+))?$"
)


def format_seconds(seconds: float) -> str:
    total = max(0, int(seconds))
    hours, remainder = divmod(total, 3600)
    minutes, secs = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def parse_clock(value: object) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    if value is None:
        return 0.0

    text = str(value).strip()
    match = _CLOCK_RE.match(text)
    if not match:
        try:
            return float(text)
        except ValueError:
            return 0.0

    hours = int(match.group("hours") or 0)
    minutes = int(match.group("minutes"))
    seconds = int(match.group("seconds"))
    millis_text = match.group("millis") or "0"
    millis = float(f"0.{millis_text}")
    return hours * 3600 + minutes * 60 + seconds + millis

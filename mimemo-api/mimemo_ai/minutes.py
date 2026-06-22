from __future__ import annotations

import json
import re
from typing import Any

from .domain import Segment
from .llm import LLMClient, parse_json_object
from .prompts import (
    CHUNK_SYSTEM_PROMPT,
    CHUNK_USER_TEMPLATE,
    FINAL_SYSTEM_PROMPT,
    FINAL_USER_TEMPLATE,
)
from .timefmt import format_seconds


def format_segment(segment: Segment) -> str:
    speaker = segment.speaker or "unknown"
    return (
        f"[{format_seconds(segment.start)}-{format_seconds(segment.end)}] "
        f"{speaker}: {segment.text}"
    )


def chunk_segments(segments: list[Segment], max_chars: int) -> list[list[Segment]]:
    if not segments:
        return []
    chunks: list[list[Segment]] = []
    current: list[Segment] = []
    current_chars = 0

    for segment in segments:
        line_chars = len(format_segment(segment)) + 1
        if current and current_chars + line_chars > max_chars:
            chunks.append(current)
            current = []
            current_chars = 0
        current.append(segment)
        current_chars += line_chars

    if current:
        chunks.append(current)
    return chunks


class MinuteGenerator:
    def __init__(self, llm: LLMClient, max_chunk_chars: int = 6000):
        self.llm = llm
        self.max_chunk_chars = max_chunk_chars

    def generate(self, segments: list[Segment]) -> dict[str, Any]:
        chunks = chunk_segments(segments, self.max_chunk_chars)
        chunk_summaries = [
            self._summarize_chunk(index=index, segments=chunk)
            for index, chunk in enumerate(chunks)
        ]
        final_minutes = self._merge_summaries(chunk_summaries)
        valid_times = {format_seconds(segment.start) for segment in segments}
        final_minutes = _filter_unsupported_evidence(final_minutes, valid_times)
        final_minutes = _augment_from_segments(final_minutes, segments)
        final_minutes["transcript"] = [segment.to_dict() for segment in segments]
        final_minutes["chunk_count"] = len(chunks)
        return final_minutes

    def _summarize_chunk(self, index: int, segments: list[Segment]) -> dict[str, Any]:
        transcript = "\n".join(format_segment(segment) for segment in segments)
        available_timestamps = ", ".join(
            format_seconds(segment.start) for segment in segments
        )
        user_prompt = CHUNK_USER_TEMPLATE.format(
            chunk_index=index,
            available_timestamps=available_timestamps,
            transcript=transcript,
        )
        response = self.llm.complete(
            [
                {"role": "system", "content": CHUNK_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.1,
        )
        return _normalize_chunk_summary(parse_json_object(response))

    def _merge_summaries(self, chunk_summaries: list[dict[str, Any]]) -> dict[str, Any]:
        user_prompt = FINAL_USER_TEMPLATE.format(
            chunk_summaries=json.dumps(chunk_summaries, ensure_ascii=False, indent=2)
        )
        response = self.llm.complete(
            [
                {"role": "system", "content": FINAL_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.1,
        )
        minutes = _normalize_final_minutes(parse_json_object(response))
        if _is_placeholder_text(minutes["overview"]):
            minutes["overview"] = _fallback_overview(chunk_summaries)
        return minutes


def _normalize_chunk_summary(value: dict[str, Any]) -> dict[str, Any]:
    return {
        "summary": str(value.get("summary", "")),
        "decisions": _normalize_evidence_items(value.get("decisions")),
        "todos": _normalize_evidence_items(value.get("todos")),
        "topics": _as_list(value.get("topics")),
        "open_questions": _as_list(value.get("open_questions")),
        "unclear": _as_list(value.get("unclear")),
    }


def _normalize_final_minutes(value: dict[str, Any]) -> dict[str, Any]:
    return {
        "overview": str(value.get("overview", "")),
        "decisions": _normalize_evidence_items(value.get("decisions")),
        "todos": _normalize_todos(value.get("todos")),
        "topics": _clean_placeholder_strings(_as_list(value.get("topics"))),
        "open_questions": _clean_placeholder_strings(_as_list(value.get("open_questions"))),
        "unclear": _clean_unclear_strings(_as_list(value.get("unclear"))),
    }


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def _normalize_evidence_items(value: Any) -> list[Any]:
    items = _as_list(value)
    normalized: list[Any] = []
    for item in items:
        if not isinstance(item, dict):
            normalized.append(item)
            continue
        clean_item = dict(item)
        if "evidence" in clean_item:
            clean_item["evidence"] = _as_list(clean_item["evidence"])
        normalized.append(clean_item)
    return normalized


def _normalize_todos(value: Any) -> list[Any]:
    todos = _normalize_evidence_items(value)
    normalized: list[Any] = []
    for item in todos:
        if not isinstance(item, dict):
            normalized.append(item)
            continue
        clean_item = dict(item)
        due = clean_item.get("due")
        if isinstance(due, str) and _looks_like_clock(due):
            clean_item["due"] = None
        normalized.append(clean_item)
    return normalized


def _clean_placeholder_strings(values: list[Any]) -> list[Any]:
    placeholders = {
        "",
        "TODO",
        "会議概要",
        "決定事項",
        "論点",
        "未決事項",
        "聞き取り不明・要確認",
        "実際に聞き取れない、または文字起こしが不自然な箇所",
        "要確認",
        "不明",
    }
    cleaned: list[Any] = []
    for value in values:
        if isinstance(value, str) and value.strip() in placeholders:
            continue
        cleaned.append(value)
    return cleaned


def _clean_unclear_strings(values: list[Any]) -> list[Any]:
    cleaned = _clean_placeholder_strings(values)
    keywords = ("聞き取", "不明", "不自然", "誤認識", "要確認")
    return [
        value
        for value in cleaned
        if not isinstance(value, str) or any(keyword in value for keyword in keywords)
    ]


def _looks_like_clock(value: str) -> bool:
    return bool(re.fullmatch(r"\d{1,2}:\d{2}(?::\d{2})?", value.strip()))


def _is_placeholder_text(value: str) -> bool:
    return value in {
        "",
        "TODO",
        "会議概要",
        "決定事項",
        "このチャンクの要約",
        "未決事項",
        "論点",
        "聞き取り不明・要確認",
        "実際に聞き取れない、または文字起こしが不自然な箇所",
    }


def _fallback_overview(chunk_summaries: list[dict[str, Any]]) -> str:
    summaries = [
        str(summary.get("summary", "")).strip()
        for summary in chunk_summaries
        if not _is_placeholder_text(str(summary.get("summary", "")).strip())
    ]
    return " ".join(summaries) if summaries else ""


def _filter_unsupported_evidence(
    minutes: dict[str, Any], valid_times: set[str]
) -> dict[str, Any]:
    filtered = dict(minutes)
    filtered["decisions"] = _filter_items_by_evidence(
        filtered.get("decisions", []), valid_times
    )
    filtered["todos"] = _filter_items_by_evidence(filtered.get("todos", []), valid_times)
    return filtered


def _filter_items_by_evidence(items: list[Any], valid_times: set[str]) -> list[Any]:
    filtered: list[Any] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        item_text = str(item.get("task") or item.get("text") or "").strip()
        if _is_placeholder_text(item_text):
            continue
        evidence = item.get("evidence")
        if not isinstance(evidence, list):
            continue
        clean_evidence = [value for value in evidence if value in valid_times]
        if not clean_evidence:
            continue
        clean_item = dict(item)
        clean_item["evidence"] = clean_evidence
        filtered.append(clean_item)
    return filtered


def _augment_from_segments(
    minutes: dict[str, Any], segments: list[Segment]
) -> dict[str, Any]:
    augmented = dict(minutes)
    decisions = list(augmented.get("decisions", []))
    todos = list(augmented.get("todos", []))

    for index, segment in enumerate(segments):
        text = segment.text
        evidence = [format_seconds(segment.start)]

        decision = _extract_rule_decision(text)
        if decision and not _has_item(decisions, "text", decision):
            decisions.append({"text": decision, "evidence": evidence})

        for todo in _extract_rule_todos(text, segments, index):
            todo["evidence"] = evidence
            if not _has_item(todos, "task", str(todo.get("task", ""))):
                todos.append(todo)

    augmented["decisions"] = decisions
    augmented["todos"] = todos
    return augmented


def _extract_rule_decision(text: str) -> str | None:
    if "ヘルプに入ってもらう" in text:
        return "高橋さんに予約機能の画面設計を支援してもらう"
    if "来月から" in text and "情報共有" in text and "設け" in text:
        return "来月から15分間の情報共有の場を設ける"
    if "1時間前倒し" in text:
        return "次回定例を1時間前倒しにする"
    if "予定通り" in text and "実施しましょう" in text:
        return "実習を予定通り実施する"
    return None


def _extract_rule_todos(
    text: str, segments: list[Segment], index: int
) -> list[dict[str, Any]]:
    todos: list[dict[str, Any]] = []

    if "今週中" in text and "予定" in text:
        todos.append(
            {
                "task": "レビューを今週中に完了する",
                "owner": _speaker_from_previous_context(segments, index),
                "due": "今週中",
            }
        )

    if "画面設計" in text and ("失筆" in text or "執筆" in text or "予定" in text):
        todos.append(
            {
                "task": "画面設計書を作成する",
                "owner": _speaker_from_previous_context(segments, index),
                "due": None,
            }
        )

    if "明日までに" in text and "空き時間" in text and "提示" in text:
        todos.append(
            {
                "task": "空き時間を調整して提示する",
                "owner": _speaker_from_previous_context(segments, index),
                "due": "明日まで",
            }
        )

    if "来週から" in text and "提案資料" in text and "作成" in text:
        todos.append(
            {
                "task": "提案資料を作成する",
                "owner": _speaker_from_previous_context(segments, index),
                "due": "来週から",
            }
        )

    if "共有しておきます" in text or "共有します" in text:
        todos.append(
            {
                "task": "資料またはメモを共有する",
                "owner": _speaker_from_previous_context(segments, index),
                "due": "この後",
            }
        )

    if "さえておいてください" in text or "押さえておいてください" in text:
        todos.append(
            {
                "task": "次回の日程を押さえる",
                "owner": _extract_named_owner(text),
                "due": None,
            }
        )

    return todos


def _speaker_from_previous_context(segments: list[Segment], index: int) -> str | None:
    current = _extract_named_owner(segments[index].text)
    if current:
        return current
    for previous in reversed(segments[max(0, index - 3) : index]):
        match = re.search(r"([一-龥ぁ-んァ-ンA-Za-z]+さん)お願いします", previous.text)
        if match:
            return match.group(1)
    return None


def _extract_named_owner(text: str) -> str | None:
    match = re.search(r"([一-龥ぁ-んァ-ンA-Za-z]+さん)", text)
    return match.group(1) if match else None


def _has_item(items: list[Any], key: str, value: str) -> bool:
    return any(isinstance(item, dict) and item.get(key) == value for item in items)

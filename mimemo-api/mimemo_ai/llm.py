from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from abc import ABC, abstractmethod
from typing import Any

from .config import Settings


class LLMClient(ABC):
    @abstractmethod
    def complete(self, messages: list[dict[str, str]], temperature: float = 0.1) -> str:
        raise NotImplementedError


class LlamaCppClient(LLMClient):
    def __init__(self, base_url: str, model: str, api_key: str = ""):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.api_key = api_key

    def complete(self, messages: list[dict[str, str]], temperature: float = 0.1) -> str:
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "response_format": {"type": "json_object"},
        }
        body = json.dumps(payload).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        request = urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=body,
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=600) as response:
                data = json.loads(response.read().decode("utf-8"))
        except urllib.error.URLError as exc:
            raise RuntimeError(
                "llama.cpp server is not reachable. Start it with "
                "`scripts/start_llama_server.sh` or set MIMEMO_LLM_BACKEND=mock "
                "for local smoke tests."
            ) from exc
        return data["choices"][0]["message"]["content"]


class MockLLMClient(LLMClient):
    def complete(self, messages: list[dict[str, str]], temperature: float = 0.1) -> str:
        text = messages[-1]["content"]
        if "chunk_index" in text:
            return json.dumps(
                {
                    "summary": "開発用の部分要約です。",
                    "decisions": [],
                    "todos": [
                        {
                            "task": "見積もりを確認する",
                            "owner": None,
                            "due": "来週",
                            "evidence": ["00:00:00"],
                        }
                    ],
                    "topics": ["見積もり確認"],
                    "open_questions": [],
                    "unclear": [],
                },
                ensure_ascii=False,
            )
        return json.dumps(
            {
                "overview": "開発用の議事録です。",
                "decisions": [],
                "todos": [
                    {
                        "task": "見積もりを確認する",
                        "owner": None,
                        "due": "来週",
                        "evidence": ["00:00:00"],
                    }
                ],
                "topics": ["見積もり確認"],
                "open_questions": [],
                "unclear": [],
            },
            ensure_ascii=False,
        )


def build_llm_client(settings: Settings) -> LLMClient:
    backend = settings.llm_backend.lower()
    if backend in {"llama.cpp", "llama-cpp", "llamacpp"}:
        return LlamaCppClient(
            base_url=settings.llama_cpp_base_url,
            model=settings.llama_cpp_model,
            api_key=settings.llama_cpp_api_key,
        )
    if backend == "mock":
        return MockLLMClient()
    raise ValueError(f"Unsupported LLM backend: {settings.llm_backend}")


def parse_json_object(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    fenced = re.match(r"^```(?:json)?\s*(.*?)\s*```$", cleaned, flags=re.DOTALL)
    if fenced:
        cleaned = fenced.group(1).strip()

    try:
        value = json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start < 0 or end < start:
            raise
        value = json.loads(cleaned[start : end + 1])

    if not isinstance(value, dict):
        raise ValueError("LLM response must be a JSON object")
    return value

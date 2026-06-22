import json
import unittest

from mimemo_ai.domain import Segment
from mimemo_ai.llm import LLMClient
from mimemo_ai.minutes import MinuteGenerator, chunk_segments, format_segment


class FakeLLM(LLMClient):
    def complete(self, messages, temperature=0.1):
        content = messages[-1]["content"]
        if "chunk_index" in content:
            return json.dumps(
                {
                    "summary": "見積もり確認について話した。",
                    "decisions": [],
                    "todos": [
                        {
                            "task": "見積もりを確認する",
                            "owner": None,
                            "due": "来週",
                            "evidence": ["00:00:00"],
                        }
                    ],
                    "topics": ["見積もり"],
                    "open_questions": [],
                    "unclear": [],
                },
                ensure_ascii=False,
            )
        return json.dumps(
            {
                "overview": "見積もり確認の会議。",
                "decisions": [],
                "todos": [
                    {
                        "task": "見積もりを確認する",
                        "owner": None,
                        "due": "来週",
                        "evidence": ["00:00:00"],
                    }
                ],
                "topics": ["見積もり"],
                "open_questions": [],
                "unclear": [],
            },
            ensure_ascii=False,
        )


class MinutesTest(unittest.TestCase):
    def test_format_segment(self):
        segment = Segment(start=1, end=3, speaker="A", text="確認します。")
        self.assertEqual(format_segment(segment), "[00:00:01-00:00:03] A: 確認します。")

    def test_chunk_segments(self):
        segments = [
            Segment(start=0, end=1, text="a" * 20),
            Segment(start=1, end=2, text="b" * 20),
        ]
        chunks = chunk_segments(segments, max_chars=45)
        self.assertEqual(len(chunks), 2)

    def test_generate_minutes(self):
        segments = [Segment(start=0, end=5, text="来週までに見積もりを確認します。")]
        result = MinuteGenerator(FakeLLM(), max_chunk_chars=2000).generate(segments)
        self.assertEqual(result["overview"], "見積もり確認の会議。")
        self.assertEqual(result["todos"][0]["task"], "見積もりを確認する")
        self.assertEqual(result["chunk_count"], 1)
        self.assertEqual(result["transcript"][0]["text"], "来週までに見積もりを確認します。")

    def test_filters_unsupported_evidence(self):
        class PlaceholderLLM(LLMClient):
            def complete(self, messages, temperature=0.1):
                if "chunk_index" in messages[-1]["content"]:
                    return json.dumps(
                        {
                            "summary": "",
                            "decisions": [],
                            "todos": [],
                            "topics": [],
                            "open_questions": [],
                            "unclear": [],
                        }
                    )
                return json.dumps(
                    {
                        "overview": "",
                        "decisions": [{"text": "決定", "evidence": ["HH:MM:SS"]}],
                        "todos": [
                            {"task": "確認", "owner": None, "due": None, "evidence": ["00:00:00"]}
                        ],
                        "topics": [],
                        "open_questions": [],
                        "unclear": [],
                    },
                    ensure_ascii=False,
                )

        segments = [Segment(start=0, end=5, text="確認します。")]
        result = MinuteGenerator(PlaceholderLLM(), max_chunk_chars=2000).generate(segments)
        self.assertEqual(result["decisions"], [])
        self.assertEqual(result["todos"][0]["evidence"], ["00:00:00"])

    def test_cleans_clock_due_and_placeholder_sections(self):
        class PlaceholderSectionLLM(LLMClient):
            def complete(self, messages, temperature=0.1):
                if "chunk_index" in messages[-1]["content"]:
                    return json.dumps(
                        {
                            "summary": "",
                            "decisions": [],
                            "todos": [
                                {
                                    "task": "確認",
                                    "owner": None,
                                    "due": "00:00:17",
                                    "evidence": "00:00:00",
                                }
                            ],
                            "topics": ["論点"],
                            "open_questions": ["未決事項"],
                            "unclear": ["聞き取り不明・要確認"],
                        },
                        ensure_ascii=False,
                    )
                return json.dumps(
                    {
                        "overview": "",
                        "decisions": [],
                        "todos": [
                            {
                                "task": "確認",
                                "owner": None,
                                "due": "00:00:17",
                                "evidence": ["00:00:00"],
                            }
                        ],
                        "topics": ["論点"],
                        "open_questions": ["未決事項"],
                        "unclear": ["聞き取り不明・要確認"],
                    },
                    ensure_ascii=False,
                )

        segments = [Segment(start=0, end=5, text="確認します。")]
        result = MinuteGenerator(PlaceholderSectionLLM(), max_chunk_chars=2000).generate(
            segments
        )
        self.assertIsNone(result["todos"][0]["due"])
        self.assertEqual(result["topics"], [])
        self.assertEqual(result["open_questions"], [])
        self.assertEqual(result["unclear"], [])

    def test_drops_placeholder_todo_and_overview(self):
        class PlaceholderOutputLLM(LLMClient):
            def complete(self, messages, temperature=0.1):
                if "chunk_index" in messages[-1]["content"]:
                    return json.dumps(
                        {
                            "summary": "石鹸の紹介。",
                            "decisions": [],
                            "todos": [],
                            "topics": [],
                            "open_questions": [],
                            "unclear": [],
                        },
                        ensure_ascii=False,
                    )
                return json.dumps(
                    {
                        "overview": "会議概要",
                        "decisions": [{"text": "決定事項", "evidence": ["00:00:00"]}],
                        "todos": [
                            {
                                "task": "TODO",
                                "owner": None,
                                "due": None,
                                "evidence": ["00:00:00"],
                            }
                        ],
                        "topics": [],
                        "open_questions": [],
                        "unclear": [
                            "実際に聞き取れない、または文字起こしが不自然な箇所"
                        ],
                    },
                    ensure_ascii=False,
                )

        segments = [Segment(start=0, end=5, text="石鹸の紹介です。")]
        result = MinuteGenerator(PlaceholderOutputLLM(), max_chunk_chars=2000).generate(
            segments
        )
        self.assertEqual(result["overview"], "石鹸の紹介。")
        self.assertEqual(result["decisions"], [])
        self.assertEqual(result["todos"], [])
        self.assertEqual(result["unclear"], [])

    def test_augments_rule_based_decisions_and_todos(self):
        class EmptyLLM(LLMClient):
            def complete(self, messages, temperature=0.1):
                if "chunk_index" in messages[-1]["content"]:
                    return json.dumps(
                        {
                            "summary": "進捗会議。",
                            "decisions": [],
                            "todos": [],
                            "topics": [],
                            "open_questions": [],
                            "unclear": [],
                        },
                        ensure_ascii=False,
                    )
                return json.dumps(
                    {
                        "overview": "進捗会議。",
                        "decisions": [],
                        "todos": [],
                        "topics": [],
                        "open_questions": [],
                        "unclear": [],
                    },
                    ensure_ascii=False,
                )

        segments = [
            Segment(start=0, end=4, text="高橋さんお願いします"),
            Segment(start=4, end=8, text="明日までに空き時間を調整して提示しますね"),
            Segment(start=8, end=12, text="では来月から15分間お互いに情報共有する場を設けましょう"),
        ]
        result = MinuteGenerator(EmptyLLM(), max_chunk_chars=2000).generate(segments)
        self.assertEqual(result["todos"][0]["task"], "空き時間を調整して提示する")
        self.assertEqual(result["todos"][0]["owner"], "高橋さん")
        self.assertEqual(result["todos"][0]["due"], "明日まで")
        self.assertEqual(result["decisions"][0]["text"], "来月から15分間の情報共有の場を設ける")


if __name__ == "__main__":
    unittest.main()

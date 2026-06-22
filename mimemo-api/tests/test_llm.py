import unittest

from mimemo_ai.llm import parse_json_object


class ParseJsonObjectTest(unittest.TestCase):
    def test_parses_plain_json(self):
        self.assertEqual(parse_json_object('{"a": 1}'), {"a": 1})

    def test_parses_fenced_json(self):
        self.assertEqual(parse_json_object('```json\n{"a": 1}\n```'), {"a": 1})

    def test_parses_json_inside_extra_text(self):
        self.assertEqual(parse_json_object('result:\n{"a": 1}\nend'), {"a": 1})


if __name__ == "__main__":
    unittest.main()

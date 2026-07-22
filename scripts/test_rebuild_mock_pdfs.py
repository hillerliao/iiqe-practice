import importlib.util
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).with_name("rebuild_mock_pdfs.py")
SPEC = importlib.util.spec_from_file_location("rebuild_mock_pdfs", SCRIPT_PATH)
assert SPEC and SPEC.loader
PARSER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PARSER)


def words(*lines: str) -> list[dict[str, object]]:
    result: list[dict[str, object]] = []
    for line_number, text in enumerate(lines):
        for word_number, token in enumerate(text.split(" ")):
            result.append(
                {
                    "text": token,
                    "top": float(line_number * 10),
                    "x0": float(word_number * 20),
                }
            )
    return result


class SplitQuestionContentTests(unittest.TestCase):
    def test_keeps_wrapped_d_option_in_same_row(self) -> None:
        stem, options, errors = PARSER.split_question_content(
            words(
                "以下哪項有關再保險的陳述是正確的？",
                "a)甲",
                "b)乙",
                "c)丙",
                "d)把風險的部分或全部轉移至",
                "另一保險人",
            )
        )

        self.assertEqual(stem, "以下哪項有關再保險的陳述是正確的？")
        self.assertEqual(options["d"], "把風險的部分或全部轉移至另一保險人")
        self.assertEqual(errors, [])

    def test_keeps_short_wrapped_stem_in_same_row(self) -> None:
        stem, options, errors = PARSER.split_question_content(
            words("有一類風險", "：", "a)甲", "b)乙", "c)丙", "d)丁")
        )

        self.assertEqual(stem, "有一類風險：")
        self.assertEqual(options, {"a": "甲", "b": "乙", "c": "丙", "d": "丁"})
        self.assertEqual(errors, [])

    def test_rejects_missing_or_out_of_order_markers(self) -> None:
        _, _, errors = PARSER.split_question_content(
            words("題目", "a)甲", "c)丙", "b)乙", "d)丁")
        )

        self.assertEqual(len(errors), 1)
        self.assertIn("option markers", errors[0])

    def test_preserves_roman_statement_boundaries(self) -> None:
        stem, _, errors = PARSER.split_question_content(
            words("題目", "i.第一項", "ii.第二項", "a)甲", "b)乙", "c)丙", "d)丁")
        )

        self.assertEqual(stem, "題目 i.第一項 ii.第二項")
        self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main()

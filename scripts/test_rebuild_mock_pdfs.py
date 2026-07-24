import importlib.util
import io
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch


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


class ReconstructTests(unittest.TestCase):
    def test_preserves_non_pdf_metadata_fields(self) -> None:
        source = [
            {
                "number": 1,
                "ref": "1.1",
                "question": "PDF 題幹",
                "options": {"a": "甲", "b": "乙", "c": "丙", "d": "丁"},
                "answer": "a",
                "page": 2,
            }
        ]
        current = [
            {
                "id": "P1-mock-1",
                "number": 1,
                "ref": "舊參考",
                "question": "舊題幹",
                "options": {"a": "舊甲", "b": "舊乙", "c": "舊丙", "d": "舊丁"},
                "answer": "a",
                "explanation": "人工解析",
                "page": 1,
                "source": "mock",
                "sourceLabel": "2025模擬試題",
                "reviewStatus": "verified",
            }
        ]

        records, conflicts = PARSER.reconstruct(source, current, "P1")

        self.assertEqual(conflicts, [])
        self.assertEqual(records[0]["question"], "PDF 題幹")
        self.assertEqual(records[0]["explanation"], "人工解析")
        self.assertEqual(records[0]["reviewStatus"], "verified")


class CheckModeTests(unittest.TestCase):
    def test_check_mode_is_read_only(self) -> None:
        paper_audit = {
            "paper": "P1",
            "extractedCount": 1,
            "expectedCount": 1,
            "answerConflicts": [],
            "validationErrors": [],
            "datasetDifferences": [],
            "valid": True,
        }
        source = {"paper": "P1", "target": Path("unused.json")}

        with tempfile.TemporaryDirectory() as directory:
            audit_path = Path(directory) / "audit.json"
            with (
                patch.object(PARSER, "SOURCES", (source,)),
                patch.object(PARSER, "AUDIT_PATH", audit_path),
                patch.object(PARSER, "audit_one", return_value=(paper_audit, [])),
                redirect_stdout(io.StringIO()),
            ):
                PARSER.main(["--check"])

            self.assertFalse(audit_path.exists())

    def test_compare_current_reports_pdf_dataset_drift(self) -> None:
        current = [{"number": 740, "question": "錯誤題幹"}]
        rebuilt = [{"number": 740, "question": "正確題幹"}]

        differences = PARSER.compare_current(current, rebuilt)

        self.assertEqual(differences, ["question 740: current dataset differs from rebuilt PDF record"])


class AuditHashTests(unittest.TestCase):
    def test_json_sha256_is_stable_across_dictionary_key_order(self) -> None:
        left = [{"number": 1, "question": "題目"}]
        right = [{"question": "題目", "number": 1}]

        self.assertEqual(PARSER.json_sha256(left), PARSER.json_sha256(right))


class RealPdfBoundaryIntegrationTests(unittest.TestCase):
    @unittest.skipUnless(PARSER.SOURCES[0]["pdf"].exists(), "P1 mock PDF is not available")
    def test_p1_740_and_741_are_separate_physical_rows(self) -> None:
        questions, diagnostics = PARSER.parse_pdf(PARSER.SOURCES[0]["pdf"])
        by_number = {question["number"]: question for question in questions}

        self.assertEqual(diagnostics["structureErrors"], [])
        self.assertEqual(by_number[740]["page"], 134)
        self.assertEqual(by_number[740]["options"]["d"], "以上各項皆不是")
        self.assertEqual(by_number[741]["page"], 134)
        self.assertEqual(
            by_number[741]["question"],
            "一個保險代理人希望代表一個綜合保險人的一般及長期業務，根據《保險業條例》中的規則是：",
        )
        self.assertEqual(
            by_number[741]["options"],
            {
                "a": "不能同時代表兩間保險公司",
                "b": "當作代表單一保險公司",
                "c": "當作代表兩間不同的保險公司",
                "d": "在保險業監管局同意下，允許代表兩間公司",
            },
        )


if __name__ == "__main__":
    unittest.main()

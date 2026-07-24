import json
import unittest
from pathlib import Path

from scripts.build_handbook import make_offline_html
from scripts.build_handbook_en import (
    ENGLISH_LABELS,
    SPECS,
    build_handbook,
    merge_split_heading_lines,
    validate_structure,
)


class EnglishHandbookTest(unittest.TestCase):
    def test_merges_split_number_and_wrapped_title_lines(self) -> None:
        lines = [
            ("5.2.8", "5.2.8", 92.0, 13.0, True, 15.0),
            (
                "Guideline on Underwriting Long Term Insurance Business (Other Than",
                "Guideline on Underwriting Long Term Insurance Business (Other Than",
                92.0,
                13.0,
                True,
                15.0,
            ),
            ("Class C Business)", "Class C Business)", 92.0, 13.0, True, 15.0),
            ("Body text.", "Body text.", 92.0, 13.0, False, 15.0),
        ]

        merged = merge_split_heading_lines(lines)

        self.assertEqual(
            merged[0][0],
            "5.2.8 Guideline on Underwriting Long Term Insurance Business (Other Than Class C Business)",
        )
        self.assertEqual(merged[1][0], "Body text.")

    def test_bold_numbered_body_is_not_a_heading(self) -> None:
        spec = SPECS[0]
        pages = [
            (9, [
                ("1 RISK AND INSURANCE", "1 RISK AND INSURANCE", 68.0, 16.0, True, 0.0),
                ("1.1 CONCEPT OF RISK", "1.1 CONCEPT OF RISK", 68.0, 14.0, True, 15.0),
                ("1 the property or person at risk", "1 the property or person at risk", 105.0, 13.0, True, 15.0),
            ]),
        ]

        chapters, html = build_handbook(spec, pages)

        self.assertEqual([chapter["id"] for chapter in chapters], ["ch-1", "ch-1-1"])
        self.assertIn("the property or person at risk", html)

    def test_appendix_title_keeps_text_before_page_count(self) -> None:
        spec = SPECS[1]
        pages = [
            (135, [
                ("Appendix A", "Appendix A", 68.0, 15.0, True, 0.0),
                (
                    "Guideline on Cooling-off Period (GL29 – Appendix 1) (1/2)",
                    "Guideline on Cooling-off Period (GL29 – Appendix 1) (1/2)",
                    68.0,
                    13.0,
                    True,
                    15.0,
                ),
                ("(Source: Insurance Authority)", "(Source: Insurance Authority)", 68.0, 10.0, False, 15.0),
            ]),
        ]

        chapters, _ = build_handbook(spec, pages)

        appendix = next(chapter for chapter in chapters if chapter["id"] == "apx-a")
        self.assertEqual(
            appendix["title"],
            "Guideline on Cooling-off Period (GL29 – Appendix 1)",
        )

    def test_appendix_title_restores_parenthesis_split_by_page_count(self) -> None:
        spec = SPECS[1]
        pages = [
            (135, [
                ("Appendix M", "Appendix M", 68.0, 15.0, True, 0.0),
                (
                    "Important Facts Statement (Only Chinese",
                    "Important Facts Statement (Only Chinese",
                    68.0,
                    13.0,
                    True,
                    15.0,
                ),
                ("version available (1/4)", "version available (1/4)", 68.0, 13.0, True, 15.0),
            ]),
        ]

        chapters, _ = build_handbook(spec, pages)

        appendix = next(chapter for chapter in chapters if chapter["id"] == "apx-m")
        self.assertEqual(
            appendix["title"],
            "Important Facts Statement (Only Chinese version available)",
        )

    def test_offline_html_uses_english_locale_and_labels(self) -> None:
        html = make_offline_html(
            "English Notes",
            "2024",
            [],
            "<p>Content</p>",
            language="en-HK",
            labels=ENGLISH_LABELS,
        )

        self.assertIn('<html lang="en-HK">', html)
        self.assertIn(">Contents</h2>", html)
        self.assertIn(">Light</span>", html)
        self.assertIn('aria-label="Back to top"', html)
        self.assertNotIn(">目錄</h2>", html)

    def test_generated_outputs_have_required_structure_and_language(self) -> None:
        output_dir = Path(__file__).resolve().parent.parent / "public" / "handbook"
        for spec in SPECS:
            with self.subTest(slug=spec.slug):
                data = json.loads((output_dir / f"{spec.slug}.json").read_text(encoding="utf-8"))
                self.assertEqual(data["slug"], spec.slug)
                self.assertEqual(data["language"], "en-HK")
                self.assertEqual(data["pdfPageStarts"], sorted(spec.chapter_starts.values()))
                validate_structure(spec, data["chapters"], data["html"])
                offline = (output_dir / f"{spec.slug}.html").read_text(encoding="utf-8")
                self.assertIn('<html lang="en-HK">', offline)
                self.assertIn(">Contents</h2>", offline)

    def test_english_slugs_do_not_overlap_chinese_outputs(self) -> None:
        chinese = {"exam1-2024.json", "exam1-2024.html", "exam3-2022.json", "exam3-2022.html"}
        english = {
            f"{spec.slug}{extension}"
            for spec in SPECS
            for extension in (".json", ".html")
        }
        self.assertTrue(chinese.isdisjoint(english))


if __name__ == "__main__":
    unittest.main()

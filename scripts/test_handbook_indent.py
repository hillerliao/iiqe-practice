import unittest

from build_handbook_p3 import _indent_level, render_paragraph


class HandbookIndentTest(unittest.TestCase):
    def test_pdf_x_positions_map_to_bounded_indent_levels(self) -> None:
        self.assertEqual(_indent_level(68.1), 0)
        self.assertEqual(_indent_level(104.8), 1)
        self.assertEqual(_indent_level(141.6), 2)
        self.assertEqual(_indent_level(178.4), 3)
        self.assertEqual(_indent_level(333.9), 3)

    def test_paragraph_uses_first_line_indent_for_wrapped_content(self) -> None:
        html = render_paragraph(
            [("(i) 受養人的生活開支；", 141.6), ("續行內容。", 178.4)],
            False,
        )
        self.assertEqual(
            html,
            '<p class="handbook-indent-2">(i) 受養人的生活開支；續行內容。</p>',
        )

    def test_baseline_paragraph_has_no_indent_class(self) -> None:
        html = render_paragraph([("一般正文。", 68.1)], False)
        self.assertEqual(html, "<p>一般正文。</p>")


if __name__ == "__main__":
    unittest.main()

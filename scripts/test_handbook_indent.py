import unittest

from build_handbook import _split_long_paragraph as split_p1_paragraph
from build_handbook_p3 import (
    _indent_level,
    _split_long_paragraph as split_p3_paragraph,
    render_paragraph,
)


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

    def test_long_paragraph_does_not_leave_short_reference_fragment(self) -> None:
        text = (
            "(e)保單所有人違反責任："
            + "甲" * 130
            + "（詳情見\x01B\x014.\x01/B\x01\x01B\x012\x01/B\x01段）。"
        )
        html = render_paragraph([(text, 104.8)], False)
        self.assertNotIn(
            '</p><p class="handbook-indent-1"><strong>2</strong>段）。</p>',
            html,
        )
        self.assertIn("<strong>4.</strong><strong>2</strong>段）。", html)

    def test_p3_long_paragraph_formats_lettered_items_on_separate_lines(self) -> None:
        text = (
            "(v) 利益說明文件應就下列年度提供利益說明："
            "a. 顯示不少於30年；及b. 在65歲時；及"
            "c. 在100歲時；及d. 在保單年期屆滿時。"
        )
        html = render_paragraph([(text, 178.4)], False)
        self.assertIn("：<br>a. 顯示不少於30年", html)
        self.assertIn("；及<br>b. 在65歲時", html)
        self.assertIn("；及<br>c. 在100歲時", html)
        self.assertIn("；及<br>d. 在保單年期屆滿時。", html)

    def test_p3_long_paragraph_keeps_lettered_list_item_together(self) -> None:
        inner_html = (
            "(iii) 利益說明文件只應顯示在保單年度終結時的數字，"
            + "甲" * 130
            + "；及d. 在保單年期屆滿時。"
        )
        chunks = split_p3_paragraph(inner_html)
        html = "</p><p>".join(chunks)
        self.assertNotIn("及d.</p><p> 在保單年期屆滿時。", html)
        self.assertIn("及d. 在保單年期屆滿時。", html)

    def test_p1_long_paragraph_keeps_section_reference_together(self) -> None:
        inner_html = "甲" * 130 + "（見下文<strong>3.</strong><strong>2</strong>）。"
        chunks = split_p1_paragraph(inner_html)
        html = "</p><p>".join(chunks)
        self.assertNotIn("<strong>3.</strong></p><p><strong>2</strong>", html)
        self.assertIn("<strong>3.</strong><strong>2</strong>）。", html)


if __name__ == "__main__":
    unittest.main()
